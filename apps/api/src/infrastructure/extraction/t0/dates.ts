import { type IsoDate, isoDate } from '../../../domain/shared/iso-date';
import { normalize } from './normalize';

/** Spanish and English month names/abbreviations (dataset mixes both: "13 de June"). */
const MONTHS: Record<string, number> = {
  ene: 1,
  enero: 1,
  jan: 1,
  january: 1,
  feb: 2,
  febrero: 2,
  february: 2,
  mar: 3,
  marzo: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  june: 6,
  jul: 7,
  julio: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  set: 9,
  septiembre: 9,
  setiembre: 9,
  september: 9,
  oct: 10,
  octubre: 10,
  october: 10,
  nov: 11,
  noviembre: 11,
  november: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
  december: 12,
};
const MONTH_WORD = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');

export const monthFromWord = (w: string): number | null =>
  MONTHS[normalize(w).replace(/\./g, '')] ?? null;

/** A date with possibly missing parts, as printed: "01", "13 de June", "01/FEB/2026", "31/10/2025". */
interface PartialDate {
  day: number;
  month: number | null;
  year: number | null;
}

const D = String.raw`(\d{1,2})`;
const MW = String.raw`(${MONTH_WORD})\.?`;
const Y = String.raw`(\d{4})`;

// Order matters: most specific first.
const DATE_FORMS: { re: RegExp; read: (m: RegExpMatchArray) => PartialDate | null }[] = [
  { re: new RegExp(String.raw`${D}[/-](\d{1,2})[/-]${Y}`, 'y'), read: (m) => pd(m[1], m[2], m[3]) },
  { re: new RegExp(String.raw`${D}[/ -]${MW}[/ -]${Y}`, 'y'), read: (m) => pdw(m[1], m[2], m[3]) },
  {
    re: new RegExp(String.raw`${D}\s+de\s+${MW}(?:\s+(?:de\s+|del\s+)?${Y})?`, 'y'),
    read: (m) => pdw(m[1], m[2], m[3]),
  },
  {
    re: new RegExp(String.raw`${D}[/ -]${MW}(?:\s+${Y})?`, 'y'),
    read: (m) => pdw(m[1], m[2], m[3]),
  },
  {
    re: new RegExp(String.raw`${D}(?![\d/.,:-])`, 'y'),
    read: (m) => pd(m[1], undefined, undefined),
  },
];

function pd(d?: string, m?: string, y?: string): PartialDate | null {
  const day = Number(d);
  if (!(day >= 1 && day <= 31)) return null;
  const month = m === undefined ? null : Number(m);
  if (month !== null && !(month >= 1 && month <= 12)) return null;
  return { day, month, year: y === undefined ? null : Number(y) };
}

function pdw(d?: string, mw?: string, y?: string): PartialDate | null {
  const month = mw === undefined ? null : monthFromWord(mw);
  if (month === null) return null;
  return pd(d, String(month), y);
}

function readDateAt(text: string, pos: number): { date: PartialDate; end: number } | null {
  for (const f of DATE_FORMS) {
    f.re.lastIndex = pos;
    const m = f.re.exec(text);
    if (m) {
      const date = f.read(m);
      if (date) return { date, end: pos + m[0].length };
    }
  }
  return null;
}

export interface Period {
  start: IsoDate;
  end: IsoDate;
}

/**
 * Finds "<date> al <date>" with an optional "del/periodo" prefix. The first date may be partial
 * ("del 01 al 30 de abril 2025", "Del 13 de June al 11 de septiembre de 2026"): missing parts are
 * taken from the second date; the year rolls back when the start month is after the end month.
 */
export function findPeriod(text: string): Period | null {
  const t = normalize(text);
  const sep = /\s*\bal\b\s*|(?<=\d)al\s+/g;
  for (const m of t.matchAll(sep)) {
    const endRead = readDateAt(t, m.index + m[0].length);
    if (!endRead || endRead.date.month === null || endRead.date.year === null) continue;
    const startRead = readStartBefore(t, m.index);
    if (!startRead) continue;
    const e = endRead.date as Required<{ [K in keyof PartialDate]: number }>;
    const sMonth = startRead.month ?? e.month;
    const sYear = startRead.year ?? (sMonth > e.month ? e.year - 1 : e.year);
    const start = isoDate(sYear, sMonth, startRead.day);
    const end = isoDate(e.year, e.month, e.day);
    if (start && end && start <= end) return { start, end };
  }
  return null;
}

/** Tries every start position in a short window before " al " and keeps the longest valid date that ends there. */
function readStartBefore(t: string, sepIndex: number): PartialDate | null {
  const window = 28;
  for (let pos = Math.max(0, sepIndex - window); pos < sepIndex; pos++) {
    if (pos > 0 && /[\d]/.test(t[pos - 1] as string)) continue;
    const r = readDateAt(t, pos);
    if (r && r.end === sepIndex) {
      const prefix = t.slice(Math.max(0, pos - 12), pos);
      if (/(del?|periodo|:)\s*$/.test(prefix) || r.date.month !== null) return r.date;
    }
  }
  return null;
}

export interface RowDateContext {
  period: Period;
  allowDayOnly: boolean;
}

/**
 * Date at the start of a table row. Supported: 31/10/2025, 14-06-2026, 01-ABR-2025, 01/FEB, 03 FEB,
 * 31 JUL 2025, ENE. 16, and (only when the table has a "día" column) a bare day "07".
 * Returns the partial date and where it ends, or null.
 */
export function readRowDate(
  line: string,
  allowDayOnly: boolean,
): { date: PartialDate; end: number } | null {
  const t = normalize(line);
  const lead = t.length - t.trimStart().length;
  if (lead > 6) return null;
  if (allowDayOnly) {
    // Tables with a "día" column print only the day. Do not read "19 MAR…" as March: MAR can be a merchant.
    const m = /(\d{1,2})(?=[\sa-z])/y;
    m.lastIndex = lead;
    const dm = m.exec(t);
    const day = dm ? Number(dm[1]) : 0;
    return dm && day >= 1 && day <= 31
      ? { date: { day, month: null, year: null }, end: lead + (dm[0] as string).length }
      : null;
  }
  // "ene. 16" (month first)
  const mf = new RegExp(String.raw`(${MONTH_WORD})\.?\s+(\d{1,2})(?![\d/.,:-])`, 'y');
  mf.lastIndex = lead;
  const mfm = mf.exec(t);
  if (mfm) {
    const month = monthFromWord(mfm[1] as string);
    const day = Number(mfm[2]);
    if (month && day >= 1 && day <= 31)
      return { date: { day, month, year: null }, end: lead + mfm[0].length };
  }
  const r = readDateAt(t, lead);
  if (!r) return null;
  if (r.date.month === null) {
    if (!allowDayOnly) return null;
    // A bare day must be followed by a space or a letter ("07 EFE", "06CGO"), never by digits.
    const next = t[r.end];
    if (next !== undefined && !/[\sa-z]/.test(next)) return null;
  }
  return r;
}

/** Resolves a partial row date against the statement period. `prev` keeps day-only rows monotonic. */
export function resolveRowDate(
  d: PartialDate,
  period: Period,
  prev: IsoDate | null,
): IsoDate | null {
  const [ey, em] = period.end.split('-').map(Number) as [number, number];
  const [sy, sm] = period.start.split('-').map(Number) as [number, number];
  if (d.month !== null) {
    // A month after the end month belongs to the start year (periods crossing New Year).
    const year = d.year ?? (d.month > em ? sy : ey);
    return isoDate(year, d.month, d.day);
  }
  // Day only: start from the period's first month, move forward when the day goes backwards.
  let year = sy;
  let month = sm;
  if (prev) {
    const [py, pm, pday] = prev.split('-').map(Number) as [number, number, number];
    year = py;
    month = pm;
    if (d.day < pday) {
      month++;
      if (month > 12) {
        month = 1;
        year++;
      }
    }
  }
  return isoDate(year, month, d.day);
}
