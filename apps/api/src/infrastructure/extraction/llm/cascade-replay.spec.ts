import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ToolLoopAgent } from '../../../application/agents/tool-loop-agent';
import type { DocumentTextPort } from '../../../application/ports/document-text.port';
import type { LlmContent, LlmPort, LlmRequest } from '../../../application/ports/llm.port';
import type { LoggerPort } from '../../../application/ports/logger.port';
import { ExtractBankStatementUseCase } from '../../../application/use-cases/extract-bank-statement.use-case';
import { DEFAULT_MODELS } from '../../llm/anthropic-llm.adapter';
import { FixtureStore } from '../../llm/fixture-store';
import { RecordingLlmAdapter, ReplayLlmAdapter } from '../../llm/replay-llm.adapter';
import { T0StatementExtractor } from '../t0/t0-statement-extractor';
import { T3LlmStatementExtractor } from './t3-llm-statement-extractor';
import { T4RepairAgentExtractor } from './t4-repair-agent-extractor';

/**
 * Reproducibility (ADR 0004): a cascade run recorded once replays to the identical outcome with no
 * live model. Synthetic statement; the "live" model is scripted. T0 cannot resolve it (the summary
 * prints an interest line that no row lists), T3 returns a row with the wrong side, T4 repairs it.
 */
const pdfText: DocumentTextPort = {
  extract: async () => ({
    source: 'pdf-text-layer',
    pages: [
      {
        number: 1,
        lines: [
          'BANCO DEMO                     ESTADO DE CUENTA',
          'Periodo: del 01/03/2025 al 31/03/2025',
          'Saldo inicial                 1,000.00',
          'Intereses ganados                10.00',
          'Saldo final                   1,210.00',
          '',
          'FECHA        CONCEPTO                        CARGOS        ABONOS         SALDO',
          '05/03/2025   DEPOSITO CLIENTE                              500.00      1,500.00',
          '20/03/2025   PAGO PROVEEDOR                  300.00                    1,200.00',
        ],
      },
    ],
  }),
};
const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const row = (
  date: string,
  description: string,
  debit: number,
  credit: number,
  balance: number | null,
  fromSummary = false,
) => ({ date, description, page: 1, debit, credit, balance, fromSummary });

function scriptedModel(): LlmPort {
  let t4Turn = 0;
  const use = (id: string, name: string, input: unknown): LlmContent => ({
    type: 'tool_use',
    id,
    name,
    input,
  });
  return {
    complete: vi.fn(async (req: LlmRequest) => {
      const usage = { inputTokens: 1000, outputTokens: 100, costUsd: 0.01 };
      if (req.model === 'basic') {
        const answer = {
          bankName: 'Banco Demo',
          currency: 'MXN',
          periodStart: '2025-03-01',
          periodEnd: '2025-03-31',
          openingBalance: 1000,
          closingBalance: 1210,
          reportedCredits: null,
          reportedDebits: null,
          // Wrong side on the payment → T3 fails the validators.
          transactions: [
            row('2025-03-05', 'DEPOSITO CLIENTE', 0, 500, 1500),
            row('2025-03-20', 'PAGO PROVEEDOR', 0, 300, 1200),
          ],
        };
        return {
          model: 'claude-haiku-5-5',
          content: [{ type: 'text' as const, text: JSON.stringify(answer) }],
          stopReason: 'end_turn' as const,
          usage,
          source: 'live' as const,
        };
      }
      const turns: LlmContent[][] = [
        [
          { type: 'opaque', raw: { type: 'thinking', thinking: '', signature: 'sig-1' } },
          use('a', 'run_validators', {}),
        ],
        [
          use('b', 'update_row', {
            index: 1,
            row: row('2025-03-20', 'PAGO PROVEEDOR', 300, 0, 1200),
          }),
          use('c', 'insert_row', {
            index: 2,
            row: row('2025-03-31', 'Intereses ganados', 0, 10, null, true),
          }),
        ],
        [use('d', 'submit_extraction', { notes: 'fixed side; added interest from summary' })],
      ];
      const content = turns[t4Turn++] ?? [];
      return {
        model: 'claude-opus-5-5',
        content,
        stopReason: 'tool_use' as const,
        usage,
        source: 'live' as const,
      };
    }),
  };
}

const cascade = (llm: LlmPort) =>
  new ExtractBankStatementUseCase(
    pdfText,
    [
      new T0StatementExtractor(),
      new T3LlmStatementExtractor(llm),
      new T4RepairAgentExtractor(new ToolLoopAgent(llm, logger)),
    ],
    logger,
  );

describe('cascade record → replay', () => {
  it('replays a recorded run to the identical outcome without calling the model', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fixtures-'));
    const store = new FixtureStore(dir);
    const live = scriptedModel();

    const recorded = await cascade(
      new RecordingLlmAdapter(live, store, DEFAULT_MODELS, logger),
    ).execute(new Uint8Array(), { documentId: 'demo' });
    expect(recorded.attempts.map((a) => [a.tier, a.passed])).toEqual([
      ['T0', false],
      ['T3', false],
      ['T4', true],
    ]);
    expect(recorded.resolvedBy).toBe('T4');
    expect(recorded.statement.transactions.at(-1)?.description).toBe('[resumen] Intereses ganados');
    expect(live.complete).toHaveBeenCalledTimes(4); // 1 Haiku call + 3 agent turns
    expect(readdirSync(dir).sort()).toEqual(['t3-extract-statement@v1', 't4-repair-statement@v1']);

    const replayed = await cascade(new ReplayLlmAdapter(store, DEFAULT_MODELS, logger)).execute(
      new Uint8Array(),
      { documentId: 'demo' },
    );
    expect(live.complete).toHaveBeenCalledTimes(4);
    expect(replayed.statement).toEqual(recorded.statement);
    expect(replayed.resolvedBy).toBe('T4');
    expect(replayed.costUsd).toBeCloseTo(recorded.costUsd);
    expect(replayed.attempts.find((a) => a.tier === 'T4')?.diagnostics.replayed).toBe(true);
  });
});
