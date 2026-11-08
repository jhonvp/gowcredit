import type { CaseStatus } from '../../domain/case/case-status';
import type { CfdiInvoice } from '../../domain/cfdi/cfdi-invoice';
import type { CfdiCheck } from '../../domain/cfdi/cfdi-validators';
import type { Decision, DecisionFacts } from '../../domain/eligibility/engine';
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
  kind: 'bank_statement' | 'cfdi';
  resolvedBy: Tier;
  needsReview: boolean;
  /** Set for bank statements. */
  statement: BankStatement | null;
  validation: ValidationReport | null;
  /** Set for CFDI invoices. */
  invoice: CfdiInvoice | null;
  invoiceChecks: CfdiCheck[] | null;
  attempts: TierAttempt[];
  costUsd: number;
  createdAt: Date;
}

export interface DecisionRecord extends Decision {
  createdAt: Date;
}

export interface CaseRecord {
  id: string;
  status: CaseStatus;
  /** Facts confirmed by the owner (clarification loop) or external checks. */
  facts: DecisionFacts;
  /** Latest eligibility decision, if any. */
  decision: DecisionRecord | null;
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
  addDocument(caseId: string, document: NewDocument): Promise<void>;
  findCase(caseId: string): Promise<CaseRecord | null>;
  findDocument(documentId: string): Promise<DocumentRecord | null>;
  /** Compare-and-set: returns false if the case was not in `from` (another worker moved it). */
  transition(caseId: string, from: CaseStatus, to: CaseStatus): Promise<boolean>;
  setDocumentType(
    documentId: string,
    docType: NonNullable<DocumentRecord['docType']>,
  ): Promise<void>;
  saveExtraction(extraction: Omit<ExtractionRecord, 'createdAt'>): Promise<void>;
  saveDecision(caseId: string, decision: Decision): Promise<void>;
  setFacts(caseId: string, facts: DecisionFacts): Promise<void>;
}

export const CASE_REPOSITORY_PORT = Symbol('CaseRepositoryPort');
