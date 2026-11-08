import type { CaseRepositoryPort } from '../ports/case-repository.port';
import type { ExtractDocumentJob } from '../ports/job-queue.port';
import type { LoggerPort } from '../ports/logger.port';
import type { ObjectStoragePort } from '../ports/object-storage.port';
import { sniffKind } from './submit-document.use-case';
import type { ExtractBankStatementUseCase } from './extract-bank-statement.use-case';

export type ProcessResult = 'extracted' | 'needs-review' | 'skipped' | 'unsupported';

/**
 * Worker side of the cascade: one queue message → one document extracted and persisted.
 *
 * Idempotent under SQS at-least-once delivery: the case moves RECEIVED/EXTRACTED/... → EXTRACTING
 * with compare-and-set, so a duplicate message for a case another worker already took is skipped.
 * Errors propagate: the message is not acked, SQS redelivers, and the DLQ catches poison messages.
 */
export class ProcessDocumentUseCase {
  constructor(
    private readonly cases: CaseRepositoryPort,
    private readonly storage: ObjectStoragePort,
    private readonly extract: ExtractBankStatementUseCase,
    private readonly logger: LoggerPort,
  ) {}

  async execute(job: ExtractDocumentJob): Promise<ProcessResult> {
    const current = await this.cases.findCase(job.caseId);
    const document = current?.documents.find((d) => d.id === job.documentId);
    if (!current || !document) {
      this.logger.warn('job for unknown case or document', { ...job });
      return 'skipped';
    }
    if (current.status === 'EXTRACTING') {
      // Another delivery is processing it, or a crash left it here; the visibility timeout decides.
      this.logger.info('case already extracting; skipping duplicate delivery', {
        caseId: job.caseId,
      });
      return 'skipped';
    }
    if (!(await this.cases.transition(job.caseId, current.status, 'EXTRACTING'))) return 'skipped';

    try {
      return await this.run(job, document.id, document.storageKey);
    } catch (e) {
      // FAILED → EXTRACTING is allowed, so the redelivered message retries; after maxReceiveCount
      // the queue moves it to the DLQ and the case stays FAILED for an analyst.
      await this.cases.transition(job.caseId, 'EXTRACTING', 'FAILED');
      this.logger.error('document processing failed', {
        caseId: job.caseId,
        documentId: document.id,
        error: (e as Error).name,
      });
      throw e;
    }
  }

  private async run(
    job: ExtractDocumentJob,
    documentId: string,
    storageKey: string,
  ): Promise<ProcessResult> {
    const bytes = await this.storage.get(storageKey);
    if (sniffKind(bytes) !== 'pdf') {
      // CFDI XML lands with the eligibility PR; until then it waits for an analyst/owner.
      await this.cases.setDocumentType(documentId, 'CFDI_INVOICE');
      await this.cases.transition(job.caseId, 'EXTRACTING', 'AWAITING_OWNER');
      return 'unsupported';
    }

    const outcome = await this.extract.execute(bytes, { documentId: documentId });
    await this.cases.setDocumentType(documentId, 'BANK_STATEMENT');
    await this.cases.saveExtraction({
      documentId: documentId,
      resolvedBy: outcome.resolvedBy,
      needsReview: outcome.needsReview,
      statement: outcome.statement,
      validation: outcome.validation,
      attempts: outcome.attempts,
      costUsd: outcome.costUsd,
    });
    const next = outcome.needsReview ? 'AWAITING_OWNER' : 'EXTRACTED';
    await this.cases.transition(job.caseId, 'EXTRACTING', next);
    this.logger.info('document processed', {
      caseId: job.caseId,
      documentId: documentId,
      resolvedBy: outcome.resolvedBy,
      needsReview: outcome.needsReview,
      costUsd: outcome.costUsd,
    });
    return outcome.needsReview ? 'needs-review' : 'extracted';
  }
}
