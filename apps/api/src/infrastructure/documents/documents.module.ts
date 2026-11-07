import { randomUUID } from 'node:crypto';
import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import {
  ANSWER_NORMALIZER_PORT,
  type AnswerNormalizerPort,
  CLARIFICATION_REPOSITORY_PORT,
  type ClarificationRepositoryPort,
  MAILER_PORT,
  type MailerPort,
  QUESTION_WRITER_PORT,
  type QuestionWriterPort,
  SECRET_TOKEN_PORT,
  type SecretTokenPort,
} from '../../application/ports/clarification.ports';
import { CLOCK_PORT, type ClockPort } from '../../application/ports/clock.port';
import { AGENT_PORT, type AgentPort } from '../../application/ports/agent.port';
import { LLM_PORT, type LlmPort } from '../../application/ports/llm.port';
import {
  CFDI_PARSER_PORT,
  type CfdiParserPort,
  POLICY_PORT,
  type PolicyPort,
  SAT_STATUS_PORT,
  type SatStatusPort,
} from '../../application/ports/eligibility.ports';
import { JOB_QUEUE_PORT, type JobQueuePort } from '../../application/ports/job-queue.port';
import { LOGGER_PORT, type LoggerPort } from '../../application/ports/logger.port';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../../application/ports/object-storage.port';
import { AnalystCopilotUseCase } from '../../application/use-cases/analyst-copilot.use-case';
import { AnswerClarificationUseCase } from '../../application/use-cases/answer-clarification.use-case';
import { DecideCaseUseCase } from '../../application/use-cases/decide-case.use-case';
import { RequestClarificationUseCase } from '../../application/use-cases/request-clarification.use-case';
import { ExtractBankStatementUseCase } from '../../application/use-cases/extract-bank-statement.use-case';
import { ProcessDocumentUseCase } from '../../application/use-cases/process-document.use-case';
import { SubmitDocumentUseCase } from '../../application/use-cases/submit-document.use-case';
import { AppConfig } from '../config/app-config';
import { MagicLinkStrategy } from '../auth/magic-link.strategy';
import {
  LlmAnswerNormalizer,
  LlmQuestionWriter,
} from '../clarification/llm-clarification.adapters';
import { CryptoSecretToken } from '../clarification/secret-token.adapter';
import { CfdiXmlParser } from '../eligibility/cfdi-xml.parser';
import { NodemailerAdapter } from '../mail/nodemailer.adapter';
import { TypeOrmClarificationRepository } from '../persistence/repositories/typeorm-clarification.repository';
import { StubSatStatusAdapter } from '../eligibility/stub-sat-status.adapter';
import { YamlPolicyAdapter } from '../eligibility/yaml-policy.adapter';
import { ExtractionModule } from '../extraction/extraction.module';
import { TypeOrmCaseRepository } from '../persistence/repositories/typeorm-case.repository';
import { SqsJobQueue } from '../queue/sqs-job-queue';
import { S3ObjectStorage } from '../storage/s3-object-storage';

/** Document intake + worker use cases bound to S3, SQS and Postgres (ADR 0001/0006). */
@Module({
  imports: [ExtractionModule],
  providers: [
    {
      provide: OBJECT_STORAGE_PORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new S3ObjectStorage(config.documents.bucket),
    },
    {
      provide: JOB_QUEUE_PORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new SqsJobQueue(config.documents.queueName),
    },
    { provide: CLOCK_PORT, useValue: { now: () => new Date() } satisfies ClockPort },
    { provide: POLICY_PORT, useFactory: () => new YamlPolicyAdapter() },
    { provide: CFDI_PARSER_PORT, useValue: new CfdiXmlParser() },
    {
      provide: SAT_STATUS_PORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => new StubSatStatusAdapter(config.eligibility.satStatusMode),
    },
    {
      provide: CASE_REPOSITORY_PORT,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmCaseRepository(ds),
    },
    {
      provide: SubmitDocumentUseCase,
      inject: [OBJECT_STORAGE_PORT, JOB_QUEUE_PORT, CASE_REPOSITORY_PORT, LOGGER_PORT],
      useFactory: (
        storage: ObjectStoragePort,
        queue: JobQueuePort,
        cases: CaseRepositoryPort,
        logger: LoggerPort,
      ) => new SubmitDocumentUseCase(storage, queue, cases, { uuid: randomUUID }, logger),
    },
    {
      provide: CLARIFICATION_REPOSITORY_PORT,
      inject: [DataSource],
      useFactory: (ds: DataSource) => new TypeOrmClarificationRepository(ds),
    },
    {
      provide: MAILER_PORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new NodemailerAdapter(config.mail.smtpUrl, config.mail.from),
    },
    { provide: SECRET_TOKEN_PORT, useValue: new CryptoSecretToken() },
    {
      provide: QUESTION_WRITER_PORT,
      inject: [LLM_PORT, LOGGER_PORT],
      useFactory: (llm: LlmPort, logger: LoggerPort) => new LlmQuestionWriter(llm, logger),
    },
    {
      provide: ANSWER_NORMALIZER_PORT,
      inject: [LLM_PORT],
      useFactory: (llm: LlmPort) => new LlmAnswerNormalizer(llm),
    },
    {
      provide: RequestClarificationUseCase,
      inject: [
        CASE_REPOSITORY_PORT,
        CLARIFICATION_REPOSITORY_PORT,
        QUESTION_WRITER_PORT,
        SECRET_TOKEN_PORT,
        MAILER_PORT,
        CLOCK_PORT,
        LOGGER_PORT,
        AppConfig,
      ],
      useFactory: (
        cases: CaseRepositoryPort,
        requests: ClarificationRepositoryPort,
        writer: QuestionWriterPort,
        tokens: SecretTokenPort,
        mailer: MailerPort,
        clock: ClockPort,
        logger: LoggerPort,
        config: AppConfig,
      ) =>
        new RequestClarificationUseCase(
          cases,
          requests,
          writer,
          tokens,
          mailer,
          clock,
          logger,
          config.mail.webBaseUrl,
        ),
    },
    {
      provide: DecideCaseUseCase,
      inject: [
        CASE_REPOSITORY_PORT,
        POLICY_PORT,
        SAT_STATUS_PORT,
        CLOCK_PORT,
        LOGGER_PORT,
        AppConfig,
        RequestClarificationUseCase,
      ],
      useFactory: (
        cases: CaseRepositoryPort,
        policy: PolicyPort,
        sat: SatStatusPort,
        clock: ClockPort,
        logger: LoggerPort,
        config: AppConfig,
        ask: RequestClarificationUseCase,
      ) => new DecideCaseUseCase(cases, policy, sat, clock, logger, config.eligibility.asOf, ask),
    },
    {
      provide: AnswerClarificationUseCase,
      inject: [
        CASE_REPOSITORY_PORT,
        CLARIFICATION_REPOSITORY_PORT,
        ANSWER_NORMALIZER_PORT,
        DecideCaseUseCase,
        CLOCK_PORT,
        LOGGER_PORT,
      ],
      useFactory: (
        cases: CaseRepositoryPort,
        requests: ClarificationRepositoryPort,
        normalizer: AnswerNormalizerPort,
        decide: DecideCaseUseCase,
        clock: ClockPort,
        logger: LoggerPort,
      ) => new AnswerClarificationUseCase(cases, requests, normalizer, decide, clock, logger),
    },
    MagicLinkStrategy,
    {
      provide: AnalystCopilotUseCase,
      inject: [CASE_REPOSITORY_PORT, CLARIFICATION_REPOSITORY_PORT, AGENT_PORT, LOGGER_PORT],
      useFactory: (
        cases: CaseRepositoryPort,
        requests: ClarificationRepositoryPort,
        agent: AgentPort,
        logger: LoggerPort,
      ) => new AnalystCopilotUseCase(cases, requests, agent, logger),
    },
    {
      provide: ProcessDocumentUseCase,
      inject: [
        CASE_REPOSITORY_PORT,
        OBJECT_STORAGE_PORT,
        ExtractBankStatementUseCase,
        CFDI_PARSER_PORT,
        DecideCaseUseCase,
        LOGGER_PORT,
      ],
      useFactory: (
        cases: CaseRepositoryPort,
        storage: ObjectStoragePort,
        extract: ExtractBankStatementUseCase,
        cfdi: CfdiParserPort,
        decideCase: DecideCaseUseCase,
        logger: LoggerPort,
      ) => new ProcessDocumentUseCase(cases, storage, extract, cfdi, decideCase, logger),
    },
  ],
  exports: [
    AnalystCopilotUseCase,
    AnswerClarificationUseCase,
    CLARIFICATION_REPOSITORY_PORT,
    SubmitDocumentUseCase,
    ProcessDocumentUseCase,
    DecideCaseUseCase,
    POLICY_PORT,
    CASE_REPOSITORY_PORT,
    JOB_QUEUE_PORT,
    OBJECT_STORAGE_PORT,
  ],
})
export class DocumentsModule implements OnModuleInit {
  constructor(
    private readonly config: AppConfig,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort,
    @Inject(JOB_QUEUE_PORT) private readonly queue: JobQueuePort,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  async onModuleInit(): Promise<void> {
    const { bootstrap, visibilityTimeout } = this.config.documents;
    if (!bootstrap) return;
    if (this.storage instanceof S3ObjectStorage) await this.storage.ensureBucket();
    if (this.queue instanceof SqsJobQueue) await this.queue.ensureQueue(visibilityTimeout);
    this.logger.info('local aws resources ensured', { ...this.config.documents });
  }
}
