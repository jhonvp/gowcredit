import type { CfdiInvoice } from '../../domain/cfdi/cfdi-invoice';
import type { EligibilityPolicy } from '../../domain/eligibility/policy';

/** Current eligibility policy (YAML in config/, ADR 0007). */
export interface PolicyPort {
  current(): EligibilityPolicy;
}
export const POLICY_PORT = Symbol('PolicyPort');

/** CFDI XML → invoice model. Throws CfdiParseError on anything that is not a CFDI. */
export interface CfdiParserPort {
  parse(xml: Uint8Array): CfdiInvoice;
}
export const CFDI_PARSER_PORT = Symbol('CfdiParserPort');

export class CfdiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CfdiParseError';
  }
}

/** SAT cancellation status of a CFDI (C-K6). v1 ships a stub adapter (docs/eligibility-policy.md). */
export interface SatStatusPort {
  status(invoice: CfdiInvoice): Promise<'active' | 'cancelled' | 'unknown'>;
}
export const SAT_STATUS_PORT = Symbol('SatStatusPort');
