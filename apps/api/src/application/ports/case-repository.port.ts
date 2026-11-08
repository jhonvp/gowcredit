import type { CaseStatus } from '../../domain/case/case-status';
import type { BankStatement, Tier } from '../../domain/statement/bank-statement';
import type { ValidationReport } from '../../domain/validation/statement-validators';
import type { TierAttempt } from '../use-cases/extract-bank-statement.use-case';

export type DocumentKind = 'pdf' | 'xml';

export interface DocumentRecord {
  id: string;
  caseId: string;
  originalName: string;
  mimeType: string;
  sha256: string;
  storageKey: string;
  docType: 'BANK_STATEMENT' | 'CFDI_INVOICE' | 'UNKNOWN' | null;
  createdAt: Date;
}

export interface ExtractionRecord {
  documentId: string;
  resolvedBy: Tier;
  needsReview: boolean;
  statement: BankStatement;
  validation: ValidationReport;
  attempts: TierAttempt[];
  costUsd: number;
  createdAt: Date;
}

export interface CaseRecord {
  id: string;
  status: CaseStatus;
  createdAt: Date;
  updatedAt: Date;
  documents: DocumentRecord[];
  /** Latest extraction per document id. */
  extractions: ExtractionRecord[];
}

export interface NewDocument {
  id: string;
  originalName: string;
  mimeType: string;
  sha256: string;
  storageKey: string;
}

export interface CaseRepositoryPort {
  createCase(caseId: string, document: NewDocument): Promise<CaseRecord>;
  findCase(caseId: string): Promise<CaseRecord | null>;
  findDocument(documentId: string): Promise<DocumentRecord | null>;
  /** Compare-and-set: returns false if the case was not in `from` (another worker moved it). */
  transition(caseId: string, from: CaseStatus, to: CaseStatus): Promise<boolean>;
  setDocumentType(
    documentId: string,
    docType: NonNullable<DocumentRecord['docType']>,
  ): Promise<void>;
  saveExtraction(extraction: Omit<ExtractionRecord, 'createdAt'>): Promise<void>;
}

export const CASE_REPOSITORY_PORT = Symbol('CaseRepositoryPort');
