import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { CLOCK_PORT } from '../application/ports/clock.port';
import { ConfigModule } from '../infrastructure/config/config.module';
import { ExtractionModule } from '../infrastructure/extraction/extraction.module';
import { LoggingModule } from '../infrastructure/logging/logging.module';
import { PersistenceModule } from '../infrastructure/persistence/persistence.module';
import { HealthController } from '../interfaces/http/health.controller';

/**
 * Composition root (ADR 0001): the only place where ports are bound to adapters.
 * Feature modules (cascade, eligibility, clarification, auth...) are added here as they land.
 */
@Module({
  imports: [ConfigModule, LoggingModule, PersistenceModule, TerminusModule, ExtractionModule],
  controllers: [HealthController],
  providers: [{ provide: CLOCK_PORT, useValue: { now: () => new Date() } }],
})
export class AppModule {}
