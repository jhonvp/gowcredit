import { describe, expect, it, vi } from 'vitest';
import type { AgentTask, AgentTool } from '../ports/agent.port';
import type { LlmContent, LlmPort, LlmRequest, LlmResponse } from '../ports/llm.port';
import type { LoggerPort } from '../ports/logger.port';
import { ToolLoopAgent } from './tool-loop-agent';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

/** Scripted LLM: returns the given turns in order and records every request it saw. */
function scripted(turns: LlmContent[][], cost = 0.1) {
  const seen: LlmRequest[] = [];
  const llm: LlmPort = {
    complete: vi.fn(async (req: LlmRequest): Promise<LlmResponse> => {
      seen.push(structuredClone(req));
      const content = turns[seen.length - 1] ?? [{ type: 'text', text: 'done' }];
      return {
        model: 'm',
        content,
        stopReason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5, costUsd: cost },
        source: 'fixture',
      };
    }),
  };
  return { llm, seen };
}

const call = (id: string, name: string, input: unknown = {}): LlmContent => ({
  type: 'tool_use',
  id,
  name,
  input,
});

const tools: AgentTool[] = [
  { name: 'echo', description: '', inputSchema: {}, run: (i) => ({ content: JSON.stringify(i) }) },
  {
    name: 'submit',
    description: '',
    inputSchema: {},
    run: (i) => ({ content: 'ok', final: i }),
  },
];

const task = (over: Partial<AgentTask> = {}): AgentTask => ({
  purpose: 'test@v1',
  model: 'big',
  system: 's',
  prompt: 'p',
  tools,
  limits: { maxTurns: 5, maxCostUsd: 10 },
  maxTokensPerTurn: 100,
  ...over,
});

describe('ToolLoopAgent', () => {
  it('runs tools, returns all results in one user message, and stops on the terminal tool', async () => {
    const thinking: LlmContent = { type: 'opaque', raw: { type: 'thinking', signature: 'sig' } };
    const { llm, seen } = scripted([
      [thinking, call('a', 'echo', { x: 1 }), call('b', 'echo', { x: 2 })],
      [call('c', 'submit', { answer: 42 })],
    ]);
    const out = await new ToolLoopAgent(llm, logger).run(task());

    expect(out).toMatchObject({
      stop: 'submitted',
      final: { answer: 42 },
      turns: 2,
      replayed: true,
    });
    expect(out.costUsd).toBeCloseTo(0.2);
    const second = seen[1]?.messages ?? [];
    // Assistant turn echoed verbatim (opaque thinking included), then one user message with both results.
    expect(second[1]?.content[0]).toEqual(thinking);
    expect(second[2]?.content.map((c) => c.type === 'tool_result' && c.toolUseId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('reports unknown tools and thrown errors back to the model as tool errors', async () => {
    const boom: AgentTool = {
      name: 'boom',
      description: '',
      inputSchema: {},
      run: () => {
        throw new Error('bad input');
      },
    };
    const { llm, seen } = scripted([[call('a', 'nope'), call('b', 'boom')], [call('c', 'submit')]]);
    const out = await new ToolLoopAgent(llm, logger).run(task({ tools: [...tools, boom] }));
    expect(out.toolCalls).toEqual([
      { name: 'nope', isError: true },
      { name: 'boom', isError: true },
      { name: 'submit', isError: false },
    ]);
    expect(JSON.stringify(seen[1]?.messages[2])).toContain('bad input');
  });

  it('enforces the turn cap and the cost cap', async () => {
    const loop = Array.from({ length: 10 }, (_, i) => [call(`t${i}`, 'echo')]);
    const turns = await new ToolLoopAgent(scripted(loop).llm, logger).run(
      task({ limits: { maxTurns: 3, maxCostUsd: 10 } }),
    );
    expect(turns).toMatchObject({ stop: 'max-turns', turns: 3 });

    const cost = await new ToolLoopAgent(scripted(loop, 0.4).llm, logger).run(
      task({ limits: { maxTurns: 10, maxCostUsd: 1 } }),
    );
    expect(cost).toMatchObject({ stop: 'cost-cap', turns: 3 });
  });

  it('stops when the model answers without calling a tool', async () => {
    const out = await new ToolLoopAgent(scripted([[{ type: 'text', text: 'hi' }]]).llm, logger).run(
      task(),
    );
    expect(out).toMatchObject({ stop: 'no-tool-call', final: null });
  });
});
