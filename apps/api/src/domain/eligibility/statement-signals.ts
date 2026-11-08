import { type BankStatement, totalCredits, totalDebits } from '../statement/bank-statement';
import { daysBetween } from '../shared/iso-date';
import type { Cents } from '../shared/money';

/** Financial signals of a bank statement used by the score (docs/eligibility-policy.md §2). */
export interface StatementSignals {
  periodDays: number;
  months: number;
  avgMonthlyCredits: Cents;
  avgMonthlyDebits: Cents;
  /** Time-weighted average of the end-of-day balance over the period. */
  avgDailyBalance: Cents;
  bouncedEntries: number;
  /** Share (0–1) of credits coming from the largest payer. */
  topPayerShare: number;
  creditDebitRatio: number | null;
  minBalance: Cents;
}

const BOUNCED = /\b(devolucion|devuelto|rechaz\w*|insuficien\w*|sin fondos)\b/i;

/** Counterparty key: description without digits, references and transfer boilerplate. */
export function payerKey(description: string): string {
  return description
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(
      /\b(SPEI|DEPOSITO|TRANSFERENCIA|RECIBIDA?|ABONO|PAGO|DE|DEL|REF|CTA|CLABE|BCO|BANCO)\b/g,
      ' ',
    )
    .replace(/[^A-Z ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 3)
    .join(' ');
}

export function statementSignals(s: BankStatement): StatementSignals {
  const start = s.summary.periodStart as string;
  const end = s.summary.periodEnd as string;
  const periodDays = Math.max(1, daysBetween(start, end) + 1);
  const months = Math.max(1, periodDays / 30.4375);
  const credits = totalCredits(s);
  const debits = totalDebits(s);

  // End-of-day balance, carried forward across days without movements.
  const opening = s.summary.openingBalance ?? 0;
  const eod = new Map<string, Cents>();
  let running = opening;
  let minBalance = opening;
  for (const t of s.transactions) {
    if (t.internal) continue;
    running = t.balance ?? running + t.credit - t.debit;
    eod.set(t.date, running);
    minBalance = Math.min(minBalance, running);
  }
  let weighted = 0;
  let balance = opening;
  for (let d = 0; d < periodDays; d++) {
    const day = new Date(Date.parse(`${start}T00:00:00Z`) + d * 86_400_000)
      .toISOString()
      .slice(0, 10);
    balance = eod.get(day) ?? balance;
    weighted += balance;
  }

  const byPayer = new Map<string, Cents>();
  for (const t of s.transactions)
    if (t.credit > 0 && !t.internal)
      byPayer.set(payerKey(t.description), (byPayer.get(payerKey(t.description)) ?? 0) + t.credit);
  const top = Math.max(0, ...byPayer.values());

  return {
    periodDays,
    months,
    avgMonthlyCredits: Math.round(credits / months),
    avgMonthlyDebits: Math.round(debits / months),
    avgDailyBalance: Math.round(weighted / periodDays),
    bouncedEntries: s.transactions.filter((t) => !t.internal && BOUNCED.test(t.description)).length,
    topPayerShare: credits > 0 ? top / credits : 0,
    creditDebitRatio: debits > 0 ? credits / debits : null,
    minBalance,
  };
}
