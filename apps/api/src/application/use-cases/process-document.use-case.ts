import { validateCfdi } from '../../domain/cfdi/cfdi-validators';
import type { CaseRepositoryPort } from '../ports/case-repository.port';
import { type CfdiParserPort, CfdiParseError } from '../ports/eligibility.ports';
import type { ExtractDocumentJob } from '../ports/job-queue.port';
import type { LoggerPort } from '../ports/logger.port';
import type { ObjectStoragePort } from '../ports/object-storage.port';
import type { DecideCaseUseCase } from './decide-case.use-case';
import type { ExtractBankStatementUseCase } from './extract-bank-statement.use-case';
import { sniffKind } from './submit-document.use-case';

/**
 * - `processed`: extracted and decided.
 * - `duplicate`: this document already has an extraction (SQS redelivery); ack it.
 * - `busy`: another document of the case is being extracted; do not ack, SQS redelivers later.
 * - `skipped`: unknown case/document; ack it.
 */
export type ProcessResult = 'processed' | 'duplicate' | 'busy' | 'skipped';

/**
 * Worker side of the cascade: one queue message → one document extracted, then the case decided.
 *
 * At-least-once delivery from SQS is absorbed by: a duplicate check (the document already has an
 * extraction), and a compare-and-set to EXTRACTING so two documents of one case never run at once.
 * Errors move the case to FAILED and propagate: the message is not acked, SQS redelivers it, and
 * after maxReceiveCount the DLQ keeps it.
 */
export class ProcessDocumentUseCase {
  constructor(
    private readonly cases: CaseRepositoryPort,
    private readonly storage: ObjectStoragePort,
    private readonly extract: ExtractBankStatementUseCase,
    private readonly cfdi: CfdiParserPort,
    private readonly decideCase: DecideCaseUseCase,
    private readonly logger: LoggerPort,
  ) {}

  async execute(job: ExtractDocumentJob): Promise<ProcessResult> {
    const current = await this.cases.findCase(job.caseId);
    const document = current?.documents.find((d) => d.id === job.documentId);
    if (!current || !document) {
      this.logger.warn('job for unknown case or document', { ...job });
      return 'skipped';
    }
    if (current.extractions.some((e) => e.documentId === document.id)) return 'duplicate';
    if (current.status === 'EXTRACTING') return 'busy';
    if (!(await this.cases.transition(job.caseId, current.status, 'EXTRACTING'))) return 'busy';

    try {
      await this.extractDocument(document.id, document.storageKey);
      await this.cases.transition(job.caseId, 'EXTRACTING', 'EXTRACTED');
      await this.decideCase.execute(job.caseId);
      return 'processed';
    } catch (e) {
      await this.cases.transition(job.caseId, 'EXTRACTING', 'FAILED');
      this.logger.error('document processing failed', {
        caseId: job.caseId,
        documentId: document.id,
        error: (e as Error).name,
      });
      // Not a CFDI: retrying cannot help, so ack instead of filling the DLQ.
      if (e instanceof CfdiParseError) return 'skipped';
      throw e;
    }
  }

  private async extractDocument(documentId: string, storageKey: string): Promise<void> {
    const bytes = await this.storage.get(storageKey);

    if (sniffKind(bytes) === 'xml') {
      await this.cases.setDocumentType(documentId, 'CFDI_INVOICE');
      let invoice;
      try {
        invoice = this.cfdi.parse(bytes);
      } catch (e) {
        if (e instanceof CfdiParseError) await this.cases.setDocumentType(documentId, 'UNKNOWN');
        throw e;
      }
      const { checks, passed } = validateCfdi(invoice);
      await this.cases.saveExtraction({
        documentId,
        kind: 'cfdi',
        resolvedBy: 'T0',
        needsReview: !passed,
        statement: null,
        validation: null,
        invoice,
        invoiceChecks: checks,
        attempts: [],
        costUsd: 0,
      });
      this.logger.info('cfdi extracted', { documentId, passed });
      return;
    }

    const outcome = await this.extract.execute(bytes, { documentId });
    await this.cases.setDocumentType(documentId, 'BANK_STATEMENT');
    await this.cases.saveExtraction({
      documentId,
      kind: 'bank_statement',
      resolvedBy: outcome.resolvedBy,
      needsReview: outcome.needsReview,
      statement: outcome.statement,
      validation: outcome.validation,
      invoice: null,
      invoiceChecks: null,
      attempts: outcome.attempts,
      costUsd: outcome.costUsd,
    });
    this.logger.info('statement extracted', {
      documentId,
      resolvedBy: outcome.resolvedBy,
      needsReview: outcome.needsReview,
      costUsd: outcome.costUsd,
    });
  }
}
