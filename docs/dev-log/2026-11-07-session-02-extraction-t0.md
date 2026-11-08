# Session 02 — T0 deterministic extraction (2026-11-07)

Prompt: "yes, start feat/extraction-t0"

## Approach

1. Studied every layout with `pdftotext -layout` before writing any parser. No per-bank code paths:
   every rule is generic and named after the pattern it handles.
2. Built the domain validators first. They define "correct" without labels: opening + credits − debits
   = closing, and the running balance chain.
3. Iterated T0 against the validators, one failure class at a time:

| Run | Passing            | Failure found → generic fix                                                                                                  |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | 5/9                | Fondeadora prints `0.00` in the empty column → zeros are not movements                                                       |
|     |                    | Banamex amounts come after up to 15 reference lines → longer continuation window                                             |
|     |                    | Nu's opening label is >90 columns from its amount → wider label gap                                                          |
|     |                    | HSBC rows indented 4 columns → indent allowance; day-column tables read bare days only                                       |
| 2   | 7/9                | Banamex records continue across page breaks after the repeated header → keep the record open                                 |
| 3   | 7/9                | Banamex "SALDO AL…" and "DISPOSICIONES EN CAJERO EXENTAS" rows only restate the balance → skip closing and balance-only rows |
| 4   | 7/9 + exact counts | Unit test caught `totales?` (matches "totale"), so `TOTAL` never ended a table                                               |

## Findings

- HSBC: re-reading each glyph's byte as EBCDIC (cp500) recovers numbers and dates exactly. pdftotext
  drops the byte for `e`, so labels are matched approximately (edit distance). The same technique will
  help with OCR output.
- **The printed running balance is the strongest signal** for debit vs credit (prev ± amount = balance).
  It makes column alignment a fallback and handles HSBC, where the columns are shifted.
- Fondeadora's own running balance is inconsistent (interest/ISR rows printed at the end). T0's values are
  right and the totals reconcile. The validator correctly flags it for the owner.
- Nu's table mixes internal "Cajita" transfers with real movements, and the month's interest isn't a row.
  T0 correctly fails validation, so this document is the target for the LLM tiers.

## Result (T0 only, no LLM)

78/80 fields (97.5%), 7/9 documents pass all validators, 2/2 known anomalies flagged, 0 false flags,
23–277 ms per document. Full report: `eval/reports/latest.md`.
