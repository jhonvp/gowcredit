import type { CfdiInvoice } from '../cfdi/cfdi-invoice';
import { type CfdiCheck, RFC_STATUS_ES } from '../cfdi/cfdi-validators';
import type { BankStatement } from '../statement/bank-statement';
import type { ValidationReport } from '../validation/statement-validators';
import { daysBetween, type IsoDate } from '../shared/iso-date';
import { type Cents, formatMxn } from '../shared/money';
import { rfcStatus } from '../shared/rfc';
import { bandPoints, type EligibilityPolicy } from './policy';
import { type StatementSignals, statementSignals } from './statement-signals';

export type Outcome = 'QUALIFIES' | 'DOES_NOT_QUALIFY' | 'NEEDS_INFO';

/** What the owner is asked for; the clarification loop (ADR 0008) turns these into questions. */
export type MissingInfoCode =
  | 'STATEMENT_UNREADABLE'
  | 'RECENT_STATEMENT'
  | 'INVOICE_INCONSISTENT'
  | 'RFC_CONFIRMATION'
  | 'INVOICE_DUE_DATE'
  | 'SAT_STATUS'
  | 'SUPPLIER_STATEMENT';

export interface MissingInfo {
  code: MissingInfoCode;
  ruleId: string;
  detail: string;
}

export interface RuleResult {
  id: string;
  passed: boolean;
  /** integrity → NEEDS_INFO, knockout → DOES_NOT_QUALIFY, ask → NEEDS_INFO, score → points. */
  kind: 'integrity' | 'knockout' | 'ask' | 'score';
  detail: string;
  points?: number;
  maxPoints?: number;
}

/** Facts confirmed by the owner or external checks; they override what the documents lack. */
export interface DecisionFacts {
  invoiceDueDate?: IsoDate;
  issuerRfcConfirmed?: boolean;
  satStatus?: 'active' | 'cancelled' | 'unknown';
}

export interface DecisionInput {
  asOf: IsoDate;
  policy: EligibilityPolicy;
  statement?: { statement: BankStatement; validation: ValidationReport } | null;
  invoice?: { invoice: CfdiInvoice; checks: CfdiCheck[] } | null;
  facts?: DecisionFacts;
}

export interface Decision {
  outcome: Outcome;
  /** Statement score 0–100 when it was computed. */
  score: number | null;
  rules: RuleResult[];
  missing: MissingInfo[];
  suggestedAdvance: Cents | null;
  signals: StatementSignals | null;
  policyVersion: string;
  asOf: IsoDate;
}

/**
 * The eligibility engine (ADR 0007). Pure and deterministic: same input, same decision.
 * Order: integrity → hard knockouts → questions → score. Integrity problems never reject; they ask.
 */
export function decide(input: DecisionInput): Decision {
  const { policy, asOf, facts = {} } = input;
  const rules: RuleResult[] = [];
  const missing: MissingInfo[] = [];
  const ask = (code: MissingInfoCode, ruleId: string, detail: string) =>
    missing.push({ code, ruleId, detail });
  let score: number | null = null;
  let signals: StatementSignals | null = null;

  if (!input.statement && !input.invoice)
    throw new Error('decide() needs a statement or an invoice');

  // ---- Bank statement ----
  if (input.statement) {
    const { statement: s, validation } = input.statement;
    const failed = validation.checks.filter((c) => c.blocking && !c.passed);
    rules.push({
      id: 'I1-I2',
      kind: 'integrity',
      passed: validation.passed,
      detail: validation.passed
        ? 'El estado de cuenta tiene los datos necesarios y sus cifras cuadran'
        : failed.map((c) => c.message).join('; '),
    });
    if (!validation.passed)
      ask(
        'STATEMENT_UNREADABLE',
        'I1-I2',
        `Una explicación o un documento legible: ${failed.map((c) => c.message).join('; ')}`,
      );
    else {
      signals = statementSignals(s);
      const currency = s.summary.currency ?? 'MXN';
      rules.push({
        id: 'S-K1',
        kind: 'knockout',
        passed: currency === policy.statement.currency,
        detail: `Moneda ${currency}`,
      });
      const age = daysBetween(s.summary.periodEnd as string, asOf);
      const recent = age <= policy.statement.maxAgeDays;
      rules.push({
        id: 'S-K2',
        kind: 'ask',
        passed: recent,
        detail: `El periodo terminó ${age} días antes del ${asOf} (máximo ${policy.statement.maxAgeDays})`,
      });
      if (!recent)
        ask(
          'RECENT_STATEMENT',
          'S-K2',
          `Un estado de cuenta que termine después del ${shift(asOf, -policy.statement.maxAgeDays)} (el recibido termina el ${s.summary.periodEnd})`,
        );
      const closing = s.summary.closingBalance ?? 0;
      rules.push({
        id: 'S-K3',
        kind: 'knockout',
        passed: closing >= 0 && signals.minBalance >= 0,
        detail: `Saldo final ${formatMxn(closing)}; saldo más bajo ${formatMxn(signals.minBalance)}`,
      });

      const sc = policy.statement.score;
      const liquidity =
        signals.avgMonthlyDebits > 0 ? signals.avgDailyBalance / signals.avgMonthlyDebits : 1;
      const parts: [string, number, number, string][] = [
        [
          'S-S1',
          bandPoints(sc.avgMonthlyCredits, signals.avgMonthlyCredits),
          maxPoints(sc.avgMonthlyCredits),
          `Abonos promedio por mes: ${formatMxn(signals.avgMonthlyCredits)}`,
        ],
        [
          'S-S2',
          bandPoints(sc.liquidityBuffer, liquidity),
          maxPoints(sc.liquidityBuffer),
          `Saldo promedio diario / cargos del mes: ${(100 * liquidity).toFixed(1)}%`,
        ],
        [
          'S-S3',
          bandPoints(sc.bouncedEntries, signals.bouncedEntries),
          maxPoints(sc.bouncedEntries),
          `${signals.bouncedEntries} movimientos devueltos o rechazados`,
        ],
        [
          'S-S4',
          bandPoints(sc.topPayerShare, signals.topPayerShare),
          maxPoints(sc.topPayerShare),
          `El principal pagador aporta ${(100 * signals.topPayerShare).toFixed(1)}% de los abonos`,
        ],
        [
          'S-S5',
          signals.creditDebitRatio === null
            ? 0
            : bandPoints(sc.creditDebitRatio, signals.creditDebitRatio),
          maxPoints(sc.creditDebitRatio),
          `Abonos / cargos: ${signals.creditDebitRatio?.toFixed(2) ?? 'sin cargos'}`,
        ],
      ];
      score = 0;
      for (const [id, points, max, detail] of parts) {
        score += points;
        rules.push({ id, kind: 'score', passed: points > 0, points, maxPoints: max, detail });
      }
    }
  }

  // ---- CFDI invoice ----
  if (input.invoice) {
    const { invoice: c, checks } = input.invoice;
    const integrity = checks.filter((x) => x.id !== 'cfdi-rfcs');
    const intact = integrity.every((x) => x.passed);
    rules.push({
      id: 'I1-I3',
      kind: 'integrity',
      passed: intact,
      detail: integrity.map((x) => x.message).join('; '),
    });
    if (!intact)
      ask(
        'INVOICE_INCONSISTENT',
        'I1-I3',
        `Una explicación o el XML correcto: ${integrity
          .filter((x) => !x.passed)
          .map((x) => x.message)
          .join('; ')}`,
      );

    const issuer = rfcStatus(c.issuerRfc);
    const receiver = rfcStatus(c.receiverRfc);
    const rfcOk = (issuer === 'valid' || facts.issuerRfcConfirmed === true) && receiver === 'valid';
    rules.push({
      id: 'I4',
      kind: 'integrity',
      passed: rfcOk,
      detail: `RFC emisor ${RFC_STATUS_ES[issuer]}${facts.issuerRfcConfirmed ? ' (confirmado por el dueño)' : ''}; RFC receptor ${RFC_STATUS_ES[receiver]}`,
    });
    if (!rfcOk)
      ask('RFC_CONFIRMATION', 'I4', `Confirmar el RFC del emisor (${RFC_STATUS_ES[issuer]})`);

    if (intact) {
      const inv = policy.invoice;
      rules.push({
        id: 'C-K1',
        kind: 'knockout',
        passed: inv.voucherTypes.includes(c.voucherType ?? ''),
        detail: `Tipo de comprobante: ${c.voucherType ?? 'ausente'}`,
      });
      rules.push({
        id: 'C-K2',
        kind: 'knockout',
        passed: inv.paymentMethods.includes(c.paymentMethod ?? ''),
        detail: `Método de pago: ${c.paymentMethod ?? 'ausente'}`,
      });
      rules.push({
        id: 'C-K3',
        kind: 'knockout',
        passed: inv.anchorBuyers.includes((c.receiverRfc ?? '').toUpperCase()),
        detail: 'El RFC receptor está en la lista de compradores ancla',
      });
      const total = c.total ?? 0;
      rules.push({
        id: 'C-K5',
        kind: 'knockout',
        passed: total >= inv.total.min && total <= inv.total.max,
        detail: `Total ${formatMxn(total)} (rango ${formatMxn(inv.total.min)}–${formatMxn(inv.total.max)})`,
      });
      if (!facts.invoiceDueDate) {
        rules.push({
          id: 'C-K4',
          kind: 'ask',
          passed: false,
          detail: 'El CFDI no incluye la fecha de vencimiento',
        });
        ask('INVOICE_DUE_DATE', 'C-K4', 'La fecha de vencimiento de la factura');
      } else {
        const days = daysBetween(asOf, facts.invoiceDueDate);
        rules.push({
          id: 'C-K4',
          kind: 'knockout',
          passed: days >= inv.dueInDays.min && days <= inv.dueInDays.max,
          detail: `Vence en ${days} días (rango ${inv.dueInDays.min}–${inv.dueInDays.max})`,
        });
      }
      const sat = facts.satStatus ?? 'unknown';
      if (sat === 'unknown') {
        rules.push({
          id: 'C-K6',
          kind: 'ask',
          passed: false,
          detail: 'Estado en el SAT sin verificar',
        });
        ask('SAT_STATUS', 'C-K6', 'Confirmar que la factura no fue cancelada en el SAT');
      } else
        rules.push({
          id: 'C-K6',
          kind: 'knockout',
          passed: sat === 'active',
          detail: `Estado en el SAT: ${sat === 'active' ? 'vigente' : 'cancelada'}`,
        });
    }
    if (!input.statement)
      ask('SUPPLIER_STATEMENT', 'COMBINED', 'Un estado de cuenta bancario reciente del proveedor');
  }

  // ---- Combine ----
  const integrityFailed = rules.some((r) => r.kind === 'integrity' && !r.passed);
  const knockedOut = rules.filter((r) => r.kind === 'knockout' && !r.passed);
  let outcome: Outcome;
  if (integrityFailed) outcome = 'NEEDS_INFO';
  else if (knockedOut.length) outcome = 'DOES_NOT_QUALIFY';
  else if (missing.length) outcome = 'NEEDS_INFO';
  else if (score !== null && score < policy.minScore) outcome = 'DOES_NOT_QUALIFY';
  else outcome = 'QUALIFIES';
  if (score !== null)
    rules.push({
      id: 'SCORE',
      kind: 'score',
      passed: score >= policy.minScore,
      points: score,
      maxPoints: 100,
      detail: `Puntaje ${score} (mínimo ${policy.minScore})`,
    });

  // Only questions that can still change the outcome are kept: after a knockout, asking is pointless.
  const keptMissing = outcome === 'NEEDS_INFO' ? missing : [];
  let suggestedAdvance: Cents | null = null;
  if (outcome === 'QUALIFIES' && signals) {
    const byCredits = Math.round(policy.advance.monthlyCreditsShare * signals.avgMonthlyCredits);
    const total = input.invoice?.invoice.total;
    suggestedAdvance =
      total != null
        ? Math.min(Math.round(policy.advance.invoiceShare * total), byCredits)
        : byCredits;
  }
  return {
    outcome,
    score,
    rules,
    missing: keptMissing,
    suggestedAdvance,
    signals,
    policyVersion: policy.version,
    asOf,
  };
}

const maxPoints = (bands: readonly { points: number }[]) =>
  Math.max(0, ...bands.map((b) => b.points));
const shift = (d: IsoDate, days: number): IsoDate =>
  new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
