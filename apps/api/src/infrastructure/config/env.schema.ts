import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Full URL locally; in ECS it is composed from DB_* (RDS-managed secret injects user/password). */
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('gowcredit'),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Auth (ADR 0005). In AWS the secret comes from Secrets Manager.
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 3600),
  // Documents and the extraction queue (ADR 0006). Floci locally, Terraform-managed in AWS.
  S3_BUCKET: z.string().default('gowcredit-local-documents'),
  SQS_QUEUE_NAME: z.string().default('gowcredit-local-extract'),
  /** Create the bucket and queue on startup (local Floci only; in AWS Terraform owns them). */
  AWS_BOOTSTRAP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Seconds a received job stays invisible to other workers; must exceed the slowest extraction. */
  SQS_VISIBILITY_TIMEOUT: z.coerce.number().int().positive().default(300),
  // Clarification loop (ADR 0008): email with a magic link to the web owner page.
  SMTP_URL: z.string().default('smtp://mailpit:1025'),
  MAIL_FROM: z.string().default('GowCredit <no-reply@gowcredit.local>'),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  /**
   * Lets analysts generate a fresh owner link in the UI (local demos, or sharing it by phone). Off by
   * default: in production the emailed link is the only one, and only its hash is stored.
   */
  OWNER_LINK_SHARING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Eligibility (ADR 0007). Fixed evaluation date for reproducible runs; default is today.
  ELIGIBILITY_AS_OF: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** C-K6 stub: 'active' assumes the CFDI is not cancelled; 'unknown' makes the owner confirm. */
  SAT_STATUS_MODE: z.enum(['active', 'unknown']).default('active'),
  // LLM tiers (ADR 0004). replay needs no key; record/live use ANTHROPIC_API_KEY (read by the SDK).
  LLM_MODE: z.enum(['replay', 'record', 'live', 'off']).default('replay'),
  LLM_FIXTURES_DIR: z.string().optional(),
  LLM_MODEL_BASIC: z.string().optional(),
  LLM_MODEL_BIG: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (raw: Record<string, unknown>): Env & { DATABASE_URL: string } => {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  const env = parsed.data;
  const url = env.DATABASE_URL ?? databaseUrlFromParts(env);
  if (!url) throw new Error('Invalid environment: set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD');
  return { ...env, DATABASE_URL: url };
};

/** postgres://user:pass@host:port/name with TLS required (RDS), from the DB_* variables. */
export function databaseUrlFromParts(env: {
  DB_HOST?: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
}): string | null {
  if (!env.DB_HOST || !env.DB_USER || !env.DB_PASSWORD) return null;
  const user = encodeURIComponent(env.DB_USER);
  const pass = encodeURIComponent(env.DB_PASSWORD);
  return `postgres://${user}:${pass}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}?sslmode=no-verify`;
}
