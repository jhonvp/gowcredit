import { normalize } from './normalize';

export interface FuzzyMatch {
  start: number;
  end: number;
  errors: number;
}

/**
 * Approximate substring search (Sellers' algorithm): finds `pattern` in `text` with at most
 * `maxErrors` insertions/deletions/substitutions. Both are normalized (case, accents). Used for
 * labels in damaged text: EBCDIC-repaired HSBC ("Saldo Inicial d l") and OCR output.
 */
export function fuzzyFind(text: string, pattern: string, maxErrors: number): FuzzyMatch | null {
  const t = normalize(text);
  const p = normalize(pattern);
  const m = p.length;
  if (m === 0) return null;
  if (maxErrors === 0) {
    const i = t.indexOf(p);
    return i < 0 ? null : { start: i, end: i + m, errors: 0 };
  }
  // prev[i] = edit distance of p[0..i) vs some substring of t ending at the current column; start[i] tracks where it began.
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let prevStart = new Array<number>(m + 1).fill(0);
  let best: FuzzyMatch | null = null;
  for (let j = 1; j <= t.length; j++) {
    const cur = new Array<number>(m + 1);
    const curStart = new Array<number>(m + 1);
    cur[0] = 0;
    curStart[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = p[i - 1] === t[j - 1] ? 0 : 1;
      const sub = (prev[i - 1] as number) + cost;
      const del = (prev[i] as number) + 1;
      const ins = (cur[i - 1] as number) + 1;
      if (sub <= del && sub <= ins) {
        cur[i] = sub;
        curStart[i] = prevStart[i - 1] as number;
      } else if (del <= ins) {
        cur[i] = del;
        curStart[i] = prevStart[i] as number;
      } else {
        cur[i] = ins;
        curStart[i] = curStart[i - 1] as number;
      }
    }
    const errors = cur[m] as number;
    if (errors <= maxErrors && (best === null || errors < best.errors)) {
      best = { start: curStart[m] as number, end: j, errors };
      if (errors === 0) return best;
    }
    prev = cur;
    prevStart = curStart;
  }
  return best;
}

/** Error budget proportional to label length: short labels must match exactly. */
export const errorBudget = (label: string): number =>
  label.length >= 12 ? 2 : label.length >= 6 ? 1 : 0;
