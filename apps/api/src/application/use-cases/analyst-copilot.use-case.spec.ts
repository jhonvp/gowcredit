import { describe, expect, it, vi } from 'vitest';
import { ToolLoopAgent } from '../agents/tool-loop-agent';
import type { CaseRecord, CaseRepositoryPort } from '../ports/case-repository.port';
import type { ClarificationRepositoryPort } from '../ports/clarification.ports';
import {
  type LlmContent,
  type LlmPort,
  type LlmRequest,
  LlmUnavailableError,
} from '../ports/llm.port';
import type { LoggerPort } from '../ports/logger.port';
import { AnalystCopilotUseCase } from './analyst-copilot.use-case';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const theCase = {
  id: 'c1',
  status: 'DECIDED',
  supplierId: 's1',
  ownerEmail: null,
  facts: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  documents: [],
  extractions: [],
  decision: {
    outcome: 'DOES_NOT_QUALIFY',
    score: 58,
    rules: [
      {
        id: 'S-S2',
        kind: 'score',
        passed: false,
        points: 0,
        maxPoints: 20,
        detail: 'liquidity 3.1%',
      },
      { id: 'S-K3', kind: 'knockout', passed: true, detail: 'no overdraft' },
    ],
    missing: [],
    suggestedAdvance: null,
    signals: null,
    policyVersion: 'v1',
    asOf: '2026-03-05',
    createdAt: new Date(),
  },
} as unknown as CaseRecord;
const cases = { findCase: vi.fn(async () => theCase) } as unknown as CaseRepositoryPort;
const requests = { listByCase: vi.fn(async () => []) } as unknown as ClarificationRepositoryPort;

describe('AnalystCopilotUseCase', () => {
  it('answers with read-only tools and cites rules', async () => {
    const seen: LlmRequest[] = [];
    const turns: LlmContent[][] = [
      [{ type: 'tool_use', id: '1', name: 'get_decision_trace', input: {} }],
      [
        {
          type: 'tool_use',
          id: '2',
          name: 'answer',
          input: { text: 'No califica: puntaje 58, S-S2 sin puntos.', citations: ['S-S2'] },
        },
      ],
    ];
    const llm: LlmPort = {
      complete: async (r) => {
        seen.push(structuredClone(r));
        return {
          model: 'claude-haiku-5-5',
          content: turns[seen.length - 1] ?? [],
          stopReason: 'tool_use',
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.001 },
          source: 'fixture',
        };
      },
    };
    const out = await new AnalystCopilotUseCase(
      cases,
      requests,
      new ToolLoopAgent(llm, logger),
      logger,
    ).execute('c1', '¿Por qué no califica?');
    expect(out).toMatchObject({ by: 'agent', citations: ['S-S2'], turns: 2 });
    expect(JSON.stringify(seen[1]?.messages)).toContain('liquidity 3.1%');
    expect(seen[0]?.tools?.map((t) => t.name)).toEqual([
      'get_case',
      'get_decision_trace',
      'get_field_provenance',
      'get_clarifications',
      'answer',
    ]);
  });

  it('falls back to a deterministic trace summary without an LLM', async () => {
    const agent = {
      run: vi.fn(async () => {
        throw new LlmUnavailableError('no fixture', 'fixture-missing');
      }),
    };
    const out = await new AnalystCopilotUseCase(cases, requests, agent, logger).execute(
      'c1',
      '¿Por qué?',
    );
    expect(out?.by).toBe('trace');
    expect(out?.answer).toContain('DOES_NOT_QUALIFY con puntaje 58/100');
    expect(out?.answer).toContain('S-S2 0/20');
  });
});
