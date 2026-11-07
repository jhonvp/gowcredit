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
 * instead of starting over. A tier's output (or a per-section mix with the earlier candidate)
 * replaces the candidate only if it fails fewer blocking checks.
 */
export class ExtractBankStatementUseCase {
  constructor(
    private readonly text: DocumentTextPort,
    private readonly tiers: readonly StatementExtractorPort[],
    private readonly logger: LoggerPort,
  ) {}

  async execute(pdf: Uint8Array, ref: { documentId: string }): Promise<ExtractionOutcome> {
    if (this.tiers.length === 0) throw new Error('No extraction tiers configured');
    let text = await this.text.extract(pdf);
    const attempts: TierAttempt[] = [];
    let best: { statement: BankStatement; validation: ValidationReport; tier: Tier } | null = null;

    for (const tier of this.tiers) {
      const started = Date.now();
      const out = await tier.extract(text, { documentId: ref.documentId, pdf, previous: best });
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
      if (out.text) text = out.text;
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
      best = pickBest(best, { statement: out.statement, validation, tier: tier.tier });
      if (best.validation.passed) break;
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

type Candidate = { statement: BankStatement; validation: ValidationReport; tier: Tier };

/**
 * Per-section escalation (ADR 0002): besides the new tier's output, try the hybrids that keep one
 * section from the earlier candidate (its summary with the new rows, or the new summary with its
 * rows). The variant with the fewest blocking failures wins; ties keep the earlier candidate, so an
 * LLM tier never replaces deterministic output it does not improve. Provenance records which tier
 * produced each section.
 */
function pickBest(best: Candidate | null, next: Candidate): Candidate {
  if (!best) return next;
  const mix = (summaryFrom: Candidate, rowsFrom: Candidate): Candidate => {
    const statement: BankStatement = {
      summary: summaryFrom.statement.summary,
      transactions: rowsFrom.statement.transactions,
      provenance: {
        summary: summaryFrom.statement.provenance.summary,
        transactions: rowsFrom.statement.provenance.transactions,
      },
    };
    return { statement, validation: validateStatement(statement), tier: next.tier };
  };
  const options = [best, next, mix(best, next), mix(next, best)];
  return options.reduce((winner, o) =>
    failures(o.validation) < failures(winner.validation) ? o : winner,
  );
}
