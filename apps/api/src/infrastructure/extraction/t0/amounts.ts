import { type Cents } from '../../../domain/shared/money';

export interface AmountToken {
  /** Absolute value in cents. */
  cents: Cents;
  /** -1 / +1 when the text carries an explicit sign, otherwise null. */
  sign: -1 | 1 | null;
  /** Column span in the layout line [start, end). */
  start: number;
  end: number;
}

/**
 * Money with exactly two decimals: `1,433.91`, `$ 15,185.06`, `-$82.00`, `+$100.00`, `$ -40.00`.
 * Excluded: percentages (`3.04%`), numbers glued to other digits (references), integers (counts).
 */
const AMOUNT = /([+-])?\s?\$?\s?([+-])?\s?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d%])/g;

export function findAmounts(line: string): AmountToken[] {
  const out: AmountToken[] = [];
  for (const m of line.matchAll(AMOUNT)) {
    const text = m[0];
    // Leading whitespace captured by \s? is not part of the token.
    const lead = text.length - text.trimStart().length;
    const start = m.index + lead;
    // A bare number glued to a preceding digit/dot/comma is the tail of a longer number (reference).
    // A "$" or sign right after a reference is a separator, so "…625$ 15,185.06" is still an amount.
    const before = start > 0 ? line[start - 1] : ' ';
    if (/^\d/.test(text.trimStart()) && before !== undefined && /[\d.,]/.test(before)) continue;
    const signChar = m[1] ?? m[2];
    const digits = (m[3] as string).replace(/,/g, '');
    out.push({
      cents: Number(digits) * 100 + Number(m[4]),
      sign: signChar === '-' ? -1 : signChar === '+' ? 1 : null,
      start,
      end: m.index + text.length,
    });
  }
  return out;
}
