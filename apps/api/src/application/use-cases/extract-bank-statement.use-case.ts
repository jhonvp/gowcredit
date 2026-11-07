import type { BankStatement, Tier } from '../../domain/statement/bank-statement';
import {
  type ValidationReport,
  validateStatement,
} from '../../domain/validation/statement-validators';
import type { DocumentTextPort } from '../ports/document-text.port';
import type { LoggerPort } from '../ports/logger.port';
import {
  type Diagnostics,
  isSkipped,
  type StatementExtractorPort,
} from '../ports/statement-extractor.port';

export interface TierAttempt {
  tier: Tier;
  passed: boolean;
  /** Why the tier did not run (no fixture, LLM off, nothing to repair); absent if it ran. */
  skipped?: string;
  failedSections: string[];
  durationMs: number;
  costUsd: number;
  diagnostics: Diagnostics;
}

export interface ExtractionOutcome {
  statement: BankStatement;
  validation: ValidationReport;
  /** Tier whose output was kept. */
  resolvedBy: Tier;
  attempts: TierAttempt[];
  /** LLM spend for this document across tiers (replayed fixtures report the original call's cost). */
  costUsd: number;
  /** True when no tier produced a statement that passes the validators (→ owner clarification). */
  needsReview: boolean;
}

/**
 * Runs the extraction tiers in cost order and stops at the first one whose output passes the domain
 * validators (ADR 0002). Each tier sees the best candidate so far, so later tiers can repair it
 * instead of starting over. A tier's output replaces the candidate only if it passes, or if it fails
 * fewer blocking checks.
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
      const out = await tier.extract(text, { documentId: ref.documentId, previous: best });
      const costUsd = typeof out.diagnostics.costUsd === 'number' ? out.diagnostics.costUsd : 0;
      if (isSkipped(out)) {
        attempts.push({
          tier: tier.tier,
          passed: false,
          skipped: out.skipped,
          failedSections: [],
          durationMs: Date.now() - started,
          costUsd,
          diagnostics: out.diagnostics,
        });
        this.logger.info('extraction tier skipped', {
          documentId: ref.documentId,
          tier: tier.tier,
          reason: out.skipped,
        });
        continue;
      }
      const validation = validateStatement(out.statement);
      const attempt: TierAttempt = {
        tier: tier.tier,
        passed: validation.passed,
        failedSections: validation.failedSections,
        durationMs: Date.now() - started,
        costUsd,
        diagnostics: out.diagnostics,
      };
      attempts.push(attempt);
      this.logger.info('extraction tier finished', {
        documentId: ref.documentId,
        tier: tier.tier,
        passed: attempt.passed,
        failedSections: attempt.failedSections,
        durationMs: attempt.durationMs,
        costUsd,
      });
      if (!best || validation.passed || failures(validation) < failures(best.validation))
        best = { statement: out.statement, validation, tier: tier.tier };
      if (validation.passed) break;
    }

    if (!best) throw new Error('Every extraction tier was skipped');
    return {
      statement: best.statement,
      validation: best.validation,
      resolvedBy: best.tier,
      attempts,
      costUsd: attempts.reduce((a, t) => a + t.costUsd, 0),
      needsReview: !best.validation.passed,
    };
  }
}

const failures = (v: ValidationReport): number =>
  v.checks.filter((c) => c.blocking && !c.passed).length;
