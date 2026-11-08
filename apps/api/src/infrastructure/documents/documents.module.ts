import { randomUUID } from 'node:crypto';
import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import { CLOCK_PORT, type ClockPort } from '../../application/ports/clock.port';
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
import { DecideCaseUseCase } from '../../application/use-cases/decide-case.use-case';
import { ExtractBankStatementUseCase } from '../../application/use-cases/extract-bank-statement.use-case';
import { ProcessDocumentUseCase } from '../../application/use-cases/process-document.use-case';
import { SubmitDocumentUseCase } from '../../application/use-cases/submit-document.use-case';
import { AppConfig } from '../config/app-config';
import { CfdiXmlParser } from '../eligibility/cfdi-xml.parser';
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
      provide: DecideCaseUseCase,
      inject: [
        CASE_REPOSITORY_PORT,
        POLICY_PORT,
        SAT_STATUS_PORT,
        CLOCK_PORT,
        LOGGER_PORT,
        AppConfig,
      ],
      useFactory: (
        cases: CaseRepositoryPort,
        policy: PolicyPort,
        sat: SatStatusPort,
        clock: ClockPort,
        logger: LoggerPort,
        config: AppConfig,
      ) => new DecideCaseUseCase(cases, policy, sat, clock, logger, config.eligibility.asOf),
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
