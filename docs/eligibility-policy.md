# Eligibility Policy v1

Deterministic and versioned. Lives in `config/eligibility-policy.v1.yaml`; every decision records the
policy version and the rules that fired. The LLM never decides eligibility.

## Outcomes

| Outcome            | Meaning                                                                                |
| ------------------ | -------------------------------------------------------------------------------------- |
| `QUALIFIES`        | All knockouts pass and score ≥ 60. Includes a suggested maximum advance.               |
| `DOES_NOT_QUALIFY` | A knockout failed or score < 60. Lists the reasons.                                    |
| `NEEDS_INFO`       | Data is missing or inconsistent. A question was sent to the owner; the case is paused. |

Order: integrity → knockouts → score. Integrity problems never lead to a rejection, only to `NEEDS_INFO`.

## 1. Integrity (both document types) → `NEEDS_INFO` on failure

| ID  | Rule                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Required fields were extracted (statement: period, opening/closing balance, transactions; CFDI: UUID, RFCs, total, date).                               |
| I2  | Statement arithmetic reconciles: opening + credits − debits = closing (±1.00 MXN), running balance consistent row by row, row totals match the summary. |
| I3  | CFDI arithmetic: subtotal − discounts + transferred taxes − withheld taxes = total (±0.01).                                                             |
| I4  | Holder/issuer RFC present and well-formed. If anonymized or generic (`XAXX010101000`) → ask the owner to confirm.                                       |

## 2. Bank statement (supplier financial health)

**Knockouts → `DOES_NOT_QUALIFY`**

| ID   | Rule                                                     | Default                                                                          |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| S-K1 | Currency is MXN                                          | —                                                                                |
| S-K2 | Statement is recent: period end ≥ `asOf` − 90 days       | 90 days → if older, `NEEDS_INFO` asking for a recent statement (not a rejection) |
| S-K3 | Closing balance is not negative and no overdraft entries | —                                                                                |

**Score (0–100)**

| ID   | Signal                                                                    | Points                                      |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------- |
| S-S1 | Average monthly credits (deposits)                                        | ≥ 200k: 30 · ≥ 50k: 20 · ≥ 20k: 10 · else 0 |
| S-S2 | Average daily balance / average monthly debits (liquidity buffer)         | ≥ 20%: 20 · ≥ 5%: 10 · else 0               |
| S-S3 | Returned / bounced / NSF entries (`DEVOLUCION`, `RECHAZ*`, `INSUFICIEN*`) | 0: 20 · 1–2: 10 · ≥ 3: 0                    |
| S-S4 | Payer concentration: share of credits from the top payer                  | ≤ 60%: 15 · ≤ 85%: 8 · else 0               |
| S-S5 | Credits/debits ratio in the period                                        | 0.9–1.3: 15 · 0.7–1.5: 8 · else 0           |

## 3. CFDI invoice (the receivable itself)

**Knockouts**

| ID   | Rule                                                                                                        | Result if it fails      |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------- |
| C-K1 | Voucher type is `I` (ingreso)                                                                               | `DOES_NOT_QUALIFY`      |
| C-K2 | Payment method is `PPD` (deferred). `PUE` means it is already paid → nothing to advance                     | `DOES_NOT_QUALIFY`      |
| C-K3 | Receiver RFC is in the configured anchor-buyer list (the distribution chain)                                | `DOES_NOT_QUALIFY`      |
| C-K4 | Due date known and between `asOf` + 7 and `asOf` + 120 days. A CFDI usually has no due date → ask the owner | `NEEDS_INFO` if missing |
| C-K5 | Total between 5,000 and 5,000,000 MXN                                                                       | `DOES_NOT_QUALIFY`      |
| C-K6 | Not cancelled at SAT (port with a stub adapter in v1; documented)                                           | `NEEDS_INFO` if unknown |

## 4. Combined decision and suggested advance

- Statement only → supplier pre-qualification (`QUALIFIES` = supplier is eligible to submit invoices).
- Invoice only → invoice knockouts pass, but a supplier statement is needed → `NEEDS_INFO` asking for one.
- Both → `QUALIFIES` if both pass. Suggested advance = `min(90% × invoice total, 50% × average monthly credits)`.

## Implementation notes (v1)

- Engine: `apps/api/src/domain/eligibility/engine.ts` (pure). Values: `apps/api/config/eligibility-policy.v1.yaml`.
- **I4 applies to the CFDI.** Statement holder data is anonymized in the dataset (SPEC A4) and T0 does not
  extract it, so it is not a reason to ask on its own.
- **Owner facts** (`cases.facts`) fill what documents cannot carry: the invoice due date (C-K4), a
  confirmation of a generic issuer RFC (I4), and the SAT status (C-K6). The clarification loop writes them
  and re-runs the decision.
- **C-K6 stub:** `SAT_STATUS_MODE=active` (default) assumes the CFDI is not cancelled; `unknown` makes
  every invoice ask. A production adapter would call SAT's CFDI verification service.
- **Questions are dropped after a knockout:** once a hard rule rejects, asking the owner cannot change the
  outcome.
- `ELIGIBILITY_AS_OF` fixes the evaluation date for reproducible runs; the default is today.

## Expected dev-set outcomes

Most dev statements are older than 90 days relative to today. With `asOf = today` they end in
`NEEDS_INFO (recent statement)`. The eval command runs with `asOf` = each statement's period end + 5 days
so the financial rules are exercised; both modes are in the report (`make eval`, section "Eligibility").

| Document     | asOf = period end + 5                                     | asOf = 2026-11-07             |
| ------------ | --------------------------------------------------------- | ----------------------------- |
| Inbursa      | QUALIFIES (83)                                            | NEEDS_INFO (recent statement) |
| Hey          | QUALIFIES (70)                                            | NEEDS_INFO (recent statement) |
| Fondeadora   | NEEDS_INFO (unreadable: its own running balance breaks)   | same                          |
| Banamex      | DOES_NOT_QUALIFY (58)                                     | NEEDS_INFO (recent statement) |
| BBVA         | QUALIFIES (75)                                            | NEEDS_INFO (recent statement) |
| Mercado Pago | QUALIFIES (70)                                            | QUALIFIES (70)                |
| Santander    | QUALIFIES (60)                                            | NEEDS_INFO (recent statement) |
| Nu           | NEEDS_INFO (unreadable until T3/T4 fixtures are recorded) | same                          |
| HSBC         | QUALIFIES (68)                                            | NEEDS_INFO (recent statement) |
