import {
  type BankStatement,
  otherItemsTotal,
  totalCredits,
  totalDebits,
} from '../statement/bank-statement';
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
  | 'reported-totals'
  /** Added by withRepairFlags (repair-flags.ts), never by validateStatement. */
  | 'rows-as-printed';

export type Section = 'summary' | 'transactions';

export interface CheckResult {
  id: CheckId;
  section: Section;
  passed: boolean;
  /** Blocking checks gate trust; non-blocking ones are reported only. */
  blocking: boolean;
  /**
   * For the LLM tiers and the eval report. T3/T4 prompts include it, so changing it changes the
   * recorded fixtures' keys: keep it stable.
   */
  detail: string;
  /** The same result in Spanish, for people (web, emails). */
  message: string;
}

export interface ValidationReport {
  checks: CheckResult[];
  passed: boolean;
  failedSections: Section[];
}

const SUMMARY_FIELD_ES = {
  periodStart: 'inicio del periodo',
  periodEnd: 'fin del periodo',
  openingBalance: 'saldo inicial',
  closingBalance: 'saldo final',
} as const;

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
    message: missing.length
      ? `Faltan: ${missing.map((k) => SUMMARY_FIELD_ES[k]).join(', ')}`
      : 'Periodo y saldos presentes',
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
    message: periodOk
      ? `Periodo ${summary.periodStart} → ${summary.periodEnd}`
      : 'El periodo falta o termina antes de empezar',
  });

  checks.push({
    id: 'rows-present',
    section: 'transactions',
    blocking: true,
    passed: transactions.length > 0,
    detail: `${transactions.length} rows`,
    message: `${transactions.length} movimientos`,
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
      message:
        malformed === -1
          ? 'Fechas válidas y un solo importe (cargo o abono) por movimiento'
          : `El movimiento ${malformed + 1} tiene una fecha inválida o no tiene exactamente un cargo o un abono`,
    });
  }

  if (
    summary.openingBalance !== null &&
    summary.closingBalance !== null &&
    transactions.length > 0
  ) {
    const others = otherItemsTotal(summary);
    const expected = summary.openingBalance + totalCredits(s) - totalDebits(s) + others;
    const diff = expected - summary.closingBalance;
    checks.push({
      id: 'rows-reconcile',
      section: 'transactions',
      blocking: true,
      passed: Math.abs(diff) <= RECONCILE_TOLERANCE,
      detail: `opening + credits − debits${others ? ' + other items' : ''} = ${formatMxn(expected)} vs closing ${formatMxn(summary.closingBalance)} (diff ${formatMxn(diff)})`,
      message: `Saldo inicial + abonos − cargos${others ? ' + otros' : ''} = ${formatMxn(expected)}; saldo final ${formatMxn(summary.closingBalance)} (diferencia ${formatMxn(diff)})`,
    });
  }

  const chain = runningBalanceBreaks(s);
  if (chain.checked > 0) {
    const reconciles = checks.some((c) => c.id === 'rows-reconcile' && c.passed);
    const onlyPrintingOrder = reconciles && breaksAreInTheTail(chain.breaks, transactions.length);
    checks.push({
      id: 'running-balance',
      section: 'transactions',
      blocking: !onlyPrintingOrder,
      passed: chain.breaks.length === 0,
      detail: chain.breaks.length
        ? `${chain.breaks.length}/${chain.checked} rows break the chain (first at row ${chain.breaks[0]})`
        : `${chain.checked} rows consistent`,
      message: chain.breaks.length
        ? onlyPrintingOrder
          ? `Aviso, no es un error: ${chain.breaks.length} movimientos al final de la tabla traen un saldo impreso fuera de orden, y el saldo final sí cuadra`
          : `${chain.breaks.length} de ${chain.checked} saldos por movimiento no cuadran (el primero en el movimiento ${chain.breaks[0]})`
        : `Los ${chain.checked} saldos por movimiento cuadran`,
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
      message: out
        ? `${out} movimientos fuera del periodo`
        : 'Todos los movimientos dentro del periodo',
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
      message:
        Math.abs(dc) <= RECONCILE_TOLERANCE && Math.abs(dd) <= RECONCILE_TOLERANCE
          ? 'Abonos y cargos coinciden con los totales impresos por el banco'
          : dc === dd
            ? `Aviso, no es un error: abonos y cargos suman ${formatMxn(dc)} más que los totales del banco, igual en ambos lados; suele indicar traspasos internos entre cuentas`
            : `Aviso, no es un error: contra los totales impresos por el banco, los abonos difieren ${formatMxn(dc)} y los cargos ${formatMxn(dd)}`,
    });
  }

  const failedSections = [
    ...new Set(checks.filter((c) => c.blocking && !c.passed).map((c) => c.section)),
  ] as Section[];
  return { checks, passed: failedSections.length === 0, failedSections };
}

/**
 * Banks sometimes print interest and tax near the end of the table with balances from earlier in the
 * month. That is a printing order, not a misread, when the statement still reconciles and the breaks
 * are a few rows in the last part of the table. A break anywhere else stays blocking.
 */
function breaksAreInTheTail(breaks: readonly number[], rows: number): boolean {
  const first = breaks[0];
  if (first === undefined || breaks.length > Math.max(2, Math.floor(rows * 0.05))) return false;
  return first > rows * 0.8;
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
