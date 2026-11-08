import type { BankStatement, Tier } from '../../domain/statement/bank-statement';
import type { ValidationReport } from '../../domain/validation/statement-validators';
import type { DocumentText } from './document-text.port';

export type Diagnostics = Record<string, string | number | boolean | null>;

export interface StatementExtraction {
  statement: BankStatement;
  /** Tier-specific facts for the eval report and logs (never PII). `costUsd` is summed per document. */
  diagnostics: Diagnostics;
  /** Better text for the tiers after this one (T1 replaces unreadable pages with OCR text). */
  text?: DocumentText;
}

/** A tier that could not run (no fixture in replay mode, LLM disabled, nothing to repair). */
export interface TierSkipped {
  skipped: string;
  diagnostics: Diagnostics;
}

export interface ExtractionContext {
  documentId: string;
  /** Original file bytes, for tiers that need to rasterize pages (T1 OCR). */
  pdf: Uint8Array;
  /** Best candidate from the earlier tiers and why it failed; null for the first tier. */
  previous: { statement: BankStatement; validation: ValidationReport; tier: Tier } | null;
}

/** One tier of the cascade (ADR 0002). Each implementation is an adapter. */
export interface StatementExtractorPort {
  readonly tier: Tier;
  extract(
    text: DocumentText,
    context: ExtractionContext,
  ): Promise<StatementExtraction | TierSkipped>;
}

export const isSkipped = (r: StatementExtraction | TierSkipped): r is TierSkipped => 'skipped' in r;

export const STATEMENT_EXTRACTORS = Symbol('StatementExtractors');
