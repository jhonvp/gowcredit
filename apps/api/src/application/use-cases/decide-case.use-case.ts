import { type Decision, decide } from '../../domain/eligibility/engine';
import type { IsoDate } from '../../domain/shared/iso-date';
import type { CaseRecord, CaseRepositoryPort } from '../ports/case-repository.port';
import type { ClockPort } from '../ports/clock.port';
import type { PolicyPort, SatStatusPort } from '../ports/eligibility.ports';
import type { LoggerPort } from '../ports/logger.port';

/**
 * Runs the eligibility engine on the latest extraction of each document type in a case, saves the
 * decision and moves the case: QUALIFIES / DOES_NOT_QUALIFY → DECIDED, NEEDS_INFO → AWAITING_OWNER
 * (the clarification loop asks the owner). The engine is pure; this use case only gathers inputs.
 */
export class DecideCaseUseCase {
  constructor(
    private readonly cases: CaseRepositoryPort,
    private readonly policy: PolicyPort,
    private readonly sat: SatStatusPort,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
    /** Fixed evaluation date for reproducible runs (ELIGIBILITY_AS_OF); defaults to today. */
    private readonly asOfOverride: IsoDate | null = null,
    /** Asks the owner when the outcome is NEEDS_INFO (clarification loop, ADR 0008). */
    private readonly askOwner: {
      execute(caseId: string, d: Decision): Promise<unknown>;
    } | null = null,
  ) {}

  async execute(caseId: string): Promise<Decision | null> {
    const c = await this.cases.findCase(caseId);
    if (!c) return null;
    const statement = latest(c, 'bank_statement');
    const invoice = latest(c, 'cfdi');
    if (!statement && !invoice) return null;

    const facts = { ...c.facts };
    if (invoice?.invoice && facts.satStatus === undefined)
      facts.satStatus = await this.sat.status(invoice.invoice);

    const decision = decide({
      asOf: this.asOfOverride ?? this.clock.now().toISOString().slice(0, 10),
      policy: this.policy.current(),
      statement:
        statement?.statement && statement.validation
          ? { statement: statement.statement, validation: statement.validation }
          : null,
      invoice:
        invoice?.invoice && invoice.invoiceChecks
          ? { invoice: invoice.invoice, checks: invoice.invoiceChecks }
          : null,
      facts,
    });
    await this.cases.saveDecision(caseId, decision);
    const target = decision.outcome === 'NEEDS_INFO' ? 'AWAITING_OWNER' : 'DECIDED';
    if (c.status !== target) await this.cases.transition(caseId, c.status, target);
    if (decision.outcome === 'NEEDS_INFO') await this.askOwner?.execute(caseId, decision);
    this.logger.info('case decided', {
      caseId,
      outcome: decision.outcome,
      score: decision.score,
      missing: decision.missing.map((m) => m.code),
      policyVersion: decision.policyVersion,
    });
    return decision;
  }
}

function latest(c: CaseRecord, kind: 'bank_statement' | 'cfdi') {
  return c.extractions
    .filter((e) => e.kind === kind)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}
