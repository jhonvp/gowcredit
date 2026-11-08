import {
  type Answer,
  applyAnswers,
  InvalidAnswerError,
} from '../../domain/clarification/questions';
import type { MissingInfoCode } from '../../domain/eligibility/engine';
import type { CaseRepositoryPort } from '../ports/case-repository.port';
import type {
  AnswerNormalizerPort,
  ClarificationRepositoryPort,
} from '../ports/clarification.ports';
import type { ClockPort } from '../ports/clock.port';
import type { LoggerPort } from '../ports/logger.port';
import type { DecideCaseUseCase } from './decide-case.use-case';

/** What the owner form sends: a structured value, or free text the T5 agent normalizes. */
export interface RawAnswer {
  code: MissingInfoCode;
  value?: string | boolean;
  text?: string;
}

export class ClarificationClosedError extends Error {
  constructor() {
    super('Este enlace ya fue usado o expiró');
    this.name = 'ClarificationClosedError';
  }
}

/**
 * The owner answers through the magic link (ADR 0008): typed answers become case facts, free text is
 * normalized by the T5 agent (or rejected if it cannot be), explanations go to an analyst, and the
 * case is decided again. If a document the owner uploaded is still being extracted, the worker
 * decides when it finishes.
 */
export class AnswerClarificationUseCase {
  constructor(
    private readonly cases: CaseRepositoryPort,
    private readonly requests: ClarificationRepositoryPort,
    private readonly normalizer: AnswerNormalizerPort,
    private readonly decideCase: DecideCaseUseCase,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(requestId: string, raw: readonly RawAnswer[]) {
    const req = await this.requests.findById(requestId);
    if (!req || req.status !== 'open' || (req.expiresAt && req.expiresAt < this.clock.now()))
      throw new ClarificationClosedError();
    const asked = new Set(req.questions.map((q) => q.code));
    const today = this.clock.now().toISOString().slice(0, 10);

    const answers: Answer[] = [];
    for (const r of raw) {
      if (!asked.has(r.code)) throw new InvalidAnswerError(`${r.code} was not asked`);
      answers.push(await this.toAnswer(r, today));
    }
    const c = await this.cases.findCase(req.caseId);
    if (!c) throw new ClarificationClosedError();
    const applied = applyAnswers(c.facts, answers);
    await this.cases.setFacts(c.id, applied.facts);
    await this.requests.markAnswered(
      req.id,
      answers,
      applied.forAnalyst.length ? applied.forAnalyst : null,
    );
    this.logger.info('clarification answered', {
      caseId: c.id,
      round: req.round,
      codes: answers.map((a) => a.code),
      forAnalyst: applied.forAnalyst.length,
    });

    const pending = c.documents.some((d) => !c.extractions.some((e) => e.documentId === d.id));
    const decision = pending ? null : await this.decideCase.execute(c.id);
    const after = await this.cases.findCase(c.id);
    return {
      status: after?.status ?? c.status,
      outcome: decision?.outcome ?? null,
      pendingDocuments: pending,
    };
  }

  private async toAnswer(r: RawAnswer, today: string): Promise<Answer> {
    const text = r.text?.trim() || undefined;
    if (typeof r.value === 'boolean')
      return { code: r.code, kind: 'boolean', value: r.value, text };
    if (typeof r.value === 'string' && r.value)
      return { code: r.code, kind: 'date', value: r.value, text };
    if (!text) throw new InvalidAnswerError(`${r.code} needs an answer`);
    if (r.code === 'STATEMENT_UNREADABLE' || r.code === 'INVOICE_INCONSISTENT')
      return { code: r.code, kind: 'text', text };
    const normalized = await this.normalizer.normalize(r.code, text, today);
    if (!normalized)
      throw new InvalidAnswerError(
        `We could not read "${text}"; please use the form field for ${r.code}`,
      );
    return { ...normalized, text } as Answer;
  }
}
