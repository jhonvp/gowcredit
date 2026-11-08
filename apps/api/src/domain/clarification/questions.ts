import type { DecisionFacts, MissingInfoCode } from '../eligibility/engine';
import { isIsoDate } from '../shared/iso-date';

/** Question types from ADR 0008. Each missing-info code maps to one. */
export type QuestionType =
  'confirm_value' | 'provide_value' | 'upload_document' | 'explain_discrepancy';

export const QUESTION_TYPE: Record<MissingInfoCode, QuestionType> = {
  INVOICE_DUE_DATE: 'provide_value',
  RFC_CONFIRMATION: 'confirm_value',
  SAT_STATUS: 'confirm_value',
  RECENT_STATEMENT: 'upload_document',
  SUPPLIER_STATEMENT: 'upload_document',
  STATEMENT_UNREADABLE: 'explain_discrepancy',
  INVOICE_INCONSISTENT: 'explain_discrepancy',
};

export interface Question {
  code: MissingInfoCode;
  type: QuestionType;
  /** Spanish text shown to the owner. */
  text: string;
}

/** A typed answer. `text` keeps the owner's own words for the audit trail and analyst review. */
export type Answer =
  | { code: MissingInfoCode; kind: 'date'; value: string; text?: string }
  | { code: MissingInfoCode; kind: 'boolean'; value: boolean; text?: string }
  | { code: MissingInfoCode; kind: 'text'; text: string };

export class InvalidAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAnswerError';
  }
}

export interface AppliedAnswers {
  facts: DecisionFacts;
  /** Free-text explanations that an analyst must read (they cannot change facts by themselves). */
  forAnalyst: { code: MissingInfoCode; text: string }[];
}

/**
 * Applies typed answers to the case facts (pure). Only the codes that map to a fact change the
 * decision; explanations go to an analyst; document questions are answered by uploading.
 */
export function applyAnswers(facts: DecisionFacts, answers: readonly Answer[]): AppliedAnswers {
  const next: DecisionFacts = { ...facts };
  const forAnalyst: AppliedAnswers['forAnalyst'] = [];
  for (const a of answers) {
    switch (a.code) {
      case 'INVOICE_DUE_DATE':
        if (a.kind !== 'date' || !isIsoDate(a.value))
          throw new InvalidAnswerError('INVOICE_DUE_DATE needs a date (YYYY-MM-DD)');
        next.invoiceDueDate = a.value;
        break;
      case 'RFC_CONFIRMATION':
        if (a.kind !== 'boolean') throw new InvalidAnswerError('RFC_CONFIRMATION needs yes or no');
        next.issuerRfcConfirmed = a.value;
        break;
      case 'SAT_STATUS':
        if (a.kind !== 'boolean') throw new InvalidAnswerError('SAT_STATUS needs yes or no');
        next.satStatus = a.value ? 'active' : 'cancelled';
        break;
      case 'STATEMENT_UNREADABLE':
      case 'INVOICE_INCONSISTENT':
        if (a.kind !== 'text' || !a.text.trim())
          throw new InvalidAnswerError(`${a.code} needs an explanation`);
        forAnalyst.push({ code: a.code, text: a.text.trim().slice(0, 2000) });
        break;
      case 'RECENT_STATEMENT':
      case 'SUPPLIER_STATEMENT':
        throw new InvalidAnswerError(`${a.code} is answered by uploading a document`);
    }
  }
  return { facts: next, forAnalyst };
}
