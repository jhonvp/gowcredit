/** Lifecycle of an analysis case (ADR 0007, ADR 0008). */
export const CASE_STATUSES = [
  'RECEIVED',
  'EXTRACTING',
  'EXTRACTED',
  'AWAITING_OWNER',
  'DECIDED',
  'FAILED',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * EXTRACTED: every document passed the validators; the eligibility engine decides next.
 * AWAITING_OWNER: a document needs clarification (failed validators or missing data).
 */
const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  RECEIVED: ['EXTRACTING', 'FAILED'],
  EXTRACTING: ['EXTRACTED', 'AWAITING_OWNER', 'FAILED'],
  EXTRACTED: ['DECIDED', 'AWAITING_OWNER', 'EXTRACTING'],
  AWAITING_OWNER: ['EXTRACTING', 'DECIDED', 'FAILED'],
  DECIDED: ['EXTRACTING'],
  FAILED: ['EXTRACTING'],
};

export const canTransition = (from: CaseStatus, to: CaseStatus): boolean =>
  TRANSITIONS[from].includes(to);

export class InvalidTransitionError extends Error {
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`Case cannot go from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export const assertTransition = (from: CaseStatus, to: CaseStatus): void => {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
};
