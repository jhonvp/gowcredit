import type { BankStatement, Tier } from '../../domain/statement/bank-statement';
import type { DocumentText } from './document-text.port';

export interface StatementExtraction {
  statement: BankStatement;
  /** Tier-specific facts for the eval report and logs (never PII). */
  diagnostics: Record<string, string | number | boolean | null>;
}

/** One tier of the cascade (ADR 0002). Each implementation is an adapter. */
export interface StatementExtractorPort {
  readonly tier: Tier;
  extract(text: DocumentText): Promise<StatementExtraction>;
}

export const T0_EXTRACTOR = Symbol('T0StatementExtractor');
