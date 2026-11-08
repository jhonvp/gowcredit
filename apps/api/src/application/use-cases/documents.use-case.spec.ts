import { describe, expect, it, vi } from 'vitest';
import type { CaseStatus } from '../../domain/case/case-status';
import type { CfdiInvoice } from '../../domain/cfdi/cfdi-invoice';
import type { Decision, DecisionFacts } from '../../domain/eligibility/engine';
import { canTransition } from '../../domain/case/case-status';
import type {
  CaseRecord,
  CaseRepositoryPort,
  ExtractionRecord,
} from '../ports/case-repository.port';
import type { CfdiParserPort } from '../ports/eligibility.ports';
import type { ExtractDocumentJob, JobQueuePort, ReceivedJob } from '../ports/job-queue.port';
import type { LoggerPort } from '../ports/logger.port';
import type { ObjectStoragePort } from '../ports/object-storage.port';
import type {
  ExtractBankStatementUseCase,
  ExtractionOutcome,
} from './extract-bank-statement.use-case';
import type { DecideCaseUseCase } from './decide-case.use-case';
import { ProcessDocumentUseCase } from './process-document.use-case';
import {
  sniffKind,
  SubmitDocumentUseCase,
  UnsupportedDocumentError,
} from './submit-document.use-case';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** Fakes (the application layer may not import infrastructure adapters, ADR 0001). */
class InMemoryObjectStorage implements ObjectStoragePort {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();
  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body, contentType });
  }
  async get(key: string) {
    const o = this.objects.get(key);
    if (!o) throw new Error(`No object at ${key}`);
    return o.body;
  }
}

class InMemoryJobQueue implements JobQueuePort {
  private seq = 0;
  readonly pending = new Map<string, { job: ExtractDocumentJob; attempts: number }>();
  async send(job: ExtractDocumentJob) {
    this.pending.set(String(++this.seq), { job, attempts: 0 });
  }
  async receive(max: number): Promise<ReceivedJob[]> {
    return [...this.pending.entries()]
      .slice(0, max)
      .map(([receipt, p]) => ({ job: p.job, receipt, attempts: ++p.attempts }));
  }
  async ack(receipt: string) {
    this.pending.delete(receipt);
  }
}

/** In-memory repository that enforces the domain transition rules like the SQL one. */
class FakeCases implements CaseRepositoryPort {
  readonly cases = new Map<string, CaseRecord>();
  async createCase(caseId: string, d: Parameters<CaseRepositoryPort['createCase']>[1]) {
    const now = new Date();
    const c: CaseRecord = {
      id: caseId,
      status: 'RECEIVED',
      facts: {},
      decision: null,
      createdAt: now,
      updatedAt: now,
      documents: [{ ...d, caseId, docType: null, createdAt: now }],
      extractions: [],
    };
    this.cases.set(caseId, c);
    return structuredClone(c);
  }
  async addDocument(caseId: string, d: Parameters<CaseRepositoryPort['addDocument']>[1]) {
    this.cases.get(caseId)?.documents.push({ ...d, caseId, docType: null, createdAt: new Date() });
  }
  async saveDecision(caseId: string, decision: Decision) {
    const c = this.cases.get(caseId);
    if (c) c.decision = { ...decision, createdAt: new Date() };
  }
  async setFacts(caseId: string, facts: DecisionFacts) {
    const c = this.cases.get(caseId);
    if (c) c.facts = facts;
  }
  async findCase(id: string) {
    const c = this.cases.get(id);
    return c ? structuredClone(c) : null;
  }
  async findDocument(id: string) {
    for (const c of this.cases.values()) {
      const d = c.documents.find((x) => x.id === id);
      if (d) return d;
    }
    return null;
  }
  async transition(id: string, from: CaseStatus, to: CaseStatus) {
    const c = this.cases.get(id);
    if (!c || c.status !== from || !canTransition(from, to)) return false;
    c.status = to;
    return true;
  }
  async setDocumentType(id: string, t: 'BANK_STATEMENT' | 'CFDI_INVOICE' | 'UNKNOWN') {
    for (const c of this.cases.values())
      for (const d of c.documents) if (d.id === id) d.docType = t;
  }
  async saveExtraction(e: Omit<ExtractionRecord, 'createdAt'>) {
    for (const c of this.cases.values())
      if (c.documents.some((d) => d.id === e.documentId))
        c.extractions.push({ ...e, createdAt: new Date() });
  }
}

let n = 0;
const ids = { uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
const pdf = new TextEncoder().encode('%PDF-1.7\nfake');
const file = (bytes = pdf) => ({
  originalName: 'edc.pdf',
  mimeType: 'application/pdf',
  bytes,
  sha256: 'a'.repeat(64),
});

const outcome = (needsReview: boolean): ExtractionOutcome =>
  ({
    statement: { summary: {}, transactions: [], provenance: { summary: 'T0', transactions: 'T0' } },
    validation: { checks: [], passed: !needsReview, failedSections: [] },
    resolvedBy: 'T0',
    attempts: [],
    costUsd: 0,
    needsReview,
  }) as unknown as ExtractionOutcome;

function setup(extract: () => Promise<ExtractionOutcome>) {
  const storage = new InMemoryObjectStorage();
  const queue = new InMemoryJobQueue();
  const cases = new FakeCases();
  const submit = new SubmitDocumentUseCase(storage, queue, cases, ids, logger);
  const decideCase = { execute: vi.fn(async () => null) };
  const cfdi: CfdiParserPort = { parse: vi.fn(() => ({ ...INVOICE })) };
  const process = new ProcessDocumentUseCase(
    cases,
    storage,
    { execute: vi.fn(extract) } as unknown as ExtractBankStatementUseCase,
    cfdi,
    decideCase as unknown as DecideCaseUseCase,
    logger,
  );
  return { storage, queue, cases, submit, process, decideCase, cfdi };
}

const INVOICE: CfdiInvoice = {
  uuid: 'U-1',
  version: '4.0',
  voucherType: 'I',
  paymentMethod: 'PPD',
  issuerRfc: 'PRO010203AB4',
  issuerName: null,
  receiverRfc: 'DCM850101AB1',
  receiverName: null,
  currency: 'MXN',
  exchangeRate: null,
  issueDate: '2025-04-01',
  subtotal: 100,
  discount: 0,
  transferredTaxes: 16,
  withheldTaxes: 0,
  total: 116,
  conceptCount: 1,
};
const xml = new TextEncoder().encode('<?xml version="1.0"?><cfdi:Comprobante/>');

describe('sniffKind', () => {
  it('detects PDF and CFDI XML from the bytes, BOM included', () => {
    expect(sniffKind(pdf)).toBe('pdf');
    expect(sniffKind(new TextEncoder().encode('﻿<?xml version="1.0"?><cfdi:Comprobante/>'))).toBe(
      'xml',
    );
    expect(sniffKind(new TextEncoder().encode('PK\u0003\u0004 zip'))).toBeNull();
  });
});

describe('SubmitDocumentUseCase', () => {
  it('stores the file, creates the case and queues extraction', async () => {
    const { storage, queue, submit } = setup(async () => outcome(false));
    const created = await submit.execute(file());
    expect(created.status).toBe('RECEIVED');
    const doc = created.documents[0];
    expect(doc?.storageKey).toBe(`cases/${created.id}/${doc?.id}.pdf`);
    expect(storage.objects.get(doc?.storageKey ?? '')?.contentType).toBe('application/pdf');
    expect([...queue.pending.values()].map((p) => p.job)).toEqual([
      { type: 'extract-document', caseId: created.id, documentId: doc?.id },
    ]);
  });

  it('rejects empty and non-document files without side effects', async () => {
    const { storage, queue, submit } = setup(async () => outcome(false));
    await expect(submit.execute(file(new Uint8Array()))).rejects.toBeInstanceOf(
      UnsupportedDocumentError,
    );
    await expect(submit.execute(file(new TextEncoder().encode('hello')))).rejects.toThrow(/PDF/);
    expect(storage.objects.size + queue.pending.size).toBe(0);
  });
});

describe('ProcessDocumentUseCase', () => {
  it('extracts a statement, saves it, marks the case EXTRACTED and runs the decision', async () => {
    for (const review of [false, true]) {
      const { queue, cases, submit, process, decideCase } = setup(async () => outcome(review));
      const c = await submit.execute(file());
      const [job] = await queue.receive(1);
      expect(await process.execute(job!.job)).toBe('processed');
      const saved = await cases.findCase(c.id);
      expect(saved?.status).toBe('EXTRACTED');
      expect(saved?.extractions[0]).toMatchObject({ kind: 'bank_statement', needsReview: review });
      expect(saved?.documents[0]?.docType).toBe('BANK_STATEMENT');
      expect(decideCase.execute).toHaveBeenCalledWith(c.id);
    }
  });

  it('parses and validates a CFDI XML instead of running the statement cascade', async () => {
    const { queue, cases, submit, process } = setup(async () => {
      throw new Error('cascade must not run for XML');
    });
    const c = await submit.execute(file(xml));
    const [job] = await queue.receive(1);
    expect(await process.execute(job!.job)).toBe('processed');
    const saved = await cases.findCase(c.id);
    expect(saved?.documents[0]?.docType).toBe('CFDI_INVOICE');
    expect(saved?.extractions[0]).toMatchObject({
      kind: 'cfdi',
      needsReview: false,
      statement: null,
    });
    expect(saved?.extractions[0]?.invoiceChecks?.every((x) => x.passed)).toBe(true);
  });

  it('attaches a second document to a case and acks duplicates', async () => {
    const { queue, cases, submit, process } = setup(async () => outcome(false));
    const c = await submit.execute(file());
    await submit.execute(file(xml), c.id);
    const jobs = await queue.receive(10);
    expect(jobs).toHaveLength(2);
    for (const j of jobs) expect(await process.execute(j.job)).toBe('processed');
    expect((await cases.findCase(c.id))?.extractions.map((e) => e.kind)).toEqual([
      'bank_statement',
      'cfdi',
    ]);
    expect(await process.execute(jobs[0]!.job)).toBe('duplicate');
  });

  it('reports busy while another document of the case is extracting', async () => {
    const { queue, cases, submit, process } = setup(async () => outcome(false));
    const c = await submit.execute(file());
    await cases.transition(c.id, 'RECEIVED', 'EXTRACTING');
    const [job] = await queue.receive(1);
    expect(await process.execute(job!.job)).toBe('busy');
  });

  it('marks the case FAILED and rethrows so the queue redelivers; the retry succeeds', async () => {
    let calls = 0;
    const { queue, cases, submit, process } = setup(async () => {
      if (++calls === 1) throw new Error('poppler crashed');
      return outcome(false);
    });
    const c = await submit.execute(file());
    const [job] = await queue.receive(1);
    await expect(process.execute(job!.job)).rejects.toThrow('poppler crashed');
    expect((await cases.findCase(c.id))?.status).toBe('FAILED');
    expect(await process.execute(job!.job)).toBe('processed');
  });
});
