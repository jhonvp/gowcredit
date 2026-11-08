import { Module } from '@nestjs/common';
import { ConfigModule } from '../infrastructure/config/config.module';
import { DocumentsModule } from '../infrastructure/documents/documents.module';
import { LoggingModule } from '../infrastructure/logging/logging.module';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { ExtractionWorker } from '../interfaces/worker/extraction.worker';

/** Composition root of the worker process (no HTTP): SQS → extraction cascade → Postgres. */
@Module({
  imports: [ConfigModule, LoggingModule, PersistenceModule, DocumentsModule],
  providers: [ExtractionWorker],
})
export class WorkerModule {}
