# Session 09 — recording the LLM fixtures (2026-11-08)

## Prompts (user)

- "give the mac command to adjust the key" → `read -s` into `.env` without echo or history.
- "I already re run how to check if is working as expected" → checked key presence in the containers
  (set / length only), the models endpoint (200, both models listed), and the fixture folders.
- "what is pending for the plan?" → recorded fixtures were the only "never cut" item open.
- "yes" (record the fixtures and open a PR) / "podemos mejorar algo" (with the first report pasted).

## What happened

1. The first `make eval-record` (T4 prompt v1, $0.23) made all 9 documents pass, but known anomalies
   flagged fell to 0/2. Reading the recorded tool calls: on Fondeadora the agent deleted the interest/ISR
   rows and re-inserted them earlier with new dates; on Nu it inserted the summary-only interest.
   Ground truth for both says "flag it, do not fix it".
2. Fix in the domain, not only in the prompt: `rows-as-printed` (blocking) for reordered rows (T4 vs
   its input, by longest increasing subsequence over amount-matched rows) and summary-only rows (any
   tier). T4 prompt v2 separates extraction errors from document inconsistencies.
3. Re-recorded T4 only (T3 fixtures unchanged). Result: 78/80 fields, 2/2 anomalies flagged, both
   decisions NEEDS_INFO, $0.27 total as recorded. `make eval` in replay reproduces it without a key.

## Decision log

- The guard counts summary-only rows from T3 too: such a row means the movements do not reconcile on
  their own, which is the document's problem whichever tier noticed it.
- Ties keep the earlier deterministic candidate, so a flagged T4 result never replaces T0/T2 output
  that fails the same number of checks.
