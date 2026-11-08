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
  // Documents and the extraction queue (ADR 0006). Floci locally, Terraform-managed in AWS.
  S3_BUCKET: z.string().default('gowcredit-documents-local'),
  SQS_QUEUE_NAME: z.string().default('gowcredit-extract-local'),
  /** Create the bucket and queue on startup (local Floci only; in AWS Terraform owns them). */
  AWS_BOOTSTRAP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Seconds a received job stays invisible to other workers; must exceed the slowest extraction. */
  SQS_VISIBILITY_TIMEOUT: z.coerce.number().int().positive().default(300),
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
