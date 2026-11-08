import type { Cents } from '../shared/money';

/** Eligibility policy (docs/eligibility-policy.md). Values live in config/eligibility-policy.v1.yaml. */
export interface Band {
  min?: number;
  max?: number;
  points: number;
}

export interface EligibilityPolicy {
  version: string;
  minScore: number;
  statement: {
    currency: string;
    maxAgeDays: number;
    score: {
      /** Bands on average monthly credits, in cents. */
      avgMonthlyCredits: Band[];
      /** Bands on average daily balance / average monthly debits. */
      liquidityBuffer: Band[];
      /** Bands on the number of bounced / returned entries. */
      bouncedEntries: Band[];
      /** Bands on the share of credits from the top payer (0–1). */
      topPayerShare: Band[];
      /** Bands on credits / debits for the period. */
      creditDebitRatio: Band[];
    };
  };
  invoice: {
    voucherTypes: string[];
    paymentMethods: string[];
    anchorBuyers: string[];
    dueInDays: { min: number; max: number };
    total: { min: Cents; max: Cents };
  };
  advance: { invoiceShare: number; monthlyCreditsShare: number };
}

/** Points of the first band whose [min, max] contains the value (bands are ordered best first). */
export function bandPoints(bands: readonly Band[], value: number): number {
  for (const b of bands)
    if ((b.min === undefined || value >= b.min) && (b.max === undefined || value <= b.max))
      return b.points;
  return 0;
}
