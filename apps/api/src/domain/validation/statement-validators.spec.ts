import { describe, expect, it } from 'vitest';
import type { BankStatement, Transaction } from '../statement/bank-statement';
import { validateStatement } from './statement-validators';

const tx = (p: Partial<Transaction>): Transaction => ({
  date: '2025-01-10',
  description: 'x',
  debit: 0,
  credit: 0,
  balance: null,
  page: 1,
  sideBy: 'balance-delta',
  ...p,
});

const statement = (
  transactions: Transaction[],
  over: Partial<BankStatement['summary']> = {},
): BankStatement => ({
  summary: {
    bankName: 'Test',
    holderName: null,
    holderRfc: null,
    currency: 'MXN',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    openingBalance: 10_000,
    closingBalance: 12_000,
    reportedCredits: null,
    reportedDebits: null,
    ...over,
  },
  transactions,
  provenance: { summary: 'T0', transactions: 'T0' },
});

const check = (s: BankStatement, id: string) =>
  validateStatement(s).checks.find((c) => c.id === id);

describe('validateStatement', () => {
  it('passes a statement whose rows reconcile and chain', () => {
    const s = statement([
      tx({ credit: 5_000, balance: 15_000 }),
      tx({ debit: 3_000, balance: 12_000 }),
    ]);
    const r = validateStatement(s);
    expect(r.passed).toBe(true);
    expect(r.failedSections).toEqual([]);
  });

  it('flags rows that do not reconcile to the closing balance', () => {
    const s = statement([tx({ credit: 5_000 })]);
    expect(check(s, 'rows-reconcile')?.passed).toBe(false);
    expect(validateStatement(s).failedSections).toEqual(['transactions']);
  });

  it('detects a broken running balance even when totals reconcile', () => {
    // Debit and credit swapped on both rows: totals still net to +2,000 but the chain breaks.
    const s = statement([
      tx({ debit: 3_000, balance: 15_000 }),
      tx({ credit: 5_000, balance: 12_000 }),
    ]);
    expect(check(s, 'rows-reconcile')?.passed).toBe(true);
    expect(check(s, 'running-balance')?.passed).toBe(false);
  });

  it('carries the balance forward through rows without a printed balance', () => {
    const s = statement([tx({ credit: 1_000 }), tx({ credit: 1_000, balance: 12_000 })]);
    expect(check(s, 'running-balance')?.passed).toBe(true);
  });

  it('fails the summary section when required fields are missing', () => {
    const s = statement([tx({ credit: 2_000 })], { openingBalance: null });
    expect(validateStatement(s).failedSections).toContain('summary');
  });

  it('flags rows dated outside the period', () => {
    const s = statement([tx({ credit: 2_000, date: '2025-03-15' })]);
    expect(check(s, 'dates-in-period')?.passed).toBe(false);
  });

  it('treats reported totals as non-blocking', () => {
    const s = statement([tx({ credit: 2_000 })], { reportedCredits: 9_999_00, reportedDebits: 0 });
    const r = validateStatement(s);
    expect(check(s, 'reported-totals')?.passed).toBe(false);
    expect(r.passed).toBe(true);
  });

  it('rejects malformed rows (invalid date, both or neither side)', () => {
    expect(
      check(statement([tx({ credit: 2_000, date: '2025-02-30' })]), 'rows-well-formed')?.passed,
    ).toBe(false);
    expect(check(statement([tx({ credit: 2_000, debit: 1 })]), 'rows-well-formed')?.passed).toBe(
      false,
    );
    expect(check(statement([tx({})]), 'rows-well-formed')?.passed).toBe(false);
    expect(check(statement([tx({ credit: 2_000 })]), 'rows-well-formed')?.passed).toBe(true);
  });
});
