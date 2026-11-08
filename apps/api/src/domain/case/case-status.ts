/** Lifecycle of an analysis case (ADR 0007, ADR 0008). */
export const CASE_STATUSES = [
  'RECEIVED',
  'EXTRACTING',
  'AWAITING_OWNER',
  'DECIDED',
  'FAILED',
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  RECEIVED: ['EXTRACTING', 'FAILED'],
  EXTRACTING: ['AWAITING_OWNER', 'DECIDED', 'FAILED'],
  AWAITING_OWNER: ['EXTRACTING', 'DECIDED', 'FAILED'],
  DECIDED: ['EXTRACTING'],
  FAILED: ['EXTRACTING'],
};

export const canTransition = (from: CaseStatus, to: CaseStatus): boolean =>
  TRANSITIONS[from].includes(to);
