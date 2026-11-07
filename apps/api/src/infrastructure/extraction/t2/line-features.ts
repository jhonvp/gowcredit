import { findAmounts } from '../t0/amounts';
import { readRowDate } from '../t0/dates';
import { normalize } from '../t0/normalize';

/**
 * Line features for the T2 classifier (ADR 0003). Layout and lexical cues only, no bank names, so the
 * model transfers to layouts it has not seen. Shared by the training script and the runtime adapter.
 */
export const CLASSES = ['other', 'table_header', 'transaction_row', 'continuation'] as const;
export type LineClass = (typeof CLASSES)[number];

export const FEATURE_NAMES = [
  'leading_date',
  'leading_day',
  'amount_count',
  'has_amount',
  'signed_amount',
  'last_amount_end',
  'first_amount_start',
  'indent',
  'tokens',
  'digit_fraction',
  'upper_fraction',
  'header_words',
  'kw_saldo',
  'kw_total',
  'y_position',
  'length',
  'prev_leading_date',
  'next_leading_date',
  'prev_has_amount',
  'next_has_amount',
  'blank_before',
] as const;

const HEADER_WORD =
  /\b(fecha|dia|concepto|descripcion|detalle|referencia|cargos?|abonos?|retiros?|depositos?|saldos?|importe|monto|valor|movimientos?)\b/g;

interface LineFacts {
  date: boolean;
  day: boolean;
  amounts: ReturnType<typeof findAmounts>;
  blank: boolean;
}

export function pageFeatures(lines: readonly string[]): number[][] {
  const facts: LineFacts[] = lines.map((l) => ({
    date: readRowDate(l, false) !== null,
    day: readRowDate(l, true) !== null,
    amounts: findAmounts(l),
    blank: l.trim() === '',
  }));
  const width = Math.max(40, ...lines.map((l) => l.trimEnd().length));
  return lines.map((line, i) => {
    const f = facts[i] as LineFacts;
    const prev = facts[i - 1];
    const next = facts[i + 1];
    const norm = normalize(line);
    const trimmed = line.trim();
    const letters = trimmed.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
    const lastEnd = f.amounts.length ? (f.amounts[f.amounts.length - 1]?.end ?? 0) : 0;
    const firstStart = f.amounts.length ? (f.amounts[0]?.start ?? 0) : 0;
    return [
      +f.date,
      +f.day,
      Math.min(f.amounts.length, 4) / 4,
      +(f.amounts.length > 0),
      +f.amounts.some((a) => a.sign !== null),
      lastEnd / width,
      firstStart / width,
      Math.min(line.length - line.trimStart().length, 40) / 40,
      Math.min(trimmed.split(/\s+/).filter(Boolean).length, 20) / 20,
      trimmed.length ? trimmed.replace(/[^\d]/g, '').length / trimmed.length : 0,
      letters.length ? letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / letters.length : 0,
      Math.min((norm.match(HEADER_WORD) ?? []).length, 4) / 4,
      +/\bsaldo/.test(norm),
      +/\btotal/.test(norm),
      lines.length > 1 ? i / (lines.length - 1) : 0,
      trimmed.length / width,
      +(prev?.date ?? false),
      +(next?.date ?? false),
      +((prev?.amounts.length ?? 0) > 0),
      +((next?.amounts.length ?? 0) > 0),
      +(prev?.blank ?? true),
    ];
  });
}
