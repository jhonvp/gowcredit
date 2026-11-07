import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOB_QUEUE_PORT } from '../../src/application/ports/job-queue.port';
import { LOGGER_PORT } from '../../src/application/ports/logger.port';
import { ProcessDocumentUseCase } from '../../src/application/use-cases/process-document.use-case';
import { AppModule } from '../../src/bootstrap/app.module';
import { ExtractionWorker } from '../../src/interfaces/worker/extraction.worker';
import { tinyPdf } from './support/tiny-pdf';

/**
 * Full intake path on real services: HTTP upload → S3 (Floci) → SQS (Floci) → worker → poppler →
 * cascade → Postgres → GET /api/cases/:id. LLM tiers run in replay mode with no fixture for this
 * synthetic document, so they report themselves skipped.
 */
describe('documents intake (integration)', () => {
  let app: INestApplication;
  let worker: ExtractionWorker;

  beforeAll(async () => {
    process.env.LLM_MODE = 'replay';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    worker = new ExtractionWorker(
      app.get(JOB_QUEUE_PORT),
      app.get(ProcessDocumentUseCase),
      app.get(LOGGER_PORT),
    );
    // Messages left over from earlier runs point at a dropped database: they are skipped and acked.
    while ((await worker.drain()) > 0);
  });

  afterAll(async () => app?.close());

  it('accepts a PDF, extracts it in the worker and exposes the result', async () => {
    const pdf = tinyPdf([
      'BANCO DEMO  ESTADO DE CUENTA',
      'Periodo del 01/03/2025 al 31/03/2025',
      'Saldo anterior 1,000.00',
      'Saldo final 1,200.00',
    ]);
    const res = await request(app.getHttpServer())
      .post('/api/documents')
      .attach('file', Buffer.from(pdf), { filename: 'demo.pdf', contentType: 'application/pdf' })
      .expect(202);
    expect(res.body).toMatchObject({ status: 'RECEIVED' });
    const { caseId } = res.body as { caseId: string };

    const before = await request(app.getHttpServer()).get(`/api/cases/${caseId}`).expect(200);
    expect(before.body.documents[0].extraction).toBeNull();

    expect(await worker.drain()).toBeGreaterThanOrEqual(1);

    const after = await request(app.getHttpServer()).get(`/api/cases/${caseId}`).expect(200);
    const doc = after.body.documents[0];
    // No transaction table → T0 fails rows-present; LLM tiers have no fixture → review.
    expect(after.body.status).toBe('AWAITING_OWNER');
    expect(doc.docType).toBe('BANK_STATEMENT');
    expect(doc.extraction.summary).toMatchObject({
      periodStart: '2025-03-01',
      periodEnd: '2025-03-31',
      openingBalance: 100_000,
      closingBalance: 120_000,
    });
    expect(
      doc.extraction.attempts.map((a: { tier: string; skipped: string | null }) => [
        a.tier,
        a.skipped,
      ]),
    ).toEqual([
      ['T0', null],
      ['T1', 'no-pages-need-ocr'],
      ['T2', null],
      ['T3', 'fixture-missing'],
      ['T4', 'fixture-missing'],
    ]);
    expect(doc.extraction.checks.find((c: { id: string }) => c.id === 'rows-present').passed).toBe(
      false,
    );
  });

  it('rejects files that are not PDF or XML, and validates ids', async () => {
    await request(app.getHttpServer())
      .post('/api/documents')
      .attach('file', Buffer.from('hello'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(415);
    await request(app.getHttpServer()).post('/api/documents').expect(400);
    await request(app.getHttpServer()).get('/api/cases/not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .get('/api/cases/00000000-0000-4000-8000-000000000000')
      .expect(404);
  });
});
