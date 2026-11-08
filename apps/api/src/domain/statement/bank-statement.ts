import type { Cents } from '../shared/money';
import type { IsoDate } from '../shared/iso-date';

/** Which cascade tier produced a section (ADR 0002). */
export type Tier = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface Transaction {
  date: IsoDate;
  description: string;
  /** Exactly one of debit/credit is > 0. */
  debit: Cents;
  credit: Cents;
  /** Running balance printed on the row, when the bank prints one. */
  balance: Cents | null;
  page: number;
  /**
   * How the debit/credit side was decided: balance delta (strong), column/sign (weaker), or read
   * by an LLM tier (checked afterwards by the same validators).
   */
  sideBy: 'balance-delta' | 'column' | 'sign' | 'model';
  /** A transfer between the holder's own pockets: kept and shown, but not income or spending. */
  internal?: boolean;
}

/** An amount that changes the balance but is not printed as a movement (e.g. interest). */
export interface OtherItem {
  concept: string;
  /** Signed: positive adds to the balance. */
  amount: Cents;
  description: string;
}

export interface StatementSummary {
  bankName: string | null;
  /** Anonymized in the dataset → null is a valid value (SPEC A4). */
  holderName: string | null;
  holderRfc: string | null;
  currency: string | null;
  periodStart: IsoDate | null;
  periodEnd: IsoDate | null;
  openingBalance: Cents | null;
  closingBalance: Cents | null;
  /** Totals as printed by the bank (definitions vary by bank; informative). */
  reportedCredits: Cents | null;
  reportedDebits: Cents | null;
  /** Amounts found in the summary, before deciding whether they count. */
  printedExtras?: OtherItem[];
  /** The printed extras that explain the reconciliation (see adjustStatement). */
  otherItems?: OtherItem[];
}

/** Why a summary-only amount is listed apart; shown to people next to the amount. */
export const SUMMARY_ITEM_DESCRIPTION =
  'Importe que el banco imprime en el resumen y no como movimiento. Forma parte del saldo final, pero no se cuenta como abono ni cargo.';

export interface BankStatement {
  summary: StatementSummary;
  transactions: Transaction[];
  provenance: { summary: Tier; transactions: Tier };
}

/**
 * Prefix of rows that an LLM tier took from the summary section because the statement does not print
 * them as movements (e.g. interest shown only in the summary). Kept in the description so analysts see it.
 */
export const SUMMARY_ROW_PREFIX = '[resumen] ';
export const isSummaryRow = (t: Transaction): boolean =>
  t.description.startsWith(SUMMARY_ROW_PREFIX);

export const totalCredits = (s: BankStatement): Cents =>
  s.transactions.reduce((a, t) => a + (t.internal ? 0 : t.credit), 0);
export const totalDebits = (s: BankStatement): Cents =>
  s.transactions.reduce((a, t) => a + (t.internal ? 0 : t.debit), 0);

export const otherItemsTotal = (summary: Pick<StatementSummary, 'otherItems'>): Cents =>
  (summary.otherItems ?? []).reduce((a, i) => a + i.amount, 0);
