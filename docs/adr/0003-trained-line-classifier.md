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
