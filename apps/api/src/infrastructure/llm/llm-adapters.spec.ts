import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
  LlmUnavailableError,
} from '../../application/ports/llm.port';
import type { LoggerPort } from '../../application/ports/logger.port';
import { AnthropicLlmAdapter, DEFAULT_MODELS } from './anthropic-llm.adapter';
import { canonicalJson, FixtureStore } from './fixture-store';
import { costUsd } from './pricing';
import { DisabledLlmAdapter, RecordingLlmAdapter, ReplayLlmAdapter } from './replay-llm.adapter';

const logger: LoggerPort = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const request = (over: Partial<LlmRequest> = {}): LlmRequest => ({
  purpose: 'unit@v1',
  model: 'basic',
  system: 'sys',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
  maxTokens: 100,
  ...over,
});
const answer: LlmResponse = {
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text: '{"ok":true}' }],
  stopReason: 'end_turn',
  usage: { inputTokens: 1000, outputTokens: 100, costUsd: 0.00015 },
  source: 'live',
};

describe('pricing', () => {
  it('prices per million tokens, with the Haiku long-prompt tier', () => {
    expect(costUsd('claude-opus-5-5', 1_000_000, 100_000)).toBeCloseTo(6);
    expect(costUsd('claude-haiku-5-5', 10_000, 1_000)).toBeCloseTo(0.0015);
    expect(costUsd('claude-haiku-5-5', 200_000, 0)).toBeCloseTo(0.1);
    expect(costUsd('unknown', 1, 1)).toBe(0);
  });
});

describe('FixtureStore', () => {
  it('keys requests canonically: key order does not matter, content and model do', () => {
    const store = new FixtureStore('/x');
    expect(canonicalJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
    const k = store.key(request(), 'm1');
    expect(store.key(request(), 'm1')).toBe(k);
    expect(store.key(request(), 'm2')).not.toBe(k);
    expect(store.key(request({ system: 'sys v2' }), 'm1')).not.toBe(k);
    expect(store.path('t3-extract@v1', k)).toBe(`/x/t3-extract@v1/${k}.json`);
  });
});

describe('replay / record adapters', () => {
  it('records once, then replays without the live adapter', async () => {
    const store = new FixtureStore(mkdtempSync(join(tmpdir(), 'llm-')));
    const live: LlmPort = { complete: vi.fn(async () => answer) };
    const recorder = new RecordingLlmAdapter(live, store, DEFAULT_MODELS, logger);
    expect((await recorder.complete(request())).source).toBe('live');
    expect((await recorder.complete(request())).source).toBe('fixture');
    expect(live.complete).toHaveBeenCalledTimes(1);

    const replayed = await new ReplayLlmAdapter(store, DEFAULT_MODELS, logger).complete(request());
    expect(replayed).toEqual({ ...answer, source: 'fixture' });
  });

  it('fails with LlmUnavailableError on a replay miss or when disabled', async () => {
    const store = new FixtureStore(mkdtempSync(join(tmpdir(), 'llm-')));
    await expect(
      new ReplayLlmAdapter(store, DEFAULT_MODELS, logger).complete(request()),
    ).rejects.toMatchObject({ reason: 'fixture-missing' });
    await expect(new DisabledLlmAdapter().complete(request())).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
  });
});

describe('AnthropicLlmAdapter', () => {
  function fakeClient(message: unknown) {
    const stream = vi.fn(() => ({ finalMessage: async () => message }));
    return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
  }
  const message = {
    model: 'claude-opus-5-5',
    stop_reason: 'tool_use',
    usage: { input_tokens: 900, cache_read_input_tokens: 100, output_tokens: 50 },
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 't1', name: 'run_validators', input: {} },
    ],
  };

  it('maps tools as strict, keeps thinking opaque, prices the call, and opts the big model into fallback', async () => {
    const { client, stream } = fakeClient(message);
    const out = await new AnthropicLlmAdapter(DEFAULT_MODELS, client).complete(
      request({
        model: 'big',
        effort: 'high',
        tools: [{ name: 'run_validators', description: 'd', inputSchema: { type: 'object' } }],
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'go' }] },
          {
            role: 'assistant',
            content: [{ type: 'opaque', raw: { type: 'thinking', signature: 's0' } }],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', toolUseId: 'x', content: 'r', isError: true }],
          },
        ],
      }),
    );
    const params = (stream.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01'],
      output_config: { effort: 'high' },
      tools: [{ name: 'run_validators', strict: true }],
    });
    const msgs = params.messages as { content: unknown[] }[];
    expect(msgs[1]?.content[0]).toEqual({ type: 'thinking', signature: 's0' });
    expect(msgs[2]?.content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'x',
      content: 'r',
      is_error: true,
    });

    expect(out.stopReason).toBe('tool_use');
    expect(out.content[0]).toEqual({ type: 'opaque', raw: message.content[0] });
    expect(out.usage.inputTokens).toBe(1000);
    expect(out.usage.costUsd).toBeCloseTo(costUsd('claude-opus-5-5', 1000, 50));
  });

  it('sends structured output for the basic model without fallback', async () => {
    const { client, stream } = fakeClient({
      ...message,
      model: 'claude-haiku-5-5',
      stop_reason: 'end_turn',
      content: [],
    });
    await new AnthropicLlmAdapter(DEFAULT_MODELS, client).complete(
      request({ outputSchema: { type: 'object' } }),
    );
    const params = (stream.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.output_config).toEqual({
      format: { type: 'json_schema', schema: { type: 'object' } },
    });
    expect(params).not.toHaveProperty('fallbacks');
  });
});
