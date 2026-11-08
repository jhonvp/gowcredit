import type { AgentPort, AgentTool } from '../ports/agent.port';
import type { CaseRecord, CaseRepositoryPort } from '../ports/case-repository.port';
import type { ClarificationRepositoryPort } from '../ports/clarification.ports';
import { LlmUnavailableError } from '../ports/llm.port';
import type { LoggerPort } from '../ports/logger.port';

export const COPILOT_PURPOSE = 'copilot-answer@v1';
export const COPILOT_LIMITS = { maxTurns: 4, maxCostUsd: 0.05 };

const SYSTEM = `You help a credit analyst understand one supplier early-payment case. Answer in Spanish, briefly,
using only what the tools return: the decision trace (rules, points, missing information), field provenance
(which extraction tier produced each section and which validators passed), and the clarification history.
Cite rule ids (e.g. S-S2, C-K4) and tiers (T0..T5). You cannot change anything and must not speculate about
data the tools do not show. Finish by calling the answer tool.`;

export interface CopilotAnswer {
  answer: string;
  citations: string[];
  /** 'agent' = Haiku answered with tools; 'trace' = deterministic summary (LLM unavailable). */
  by: 'agent' | 'trace';
  turns: number;
  costUsd: number;
}

const closed = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/**
 * Analyst copilot (ADR 0010): read-only tools over one case, answers "why this decision / where does
 * this value come from". It cannot act. Without an LLM (replay miss, LLM off) it returns a
 * deterministic summary of the decision trace, so the panel always answers something true.
 */
export class AnalystCopilotUseCase {
  constructor(
    private readonly cases: CaseRepositoryPort,
    private readonly requests: ClarificationRepositoryPort,
    private readonly agent: AgentPort,
    private readonly logger: LoggerPort,
  ) {}

  async execute(caseId: string, question: string): Promise<CopilotAnswer | null> {
    const c = await this.cases.findCase(caseId);
    if (!c) return null;
    const clarifications = await this.requests.listByCase(caseId);

    const tools: AgentTool[] = [
      {
        name: 'get_case',
        description: 'Case status, documents and their types.',
        inputSchema: closed({}),
        run: () => ({
          content: JSON.stringify({
            status: c.status,
            documents: c.documents.map((d) => ({
              id: d.id,
              name: d.originalName,
              type: d.docType,
            })),
          }),
        }),
      },
      {
        name: 'get_decision_trace',
        description:
          'Latest eligibility decision: outcome, score, every rule with detail and points, missing info.',
        inputSchema: closed({}),
        run: () => ({ content: JSON.stringify(c.decision ?? 'no decision yet') }),
      },
      {
        name: 'get_field_provenance',
        description:
          'Per document: which tier produced the summary and the rows, tier attempts, and validator checks.',
        inputSchema: closed({}),
        run: () => ({
          content: JSON.stringify(
            c.extractions.map((e) => ({
              documentId: e.documentId,
              kind: e.kind,
              resolvedBy: e.resolvedBy,
              provenance: e.statement?.provenance ?? null,
              attempts: e.attempts.map((a) => ({
                tier: a.tier,
                passed: a.passed,
                skipped: a.skipped ?? null,
              })),
              checks: e.validation?.checks ?? e.invoiceChecks ?? [],
            })),
          ),
        }),
      },
      {
        name: 'get_clarifications',
        description: 'Questions sent to the document owner, their answers and escalations.',
        inputSchema: closed({}),
        run: () => ({
          content: JSON.stringify(
            clarifications.map((r) => ({
              round: r.round,
              status: r.status,
              questions: r.questions,
              answers: r.answers,
              reason: r.reason,
            })),
          ),
        }),
      },
      {
        name: 'answer',
        description:
          'Finish with the answer for the analyst and the rule ids / tiers it relies on.',
        inputSchema: closed({
          text: { type: 'string' },
          citations: { type: 'array', items: { type: 'string' } },
        }),
        run: (input) => {
          const { text, citations } = input as { text?: unknown; citations?: unknown };
          if (typeof text !== 'string' || !text.trim())
            return { content: 'text is required', isError: true };
          return {
            content: 'ok',
            final: { text, citations: Array.isArray(citations) ? citations.map(String) : [] },
          };
        },
      },
    ];

    try {
      const r = await this.agent.run({
        purpose: COPILOT_PURPOSE,
        model: 'basic',
        system: SYSTEM,
        prompt: question.slice(0, 1000),
        tools,
        limits: COPILOT_LIMITS,
        maxTokensPerTurn: 2000,
        effort: 'low',
      });
      if (r.stop === 'submitted') {
        const f = r.final as { text: string; citations: string[] };
        return {
          answer: f.text,
          citations: f.citations,
          by: 'agent',
          turns: r.turns,
          costUsd: r.costUsd,
        };
      }
      this.logger.warn('copilot did not submit; using trace summary', { caseId, stop: r.stop });
      return { ...traceSummary(c), turns: r.turns, costUsd: r.costUsd };
    } catch (e) {
      if (!(e instanceof LlmUnavailableError)) throw e;
      return { ...traceSummary(c), turns: 0, costUsd: 0 };
    }
  }
}

const OUTCOME_ES = {
  QUALIFIES: 'Califica',
  DOES_NOT_QUALIFY: 'No califica',
  NEEDS_INFO: 'Falta información',
} as const;

/** Deterministic explanation from the decision trace and provenance. */
export function traceSummary(c: CaseRecord): Omit<CopilotAnswer, 'turns' | 'costUsd'> {
  const d = c.decision;
  if (!d) return { answer: 'Este caso todavía no tiene decisión.', citations: [], by: 'trace' };
  const failed = d.rules.filter((r) => !r.passed && r.kind !== 'score');
  const scores = d.rules.filter((r) => r.kind === 'score' && r.id !== 'SCORE');
  const lines = [
    `Resultado: ${OUTCOME_ES[d.outcome]}${d.score !== null ? ` con puntaje ${d.score}/100` : ''} (política ${d.policyVersion}, fecha de evaluación ${d.asOf}).`,
    failed.length
      ? `Reglas no cumplidas: ${failed.map((r) => `${r.id} (${r.detail})`).join('; ')}.`
      : 'Todas las reglas de integridad y de exclusión se cumplen.',
    scores.length
      ? `Puntaje: ${scores.map((r) => `${r.id} ${r.points}/${r.maxPoints}`).join(', ')}.`
      : '',
    d.missing.length ? `Falta: ${d.missing.map((m) => m.detail).join('; ')}.` : '',
    ...c.extractions.map((e) =>
      e.statement
        ? `Estado de cuenta: resumen por ${e.statement.provenance.summary}, movimientos por ${e.statement.provenance.transactions}.`
        : `Factura CFDI leída del XML (${(e.invoiceChecks ?? []).every((x) => x.passed) ? 'cuadra' : 'no cuadra'}).`,
    ),
  ].filter(Boolean);
  return {
    answer: lines.join(' '),
    citations: [...failed.map((r) => r.id), ...c.extractions.map((e) => e.resolvedBy)],
    by: 'trace',
  };
}
