import { describe, expect, it } from 'vitest';
import type { CfdiInvoice } from '../cfdi/cfdi-invoice';
import { validateCfdi } from '../cfdi/cfdi-validators';
import { rfcStatus } from '../shared/rfc';
import type { BankStatement, Transaction } from '../statement/bank-statement';
import { validateStatement } from '../validation/statement-validators';
import { decide, type DecisionInput } from './engine';
import type { EligibilityPolicy } from './policy';
import { payerKey, statementSignals } from './statement-signals';

/** Mirrors config/eligibility-policy.v1.yaml (the loader test checks the YAML parses to a policy). */
export const POLICY: EligibilityPolicy = {
  version: 'v1',
  minScore: 60,
  statement: {
    currency: 'MXN',
    maxAgeDays: 90,
    score: {
      avgMonthlyCredits: [
        { min: 20_000_000, points: 30 },
        { min: 5_000_000, points: 20 },
        { min: 2_000_000, points: 10 },
      ],
      liquidityBuffer: [
        { min: 0.2, points: 20 },
        { min: 0.05, points: 10 },
      ],
      bouncedEntries: [
        { max: 0, points: 20 },
        { max: 2, points: 10 },
      ],
      topPayerShare: [
        { max: 0.6, points: 15 },
        { max: 0.85, points: 8 },
      ],
      creditDebitRatio: [
        { min: 0.9, max: 1.3, points: 15 },
        { min: 0.7, max: 1.5, points: 8 },
      ],
    },
  },
  invoice: {
    voucherTypes: ['I'],
    paymentMethods: ['PPD'],
    anchorBuyers: ['DCM850101AB1'],
    dueInDays: { min: 7, max: 120 },
    total: { min: 500_000, max: 500_000_000 },
  },
  advance: { invoiceShare: 0.9, monthlyCreditsShare: 0.5 },
};

/** A March statement: deposits from three customers, payments out, consistent running balance. */
function statement(moves: [string, string, number, number][], opening = 10_000_000): BankStatement {
  let balance = opening;
  const transactions: Transaction[] = moves.map(([date, description, debit, credit]) => {
    balance += credit - debit;
    return { date, description, debit, credit, balance, page: 1, sideBy: 'balance-delta' };
  });
  return {
    summary: {
      bankName: 'Demo',
      holderName: null,
      holderRfc: null,
      currency: 'MXN',
      periodStart: '2025-03-01',
      periodEnd: '2025-03-31',
      openingBalance: opening,
      closingBalance: balance,
      reportedCredits: null,
      reportedDebits: null,
    },
    transactions,
    provenance: { summary: 'T0', transactions: 'T0' },
  };
}
const healthy = statement([
  ['2025-03-03', 'SPEI RECIBIDO CLIENTE ALFA SA 001', 0, 12_000_000],
  ['2025-03-05', 'PAGO NOMINA', 9_000_000, 0],
  ['2025-03-12', 'SPEI RECIBIDO CLIENTE BETA SC 993', 0, 9_000_000],
  ['2025-03-18', 'PAGO PROVEEDOR ACEROS', 8_000_000, 0],
  ['2025-03-25', 'DEPOSITO CLIENTE GAMMA', 0, 6_000_000],
  ['2025-03-28', 'PAGO RENTA', 7_000_000, 0],
]);
const withStatement = (s: BankStatement, over: Partial<DecisionInput> = {}): DecisionInput => ({
  asOf: '2025-04-05',
  policy: POLICY,
  statement: { statement: s, validation: validateStatement(s) },
  ...over,
});

const invoice = (over: Partial<CfdiInvoice> = {}): CfdiInvoice => ({
  uuid: '6F1B2C3D-0000-4000-8000-000000000001',
  version: '4.0',
  voucherType: 'I',
  paymentMethod: 'PPD',
  issuerRfc: 'PRO010203AB4',
  issuerName: 'Proveedor Demo',
  receiverRfc: 'DCM850101AB1',
  receiverName: 'Distribuidora Demo',
  currency: 'MXN',
  exchangeRate: null,
  issueDate: '2025-04-01',
  subtotal: 10_000_000,
  discount: 0,
  transferredTaxes: 1_600_000,
  withheldTaxes: 0,
  total: 11_600_000,
  conceptCount: 1,
  ...over,
});
const inv = (c: CfdiInvoice) => ({ invoice: c, checks: validateCfdi(c).checks });

describe('statement signals', () => {
  it('computes monthly averages, bounced entries and payer concentration', () => {
    const s = statementSignals(healthy);
    expect(s.avgMonthlyCredits).toBe(Math.round(27_000_000 / (31 / 30.4375)));
    expect(s.bouncedEntries).toBe(0);
    expect(s.topPayerShare).toBeCloseTo(12 / 27);
    expect(payerKey('SPEI RECIBIDO CLIENTE ALFA SA 001')).toBe('RECIBIDO CLIENTE ALFA');
  });
});

describe('decide (statement)', () => {
  it('qualifies a healthy, recent statement and suggests 50% of monthly credits', () => {
    const d = decide(withStatement(healthy));
    expect(d.outcome).toBe('QUALIFIES');
    expect(d.score).toBeGreaterThanOrEqual(60);
    expect(d.suggestedAdvance).toBe(Math.round(0.5 * (d.signals?.avgMonthlyCredits ?? 0)));
    expect(d.policyVersion).toBe('v1');
  });

  it('asks for a recent statement instead of rejecting an old one', () => {
    const d = decide(withStatement(healthy, { asOf: '2025-09-01' }));
    expect(d.outcome).toBe('NEEDS_INFO');
    expect(d.missing.map((m) => m.code)).toEqual(['RECENT_STATEMENT']);
  });

  it('never rejects on integrity problems: it asks', () => {
    const broken = { ...healthy, summary: { ...healthy.summary, closingBalance: -5 } };
    const d = decide(withStatement(broken));
    expect(d.outcome).toBe('NEEDS_INFO');
    expect(d.missing[0]?.code).toBe('STATEMENT_UNREADABLE');
  });

  it('rejects an overdrawn account (knockout) and drops pointless questions', () => {
    const overdrawn = statement([
      ['2025-03-03', 'PAGO', 12_000_000, 0],
      ['2025-03-20', 'DEPOSITO', 0, 3_000_000],
    ]);
    const d = decide(withStatement(overdrawn, { asOf: '2025-09-01' }));
    expect(d.outcome).toBe('DOES_NOT_QUALIFY');
    expect(d.rules.find((r) => r.id === 'S-K3')?.passed).toBe(false);
    expect(d.missing).toEqual([]);
  });

  it('rejects a low score', () => {
    const weak = statement(
      [
        ['2025-03-03', 'DEPOSITO UNICO CLIENTE', 0, 1_000_000],
        ['2025-03-10', 'DEVOLUCION CHEQUE', 50_000, 0],
        ['2025-03-11', 'CARGO RECHAZADO', 50_000, 0],
        ['2025-03-12', 'FONDOS INSUFICIENTES', 50_000, 0],
        ['2025-03-20', 'PAGO PROVEEDOR', 3_000_000, 0],
      ],
      2_200_000,
    );
    const d = decide(withStatement(weak));
    expect(d.outcome).toBe('DOES_NOT_QUALIFY');
    expect(d.score).toBeLessThan(60);
    expect(d.rules.find((r) => r.id === 'S-S3')?.points).toBe(0);
  });
});

describe('decide (CFDI)', () => {
  it('invoice alone: knockouts pass, asks for due date, SAT status and a supplier statement', () => {
    const d = decide({ asOf: '2025-04-05', policy: POLICY, invoice: inv(invoice()) });
    expect(d.outcome).toBe('NEEDS_INFO');
    expect(d.missing.map((m) => m.code).sort()).toEqual([
      'INVOICE_DUE_DATE',
      'SAT_STATUS',
      'SUPPLIER_STATEMENT',
    ]);
  });

  it('rejects a PUE (already paid) invoice', () => {
    const d = decide({
      asOf: '2025-04-05',
      policy: POLICY,
      invoice: inv(invoice({ paymentMethod: 'PUE' })),
    });
    expect(d.outcome).toBe('DOES_NOT_QUALIFY');
    expect(d.missing).toEqual([]);
  });

  it('asks when the arithmetic does not add up or the issuer RFC is generic', () => {
    const bad = decide({
      asOf: '2025-04-05',
      policy: POLICY,
      invoice: inv(invoice({ total: 11_700_000 })),
    });
    expect(bad.missing.map((m) => m.code)).toContain('INVOICE_INCONSISTENT');
    const generic = decide({
      asOf: '2025-04-05',
      policy: POLICY,
      invoice: inv(invoice({ issuerRfc: 'XAXX010101000' })),
    });
    expect(generic.missing.map((m) => m.code)).toContain('RFC_CONFIRMATION');
    expect(rfcStatus('XAXX010101000')).toBe('generic');
    expect(rfcStatus('PRO010203AB4')).toBe('valid');
    expect(rfcStatus('PRO019903AB4')).toBe('malformed');
  });

  it('statement + invoice with owner facts: qualifies with min(90% invoice, 50% monthly credits)', () => {
    const d = decide(
      withStatement(healthy, {
        invoice: inv(invoice()),
        facts: { invoiceDueDate: '2025-06-01', satStatus: 'active' },
      }),
    );
    expect(d.outcome).toBe('QUALIFIES');
    const byCredits = Math.round(0.5 * (d.signals?.avgMonthlyCredits ?? 0));
    expect(d.suggestedAdvance).toBe(Math.min(Math.round(0.9 * 11_600_000), byCredits));
  });

  it('rejects a due date outside 7–120 days', () => {
    const d = decide(
      withStatement(healthy, {
        invoice: inv(invoice()),
        facts: { invoiceDueDate: '2025-04-08', satStatus: 'active' },
      }),
    );
    expect(d.outcome).toBe('DOES_NOT_QUALIFY');
    expect(d.rules.find((r) => r.id === 'C-K4')?.passed).toBe(false);
  });
});
