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
  /** Transfer between the holder's own pockets: shown, but not income or spending. */
  internal: z.boolean(),
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
    /** Printed only in the summary and part of the balance (e.g. interest). Signed. */
    otherItems: z.array(
      z.object({ concept: z.string(), amount: z.number().int(), description: z.string() }),
    ),
    internalTransfers: z.object({ pairs: z.number().int(), amount: Cents }),
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
  /** Rounds with the document owner (filled by the API; empty while none). */
  clarifications: z.array(z.lazy(() => ClarificationViewSchema)),
});
export type CaseView = z.infer<typeof CaseViewSchema>;

/** Response of POST /api/documents (202 Accepted: extraction runs in the worker). */
export const SubmitDocumentResponseSchema = z.object({
  caseId: z.string().uuid(),
  documentId: z.string().uuid(),
  status: CaseStatusSchema,
});
export type SubmitDocumentResponse = z.infer<typeof SubmitDocumentResponseSchema>;

// ---- Auth (ADR 0005) ----
export const RoleSchema = z.enum(['supplier', 'analyst']);
export type Role = z.infer<typeof RoleSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const MeSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
});
export type Me = z.infer<typeof MeSchema>;

export const LoginResponseSchema = z.object({ accessToken: z.string(), user: MeSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const CaseSummaryViewSchema = z.object({
  id: z.string().uuid(),
  status: CaseStatusSchema,
  outcome: DecisionOutcomeSchema.nullable(),
  documentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CaseSummaryView = z.infer<typeof CaseSummaryViewSchema>;

// ---- Clarification loop (ADR 0008) ----
export const QuestionTypeSchema = z.enum([
  'confirm_value',
  'provide_value',
  'upload_document',
  'explain_discrepancy',
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const OwnerRequestViewSchema = z.object({
  round: z.number().int(),
  expiresAt: z.string().nullable(),
  questions: z.array(
    z.object({ code: MissingInfoCodeSchema, type: QuestionTypeSchema, text: z.string() }),
  ),
});
export type OwnerRequestView = z.infer<typeof OwnerRequestViewSchema>;

export const OwnerAnswersRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        code: MissingInfoCodeSchema,
        /** Date (YYYY-MM-DD) for INVOICE_DUE_DATE, boolean for confirmations. */
        value: z.union([z.string().max(20), z.boolean()]).optional(),
        /** Free text: explanations, or an answer the T5 agent normalizes. */
        text: z.string().max(2000).optional(),
      }),
    )
    .max(10),
});
export type OwnerAnswersRequest = z.infer<typeof OwnerAnswersRequestSchema>;

export const OwnerAnswerResponseSchema = z.object({
  status: CaseStatusSchema,
  outcome: DecisionOutcomeSchema.nullable(),
  pendingDocuments: z.boolean(),
});
export type OwnerAnswerResponse = z.infer<typeof OwnerAnswerResponseSchema>;

export const ClarificationViewSchema = z.object({
  round: z.number().int(),
  status: z.enum(['open', 'answered', 'superseded', 'escalated']),
  questions: z.array(
    z.object({ code: MissingInfoCodeSchema, type: QuestionTypeSchema, text: z.string() }),
  ),
  answers: z.array(z.record(z.string(), z.unknown())).nullable(),
  forAnalyst: z.array(z.object({ code: MissingInfoCodeSchema, text: z.string() })).nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
  answeredAt: z.string().nullable(),
});
export type ClarificationView = z.infer<typeof ClarificationViewSchema>;

/**
 * POST /api/cases/:id/owner-link (analyst, only where OWNER_LINK_SHARING=true): a fresh magic link
 * for the open owner request. It replaces the emailed link, which stops working; shown only once.
 */
export const OwnerLinkResponseSchema = z.object({
  link: z.string().url(),
  expiresAt: z.string(),
  round: z.number().int(),
});
export type OwnerLinkResponse = z.infer<typeof OwnerLinkResponseSchema>;

// ---- Analyst copilot (ADR 0010) ----
export const CopilotRequestSchema = z.object({ question: z.string().trim().min(1).max(1000) });
export type CopilotRequest = z.infer<typeof CopilotRequestSchema>;

export const CopilotResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.string()),
  /** agent = Haiku with read-only tools; trace = deterministic summary when no LLM is available. */
  by: z.enum(['agent', 'trace']),
  turns: z.number().int(),
  costUsd: z.number(),
});
export type CopilotResponse = z.infer<typeof CopilotResponseSchema>;
