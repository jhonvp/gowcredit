import { describe, expect, it } from 'vitest';
import { validateStatement } from '../validation/statement-validators';
import { adjustStatement } from './adjustments';
import { type BankStatement, totalCredits, totalDebits, type Transaction } from './bank-statement';

const row = (
  date: string,
  side: 'debit' | 'credit',
  cents: number,
  description = 'x',
): Transaction => ({
  date,
  description,
  debit: side === 'debit' ? cents : 0,
  credit: side === 'credit' ? cents : 0,
  balance: null,
  page: 1,
  sideBy: 'sign',
});

const statement = (
  transactions: Transaction[],
  summary: Partial<BankStatement['summary']>,
): BankStatement => ({
  summary: {
    bankName: 'X',
    holderName: null,
    holderRfc: null,
    currency: 'MXN',
    periodStart: '2025-07-01',
    periodEnd: '2025-07-31',
    openingBalance: 0,
    closingBalance: 0,
    reportedCredits: null,
    reportedDebits: null,
    ...summary,
  },
  transactions,
  provenance: { summary: 'T0', transactions: 'T0' },
});

const mirror = [row('2025-07-02', 'credit', 500), row('2025-07-02', 'debit', 500)];
const real = [row('2025-07-03', 'credit', 10_000), row('2025-07-04', 'debit', 4_000)];

describe('adjustStatement', () => {
  it('marks mirror pairs when that makes the rows match the printed totals', () => {
    const out = adjustStatement(
      statement([...mirror, ...real], {
        reportedCredits: 10_000,
        reportedDebits: 4_000,
        closingBalance: 6_000,
      }),
    );
    expect(out.transactions.map((t) => t.internal)).toEqual([true, true, false, false]);
    expect(out.transactions).toHaveLength(4);
    expect(totalCredits(out)).toBe(10_000);
    expect(totalDebits(out)).toBe(4_000);
  });

  it('keeps a same-day purchase and refund when the bank totals include them', () => {
    const out = adjustStatement(
      statement([...mirror, ...real], {
        reportedCredits: 10_500,
        reportedDebits: 4_500,
        closingBalance: 6_000,
      }),
    );
    expect(out.transactions.some((t) => t.internal)).toBe(false);
  });

  it('marks nothing without printed totals to confirm against', () => {
    const out = adjustStatement(statement([...mirror, ...real], { closingBalance: 6_000 }));
    expect(out.transactions.some((t) => t.internal)).toBe(false);
  });

  it('marks nothing when removing the pairs would not reach the printed totals', () => {
    const out = adjustStatement(
      statement([...mirror, ...real], { reportedCredits: 9_000, reportedDebits: 4_000 }),
    );
    expect(out.transactions.some((t) => t.internal)).toBe(false);
  });

  const interest = { concept: 'Rendimientos', amount: 1_824, description: 'd' };

  it('counts a printed summary amount only when it explains the difference to the cent', () => {
    const explained = adjustStatement(
      statement(real, { closingBalance: 7_824, printedExtras: [interest] }),
    );
    expect(explained.summary.otherItems).toEqual([interest]);
    const unexplained = adjustStatement(
      statement(real, { closingBalance: 7_900, printedExtras: [interest] }),
    );
    expect(unexplained.summary.otherItems).toEqual([]);
  });

  it('ignores a printed amount that is already among the rows', () => {
    const out = adjustStatement(
      statement(real, { closingBalance: 6_000, printedExtras: [interest] }),
    );
    expect(out.summary.otherItems).toEqual([]);
  });

  it('keeps a real deposit and expense with the same date and amount but another concept', () => {
    const out = adjustStatement(
      statement(
        [
          row('2025-07-02', 'credit', 500, 'Retiro de Cajita'),
          row('2025-07-02', 'debit', 500, 'Retiro de Cajita'),
          row('2025-07-05', 'credit', 700, 'Cliente'),
          row('2025-07-05', 'debit', 700, 'Renta'),
        ],
        { reportedCredits: 700, reportedDebits: 700, closingBalance: 0 },
      ),
    );
    expect(out.transactions.map((t) => t.internal)).toEqual([true, true, false, false]);
  });

  it('is idempotent', () => {
    const once = adjustStatement(
      statement([...mirror, ...real], {
        reportedCredits: 10_000,
        reportedDebits: 4_000,
        closingBalance: 6_000,
      }),
    );
    expect(adjustStatement(once)).toEqual(once);
  });
});

describe('running balance printed out of order', () => {
  const chain = (breakAt: number): BankStatement => {
    let balance = 0;
    const rows = Array.from({ length: 20 }, (_, i) => {
      balance += 100;
      return { ...row('2025-07-10', 'credit', 100), balance: i + 1 === breakAt ? 5 : balance };
    });
    return statement(rows, { closingBalance: 2_000 });
  };
  const running = (s: BankStatement) =>
    validateStatement(s).checks.find((c) => c.id === 'running-balance');

  it('is a notice near the end of a statement that reconciles', () => {
    expect(running(chain(19))).toMatchObject({ passed: false, blocking: false });
    expect(validateStatement(chain(19)).passed).toBe(true);
  });

  it('stays blocking in the middle of the table', () => {
    expect(running(chain(5))).toMatchObject({ passed: false, blocking: true });
  });

  it('stays blocking when the statement does not reconcile', () => {
    const s = chain(19);
    expect(running({ ...s, summary: { ...s.summary, closingBalance: 9_999 } })?.blocking).toBe(
      true,
    );
  });
});
