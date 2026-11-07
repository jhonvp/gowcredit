import { describe, expect, it, vi } from 'vitest';
import { POLICY } from '../../domain/eligibility/policy.fixture';
import type { BankStatement } from '../../domain/statement/bank-statement';
import { validateStatement } from '../../domain/validation/statement-validators';
import type { CaseRecord, CaseRepositoryPort } from '../ports/case-repository.port';
import type { LoggerPort } from '../ports/logger.port';
import { DecideCaseUseCase } from './decide-case.use-case';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const s: BankStatement = {
  summary: {
    bankName: 'Demo',
    holderName: null,
    holderRfc: null,
    currency: 'MXN',
    periodStart: '2025-03-01',
    periodEnd: '2025-03-31',
    openingBalance: 10_000_000,
    closingBalance: 13_000_000,
    reportedCredits: null,
    reportedDebits: null,
  },
  transactions: [
    {
      date: '2025-03-05',
      description: 'SPEI CLIENTE ALFA',
      debit: 0,
      credit: 25_000_000,
      balance: 35_000_000,
      page: 1,
      sideBy: 'balance-delta',
    },
    {
      date: '2025-03-20',
      description: 'PAGO PROVEEDOR',
      debit: 22_000_000,
      credit: 0,
      balance: 13_000_000,
      page: 1,
      sideBy: 'balance-delta',
    },
  ],
  provenance: { summary: 'T0', transactions: 'T0' },
};

function repo(c: CaseRecord) {
  const r = {
    findCase: vi.fn(async () => c),
    saveDecision: vi.fn(async () => {}),
    transition: vi.fn(async () => true),
  };
  return r as unknown as CaseRepositoryPort & typeof r;
}
const caseWith = (status: CaseRecord['status']): CaseRecord => ({
  id: 'c1',
  status,
  supplierId: 's1',
  ownerEmail: 'owner@demo.mx',
  facts: {},
  decision: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  documents: [],
  extractions: [
    {
      documentId: 'd1',
      kind: 'bank_statement',
      resolvedBy: 'T0',
      needsReview: false,
      statement: s,
      validation: validateStatement(s),
      invoice: null,
      invoiceChecks: null,
      attempts: [],
      costUsd: 0,
      createdAt: new Date(),
    },
  ],
});
const clock = { now: () => new Date('2025-04-05T12:00:00Z') };
const sat = { status: vi.fn(async () => 'active' as const) };

describe('DecideCaseUseCase', () => {
  it('decides with the policy and today as asOf, saves it and moves the case to DECIDED', async () => {
    const r = repo(caseWith('EXTRACTED'));
    const d = await new DecideCaseUseCase(r, { current: () => POLICY }, sat, clock, logger).execute(
      'c1',
    );
    expect(d?.outcome).toBe('QUALIFIES');
    expect(d?.asOf).toBe('2025-04-05');
    expect(r.saveDecision).toHaveBeenCalledWith('c1', d);
    expect(r.transition).toHaveBeenCalledWith('c1', 'EXTRACTED', 'DECIDED');
  });

  it('uses the fixed asOf when configured and sends NEEDS_INFO cases to the owner', async () => {
    const r = repo(caseWith('EXTRACTED'));
    const d = await new DecideCaseUseCase(
      r,
      { current: () => POLICY },
      sat,
      clock,
      logger,
      '2026-01-01',
    ).execute('c1');
    expect(d?.outcome).toBe('NEEDS_INFO');
    expect(d?.missing.map((m) => m.code)).toEqual(['RECENT_STATEMENT']);
    expect(r.transition).toHaveBeenCalledWith('c1', 'EXTRACTED', 'AWAITING_OWNER');
  });
});
