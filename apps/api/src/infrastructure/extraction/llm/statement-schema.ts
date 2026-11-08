import { z } from 'zod';
import {
  type BankStatement,
  type OtherItem,
  SUMMARY_ITEM_DESCRIPTION,
  SUMMARY_ROW_PREFIX,
  type Tier,
  type Transaction,
} from '../../../domain/statement/bank-statement';
import { formatMxn, fromCents, toCents } from '../../../domain/shared/money';
import { isIsoDate } from '../../../domain/shared/iso-date';

/**
 * Wire format between the LLM tiers and the domain. Amounts are pesos (decimal numbers) because
 * that is how the documents print them; they become integer cents at the boundary.
 * Hand-written JSON Schema (structured outputs accept a subset: no min/max, every object closed).
 */
const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] });

export const ROW_JSON_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string', description: 'YYYY-MM-DD' },
    description: { type: 'string' },
    page: { type: 'integer' },
    debit: { type: 'number', description: 'Money out, pesos, >= 0' },
    credit: { type: 'number', description: 'Money in, pesos, >= 0' },
    balance: { ...nullable('number'), description: 'Running balance printed on the row, or null' },
    fromSummary: {
      type: 'boolean',
      description:
        'true only for a movement taken from the summary section because no row lists it',
    },
  },
  required: ['date', 'description', 'page', 'debit', 'credit', 'balance', 'fromSummary'],
  additionalProperties: false,
} as const;

export const SUMMARY_PROPERTIES = {
  bankName: nullable('string'),
  currency: { ...nullable('string'), description: 'ISO 4217, e.g. MXN' },
  periodStart: { ...nullable('string'), description: 'YYYY-MM-DD' },
  periodEnd: { ...nullable('string'), description: 'YYYY-MM-DD' },
  openingBalance: nullable('number'),
  closingBalance: nullable('number'),
  reportedCredits: { ...nullable('number'), description: 'Total deposits as printed, or null' },
  reportedDebits: { ...nullable('number'), description: 'Total withdrawals as printed, or null' },
} as const;

const SUMMARY_ITEM_JSON_SCHEMA = {
  type: 'object',
  properties: {
    concept: { type: 'string', description: 'The concept as printed, in Spanish' },
    amount: {
      type: 'number',
      description: 'Pesos. Positive adds to the balance (interest), negative subtracts (tax, fee)',
    },
  },
  required: ['concept', 'amount'],
  additionalProperties: false,
} as const;

export const STATEMENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    ...SUMMARY_PROPERTIES,
    summaryItems: { type: 'array', items: SUMMARY_ITEM_JSON_SCHEMA },
    transactions: { type: 'array', items: ROW_JSON_SCHEMA },
  },
  required: [...Object.keys(SUMMARY_PROPERTIES), 'summaryItems', 'transactions'],
  additionalProperties: false,
} as const;

const money = z.number().finite();
export const llmRowSchema = z.object({
  date: z.string(),
  description: z.string(),
  page: z.number().int(),
  debit: money.nonnegative(),
  credit: money.nonnegative(),
  balance: money.nullable(),
  fromSummary: z.boolean(),
});
export const llmStatementSchema = z.object({
  bankName: z.string().nullable(),
  currency: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  openingBalance: money.nullable(),
  closingBalance: money.nullable(),
  reportedCredits: money.nullable(),
  reportedDebits: money.nullable(),
  summaryItems: z.array(z.object({ concept: z.string(), amount: money })).default([]),
  transactions: z.array(llmRowSchema),
});
export type LlmRow = z.infer<typeof llmRowSchema>;
export type LlmStatement = z.infer<typeof llmStatementSchema>;

export { SUMMARY_ROW_PREFIX };

const cents = (v: number | null): number | null => (v === null ? null : toCents(v));
const date = (v: string | null): string | null => (v !== null && isIsoDate(v) ? v : null);

export function toRow(r: LlmRow): Transaction {
  return {
    date: isIsoDate(r.date) ? r.date : '0000-00-00',
    description: (r.fromSummary ? SUMMARY_ROW_PREFIX : '') + r.description.trim().slice(0, 240),
    debit: toCents(r.debit),
    credit: toCents(r.credit),
    balance: cents(r.balance),
    page: r.page,
    sideBy: 'model',
  };
}

/** A summary-only amount reported by a model. It only counts if adjustStatement can verify it. */
export function toOtherItem(concept: string, pesos: number): OtherItem {
  return {
    concept: concept.trim().slice(0, 80),
    amount: toCents(pesos),
    description: SUMMARY_ITEM_DESCRIPTION,
  };
}

export function toDomain(s: LlmStatement, tier: Tier): BankStatement {
  return {
    summary: {
      bankName: s.bankName?.trim() || null,
      holderName: null,
      holderRfc: null,
      currency: s.currency?.trim().toUpperCase() || null,
      periodStart: date(s.periodStart),
      periodEnd: date(s.periodEnd),
      openingBalance: cents(s.openingBalance),
      closingBalance: cents(s.closingBalance),
      reportedCredits: cents(s.reportedCredits),
      reportedDebits: cents(s.reportedDebits),
      printedExtras: s.summaryItems.map((i) => toOtherItem(i.concept, i.amount)),
    },
    transactions: s.transactions.map(toRow),
    provenance: { summary: tier, transactions: tier },
  };
}

/** Compact, model-friendly view of a candidate (pesos, one row per line, with indexes). */
export function describeRows(rows: readonly Transaction[], from = 0, to = rows.length): string {
  const peso = (c: number) => (c === 0 ? '' : formatMxn(c));
  return rows
    .slice(from, to)
    .map(
      (t, i) =>
        `${from + i}\t${t.date}\tp${t.page}\t${peso(t.debit)}\t${peso(t.credit)}\t${t.balance === null ? '' : formatMxn(t.balance)}\t${t.description}`,
    )
    .join('\n');
}

export function describeSummary(s: BankStatement['summary']): string {
  const m = (c: number | null) => (c === null ? 'null' : fromCents(c).toFixed(2));
  return [
    `bankName: ${s.bankName ?? 'null'}`,
    `currency: ${s.currency ?? 'null'}`,
    `periodStart: ${s.periodStart ?? 'null'}`,
    `periodEnd: ${s.periodEnd ?? 'null'}`,
    `openingBalance: ${m(s.openingBalance)}`,
    `closingBalance: ${m(s.closingBalance)}`,
    `reportedCredits: ${m(s.reportedCredits)}`,
    `reportedDebits: ${m(s.reportedDebits)}`,
  ].join('\n');
}
