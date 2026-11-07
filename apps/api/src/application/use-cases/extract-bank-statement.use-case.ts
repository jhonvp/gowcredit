import type { BankStatement, Tier } from '../../domain/statement/bank-statement';
import {
  type ValidationReport,
  validateStatement,
} from '../../domain/validation/statement-validators';
import type { DocumentTextPort } from '../ports/document-text.port';
import type { LoggerPort } from '../ports/logger.port';
import type { StatementExtractorPort } from '../ports/statement-extractor.port';

export interface TierAttempt {
  tier: Tier;
  passed: boolean;
  failedSections: string[];
  durationMs: number;
  diagnostics: Record<string, string | number | boolean | null>;
}

export interface ExtractionOutcome {
  statement: BankStatement;
  validation: ValidationReport;
  /** Tier whose output was kept. */
  resolvedBy: Tier;
  attempts: TierAttempt[];
  /** True when no tier produced a statement that passes the validators (→ owner clarification). */
  needsReview: boolean;
}

/**
 * Runs the extraction tiers in cost order and stops at the first one whose output passes the domain
 * validators (ADR 0002). This PR wires T0 only; later tiers plug in as more StatementExtractorPorts.
 */
export class ExtractBankStatementUseCase {
  constructor(
    private readonly text: DocumentTextPort,
    private readonly tiers: readonly StatementExtractorPort[],
    private readonly logger: LoggerPort,
  ) {}

  async execute(pdf: Uint8Array, ref: { documentId: string }): Promise<ExtractionOutcome> {
    if (this.tiers.length === 0) throw new Error('No extraction tiers configured');
    const text = await this.text.extract(pdf);
    const attempts: TierAttempt[] = [];
    let best: { statement: BankStatement; validation: ValidationReport; tier: Tier } | null = null;

    for (const tier of this.tiers) {
      const started = Date.now();
      const { statement, diagnostics } = await tier.extract(text);
      const validation = validateStatement(statement);
      const attempt: TierAttempt = {
        tier: tier.tier,
        passed: validation.passed,
        failedSections: validation.failedSections,
        durationMs: Date.now() - started,
        diagnostics,
      };
      attempts.push(attempt);
      this.logger.info('extraction tier finished', {
        documentId: ref.documentId,
        tier: tier.tier,
        passed: attempt.passed,
        failedSections: attempt.failedSections,
        durationMs: attempt.durationMs,
      });
      if (!best || validation.passed) best = { statement, validation, tier: tier.tier };
      if (validation.passed) break;
    }

    const kept = best as NonNullable<typeof best>;
    return {
      statement: kept.statement,
      validation: kept.validation,
      resolvedBy: kept.tier,
      attempts,
      needsReview: !kept.validation.passed,
    };
  }
}
