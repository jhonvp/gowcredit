import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { LoggerPort } from '../../application/ports/logger.port';

/** Adapter: LoggerPort → pino (structured JSON, dd trace ids injected by dd-trace). */
@Injectable()
export class PinoLoggerAdapter implements LoggerPort {
  constructor(private readonly logger: PinoLogger) {}

  info(msg: string, context: Record<string, unknown> = {}): void {
    this.logger.info(context, msg);
  }
  warn(msg: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(context, msg);
  }
  error(msg: string, context: Record<string, unknown> = {}): void {
    this.logger.error(context, msg);
  }
  debug(msg: string, context: Record<string, unknown> = {}): void {
    this.logger.debug(context, msg);
  }
}
