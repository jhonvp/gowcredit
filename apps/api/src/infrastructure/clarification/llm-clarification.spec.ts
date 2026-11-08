import { describe, expect, it, vi } from 'vitest';
import { type LlmPort, LlmUnavailableError } from '../../application/ports/llm.port';
import type { LoggerPort } from '../../application/ports/logger.port';
import { LlmAnswerNormalizer, LlmQuestionWriter } from './llm-clarification.adapters';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const missing = [
  { code: 'INVOICE_DUE_DATE' as const, ruleId: 'C-K4', detail: 'a CFDI carries no due date' },
];
const ctx = { periodEnd: null, invoiceUuid: 'ABC' };
const answering = (text: string): LlmPort => ({
  complete: vi.fn(async () => ({
    model: 'claude-haiku-5-5',
    content: [{ type: 'text' as const, text }],
    stopReason: 'end_turn' as const,
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
    source: 'fixture' as const,
  })),
});

describe('LlmQuestionWriter (T5)', () => {
  it('uses the model questions when they cover every code', async () => {
    const llm = answering(
      JSON.stringify({
        questions: [{ code: 'INVOICE_DUE_DATE', text: '¿Cuándo vence su factura ABC?' }],
      }),
    );
    const out = await new LlmQuestionWriter(llm, logger).write(missing, ctx);
    expect(out).toEqual({
      by: 'llm',
      questions: [
        { code: 'INVOICE_DUE_DATE', type: 'provide_value', text: '¿Cuándo vence su factura ABC?' },
      ],
    });
  });

  it('falls back to templates on a replay miss or an incomplete answer', async () => {
    const miss: LlmPort = {
      complete: async () => {
        throw new LlmUnavailableError('no fixture', 'fixture-missing');
      },
    };
    expect((await new LlmQuestionWriter(miss, logger).write(missing, ctx)).by).toBe('template');
    const partial = answering(JSON.stringify({ questions: [] }));
    const out = await new LlmQuestionWriter(partial, logger).write(missing, ctx);
    expect(out.by).toBe('template');
    expect(out.questions[0]?.text).toContain('ABC');
  });
});

describe('LlmAnswerNormalizer (T5)', () => {
  it('accepts only a valid typed value for the asked code', async () => {
    const ok = answering(JSON.stringify({ kind: 'date', value: '2025-06-15' }));
    expect(
      await new LlmAnswerNormalizer(ok).normalize(
        'INVOICE_DUE_DATE',
        'el 15 de junio',
        '2025-04-05',
      ),
    ).toMatchObject({ kind: 'date', value: '2025-06-15' });
    const bad = answering(JSON.stringify({ kind: 'date', value: '2025-02-30' }));
    expect(
      await new LlmAnswerNormalizer(bad).normalize('INVOICE_DUE_DATE', 'x', '2025-04-05'),
    ).toBeNull();
    const unknown = answering(JSON.stringify({ kind: 'unknown', value: null }));
    expect(
      await new LlmAnswerNormalizer(unknown).normalize('SAT_STATUS', 'no sé', '2025-04-05'),
    ).toBeNull();
  });
});
