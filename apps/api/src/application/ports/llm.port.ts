/**
 * Port for LLM calls (ADR 0004). The application speaks this small, provider-neutral shape; the
 * Anthropic adapter maps it to the Messages API, and the replay/record adapters store it as fixtures.
 */

/** Logical model slot; the adapter maps it to a pinned model id (T3 → Haiku, T4 → Opus). */
export type LlmModelSlot = 'basic' | 'big';

export type LlmContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  /**
   * Provider blocks the application must send back unchanged but never reads (thinking blocks).
   * Multi-turn agent loops replay them verbatim, so history stays append-only.
   */
  | { type: 'opaque'; raw: unknown };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: LlmContent[];
}

export interface LlmTool {
  name: string;
  description: string;
  /** JSON Schema (object, additionalProperties: false). */
  inputSchema: Record<string, unknown>;
}

export interface LlmRequest {
  /** Stable name of the call site + prompt version, e.g. `t3-extract-statement@v1`. Fixture folder + logs. */
  purpose: string;
  model: LlmModelSlot;
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  /** Constrain the final answer to this JSON Schema (structured outputs). */
  outputSchema?: Record<string, unknown>;
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface LlmResponse {
  /** Exact model id that answered. */
  model: string;
  content: LlmContent[];
  stopReason: LlmStopReason;
  usage: LlmUsage;
  /** Where the answer came from: the API now, or a recorded fixture. */
  source: 'live' | 'fixture';
}

export interface LlmPort {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * The LLM cannot answer in the current mode: no fixture recorded for this request in replay mode,
 * or LLM_MODE=off. Tiers treat it as "skipped", never as a crash.
 */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: 'fixture-missing' | 'disabled',
  ) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

export const LLM_PORT = Symbol('LlmPort');

export const textOf = (content: readonly LlmContent[]): string =>
  content
    .filter((c): c is Extract<LlmContent, { type: 'text' }> => c.type === 'text')
    .map((c) => c.text)
    .join('');
