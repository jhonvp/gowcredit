import type { Cents } from '../shared/money';
import { type BankStatement, otherItemsTotal, totalCredits, totalDebits } from './bank-statement';

/** Same tolerance as the validators' reconciliation: 1.00 MXN of rounding in bank summaries. */
const TOTALS_TOLERANCE: Cents = 100;

const close = (a: Cents, b: Cents): boolean => Math.abs(a - b) <= TOTALS_TOLERANCE;

/**
 * Normalizes what a statement prints beyond its movements, for any bank and any tier. Idempotent:
 * every call starts again from the printed rows and `printedExtras`.
 *
 * Nothing is deleted or invented. Rows are only labelled, and a printed amount only counts when it
 * explains a difference to the cent.
 */
export function adjustStatement(s: BankStatement): BankStatement {
  const marked = markInternalTransfers(s);
  return { ...marked, summary: { ...marked.summary, otherItems: explainedExtras(marked) } };
}

/**
 * Some statements print a transfer between the holder's own pockets twice with opposite signs (Nu:
 * once under the account, once under the "Cajita"). Such rows are neither income nor spending.
 * Mirror pairs (same date, amount and concept, opposite side) are only marked when removing them makes the
 * rows match the totals the bank printed: a purchase and its same-day refund are also mirror pairs,
 * and without that confirmation they would be hidden.
 */
function markInternalTransfers(s: BankStatement): BankStatement {
  const rows = s.transactions.map((t) => ({ ...t, internal: false }));
  const clean = { ...s, transactions: rows };
  const { reportedCredits, reportedDebits } = s.summary;
  if (reportedCredits === null || reportedDebits === null) return clean;
  if (close(totalCredits(clean), reportedCredits) && close(totalDebits(clean), reportedDebits))
    return clean;

  const openDebits = new Map<string, number[]>();
  rows.forEach((t, i) => {
    if (t.debit <= 0) return;
    const key = `${t.date}|${t.debit}`;
    openDebits.set(key, [...(openDebits.get(key) ?? []), i]);
  });
  const marked = new Set<number>();
  rows.forEach((t, i) => {
    if (t.credit <= 0) return;
    const open = openDebits.get(`${t.date}|${t.credit}`) ?? [];
    const at = open.findIndex((d) => sameConcept(rows[d]?.description ?? '', t.description));
    if (at === -1) return;
    marked.add(i);
    marked.add(open.splice(at, 1)[0] as number);
  });
  if (marked.size === 0) return clean;

  const candidate = {
    ...s,
    transactions: rows.map((t, i) => ({ ...t, internal: marked.has(i) })),
  };
  return close(totalCredits(candidate), reportedCredits) &&
    close(totalDebits(candidate), reportedDebits)
    ? candidate
    : clean;
}

const conceptOf = (description: string): string =>
  description
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();

/**
 * A real deposit and a real expense can share a date and an amount, so the concept must match too.
 * One copy may carry extra text (a counterparty on a wrapped line), so it is enough that one starts
 * the other or that they share their first four words.
 */
function sameConcept(a: string, b: string): boolean {
  const [x, y] = [conceptOf(a), conceptOf(b)];
  if (!x || !y) return false;
  if (x.startsWith(y) || y.startsWith(x)) return true;
  const [xs, ys] = [x.split(' '), y.split(' ')];
  return xs.slice(0, 4).length === 4 && xs.slice(0, 4).every((word, i) => word === ys[i]);
}

/** Amounts printed only in the summary count when, together, they close the difference exactly. */
function explainedExtras(s: BankStatement): BankStatement['summary']['otherItems'] {
  const extras = s.summary.printedExtras ?? [];
  const { openingBalance: opening, closingBalance: closing } = s.summary;
  if (extras.length === 0 || opening === null || closing === null) return [];
  const missing = closing - (opening + totalCredits(s) - totalDebits(s));
  const sum = otherItemsTotal({ otherItems: extras });
  return missing !== 0 && Math.abs(missing - sum) <= 1 ? extras : [];
}
