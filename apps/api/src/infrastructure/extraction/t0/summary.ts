import type { Cents } from '../../../domain/shared/money';
import { findAmounts } from './amounts';
import { errorBudget, fuzzyFind } from './fuzzy';
import { normalize } from './normalize';
import type { RepairedPage } from './text-quality';

/**
 * Summary fields by label → nearest amount to the RIGHT on the same line. Labels are generic
 * Spanish banking vocabulary (no per-bank branches). Earliest occurrence in the document wins,
 * because the account summary is on the first page(s).
 */
interface LabelSpec {
  labels: string[];
  /** Skip a match when the rest of the line says it's something else ("saldo final del periodo ANTERIOR"). */
  exclude?: RegExp;
}

const SPECS = {
  opening: {
    labels: [
      'saldo final del periodo anterior',
      'saldo de liquidacion inicial',
      'saldo de operacion inicial',
      'saldo inicial del periodo',
      'saldo inicial',
      'saldo anterior',
      'balance inicial',
    ],
  },
  closing: {
    labels: [
      'saldo final del periodo',
      'saldo al generar este estado de cuenta',
      'saldo final',
      'saldo actual',
      'saldo al',
    ],
    exclude: /anterior|promedio|minimo|bloqueado/,
  },
  credits: {
    labels: ['depositos / abonos', 'total importe abonos', 'depositos', 'abonos', 'entradas'],
    exclude: /objetad|promedio/,
  },
  debits: {
    labels: ['retiros / cargos', 'total importe cargos', 'retiros', 'cargos', 'salidas', 'gastos'],
    exclude: /objetad|promedio|comision/,
  },
} satisfies Record<string, LabelSpec>;

export type SummaryField = keyof typeof SPECS;

export interface LabeledAmount {
  cents: Cents;
  page: number;
  label: string;
}

/** Max columns between the end of a label and its amount. */
const MAX_GAP = 140;

export function findLabeledAmount(
  pages: readonly RepairedPage[],
  field: SummaryField,
): LabeledAmount | null {
  const spec: LabelSpec = SPECS[field];
  for (const page of pages) {
    for (const line of page.lines) {
      const amounts = findAmounts(line);
      if (amounts.length === 0) continue;
      const norm = normalize(line);
      let best: { label: string; amountStart: number; cents: Cents; gap: number } | null = null;
      for (const label of spec.labels) {
        const match = fuzzyFind(line, label, errorBudget(label));
        if (!match) continue;
        // Must look like a label: at a word boundary.
        if (match.start > 0 && /[a-z0-9]/.test(norm[match.start - 1] as string)) continue;
        const tail = norm.slice(match.end, match.end + 40);
        if (
          spec.exclude?.test(tail) ||
          spec.exclude?.test(norm.slice(Math.max(0, match.start - 15), match.start))
        )
          continue;
        const next = amounts.find((a) => a.start >= match.end && a.start - match.end <= MAX_GAP);
        if (!next) continue;
        // Another label between this label and the amount means the amount belongs to that one.
        const between = norm.slice(match.end, next.start);
        if (/[a-z]{4,}/.test(between.replace(/\b(del|de|la|el|mes|periodo|mxn|pesos|en)\b/g, '')))
          continue;
        const gap = next.start - match.end;
        if (!best || gap < best.gap)
          best = { label, amountStart: next.start, cents: next.cents, gap };
      }
      if (best) return { cents: best.cents, page: page.number, label: best.label };
    }
  }
  return null;
}

/** Statement currency. Mexican statements say "pesos", "moneda nacional", "MXN" or "M.N.". */
export function detectCurrency(pages: readonly RepairedPage[]): string | null {
  const text = normalize(
    pages
      .slice(0, 3)
      .flatMap((p) => p.lines)
      .join('\n'),
  );
  if (/\b(usd|dolares)\b/.test(text) && !/\b(mxn|pesos|moneda nacional)\b/.test(text)) return 'USD';
  if (/\bmxn\b|pesos|moneda nacional|\bm\.n\./.test(text)) return 'MXN';
  // "$" amounts on a Mexican document (RFC/CURP/SPEI/CLABE/México) are pesos (SPEC A2).
  if (/\$/.test(text) && /\b(rfc|curp|spei|clabe|mexico)\b/.test(text)) return 'MXN';
  return null;
}
