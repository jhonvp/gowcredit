import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOB_QUEUE_PORT } from '../../src/application/ports/job-queue.port';
import { LOGGER_PORT } from '../../src/application/ports/logger.port';
import { ProcessDocumentUseCase } from '../../src/application/use-cases/process-document.use-case';
import { AppModule } from '../../src/bootstrap/app.module';
import { ExtractionWorker } from '../../src/interfaces/worker/extraction.worker';
import { bearer, login } from './support/auth';
import { demoStatementPdf } from './support/demo-statement';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';

/** Reads the magic-link token from the last email Mailpit received for `to`. */
async function tokenFromMail(to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = (await (
      await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    ).json()) as {
      messages: { ID: string }[];
    };
    const id = search.messages[0]?.ID;
    if (id) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
        Subject: string;
      };
      const m = /\/owner\/([A-Za-z0-9_-]{20,})/.exec(msg.Text);
      if (m) return m[1] as string;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no magic-link email for ${to}`);
}

/**
 * The whole loop on real services (ADR 0008): statement + CFDI → NEEDS_INFO (a CFDI has no due date)
 * → email with a magic link in Mailpit → owner reads the question and answers → re-decision.
 */
describe('clarification loop (integration)', () => {
  let app: INestApplication;
  let worker: ExtractionWorker;
  let supplier: Record<string, string>;
  let analyst: Record<string, string>;
  const http = () => request(app.getHttpServer());
  const owner = `owner+${Date.now()}@demo.mx`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
    worker = new ExtractionWorker(
      app.get(JOB_QUEUE_PORT),
      app.get(ProcessDocumentUseCase),
      app.get(LOGGER_PORT),
    );
    while ((await worker.drain()) > 0);
    supplier = bearer(await login(app, 'supplier@demo.mx'));
    analyst = bearer(await login(app, 'analyst@demo.mx'));
  });
  afterAll(async () => app?.close());

  it('asks the owner by email, takes the answer through the magic link and decides', async () => {
    const up = await http()
      .post('/api/documents')
      .set(supplier)
      .field('ownerEmail', owner)
      .attach('file', Buffer.from(demoStatementPdf()), {
        filename: 'edc.pdf',
        contentType: 'application/pdf',
      })
      .expect(202);
    const caseId = up.body.caseId as string;
    await worker.drain();
    const afterStatement = (await http().get(`/api/cases/${caseId}`).set(supplier).expect(200))
      .body;
    expect(afterStatement.decision.outcome).toBe('QUALIFIES');

    await http()
      .post(`/api/cases/${caseId}/documents`)
      .set(supplier)
      .attach(
        'file',
        readFileSync(join(__dirname, '../../../../samples/cfdi/factura-ppd-anchor.xml')),
        {
          filename: 'factura.xml',
          contentType: 'application/xml',
        },
      )
      .expect(202);
    await worker.drain();
    const waiting = (await http().get(`/api/cases/${caseId}`).set(supplier).expect(200)).body;
    expect(waiting.status).toBe('AWAITING_OWNER');
    expect(waiting.decision.missing.map((m: { code: string }) => m.code)).toEqual([
      'INVOICE_DUE_DATE',
    ]);
    expect(waiting.clarifications).toMatchObject([{ round: 1, status: 'open' }]);

    const token = await tokenFromMail(owner);
    const owned = { 'X-Owner-Token': token };
    const q = (await http().get('/api/owner/request').set(owned).expect(200)).body;
    expect(q.questions).toEqual([
      expect.objectContaining({
        code: 'INVOICE_DUE_DATE',
        type: 'provide_value',
        text: expect.stringContaining('vencimiento'),
      }),
    ]);

    // Owners cannot use supplier routes, and suppliers cannot use owner routes.
    await http().get(`/api/cases/${caseId}`).set(owned).expect(401);
    await http().get('/api/owner/request').set(supplier).expect(401);

    await http()
      .post('/api/owner/answers')
      .set(owned)
      .send({ answers: [{ code: 'INVOICE_DUE_DATE', value: '2025-02-30' }] })
      .expect(422);
    const due = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    const answered = await http()
      .post('/api/owner/answers')
      .set(owned)
      .send({ answers: [{ code: 'INVOICE_DUE_DATE', value: due, text: 'vence en 45 días' }] })
      .expect(200);
    expect(answered.body).toEqual({
      status: 'DECIDED',
      outcome: 'QUALIFIES',
      pendingDocuments: false,
    });

    // Single use.
    await http().get('/api/owner/request').set(owned).expect(401);

    const decided = (await http().get(`/api/cases/${caseId}`).set(analyst).expect(200)).body;
    expect(decided.decision.outcome).toBe('QUALIFIES');
    expect(decided.decision.suggestedAdvance).toBeGreaterThan(0);
    // Copilot (replay mode, no fixture → deterministic trace summary); analysts only.
    const copilot = await http()
      .post(`/api/cases/${caseId}/copilot`)
      .set(analyst)
      .send({ question: '¿Por qué califica?' })
      .expect(200);
    expect(copilot.body).toMatchObject({ by: 'trace' });
    expect(copilot.body.answer).toContain('QUALIFIES');
    await http()
      .post(`/api/cases/${caseId}/copilot`)
      .set(supplier)
      .send({ question: 'x' })
      .expect(403);
    expect(decided.clarifications).toMatchObject([
      {
        round: 1,
        status: 'answered',
        answers: [{ code: 'INVOICE_DUE_DATE', value: due, text: 'vence en 45 días' }],
      },
    ]);
  });

  it('rejects unknown owner tokens', async () => {
    await http()
      .get('/api/owner/request')
      .set({ 'X-Owner-Token': 'nope-nope-nope-nope-nope' })
      .expect(401);
    await http().get('/api/owner/request').expect(401);
  });
});
