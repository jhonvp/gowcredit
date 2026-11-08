import { z } from 'zod';
import { templateQuestions } from '../../application/clarification/question-templates';
import type {
  AnswerNormalizerPort,
  QuestionContext,
  QuestionWriterPort,
} from '../../application/ports/clarification.ports';
import { type LlmPort, LlmUnavailableError, textOf } from '../../application/ports/llm.port';
import type { LoggerPort } from '../../application/ports/logger.port';
import { type Answer, QUESTION_TYPE } from '../../domain/clarification/questions';
import type { MissingInfo, MissingInfoCode } from '../../domain/eligibility/engine';
import { isIsoDate } from '../../domain/shared/iso-date';

export const T5_QUESTIONS_PURPOSE = 't5-clarification-questions@v1';
export const T5_NORMALIZE_PURPOSE = 't5-normalize-answer@v1';

const QUESTIONS_SYSTEM = `You write short, polite questions in Mexican Spanish (usted) to the owner of a business
document, on behalf of GowCredit, a supplier early-payment program. You receive the missing items (code and an
internal note in English). Write one question per code: plain language, no internal codes, no English, no
amounts or data you were not given, at most two sentences. Return JSON matching the schema.`;

const NORMALIZE_SYSTEM = `You convert a document owner's short answer (Mexican Spanish) into a typed value.
For INVOICE_DUE_DATE return {"kind":"date","value":"YYYY-MM-DD"} (resolve relative dates against "today").
For RFC_CONFIRMATION and SAT_STATUS return {"kind":"boolean","value":true|false} (true = confirms / invoice is
valid). If the answer is ambiguous or does not answer the question, return {"kind":"unknown"}.`;

/**
 * T5 clarification agent (ADR 0010), as two bounded single calls on the basic model: writing the
 * questions and normalizing free-text answers. Both are proposals: the questions fall back to
 * templates when the model is unavailable or answers off-schema, and a normalized answer still goes
 * through the domain's typed validation.
 */
export class LlmQuestionWriter implements QuestionWriterPort {
  constructor(
    private readonly llm: LlmPort,
    private readonly logger: LoggerPort,
  ) {}

  async write(missing: readonly MissingInfo[], context: QuestionContext) {
    const fallback = { questions: templateQuestions(missing, context), by: 'template' as const };
    try {
      const res = await this.llm.complete({
        purpose: T5_QUESTIONS_PURPOSE,
        model: 'basic',
        system: QUESTIONS_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  missing: missing.map((m) => ({ code: m.code, note: m.detail })),
                  context,
                }),
              },
            ],
          },
        ],
        outputSchema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', enum: missing.map((m) => m.code) },
                  text: { type: 'string' },
                },
                required: ['code', 'text'],
                additionalProperties: false,
              },
            },
          },
          required: ['questions'],
          additionalProperties: false,
        },
        maxTokens: 2000,
        effort: 'low',
      });
      const parsed = z
        .object({
          questions: z.array(z.object({ code: z.string(), text: z.string().min(10).max(400) })),
        })
        .safeParse(JSON.parse(textOf(res.content)));
      const byCode = new Map(
        parsed.success ? parsed.data.questions.map((q) => [q.code, q.text]) : [],
      );
      if (!missing.every((m) => byCode.has(m.code))) return fallback;
      return {
        questions: missing.map((m) => ({
          code: m.code,
          type: QUESTION_TYPE[m.code],
          text: byCode.get(m.code) as string,
        })),
        by: 'llm' as const,
      };
    } catch (e) {
      if (!(e instanceof LlmUnavailableError) && !(e instanceof SyntaxError))
        this.logger.warn('question writer failed; using templates', { error: (e as Error).name });
      return fallback;
    }
  }
}

export class LlmAnswerNormalizer implements AnswerNormalizerPort {
  constructor(private readonly llm: LlmPort) {}

  async normalize(code: MissingInfoCode, text: string, today: string): Promise<Answer | null> {
    if (code !== 'INVOICE_DUE_DATE' && code !== 'RFC_CONFIRMATION' && code !== 'SAT_STATUS')
      return null;
    try {
      const res = await this.llm.complete({
        purpose: T5_NORMALIZE_PURPOSE,
        model: 'basic',
        system: NORMALIZE_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: JSON.stringify({ code, today, answer: text.slice(0, 500) }) },
            ],
          },
        ],
        outputSchema: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['date', 'boolean', 'unknown'] },
            value: { anyOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'null' }] },
          },
          required: ['kind', 'value'],
          additionalProperties: false,
        },
        maxTokens: 300,
        effort: 'low',
      });
      const out = JSON.parse(textOf(res.content)) as { kind: string; value: unknown };
      if (
        code === 'INVOICE_DUE_DATE' &&
        out.kind === 'date' &&
        typeof out.value === 'string' &&
        isIsoDate(out.value)
      )
        return { code, kind: 'date', value: out.value, text };
      if (code !== 'INVOICE_DUE_DATE' && out.kind === 'boolean' && typeof out.value === 'boolean')
        return { code, kind: 'boolean', value: out.value, text };
      return null;
    } catch {
      return null;
    }
  }
}
