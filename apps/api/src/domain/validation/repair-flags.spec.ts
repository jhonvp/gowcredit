import { describe, expect, it } from 'vitest';
import { SUMMARY_ROW_PREFIX, type Transaction } from '../statement/bank-statement';
import { reorderedRows, summaryRowCount, withRepairFlags } from './repair-flags';
import type { ValidationReport } from './statement-validators';

const row = (debit: number, credit: number, description = 'x'): Transaction => ({
  date: '2025-10-01',
  description,
  debit,
  credit,
  balance: null,
  page: 1,
  sideBy: 'model',
});
const printed = [row(100, 0), row(0, 200), row(300, 0), row(0, 400), row(0, 21683), row(3614, 0)];

describe('reorderedRows', () => {
  it('is 0 when the order is kept', () => {
    expect(reorderedRows(printed, printed)).toBe(0);
  });

  it('counts rows moved away from where they were printed (Fondeadora interest + ISR)', () => {
    // The agent deleted the last 2 rows and re-inserted them earlier to repair the running balance.
    const after = [printed[0], printed[1], printed[4], printed[5], printed[2], printed[3]];
    expect(reorderedRows(printed, after as Transaction[])).toBe(2);
  });

  it('does not count corrections, deletions or inserted printed rows as moves', () => {
    const fixedSide = row(0, 100); // debit read as credit: different amounts → not matched
    const after = [fixedSide, printed[1], row(50, 0), printed[3], printed[4], printed[5]];
    expect(reorderedRows(printed, after as Transaction[])).toBe(0);
  });

  it('matches repeated amounts in order', () => {
    const fees = [row(10, 0), row(0, 5), row(10, 0)];
    expect(reorderedRows(fees, fees)).toBe(0);
    // Swapping two rows with identical amounts is indistinguishable from keeping the order.
    expect(reorderedRows(fees, [fees[2], fees[1], fees[0]] as Transaction[])).toBe(0);
    // Moving the 5.00 row after the second 10.00 row is a reorder.
    expect(reorderedRows(fees, [fees[0], fees[2], fees[1]] as Transaction[])).toBe(1);
  });
});

describe('withRepairFlags', () => {
  const passing: ValidationReport = { checks: [], passed: true, failedSections: [] };

  it('leaves the report unchanged without flags', () => {
    expect(withRepairFlags(passing, { movedRows: 0, summaryRows: 0 })).toBe(passing);
  });

  it('adds a failing blocking rows-as-printed check on the transactions section', () => {
    const out = withRepairFlags(passing, { movedRows: 2, summaryRows: 1 });
    expect(out.passed).toBe(false);
    expect(out.failedSections).toEqual(['transactions']);
    expect(out.checks).toEqual([
      expect.objectContaining({ id: 'rows-as-printed', blocking: true, passed: false }),
    ]);
    expect(out.checks[0]?.detail).toContain('2 row(s) moved');
    expect(out.checks[0]?.detail).toContain('1 row(s) taken from the summary');
  });

  it('counts summary-only rows by their prefix', () => {
    expect(summaryRowCount([row(0, 1824, `${SUMMARY_ROW_PREFIX}Interés`), ...printed])).toBe(1);
  });
});
