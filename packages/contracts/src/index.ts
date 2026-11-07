import { z } from 'zod';

/** Shared API contracts (ADR 0011). The API validates with these; the web infers its types from them. */

export const CaseStatusSchema = z.enum([
  'RECEIVED',
  'EXTRACTING',
  'AWAITING_OWNER',
  'DECIDED',
  'FAILED',
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const ExtractionTierSchema = z.enum([
  'T0_DETERMINISTIC',
  'T1_OCR',
  'T2_CLASSIFIER',
  'T3_LLM_BASIC',
  'T4_LLM_AGENT',
  'T5_OWNER',
]);
export type ExtractionTier = z.infer<typeof ExtractionTierSchema>;

export const DecisionOutcomeSchema = z.enum(['QUALIFIES', 'DOES_NOT_QUALIFY', 'NEEDS_INFO']);
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

export const DocumentTypeSchema = z.enum(['BANK_STATEMENT', 'CFDI_INVOICE', 'UNKNOWN']);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
