/** Logging port: use cases log through this, never through a concrete logger (ADR 0009). */
export interface LoggerPort {
  info(msg: string, context?: Record<string, unknown>): void;
  warn(msg: string, context?: Record<string, unknown>): void;
  error(msg: string, context?: Record<string, unknown>): void;
  debug(msg: string, context?: Record<string, unknown>): void;
}

export const LOGGER_PORT = Symbol('LoggerPort');
