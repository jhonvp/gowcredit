import type { LlmPort } from '../../application/ports/llm.port';
import type { LoggerPort } from '../../application/ports/logger.port';
import { AnthropicLlmAdapter, DEFAULT_MODELS, type ModelIds } from './anthropic-llm.adapter';
import { defaultFixturesDir, FixtureStore } from './fixture-store';
import { DisabledLlmAdapter, RecordingLlmAdapter, ReplayLlmAdapter } from './replay-llm.adapter';

export type LlmMode = 'replay' | 'record' | 'live' | 'off';

export interface LlmSettings {
  mode: LlmMode;
  fixturesDir?: string;
  models?: Partial<ModelIds>;
}

/** Builds the LlmPort for LLM_MODE (ADR 0004). Used by the Nest module and by scripts/eval.ts. */
export function createLlm(settings: LlmSettings, logger: LoggerPort): LlmPort {
  const models: ModelIds = { ...DEFAULT_MODELS, ...settings.models };
  const store = new FixtureStore(settings.fixturesDir ?? defaultFixturesDir());
  switch (settings.mode) {
    case 'off':
      return new DisabledLlmAdapter();
    case 'replay':
      return new ReplayLlmAdapter(store, models, logger);
    case 'live':
      return new AnthropicLlmAdapter(models);
    case 'record':
      return new RecordingLlmAdapter(new AnthropicLlmAdapter(models), store, models, logger);
  }
}

export function llmSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): LlmSettings {
  const mode = (env.LLM_MODE ?? 'replay') as LlmMode;
  if (!['replay', 'record', 'live', 'off'].includes(mode))
    throw new Error(`Invalid LLM_MODE: ${mode}`);
  return {
    mode,
    fixturesDir: env.LLM_FIXTURES_DIR || undefined,
    models: {
      ...(env.LLM_MODEL_BASIC ? { basic: env.LLM_MODEL_BASIC } : {}),
      ...(env.LLM_MODEL_BIG ? { big: env.LLM_MODEL_BIG } : {}),
    },
  };
}
