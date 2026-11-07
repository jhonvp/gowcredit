import type { EligibilityPolicy } from './policy';

/** Mirrors config/eligibility-policy.v1.yaml for unit tests; the YAML loader test checks the real file parses to the same values. */
export const POLICY: EligibilityPolicy = {
  version: 'v1',
  minScore: 60,
  statement: {
    currency: 'MXN',
    maxAgeDays: 90,
    score: {
      avgMonthlyCredits: [
        { min: 20_000_000, points: 30 },
        { min: 5_000_000, points: 20 },
        { min: 2_000_000, points: 10 },
      ],
      liquidityBuffer: [
        { min: 0.2, points: 20 },
        { min: 0.05, points: 10 },
      ],
      bouncedEntries: [
        { max: 0, points: 20 },
        { max: 2, points: 10 },
      ],
      topPayerShare: [
        { max: 0.6, points: 15 },
        { max: 0.85, points: 8 },
      ],
      creditDebitRatio: [
        { min: 0.9, max: 1.3, points: 15 },
        { min: 0.7, max: 1.5, points: 8 },
      ],
    },
  },
  invoice: {
    voucherTypes: ['I'],
    paymentMethods: ['PPD'],
    anchorBuyers: ['DCM850101AB1'],
    dueInDays: { min: 7, max: 120 },
    total: { min: 500_000, max: 500_000_000 },
  },
  advance: { invoiceShare: 0.9, monthlyCreditsShare: 0.5 },
};
