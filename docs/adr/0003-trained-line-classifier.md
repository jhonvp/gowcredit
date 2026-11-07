# ADR 0003 — Internal model: trained line classifier

**Status:** accepted

**Context.** Nine documents are too few to train at the document level. They contain thousands of
lines, though.

**Decision.**

- **Labels:** each text line is labeled
  `transaction_row | table_header | summary_field | continuation | noise`.
- **Features:** relative x/y position, column alignment with the detected header, date/amount regex
  hits, keyword hits, token count, and whether the line has digits only.
- **Model:** multinomial logistic regression, trained with a TS script (`scripts/train-classifier.ts`).
  Weights are exported to JSON and loaded by an adapter. No Python or ONNX at runtime.
- **Validation:** leave-one-bank-out. Train on 8 banks, test on the held-out one, report the
  macro-F1. This mirrors how the hidden set will be evaluated.

**Role in the cascade.** When T0's heuristics can't find the table structure, T2 labels the lines and
T0's row builder runs again on those labels.

**Trade-off.** A simple model, explainable and fast, whose weights are versioned in the repo.
Gradient boosting or ONNX is a documented upgrade path.

**Implementation (2026-11-07).** What changed from the plan above:

- **Labels without hand labeling.** T0 records the role of every table line. The training script keeps
  only documents whose T0 output passes every blocking validator, so the labels are confirmed by the
  documents' own arithmetic: 6,103 lines from 7 documents.
- **Classes reduced to 4:** `table_header | transaction_row | continuation | other`. Summary fields are
  already handled by T0's label matching.
- **21 features**, listed in `t2/line-features.ts`. The weights are a generated TS module, so no JSON
  asset needs copying at build time.
- **Row builder.** Rows come from `transaction_row` lines plus their continuations. The debit/credit
  side is decided by the running balance, then by an explicit sign. As a last resort, and only in
  documents whose rows mostly lack a running balance, it uses the nearest column of the line the
  classifier labeled as header.
- **Reported numbers are in-sample.** Leave-one-bank-out is an agreed cut. T2 alone rebuilds 6 of the
  7 training documents exactly. BBVA gets all 161 rows, with one debit/credit mix-up. See
  `eval/reports/classifier.md`.
