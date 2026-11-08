import { type BankStatement, totalCredits, totalDebits } from '../statement/bank-statement';
import { daysBetween, isIsoDate } from '../shared/iso-date';
import { type Cents, formatMxn } from '../shared/money';

/**
 * Domain validators (ADR 0002). They decide whether a section is trusted or escalates to the next
 * tier. They are objective: they use only the document's own arithmetic.
 */
export type CheckId =
  | 'required-fields'
  | 'period-valid'
  | 'rows-present'
  | 'rows-well-formed'
  | 'rows-reconcile'
  | 'running-balance'
  | 'dates-in-period'
  | 'reported-totals';

export type Section = 'summary' | 'transactions';

export interface CheckResult {
  id: CheckId;
  section: Section;
  passed: boolean;
  /** Blocking checks gate trust; non-blocking ones are reported only. */
  blocking: boolean;
  detail: string;
}

export interface ValidationReport {
  checks: CheckResult[];
  passed: boolean;
  failedSections: Section[];
}

/** Reconciliation tolerance: 1.00 MXN (rounding in bank summaries). */
export const RECONCILE_TOLERANCE: Cents = 100;
/** Row-level running balance tolerance: 0.01 MXN. */
export const ROW_TOLERANCE: Cents = 1;
/** Rows may post a few days after the cut-off date (BBVA liquidation dates). */
const DATE_SLACK_DAYS = 5;

export function validateStatement(s: BankStatement): ValidationReport {
  const { summary, transactions } = s;
  const checks: CheckResult[] = [];

  const missing = (
    ['periodStart', 'periodEnd', 'openingBalance', 'closingBalance'] as const
  ).filter((k) => summary[k] === null);
  checks.push({
    id: 'required-fields',
    section: 'summary',
    blocking: true,
    passed: missing.length === 0,
    detail: missing.length ? `missing: ${missing.join(', ')}` : 'all present',
  });

  const periodOk =
    summary.periodStart !== null &&
    summary.periodEnd !== null &&
    daysBetween(summary.periodStart, summary.periodEnd) >= 0;
  checks.push({
    id: 'period-valid',
    section: 'summary',
    blocking: true,
    passed: periodOk,
    detail: periodOk
      ? `${summary.periodStart} → ${summary.periodEnd}`
      : 'period missing or inverted',
  });

  checks.push({
    id: 'rows-present',
    section: 'transactions',
    blocking: true,
    passed: transactions.length > 0,
    detail: `${transactions.length} rows`,
  });

  // Every row: a real date, non-negative amounts, exactly one side. LLM tiers can emit anything,
  // and the checks below assume this shape (an invalid date would make the period check vacuous).
  const malformed = transactions.findIndex(
    (t) =>
      !isIsoDate(t.date) ||
      t.debit < 0 ||
      t.credit < 0 ||
      t.debit > 0 === t.credit > 0 ||
      !Number.isInteger(t.debit) ||
      !Number.isInteger(t.credit),
  );
  if (transactions.length > 0) {
    checks.push({
      id: 'rows-well-formed',
      section: 'transactions',
      blocking: true,
      passed: malformed === -1,
      detail:
        malformed === -1
          ? 'dates valid, one side per row'
          : `row ${malformed + 1} has an invalid date or not exactly one of debit/credit`,
    });
  }

  if (
    summary.openingBalance !== null &&
    summary.closingBalance !== null &&
    transactions.length > 0
  ) {
    const expected = summary.openingBalance + totalCredits(s) - totalDebits(s);
    const diff = expected - summary.closingBalance;
    checks.push({
      id: 'rows-reconcile',
      section: 'transactions',
      blocking: true,
      passed: Math.abs(diff) <= RECONCILE_TOLERANCE,
      detail: `opening + credits − debits = ${formatMxn(expected)} vs closing ${formatMxn(summary.closingBalance)} (diff ${formatMxn(diff)})`,
    });
  }

  const chain = runningBalanceBreaks(s);
  if (chain.checked > 0) {
    checks.push({
      id: 'running-balance',
      section: 'transactions',
      blocking: true,
      passed: chain.breaks.length === 0,
      detail: chain.breaks.length
        ? `${chain.breaks.length}/${chain.checked} rows break the chain (first at row ${chain.breaks[0]})`
        : `${chain.checked} rows consistent`,
    });
  }

  if (summary.periodStart && summary.periodEnd && transactions.length) {
    const out = transactions.filter(
      (t) =>
        daysBetween(summary.periodStart as string, t.date) < -DATE_SLACK_DAYS ||
        daysBetween(t.date, summary.periodEnd as string) < -DATE_SLACK_DAYS,
    ).length;
    checks.push({
      id: 'dates-in-period',
      section: 'transactions',
      blocking: true,
      passed: out === 0,
      detail: out ? `${out} rows outside the period` : 'all rows inside the period',
    });
  }

  if (summary.reportedCredits !== null && summary.reportedDebits !== null && transactions.length) {
    const dc = totalCredits(s) - summary.reportedCredits;
    const dd = totalDebits(s) - summary.reportedDebits;
    checks.push({
      id: 'reported-totals',
      section: 'transactions',
      blocking: false,
      passed: Math.abs(dc) <= RECONCILE_TOLERANCE && Math.abs(dd) <= RECONCILE_TOLERANCE,
      detail: `credits diff ${formatMxn(dc)}, debits diff ${formatMxn(dd)} (bank definitions of totals vary)`,
    });
  }

  const failedSections = [
    ...new Set(checks.filter((c) => c.blocking && !c.passed).map((c) => c.section)),
  ] as Section[];
  return { checks, passed: failedSections.length === 0, failedSections };
}

/**
 * Walks rows in printed order. A row with a printed balance must equal the previous known balance
 * ± its movement. Rows without a printed balance carry the computed balance forward.
 */
function runningBalanceBreaks(s: BankStatement): { checked: number; breaks: number[] } {
  let prev = s.summary.openingBalance;
  let checked = 0;
  const breaks: number[] = [];
  s.transactions.forEach((t, i) => {
    const computed = prev === null ? null : prev + t.credit - t.debit;
    if (t.balance !== null && computed !== null) {
      checked++;
      if (Math.abs(computed - t.balance) > ROW_TOLERANCE) breaks.push(i + 1);
    }
    prev = t.balance ?? computed;
  });
  return { checked, breaks };
}
