import type { CaseView } from '@gowcredit/contracts';
import type { CaseRecord } from '../../application/ports/case-repository.port';
import { totalCredits, totalDebits } from '../../domain/statement/bank-statement';

/** Maps the application record to the public contract (packages/contracts). */
export function toCaseView(c: CaseRecord): CaseView {
  return {
    id: c.id,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    documents: c.documents.map((d) => {
      const e = c.extractions.find((x) => x.documentId === d.id && x.statement !== null);
      const inv = c.extractions.find((x) => x.documentId === d.id && x.invoice !== null);
      return {
        id: d.id,
        originalName: d.originalName,
        docType: d.docType,
        uploadedAt: d.createdAt.toISOString(),
        invoice: inv?.invoice
          ? {
              uuid: inv.invoice.uuid,
              voucherType: inv.invoice.voucherType,
              paymentMethod: inv.invoice.paymentMethod,
              issuerRfc: inv.invoice.issuerRfc,
              issuerName: inv.invoice.issuerName,
              receiverRfc: inv.invoice.receiverRfc,
              receiverName: inv.invoice.receiverName,
              currency: inv.invoice.currency,
              issueDate: inv.invoice.issueDate,
              subtotal: inv.invoice.subtotal,
              transferredTaxes: inv.invoice.transferredTaxes,
              withheldTaxes: inv.invoice.withheldTaxes,
              total: inv.invoice.total,
              checks: inv.invoiceChecks ?? [],
              extractedAt: inv.createdAt.toISOString(),
            }
          : null,
        extraction:
          e?.statement && e.validation
            ? {
                resolvedBy: e.resolvedBy,
                needsReview: e.needsReview,
                provenance: e.statement.provenance,
                summary: {
                  bankName: e.statement.summary.bankName,
                  currency: e.statement.summary.currency,
                  periodStart: e.statement.summary.periodStart,
                  periodEnd: e.statement.summary.periodEnd,
                  openingBalance: e.statement.summary.openingBalance,
                  closingBalance: e.statement.summary.closingBalance,
                  totalCredits: totalCredits(e.statement),
                  totalDebits: totalDebits(e.statement),
                },
                transactions: e.statement.transactions.map((t) => ({
                  date: t.date,
                  description: t.description,
                  debit: t.debit,
                  credit: t.credit,
                  balance: t.balance,
                  page: t.page,
                })),
                checks: e.validation.checks,
                attempts: e.attempts.map((a) => ({
                  tier: a.tier,
                  passed: a.passed,
                  skipped: a.skipped ?? null,
                  durationMs: a.durationMs,
                  costUsd: a.costUsd ?? 0,
                })),
                costUsd: e.costUsd,
                extractedAt: e.createdAt.toISOString(),
              }
            : null,
      };
    }),
    decision: c.decision
      ? {
          outcome: c.decision.outcome,
          score: c.decision.score,
          suggestedAdvance: c.decision.suggestedAdvance,
          policyVersion: c.decision.policyVersion,
          asOf: c.decision.asOf,
          rules: c.decision.rules,
          missing: c.decision.missing,
          decidedAt: c.decision.createdAt.toISOString(),
        }
      : null,
  };
}
