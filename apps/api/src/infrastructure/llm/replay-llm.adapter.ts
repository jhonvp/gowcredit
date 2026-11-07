import {
  type LlmPort,
  type LlmRequest,
  type LlmResponse,
  LlmUnavailableError,
} from '../../application/ports/llm.port';
import type { LoggerPort } from '../../application/ports/logger.port';
import type { ModelIds } from './anthropic-llm.adapter';
import type { FixtureStore } from './fixture-store';

/** LLM_MODE=replay (default): answers only from recorded fixtures; needs no API key or network. */
export class ReplayLlmAdapter implements LlmPort {
  constructor(
    private readonly store: FixtureStore,
    private readonly models: ModelIds,
    private readonly logger: LoggerPort,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const key = this.store.key(request, this.models[request.model]);
    const fixture = this.store.read(request.purpose, key);
    if (!fixture) {
      this.logger.warn('llm fixture missing', { purpose: request.purpose, key });
      throw new LlmUnavailableError(
        `No fixture for ${request.purpose} (${key.slice(0, 12)}); record with LLM_MODE=record`,
        'fixture-missing',
      );
    }
    return { ...fixture.response, source: 'fixture' };
  }
}

/** LLM_MODE=record: calls the live adapter, writes a fixture per call, and replays hits. */
export class RecordingLlmAdapter implements LlmPort {
  constructor(
    private readonly live: LlmPort,
    private readonly store: FixtureStore,
    private readonly models: ModelIds,
    private readonly logger: LoggerPort,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const model = this.models[request.model];
    const key = this.store.key(request, model);
    const existing = this.store.read(request.purpose, key);
    if (existing) return { ...existing.response, source: 'fixture' };
    const response = await this.live.complete(request);
    this.store.write({
      key,
      purpose: request.purpose,
      model: response.model,
      recordedAt: new Date().toISOString(),
      response,
    });
    this.logger.info('llm fixture recorded', {
      purpose: request.purpose,
      key,
      costUsd: response.usage.costUsd,
    });
    return response;
  }
}

/** LLM_MODE=off: every call is unavailable; the cascade stops at the deterministic tiers. */
export class DisabledLlmAdapter implements LlmPort {
  async complete(request: LlmRequest): Promise<LlmResponse> {
    throw new LlmUnavailableError(`LLM disabled (purpose ${request.purpose})`, 'disabled');
  }
}
