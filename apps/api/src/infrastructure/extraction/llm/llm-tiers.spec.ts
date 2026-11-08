import { describe, expect, it, vi } from 'vitest';
import { ToolLoopAgent } from '../../../application/agents/tool-loop-agent';
import type { DocumentText } from '../../../application/ports/document-text.port';
import {
  type LlmContent,
  type LlmPort,
  type LlmRequest,
  LlmUnavailableError,
} from '../../../application/ports/llm.port';
import type { LoggerPort } from '../../../application/ports/logger.port';
import type { ExtractionContext } from '../../../application/ports/statement-extractor.port';
import type { BankStatement } from '../../../domain/statement/bank-statement';
import { validateStatement } from '../../../domain/validation/statement-validators';
import { T3LlmStatementExtractor } from './t3-llm-statement-extractor';
import { T4RepairAgentExtractor } from './t4-repair-agent-extractor';

/** Synthetic one-page statement (no real data). */
const text: DocumentText = {
  source: 'pdf-text-layer',
  pages: [
    {
      number: 1,
      lines: [
        'BANCO DEMO      Periodo del 01/01/2025 al 31/01/2025',
        'Saldo anterior 1,000.00     Saldo final 1,200.00',
        'FECHA   CONCEPTO              CARGOS    ABONOS     SALDO',
        '05/01   DEPOSITO CLIENTE                 500.00   1,500.00',
        '20/01   PAGO PROVEEDOR        300.00              1,200.00',
      ],
    },
  ],
};
const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const row = (date: string, debit: number, credit: number, balance: number | null) => ({
  date,
  description: 'x',
  page: 1,
  debit,
  credit,
  balance,
  fromSummary: false,
});
const llmJson = {
  bankName: 'Banco Demo',
  currency: 'mxn',
  periodStart: '2025-01-01',
  periodEnd: '2025-01-31',
  openingBalance: 1000,
  closingBalance: 1200,
  reportedCredits: null,
  reportedDebits: null,
  transactions: [row('2025-01-05', 0, 500, 1500), row('2025-01-20', 300, 0, 1200)],
};

const llmReturning = (
  content: LlmContent[],
  stopReason: 'end_turn' | 'max_tokens' = 'end_turn',
) => {
  const seen: LlmRequest[] = [];
  const llm: LlmPort = {
    complete: vi.fn(async (r: LlmRequest) => {
      seen.push(r);
      return {
        model: 'claude-haiku-5-5',
        content,
        stopReason,
        usage: { inputTokens: 2000, outputTokens: 300, costUsd: 0.00035 },
        source: 'fixture' as const,
      };
    }),
  };
  return { llm, seen };
};

const brokenCandidate: BankStatement = {
  summary: {
    bankName: 'Banco Demo',
    holderName: null,
    holderRfc: null,
    currency: 'MXN',
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    openingBalance: 100_000,
    closingBalance: 120_000,
    reportedCredits: null,
    reportedDebits: null,
  },
  transactions: [
    {
      date: '2025-01-05',
      description: 'DEPOSITO',
      debit: 0,
      credit: 50_000,
      balance: 150_000,
      page: 1,
      sideBy: 'column',
    },
    // Misread side: a payment taken as a deposit.
    {
      date: '2025-01-20',
      description: 'PAGO',
      debit: 0,
      credit: 30_000,
      balance: 120_000,
      page: 1,
      sideBy: 'column',
    },
  ],
  provenance: { summary: 'T0', transactions: 'T0' },
};
const context = (statement: BankStatement | null): ExtractionContext => ({
  documentId: 'doc',
  previous: statement ? { statement, validation: validateStatement(statement), tier: 'T0' } : null,
});

describe('T3LlmStatementExtractor', () => {
  it('sends the repaired page text with structured output and maps pesos to cents', async () => {
    const { llm, seen } = llmReturning([{ type: 'text', text: JSON.stringify(llmJson) }]);
    const out = await new T3LlmStatementExtractor(llm).extract(text, context(brokenCandidate));
    if ('skipped' in out) throw new Error('unexpected skip');

    expect(seen[0]).toMatchObject({ model: 'basic', purpose: 't3-extract-statement@v1' });
    expect(seen[0]?.outputSchema).toBeDefined();
    const prompt = JSON.stringify(seen[0]?.messages);
    expect(prompt).toContain('=== page 1 ===');
    expect(prompt).toContain('running-balance'); // failed checks are passed as a hint

    expect(out.statement.summary).toMatchObject({ currency: 'MXN', openingBalance: 100_000 });
    expect(out.statement.transactions[1]).toMatchObject({ debit: 30_000, sideBy: 'model' });
    expect(out.statement.provenance.transactions).toBe('T3');
    expect(validateStatement(out.statement).passed).toBe(true);
    expect(out.diagnostics.costUsd).toBe(0.00035);
  });

  it('skips on a fixture miss, and on truncated or invalid output', async () => {
    const missing: LlmPort = {
      complete: async () => {
        throw new LlmUnavailableError('no fixture', 'fixture-missing');
      },
    };
    expect(await new T3LlmStatementExtractor(missing).extract(text, context(null))).toMatchObject({
      skipped: 'fixture-missing',
    });
    const truncated = llmReturning([{ type: 'text', text: '{"bankName":' }], 'max_tokens').llm;
    expect(await new T3LlmStatementExtractor(truncated).extract(text, context(null))).toMatchObject(
      {
        skipped: 'invalid-output',
      },
    );
  });
});

describe('T4RepairAgentExtractor', () => {
  it('repairs the candidate through tools and validates its own work', async () => {
    const call = (id: string, name: string, input: unknown): LlmContent => ({
      type: 'tool_use',
      id,
      name,
      input,
    });
    const turns: LlmContent[][] = [
      [
        call('1', 'run_validators', {}),
        call('2', 'get_page_text', { page: 1 }),
        call('3', 'list_rows', { from: 0, to: 10 }),
      ],
      [
        call('4', 'update_row', {
          index: 1,
          row: { ...row('2025-01-20', 300, 0, 1200), description: 'PAGO PROVEEDOR' },
        }),
      ],
      [call('5', 'run_validators', {})],
      [call('6', 'submit_extraction', { notes: 'row 1 was a debit' })],
    ];
    const seen: LlmRequest[] = [];
    const llm: LlmPort = {
      complete: async (r) => {
        seen.push(structuredClone(r));
        return {
          model: 'claude-opus-5-5',
          content: turns[seen.length - 1] ?? [],
          stopReason: 'tool_use',
          usage: { inputTokens: 3000, outputTokens: 200, costUsd: 0.016 },
          source: 'fixture',
        };
      },
    };
    const t4 = new T4RepairAgentExtractor(new ToolLoopAgent(llm, logger));
    const out = await t4.extract(text, context(brokenCandidate));
    if ('skipped' in out) throw new Error('unexpected skip');

    expect(out.diagnostics).toMatchObject({ stop: 'submitted', turns: 4, edits: 1, toolErrors: 0 });
    expect(validateStatement(out.statement).passed).toBe(true);
    expect(out.statement.provenance.transactions).toBe('T4');
    // The earlier tier's candidate is not mutated.
    expect(brokenCandidate.transactions[1]?.credit).toBe(30_000);
    // Tool results reached the model: the second request carries the page text and the failing report.
    const results = JSON.stringify(seen[1]?.messages[2]);
    expect(results).toContain('FAILING');
    expect(results).toContain('PAGO PROVEEDOR');
    expect(seen[2]?.messages.length).toBe(5);
    expect(JSON.stringify(seen[3]?.messages[6])).toContain('ALL BLOCKING CHECKS PASS');
  });

  it('skips when there is nothing to repair', async () => {
    const agent = { run: vi.fn() };
    const t4 = new T4RepairAgentExtractor(agent);
    expect(await t4.extract(text, context(null))).toMatchObject({ skipped: 'nothing-to-repair' });
    expect(agent.run).not.toHaveBeenCalled();
  });
});
