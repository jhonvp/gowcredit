/**
 * PII never reaches logs (ADR 0009). Paths are matched at any depth by pino's redact.
 * Extracted values are not logged at all; this is the safety net.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  '*.rfc',
  '*.clabe',
  '*.accountNumber',
  '*.holderName',
  '*.email',
  '*.password',
  '*.token',
  '*.rawText',
  '*.pageText',
];
