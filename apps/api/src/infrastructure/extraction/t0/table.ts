import type { Transaction } from '../../../domain/statement/bank-statement';
import type { Cents } from '../../../domain/shared/money';
import type { IsoDate } from '../../../domain/shared/iso-date';
import { type AmountToken, findAmounts } from './amounts';
import { type Period, readRowDate, resolveRowDate } from './dates';
import { normalize } from './normalize';
import { QUALITY_THRESHOLD, type RepairedPage } from './text-quality';

/**
 * Generic transaction-table parser (ADR 0002, T0). No per-bank code paths:
 *
 * 1. A header line (column words, no amounts) switches the table on and gives column positions.
 * 2. A line that starts with a date opens a record; following lines are its continuation.
 *    Amounts may sit on the first line (most banks) or on the last line (Banamex).
 * 3. The debit/credit side is decided by the printed running balance when there is one
 *    (prev ± amount = balance), otherwise by explicit sign, otherwise by the nearest column.
 * 4. Totals/summary lines switch the table off until the next header.
 */

type Role = 'debit' | 'credit' | 'balance' | 'signed';

interface Column {
  role: Role;
  start: number;
  end: number;
}

interface Header {
  columns: Column[];
  dayOnly: boolean;
  signed: boolean;
  /** Left edge of the numeric area; amounts further left belong to descriptions ("670,687.00 COP"). */
  numericStart: number;
}

function roleOf(token: string): Role | null {
  if (/^saldos?\b|^operacion$|^liquidacion$/.test(token)) return 'balance';
  if (/abonos?\b|depositos?\b|posito/.test(token)) return 'credit';
  if (/cargos?\b|retiros?\b/.test(token)) return 'debit';
  if (/^(monto|valor|importe)$/.test(token)) return 'signed';
  return null;
}

export function readHeader(line: string): Header | null {
  if (findAmounts(line).length > 0) return null;
  const norm = normalize(line);
  const columns: Column[] = [];
  for (const m of norm.matchAll(/\S+/g)) {
    const role = roleOf(m[0]);
    if (role) columns.push({ role, start: m.index, end: m.index + m[0].length });
  }
  const has = (r: Role) => columns.some((c) => c.role === r);
  const isHeader =
    (has('debit') && has('credit')) ||
    (has('balance') && (has('debit') || has('credit') || has('signed'))) ||
    (has('signed') && /\bfecha\b/.test(norm));
  if (!isHeader) return null;
  const numeric = columns.filter((c) => c.role !== 'balance' || columns.length > 1);
  return {
    columns,
    dayOnly: /\bdia\b/.test(norm),
    signed: has('signed') && !(has('debit') && has('credit')),
    numericStart: Math.min(...numeric.map((c) => c.start)),
  };
}

const TERMINATOR =
  /^(total(es)?\b|subtotal|total de movimientos|saldo final|saldo al\b|saldo promedio|resumen\b)/;
const OPENING_ROW = /saldo anterior|balance inicial|saldo inicial|periodo anterior/;
/** Closing pseudo-rows ("SALDO AL 28 DE FEBRERO", "SALDO FINAL") print the balance, not a movement. */
const CLOSING_ROW = /^(saldo (al|final|actual)\b|balance final)/;
/** Slack to the left of the numeric area (amounts are right-aligned under wide headers). */
const NUMERIC_SLACK = 16;
/** Lines of description kept per record. */
const MAX_DESCRIPTION_LINES = 8;
/** Lines searched for the record's amounts (Banamex prints them after up to ~15 reference lines). */
const MAX_CONTINUATION_LINES = 30;

interface OpenRecord {
  date: IsoDate;
  page: number;
  text: string[];
  amounts: AmountToken[];
  header: Header;
  continuation: number;
}

export interface TableResult {
  transactions: Transaction[];
  /** Balance found on an "opening" pseudo-row (SALDO ANTERIOR / BALANCE INICIAL), if any. */
  openingFromTable: Cents | null;
  headersFound: number;
}

export function parseTransactions(
  pages: readonly RepairedPage[],
  period: Period,
  openingBalance: Cents | null,
): TableResult {
  const transactions: Transaction[] = [];
  let header: Header | null = null;
  let headersFound = 0;
  let open: OpenRecord | null = null;
  let prevBalance: Cents | null = openingBalance;
  let openingFromTable: Cents | null = null;
  let prevDate: IsoDate | null = null;

  const close = () => {
    if (!open) return;
    const rec = open;
    open = null;
    const description = squash(rec.text.join(' '));
    const inNumeric = rec.amounts.filter((a) => a.end >= rec.header.numericStart - NUMERIC_SLACK);
    // Banks that print "0.00" in the empty debit/credit column (Fondeadora): zeros are not movements.
    // The last amount is kept even if zero: it can be a legitimate 0.00 balance.
    const amounts = inNumeric.filter((a, i) => a.cents !== 0 || i === inNumeric.length - 1);
    if (OPENING_ROW.test(normalize(description))) {
      const last = amounts[amounts.length - 1];
      if (last) {
        openingFromTable = last.cents;
        prevBalance = prevBalance ?? last.cents;
      }
      return;
    }
    if (CLOSING_ROW.test(normalize(description))) return;
    if (amounts.length === 0) return;
    const tx = decide(rec, description, amounts, prevBalance);
    if (!tx) return;
    transactions.push(tx);
    prevBalance = tx.balance ?? (prevBalance === null ? null : prevBalance + tx.credit - tx.debit);
  };

  for (const page of pages) {
    if (page.quality < QUALITY_THRESHOLD) continue;
    // Lines above the repeated table header (bank title, "Página 3 de 31") are page chrome.
    let inPageChrome = true;
    for (const line of page.lines) {
      if (line.trim() === '') continue;
      const h = readHeader(line);
      if (h) {
        // A record can continue across a page break: Banamex prints its amounts after the next
        // page's header. Keep it open while it has no amounts yet.
        const pending = open as OpenRecord | null;
        if (pending && pending.amounts.length > 0) close();
        if (pending) pending.header = h;
        header = h;
        headersFound++;
        inPageChrome = false;
        continue;
      }
      if (!header) continue;
      if (inPageChrome && !readRowDate(line, header.dayOnly)) continue;
      inPageChrome = false;
      const norm = normalize(line).trim();
      if (TERMINATOR.test(norm)) {
        close();
        header = null;
        continue;
      }
      const rowDate = readRowDate(line, header.dayOnly);
      if (rowDate) {
        const date = resolveRowDate(rowDate.date, period, prevDate);
        if (date) {
          close();
          prevDate = date;
          const rest = line.slice(rowDate.end);
          const amounts = findAmounts(line).filter((a) => a.start >= rowDate.end);
          open = {
            date,
            page: page.number,
            text: [stripAmounts(rest, amounts, rowDate.end)],
            amounts,
            header,
            continuation: 0,
          };
          continue;
        }
      }
      if (open) {
        const rec: OpenRecord = open;
        rec.continuation++;
        if (rec.continuation > MAX_CONTINUATION_LINES) continue;
        const amounts = findAmounts(line);
        const inNumeric = amounts.filter((a) => a.end >= rec.header.numericStart - NUMERIC_SLACK);
        // Amounts on a continuation line count only if the record has none yet (Banamex puts them last).
        if (rec.amounts.length === 0 && inNumeric.length > 0) rec.amounts = inNumeric;
        if (rec.text.length < MAX_DESCRIPTION_LINES) rec.text.push(stripAmounts(line, amounts, 0));
      }
    }
  }
  close();
  return { transactions, openingFromTable, headersFound };
}

function decide(
  rec: OpenRecord,
  description: string,
  amounts: AmountToken[],
  prev: Cents | null,
): Transaction | null {
  const base = { date: rec.date, description, page: rec.page };
  const first = amounts[0] as AmountToken;
  const signedTable = rec.header.signed || amounts.some((a) => a.sign !== null);

  // 1. Running balance: try the first amount as the movement against each later amount as the balance.
  if (prev !== null && amounts.length >= 2) {
    for (const candidate of amounts.slice(1)) {
      if (candidate.sign === -1) continue;
      if (Math.abs(prev + first.cents - candidate.cents) <= 1 && !(first.sign === -1)) {
        return {
          ...base,
          credit: first.cents,
          debit: 0,
          balance: candidate.cents,
          sideBy: 'balance-delta',
        };
      }
      if (Math.abs(prev - first.cents - candidate.cents) <= 1 && !(first.sign === 1)) {
        return {
          ...base,
          debit: first.cents,
          credit: 0,
          balance: candidate.cents,
          sideBy: 'balance-delta',
        };
      }
    }
  }

  const balance = amounts.length >= 2 ? (amounts[amounts.length - 1] as AmountToken).cents : null;

  // 2. Explicit sign (Nu, Mercado Pago). In a signed table an unsigned amount is money in.
  if (signedTable) {
    const sign = first.sign ?? 1;
    return sign < 0
      ? { ...base, debit: first.cents, credit: 0, balance, sideBy: 'sign' }
      : { ...base, credit: first.cents, debit: 0, balance, sideBy: 'sign' };
  }

  // 3. Nearest column (amounts are right-aligned under their header). A lone amount under the
  //    balance column is an informational row that only restates the balance, not a movement.
  if (amounts.length === 1 && rec.header.columns.length > 0) {
    const nearestAny = rec.header.columns.reduce((best, c) =>
      distance(first, c) < distance(first, best) ? c : best,
    );
    if (nearestAny.role === 'balance') return null;
  }
  const sides = rec.header.columns.filter((c) => c.role === 'debit' || c.role === 'credit');
  if (sides.length === 0) return null;
  const nearest = sides.reduce((best, c) =>
    distance(first, c) < distance(first, best) ? c : best,
  );
  return nearest.role === 'debit'
    ? { ...base, debit: first.cents, credit: 0, balance, sideBy: 'column' }
    : { ...base, credit: first.cents, debit: 0, balance, sideBy: 'column' };
}

const distance = (a: AmountToken, c: Column): number =>
  Math.min(Math.abs(a.end - c.end), Math.abs((a.start + a.end) / 2 - (c.start + c.end) / 2));

function stripAmounts(text: string, amounts: AmountToken[], offset: number): string {
  let out = text;
  for (const a of [...amounts].sort((x, y) => y.start - x.start)) {
    const s = a.start - offset;
    const e = a.end - offset;
    if (s >= 0 && e <= out.length) out = out.slice(0, s) + ' '.repeat(e - s) + out.slice(e);
  }
  return out;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim().slice(0, 240);
