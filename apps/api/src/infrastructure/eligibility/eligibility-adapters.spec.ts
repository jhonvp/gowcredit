import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CfdiParseError } from '../../application/ports/eligibility.ports';
import { validateCfdi } from '../../domain/cfdi/cfdi-validators';
import { POLICY } from '../../domain/eligibility/policy.fixture';
import { CfdiXmlParser } from './cfdi-xml.parser';
import { YamlPolicyAdapter } from './yaml-policy.adapter';

const SAMPLES = join(__dirname, '../../../../../samples/cfdi');
const sample = (name: string) => readFileSync(join(SAMPLES, name));

describe('YamlPolicyAdapter', () => {
  it('loads config/eligibility-policy.v1.yaml with the documented values', () => {
    expect(new YamlPolicyAdapter().current()).toEqual(policyWithAnchors());
  });
});
const policyWithAnchors = () => ({
  ...POLICY,
  invoice: { ...POLICY.invoice, anchorBuyers: ['DCM850101AB1', 'ACH900215KL3'] },
});

describe('CfdiXmlParser', () => {
  const parser = new CfdiXmlParser();

  it('reads a CFDI 4.0 (amounts in cents, namespaces stripped, UUID from the stamp)', () => {
    const c = parser.parse(sample('factura-ppd-anchor.xml'));
    expect(c).toMatchObject({
      uuid: '6F1B2C3D-0000-4000-8000-000000000001',
      version: '4.0',
      voucherType: 'I',
      paymentMethod: 'PPD',
      issuerRfc: 'PRO010203AB4',
      receiverRfc: 'DCM850101AB1',
      issueDate: '2025-04-01',
      subtotal: 10_000_000,
      transferredTaxes: 1_600_000,
      withheldTaxes: 0,
      total: 11_600_000,
      conceptCount: 1,
    });
    expect(validateCfdi(c).passed).toBe(true);
  });

  it('keeps inconsistent totals for the validators to flag', () => {
    const c = parser.parse(sample('factura-total-mismatch.xml'));
    expect(validateCfdi(c).checks.find((x) => x.id === 'cfdi-arithmetic')?.passed).toBe(false);
    expect(parser.parse(sample('factura-pue-paid.xml')).paymentMethod).toBe('PUE');
  });

  it('rejects non-CFDI XML and documents with external entities (no XXE)', () => {
    expect(() => parser.parse(new TextEncoder().encode('<?xml version="1.0"?><root/>'))).toThrow(
      CfdiParseError,
    );
    const xxe = `<?xml version="1.0"?><!DOCTYPE c [<!ENTITY x SYSTEM "file:///etc/passwd">]>
      <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Total="1.00" SubTotal="1.00"><cfdi:Emisor Rfc="&x;"/></cfdi:Comprobante>`;
    expect(() => parser.parse(new TextEncoder().encode(xxe))).toThrow(/External entities/);
  });
});
