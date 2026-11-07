import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DATABASE_URL: z.string().url(),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // LLM tiers (ADR 0004). replay needs no key; record/live use ANTHROPIC_API_KEY (read by the SDK).
  LLM_MODE: z.enum(['replay', 'record', 'live', 'off']).default('replay'),
  LLM_FIXTURES_DIR: z.string().optional(),
  LLM_MODEL_BASIC: z.string().optional(),
  LLM_MODEL_BIG: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
};
