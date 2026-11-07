import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDataSourceOptions } from '../../src/infrastructure/persistence/data-source.options';
import { TypeOrmCaseRepository } from '../../src/infrastructure/persistence/repositories/typeorm-case.repository';

describe('TypeOrmCaseRepository (integration)', () => {
  let ds: DataSource;
  let repo: TypeOrmCaseRepository;

  beforeAll(async () => {
    ds = new DataSource(buildDataSourceOptions(process.env.DATABASE_URL as string));
    await ds.initialize();
    repo = new TypeOrmCaseRepository(ds);
  });
  afterAll(async () => ds?.destroy());

  const newCase = async () => {
    const caseId = randomUUID();
    const documentId = randomUUID();
    await repo.createCase(caseId, {
      id: documentId,
      originalName: 'edc.pdf',
      mimeType: 'application/pdf',
      sha256: 'b'.repeat(64),
      storageKey: `cases/${caseId}/${documentId}.pdf`,
    });
    return { caseId, documentId };
  };

  it('creates a case with its document and enforces transitions with compare-and-set', async () => {
    const { caseId, documentId } = await newCase();
    const created = await repo.findCase(caseId);
    expect(created).toMatchObject({
      status: 'RECEIVED',
      documents: [{ id: documentId, docType: null }],
    });

    expect(await repo.transition(caseId, 'RECEIVED', 'EXTRACTING')).toBe(true);
    // A second worker with a stale view loses the race.
    expect(await repo.transition(caseId, 'RECEIVED', 'EXTRACTING')).toBe(false);
    // Domain rules apply before SQL.
    expect(await repo.transition(caseId, 'EXTRACTING', 'RECEIVED')).toBe(false);
    expect((await repo.findCase(caseId))?.status).toBe('EXTRACTING');
  });

  it('stores extractions as JSONB and returns the latest per document', async () => {
    const { caseId, documentId } = await newCase();
    const base = {
      documentId,
      needsReview: true,
      statement: {
        summary: { bankName: 'X' },
        transactions: [],
        provenance: { summary: 'T0', transactions: 'T0' },
      },
      validation: { checks: [], passed: false, failedSections: ['transactions'] },
      attempts: [],
    } as never;
    await repo.saveExtraction({ ...(base as object), resolvedBy: 'T0', costUsd: 0 } as never);
    await new Promise((r) => setTimeout(r, 10));
    await repo.saveExtraction({
      ...(base as object),
      resolvedBy: 'T4',
      needsReview: false,
      costUsd: 0.1234,
    } as never);
    await repo.setDocumentType(documentId, 'BANK_STATEMENT');

    const found = await repo.findCase(caseId);
    expect(found?.extractions).toHaveLength(1);
    expect(found?.extractions[0]).toMatchObject({
      resolvedBy: 'T4',
      needsReview: false,
      costUsd: 0.1234,
    });
    expect(found?.documents[0]?.docType).toBe('BANK_STATEMENT');
    expect(await repo.findDocument(documentId)).toMatchObject({ caseId });
  });

  it('returns null for unknown ids', async () => {
    expect(await repo.findCase(randomUUID())).toBeNull();
  });
});
