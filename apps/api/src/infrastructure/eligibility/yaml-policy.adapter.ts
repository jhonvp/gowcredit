import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import type { PolicyPort } from '../../application/ports/eligibility.ports';
import type { EligibilityPolicy } from '../../domain/eligibility/policy';

const band = z
  .object({ min: z.number().optional(), max: z.number().optional(), points: z.number().int() })
  .strict();
const policySchema = z
  .object({
    version: z.string(),
    minScore: z.number().int().min(0).max(100),
    statement: z.object({
      currency: z.string(),
      maxAgeDays: z.number().int().positive(),
      score: z.object({
        avgMonthlyCredits: z.array(band),
        liquidityBuffer: z.array(band),
        bouncedEntries: z.array(band),
        topPayerShare: z.array(band),
        creditDebitRatio: z.array(band),
      }),
    }),
    invoice: z.object({
      voucherTypes: z.array(z.string()),
      paymentMethods: z.array(z.string()),
      anchorBuyers: z.array(z.string().transform((s) => s.toUpperCase())),
      dueInDays: z.object({ min: z.number().int(), max: z.number().int() }),
      total: z.object({ min: z.number().int(), max: z.number().int() }),
    }),
    advance: z.object({
      invoiceShare: z.number().min(0).max(1),
      monthlyCreditsShare: z.number().min(0).max(1),
    }),
  })
  .strict();

/** apps/api/config, the same relative path from src/ and dist/. */
export const DEFAULT_POLICY_FILE = join(__dirname, '../../../config/eligibility-policy.v1.yaml');

/** Loads and validates the policy once at startup; a bad policy file fails the boot, not a decision. */
export class YamlPolicyAdapter implements PolicyPort {
  private readonly policy: EligibilityPolicy;

  constructor(file = DEFAULT_POLICY_FILE) {
    this.policy = policySchema.parse(parse(readFileSync(file, 'utf8'))) as EligibilityPolicy;
  }

  current(): EligibilityPolicy {
    return this.policy;
  }
}
