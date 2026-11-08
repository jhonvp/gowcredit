import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CLOCK_PORT } from '../application/ports/clock.port';
import { AuthModule } from '../infrastructure/auth/auth.module';
import { ConfigModule } from '../infrastructure/config/config.module';
import { DocumentsModule } from '../infrastructure/documents/documents.module';
import { LoggingModule } from '../infrastructure/logging/logging.module';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { AuthController } from '../interfaces/http/auth.controller';
import { DocumentsController } from '../interfaces/http/documents.controller';
import { HealthController } from '../interfaces/http/health.controller';
import { OwnerController } from '../interfaces/http/owner.controller';

/**
 * Composition root (ADR 0001): the only place where ports are bound to adapters.
 * Feature modules (cascade, eligibility, clarification, auth...) are added here as they land.
 */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PersistenceModule,
    TerminusModule,
    AuthModule,
    DocumentsModule,
  ],
  controllers: [HealthController, AuthController, DocumentsController, OwnerController],
  providers: [{ provide: CLOCK_PORT, useValue: { now: () => new Date() } }],
})
export class AppModule {}
