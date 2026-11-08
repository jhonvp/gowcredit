import { z } from 'zod';

/** Shared API contracts (ADR 0011). The API validates with these; the web infers its types from them. */

export const CaseStatusSchema = z.enum([
  'RECEIVED',
  'EXTRACTING',
  'EXTRACTED',
  'AWAITING_OWNER',
  'DECIDED',
  'FAILED',
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

/** Cascade tier that produced a value (ADR 0002): T0 deterministic … T4 Opus agent, T5 owner. */
export const ExtractionTierSchema = z.enum(['T0', 'T1', 'T2', 'T3', 'T4', 'T5']);
export type ExtractionTier = z.infer<typeof ExtractionTierSchema>;

export const DecisionOutcomeSchema = z.enum(['QUALIFIES', 'DOES_NOT_QUALIFY', 'NEEDS_INFO']);
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

export const DocumentTypeSchema = z.enum(['BANK_STATEMENT', 'CFDI_INVOICE', 'UNKNOWN']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

/** Money is always integer cents in the API. */
const Cents = z.number().int();

export const ValidationCheckSchema = z.object({
  id: z.string(),
  section: z.enum(['summary', 'transactions']),
  passed: z.boolean(),
  blocking: z.boolean(),
  detail: z.string(),
});
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;

export const TierAttemptSchema = z.object({
  tier: ExtractionTierSchema,
  passed: z.boolean(),
  skipped: z.string().nullable(),
  durationMs: z.number(),
  costUsd: z.number(),
});
export type TierAttemptView = z.infer<typeof TierAttemptSchema>;

export const TransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  debit: Cents,
  credit: Cents,
  balance: Cents.nullable(),
  page: z.number().int(),
});
export type TransactionView = z.infer<typeof TransactionSchema>;

export const ExtractionViewSchema = z.object({
  resolvedBy: ExtractionTierSchema,
  needsReview: z.boolean(),
  provenance: z.object({ summary: ExtractionTierSchema, transactions: ExtractionTierSchema }),
  summary: z.object({
    bankName: z.string().nullable(),
    currency: z.string().nullable(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
    openingBalance: Cents.nullable(),
    closingBalance: Cents.nullable(),
    totalCredits: Cents,
    totalDebits: Cents,
  }),
  transactions: z.array(TransactionSchema),
  checks: z.array(ValidationCheckSchema),
  attempts: z.array(TierAttemptSchema),
  costUsd: z.number(),
  extractedAt: z.string(),
});
export type ExtractionView = z.infer<typeof ExtractionViewSchema>;

export const InvoiceViewSchema = z.object({
  uuid: z.string().nullable(),
  voucherType: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  issuerRfc: z.string().nullable(),
  issuerName: z.string().nullable(),
  receiverRfc: z.string().nullable(),
  receiverName: z.string().nullable(),
  currency: z.string().nullable(),
  issueDate: z.string().nullable(),
  subtotal: Cents.nullable(),
  transferredTaxes: Cents,
  withheldTaxes: Cents,
  total: Cents.nullable(),
  checks: z.array(z.object({ id: z.string(), passed: z.boolean(), detail: z.string() })),
  extractedAt: z.string(),
});
export type InvoiceView = z.infer<typeof InvoiceViewSchema>;

export const DocumentViewSchema = z.object({
  id: z.string().uuid(),
  originalName: z.string(),
  docType: DocumentTypeSchema.nullable(),
  uploadedAt: z.string(),
  /** Bank statement extraction (null for invoices or while extracting). */
  extraction: ExtractionViewSchema.nullable(),
  /** CFDI invoice data (null for statements or while extracting). */
  invoice: InvoiceViewSchema.nullable(),
});
export type DocumentView = z.infer<typeof DocumentViewSchema>;

export const MissingInfoCodeSchema = z.enum([
  'STATEMENT_UNREADABLE',
  'RECENT_STATEMENT',
  'INVOICE_INCONSISTENT',
  'RFC_CONFIRMATION',
  'INVOICE_DUE_DATE',
  'SAT_STATUS',
  'SUPPLIER_STATEMENT',
]);
export type MissingInfoCode = z.infer<typeof MissingInfoCodeSchema>;

export const DecisionViewSchema = z.object({
  outcome: DecisionOutcomeSchema,
  score: z.number().int().nullable(),
  suggestedAdvance: Cents.nullable(),
  policyVersion: z.string(),
  asOf: z.string(),
  rules: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['integrity', 'knockout', 'ask', 'score']),
      passed: z.boolean(),
      detail: z.string(),
      points: z.number().optional(),
      maxPoints: z.number().optional(),
    }),
  ),
  missing: z.array(
    z.object({ code: MissingInfoCodeSchema, ruleId: z.string(), detail: z.string() }),
  ),
  decidedAt: z.string(),
});
export type DecisionView = z.infer<typeof DecisionViewSchema>;

export const CaseViewSchema = z.object({
  id: z.string().uuid(),
  status: CaseStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  documents: z.array(DocumentViewSchema),
  decision: DecisionViewSchema.nullable(),
});
export type CaseView = z.infer<typeof CaseViewSchema>;

/** Response of POST /api/documents (202 Accepted: extraction runs in the worker). */
export const SubmitDocumentResponseSchema = z.object({
  caseId: z.string().uuid(),
  documentId: z.string().uuid(),
  status: CaseStatusSchema,
});
export type SubmitDocumentResponse = z.infer<typeof SubmitDocumentResponseSchema>;
