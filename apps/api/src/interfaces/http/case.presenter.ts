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
      const e = c.extractions.find((x) => x.documentId === d.id);
      return {
        id: d.id,
        originalName: d.originalName,
        docType: d.docType,
        uploadedAt: d.createdAt.toISOString(),
        extraction: e
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
  };
}
