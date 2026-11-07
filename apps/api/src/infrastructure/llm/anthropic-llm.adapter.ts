import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmContent,
  LlmModelSlot,
  LlmPort,
  LlmRequest,
  LlmResponse,
  LlmStopReason,
} from '../../application/ports/llm.port';
import { costUsd } from './pricing';

export type ModelIds = Record<LlmModelSlot, string>;

/** Pinned model ids (ADR 0004). Override with LLM_MODEL_BASIC / LLM_MODEL_BIG. */
export const DEFAULT_MODELS: ModelIds = { basic: 'claude-haiku-5-5', big: 'claude-opus-5-5' };

/**
 * LlmPort over the Anthropic Messages API.
 *
 * - Structured answers use `output_config.format` (JSON schema). Forced `tool_choice` is rejected
 *   by Opus 5.5, so agents use `auto` + strict tools and the prompt names the tool to call.
 * - Thinking stays at the model default (adaptive); `effort` is the only depth control. Sampling
 *   parameters (temperature) are not accepted by current models, so reproducibility comes from
 *   the fixtures, not from temperature 0.
 * - The big model opts into server-side refusal fallback (`fallbacks: "default"`).
 * - Requests stream (`finalMessage`) so large outputs never hit HTTP timeouts.
 */
export class AnthropicLlmAdapter implements LlmPort {
  private readonly client: Anthropic;

  constructor(
    readonly models: ModelIds = DEFAULT_MODELS,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ maxRetries: 3 });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const model = this.models[request.model];
    const big = request.model === 'big';
    const message = await this.client.beta.messages
      .stream({
        model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: request.messages.map(toParam),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
                strict: true,
              })),
            }
          : {}),
        output_config: {
          ...(request.effort ? { effort: request.effort } : {}),
          ...(request.outputSchema
            ? { format: { type: 'json_schema' as const, schema: request.outputSchema } }
            : {}),
        },
        ...(big
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      })
      .finalMessage();

    const inputTokens =
      message.usage.input_tokens +
      (message.usage.cache_creation_input_tokens ?? 0) +
      (message.usage.cache_read_input_tokens ?? 0);
    return {
      model: message.model,
      content: message.content.map(fromBlock),
      stopReason: stopReason(message.stop_reason),
      usage: {
        inputTokens,
        outputTokens: message.usage.output_tokens,
        costUsd: costUsd(model, inputTokens, message.usage.output_tokens),
      },
      source: 'live',
    };
  }
}

function toParam(m: LlmRequest['messages'][number]): Anthropic.Beta.BetaMessageParam {
  return {
    role: m.role,
    content: m.content.map((c): Anthropic.Beta.BetaContentBlockParam => {
      switch (c.type) {
        case 'text':
          return { type: 'text', text: c.text };
        case 'tool_use':
          return { type: 'tool_use', id: c.id, name: c.name, input: c.input };
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: c.toolUseId,
            content: c.content,
            ...(c.isError ? { is_error: true } : {}),
          };
        case 'opaque':
          return c.raw as Anthropic.Beta.BetaContentBlockParam;
      }
    }),
  };
}

function fromBlock(b: Anthropic.Beta.BetaContentBlock): LlmContent {
  if (b.type === 'text') return { type: 'text', text: b.text };
  if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
  // Thinking, redacted thinking, fallback markers: sent back verbatim, never read.
  return { type: 'opaque', raw: b };
}

function stopReason(r: string | null): LlmStopReason {
  return r === 'end_turn' || r === 'tool_use' || r === 'max_tokens' || r === 'refusal'
    ? r
    : 'other';
}
