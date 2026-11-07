import type { PageText } from '../../../application/ports/document-text.port';
import { CP500_TO_UNICODE } from './cp500';

/**
 * Text-quality gate (ADR 0002). A PDF can have a text layer that is garbage: HSBC maps glyphs
 * through EBCDIC, so "CUENTA" comes out as "ÃäÅÕãÁ". Having text is not the same as having usable text.
 */

/** Characters expected in Spanish/English financial text. */
const COMMON = /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ.,:;$%/()\-+*#'"&@°_]/;

/** Share of non-space characters that look like normal text (0..1). */
export function textQuality(lines: readonly string[]): number {
  let total = 0;
  let good = 0;
  for (const line of lines) {
    for (const ch of line) {
      if (ch === ' ' || ch === '\t') continue;
      total++;
      if (COMMON.test(ch)) good++;
    }
  }
  return total === 0 ? 0 : good / total;
}

/** Windows-1252 code points in 0x80–0x9F, so we can recover the original byte of each glyph. */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * Re-reads each glyph's byte as EBCDIC (cp500). Spaces are pdftotext's layout padding, not glyphs,
 * so they are kept: that preserves the column alignment the table parser needs.
 */
export function decodeEbcdicLine(line: string): string {
  let out = '';
  for (const ch of line) {
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    const cp = ch.codePointAt(0) as number;
    const byte = cp <= 0xff ? cp : CP1252_HIGH[cp];
    out += byte === undefined ? ch : String.fromCodePoint(CP500_TO_UNICODE[byte] as number);
  }
  return out;
}

export const QUALITY_THRESHOLD = 0.75;

export interface RepairedPage extends PageText {
  quality: number;
  repair: 'none' | 'ebcdic';
}

/** Repairs a page if its text looks like garbage and the EBCDIC reading is clearly better. */
export function repairPage(page: PageText): RepairedPage {
  const quality = textQuality(page.lines);
  if (quality >= QUALITY_THRESHOLD) return { ...page, quality, repair: 'none' };
  const decoded = page.lines.map(decodeEbcdicLine);
  const decodedQuality = textQuality(decoded);
  if (decodedQuality >= QUALITY_THRESHOLD && decodedQuality > quality) {
    return { number: page.number, lines: decoded, quality: decodedQuality, repair: 'ebcdic' };
  }
  return { ...page, quality, repair: 'none' };
}
