# Extraction evaluation

`make eval` runs the extraction pipeline over every PDF in `facturas/` and compares the output with
`ground-truth/*.json`. The report goes to `reports/latest.md` and `reports/latest.json`.

## How the ground truth was built

The development set has no labels, so each file was labeled from the PDF and then checked against the
document's own arithmetic:

1. **Summary fields** (period, opening/closing balance, credits, debits) are read from the bank's summary
   block. Each file records where they came from (`verification.summary`).
2. **Arithmetic check:** opening + credits − debits = closing, to the cent, for all 9 files. Where a bank
   defines its totals differently (Fondeadora excludes withheld tax from "Retiros"; Nu reports interest
   separately), the ground truth uses the economic totals, and the file explains why.
3. **Transaction counts** are only labeled when something independent verifies them: the bank prints the
   count (BBVA, Banamex), or every row prints a running balance and the chain holds from the opening
   balance to the closing balance (a missing or extra row would break it). Nu's count is `null`.
4. **Holder fields** are anonymized in the dataset, so the expected value is `null` (SPEC A4).

Known document problems are listed under `knownAnomalies`. The expected behaviour there is to flag them
for review, not to make the numbers fit. `notes` holds informational facts (e.g. HSBC's EBCDIC text layer)
that the pipeline is expected to handle without review.

## Fields scored

`bankName`, `currency`, `periodStart`, `periodEnd`, `openingBalance`, `closingBalance`, `totalCredits`,
`totalDebits`, `transactionCount` (when labeled). Money must match to the cent, and dates exactly. Totals
are the sums of the extracted rows, so they also measure row extraction.

## LLM tiers in the eval (replay, record, baseline)

| Command            | What runs                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `make eval`        | T0 → T3 → T4 with `LLM_MODE=replay`: LLM answers come from `fixtures/llm`, no API key, identical every run |
| `make eval-t0`     | T0 only (deterministic baseline)                                                                           |
| `make eval-record` | Same cascade; requests with no fixture call the API and are saved (needs `ANTHROPIC_API_KEY` in `.env`)    |

LLM tiers run only on documents the earlier tiers could not resolve. In replay mode a tier whose exact
request has no fixture is reported as skipped (`T3⊘ (fixture-missing)`) and never changes the result of
the earlier tiers. The fixture key is the SHA-256 of the full request (model id, prompt, document text,
schema, history), so changing a prompt, a model or the T0 output that feeds a tier needs re-recording.

The report adds the LLM cost per document (as recorded; replayed runs report the cost of the original
call) and the number of agent turns.
