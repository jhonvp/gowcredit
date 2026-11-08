import { isSummaryRow, type Transaction } from '../statement/bank-statement';
import type { CheckResult, ValidationReport } from './statement-validators';

/**
 * Edits that make a statement's arithmetic pass without the statement printing it that way. They are
 * not extraction errors but problems in the document itself, so a human must see them (eval
 * `knownAnomalies`: "flag it, do not fix it").
 */
export interface RepairFlags {
  /** Rows a repair moved out of the order the bank printed them (T4 vs the candidate it received). */
  movedRows: number;
  /** Rows taken from the summary section because no movement row prints them. */
  summaryRows: number;
}

export const NO_REPAIR_FLAGS: RepairFlags = { movedRows: 0, summaryRows: 0 };

export const summaryRowCount = (rows: readonly Transaction[]): number =>
  rows.filter(isSummaryRow).length;

/**
 * Rows of `before` that are still present in `after` (matched by amounts, k-th occurrence to k-th
 * occurrence) but no longer in their original relative order. Counted as the matched rows outside the
 * longest increasing subsequence of original positions, so inserting, deleting or correcting rows is
 * never counted as a move; only reordering is.
 */
export function reorderedRows(
  before: readonly Transaction[],
  after: readonly Transaction[],
): number {
  const key = (t: Transaction) => `${t.debit}|${t.credit}`;
  const positions = new Map<string, number[]>();
  before.forEach((t, i) => {
    const list = positions.get(key(t));
    if (list) list.push(i);
    else positions.set(key(t), [i]);
  });
  const sequence: number[] = [];
  for (const t of after) {
    const next = positions.get(key(t))?.shift();
    if (next !== undefined) sequence.push(next);
  }
  return sequence.length - longestIncreasingRun(sequence);
}

function longestIncreasingRun(values: readonly number[]): number {
  const tails: number[] = [];
  for (const v of values) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((tails[mid] as number) < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
  }
  return tails.length;
}

/** Adds the blocking `rows-as-printed` check when a candidate carries repair flags. */
export function withRepairFlags(report: ValidationReport, flags: RepairFlags): ValidationReport {
  if (flags.movedRows === 0 && flags.summaryRows === 0) return report;
  const parts = [
    flags.movedRows ? `${flags.movedRows} row(s) moved from where the bank printed them` : '',
    flags.summaryRows
      ? `${flags.summaryRows} row(s) taken from the summary, not printed as movements`
      : '',
  ].filter(Boolean);
  const check: CheckResult = {
    id: 'rows-as-printed',
    section: 'transactions',
    blocking: true,
    passed: false,
    detail: `${parts.join('; ')}: the document itself does not reconcile, needs human review`,
    message: `${[
      flags.movedRows
        ? `${flags.movedRows} movimiento(s) cambiados de lugar respecto al documento`
        : '',
      flags.summaryRows
        ? `${flags.summaryRows} movimiento(s) tomados del resumen, no impresos como movimientos`
        : '',
    ]
      .filter(Boolean)
      .join('; ')}: el documento no cuadra por sí mismo y requiere revisión de un analista`,
  };
  return {
    checks: [...report.checks, check],
    passed: false,
    failedSections: report.failedSections.includes('transactions')
      ? report.failedSections
      : [...report.failedSections, 'transactions'],
  };
}
