import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmSettings } from '../llm/create-llm';
import type { Env } from './env.schema';

/** Typed accessor over validated env; adapters read config only through this. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }
  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }
  get logPretty(): boolean {
    return this.config.get('LOG_PRETTY', { infer: true });
  }
  get databaseUrl(): string {
    return this.config.get('DATABASE_URL', { infer: true });
  }
  get dbLogging(): boolean {
    return this.config.get('DB_LOGGING', { infer: true });
  }
  get documents(): {
    bucket: string;
    queueName: string;
    bootstrap: boolean;
    visibilityTimeout: number;
  } {
    return {
      bucket: this.config.get('S3_BUCKET', { infer: true }),
      queueName: this.config.get('SQS_QUEUE_NAME', { infer: true }),
      bootstrap: this.config.get('AWS_BOOTSTRAP', { infer: true }),
      visibilityTimeout: this.config.get('SQS_VISIBILITY_TIMEOUT', { infer: true }),
    };
  }
  get eligibility(): { asOf: string | null; satStatusMode: 'active' | 'unknown' } {
    return {
      asOf: this.config.get('ELIGIBILITY_AS_OF', { infer: true }) ?? null,
      satStatusMode: this.config.get('SAT_STATUS_MODE', { infer: true }),
    };
  }
  get llm(): LlmSettings {
    return {
      mode: this.config.get('LLM_MODE', { infer: true }),
      fixturesDir: this.config.get('LLM_FIXTURES_DIR', { infer: true }) || undefined,
      models: {
        ...(this.config.get('LLM_MODEL_BASIC', { infer: true })
          ? { basic: this.config.get('LLM_MODEL_BASIC', { infer: true }) as string }
          : {}),
        ...(this.config.get('LLM_MODEL_BIG', { infer: true })
          ? { big: this.config.get('LLM_MODEL_BIG', { infer: true }) as string }
          : {}),
      },
    };
  }
}
