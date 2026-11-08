import { formatMxn } from '../shared/money';
import { type RfcStatus, rfcStatus } from '../shared/rfc';
import type { CfdiInvoice } from './cfdi-invoice';

/** Integrity checks I1/I3/I4 for a CFDI (docs/eligibility-policy.md). Tolerance ±0.01 MXN. */
export interface CfdiCheck {
  id: 'cfdi-required-fields' | 'cfdi-arithmetic' | 'cfdi-rfcs';
  passed: boolean;
  detail: string;
  /** The same result in Spanish, for people. */
  message: string;
}

const CFDI_FIELD_ES = {
  uuid: 'UUID',
  issuerRfc: 'RFC emisor',
  receiverRfc: 'RFC receptor',
  total: 'total',
  issueDate: 'fecha de emisión',
  subtotal: 'subtotal',
} as const;

export const RFC_STATUS_ES: Record<RfcStatus, string> = {
  valid: 'válido',
  generic: 'genérico',
  malformed: 'con formato inválido',
  missing: 'ausente',
};

export function validateCfdi(c: CfdiInvoice): { checks: CfdiCheck[]; passed: boolean } {
  const missing = (
    ['uuid', 'issuerRfc', 'receiverRfc', 'total', 'issueDate', 'subtotal'] as const
  ).filter((k) => c[k] === null);
  const checks: CfdiCheck[] = [
    {
      id: 'cfdi-required-fields',
      passed: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(', ')}` : 'all present',
      message: missing.length
        ? `Faltan: ${missing.map((k) => CFDI_FIELD_ES[k]).join(', ')}`
        : 'Campos obligatorios presentes',
    },
  ];
  if (c.subtotal !== null && c.total !== null) {
    const expected = c.subtotal - c.discount + c.transferredTaxes - c.withheldTaxes;
    checks.push({
      id: 'cfdi-arithmetic',
      passed: Math.abs(expected - c.total) <= 1,
      detail: `subtotal − discount + transferred − withheld = ${formatMxn(expected)} vs total ${formatMxn(c.total)}`,
      message: `Subtotal − descuento + impuestos trasladados − retenidos = ${formatMxn(expected)}; total ${formatMxn(c.total)}`,
    });
  }
  const issuer = rfcStatus(c.issuerRfc);
  const receiver = rfcStatus(c.receiverRfc);
  checks.push({
    id: 'cfdi-rfcs',
    passed: issuer === 'valid' && receiver === 'valid',
    detail: `issuer ${issuer}, receiver ${receiver}`,
    message: `RFC emisor ${RFC_STATUS_ES[issuer]}, RFC receptor ${RFC_STATUS_ES[receiver]}`,
  });
  return { checks, passed: checks.every((x) => x.passed) };
}
