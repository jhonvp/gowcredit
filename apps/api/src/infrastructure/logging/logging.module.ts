import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { LOGGER_PORT } from '../../application/ports/logger.port';
import { AppConfig } from '../config/app-config';
import { PinoLoggerAdapter } from './pino-logger.adapter';
import { REDACT_PATHS } from './redact';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
          autoLogging: { ignore: (req) => req.url === '/health' },
          transport: config.logPretty
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        },
      }),
    }),
  ],
  providers: [PinoLoggerAdapter, { provide: LOGGER_PORT, useExisting: PinoLoggerAdapter }],
  exports: [LOGGER_PORT],
})
export class LoggingModule {}
