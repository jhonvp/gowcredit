/**
 * Mexican taxpayer id (RFC). 12 characters for companies (persona moral), 13 for individuals.
 * Generic RFCs (public / foreign) are well-formed but identify nobody → the owner must confirm.
 */
const RFC = /^([A-ZÑ&]{3,4})(\d{2})(\d{2})(\d{2})([A-Z\d]{2}[A\d])$/;
export const GENERIC_RFCS: ReadonlySet<string> = new Set(['XAXX010101000', 'XEXX010101000']);

export type RfcStatus = 'valid' | 'generic' | 'malformed' | 'missing';

export function rfcStatus(rfc: string | null | undefined): RfcStatus {
  if (!rfc) return 'missing';
  const v = rfc.trim().toUpperCase();
  if (GENERIC_RFCS.has(v)) return 'generic';
  const m = RFC.exec(v);
  if (!m) return 'malformed';
  const month = Number(m[3]);
  const day = Number(m[4]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? 'valid' : 'malformed';
}
