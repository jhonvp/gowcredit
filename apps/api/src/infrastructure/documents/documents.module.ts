import { randomUUID } from 'node:crypto';
import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CASE_REPOSITORY_PORT,
  type CaseRepositoryPort,
} from '../../application/ports/case-repository.port';
import { JOB_QUEUE_PORT, type JobQueuePort } from '../../application/ports/job-queue.port';
import { LOGGER_PORT, type LoggerPort } from '../../application/ports/logger.port';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../../application/ports/object-storage.port';
import { ExtractBankStatementUseCase } from '../../application/use-cases/extract-bank-statement.use-case';
import { ProcessDocumentUseCase } from '../../application/use-cases/process-document.use-case';
import { SubmitDocumentUseCase } from '../../application/use-cases/submit-document.use-case';
import { AppConfig } from '../config/app-config';
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
      provide: ProcessDocumentUseCase,
      inject: [CASE_REPOSITORY_PORT, OBJECT_STORAGE_PORT, ExtractBankStatementUseCase, LOGGER_PORT],
      useFactory: (
        cases: CaseRepositoryPort,
        storage: ObjectStoragePort,
        extract: ExtractBankStatementUseCase,
        logger: LoggerPort,
      ) => new ProcessDocumentUseCase(cases, storage, extract, logger),
    },
  ],
  exports: [
    SubmitDocumentUseCase,
    ProcessDocumentUseCase,
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
