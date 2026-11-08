# ADR 0002 — Extraction cascade with escalation decided by validators

**Status:** accepted

**Decision.** Tiers run from cheapest to most expensive:

| Tier | What it does                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------ |
| T0   | Deterministic: pdf text + coordinates, page classifier, text-quality gate, generic layout parser |
| T1   | OCR (Tesseract `spa`), only on content pages with no text or bad text                            |
| T2   | Trained line classifier (ADR 0003)                                                               |
| T3   | Claude Haiku                                                                                     |
| T4   | Claude Opus                                                                                      |
| T5   | Owner clarification                                                                              |

After every tier the **domain validators** run (balance chain, totals, period, CFDI arithmetic).
Escalation happens **per section** (summary, transaction table of page N), only for the sections that
failed. Every field records the tier that produced it.

**Why.**

- Validators are objective, even on documents nobody has labeled. Model confidence is not.
- Escalating per section keeps LLM cost close to zero for well-formed PDFs.
- Provenance makes accuracy and cost measurable.

**Notable cases from the dev set.**

- HSBC's text layer is EBCDIC → the quality gate detects it, T0 repairs it with a cp500 decode,
  and whatever is still broken escalates.
- Textless pages in Banamex and BBVA are ads → the page classifier skips them and OCR never runs.

**Implementation note (2026-11-07).** Per-section escalation is done by mixing candidates: when a later
tier runs, the use case also scores the hybrids "earlier summary + new rows" and "new summary + earlier
rows" and keeps the variant with the fewest blocking failures (ties keep the earlier candidate).
Provenance records the tier of each section. The worker runs one document per SQS message; duplicate
deliveries are absorbed by a compare-and-set on the case status.
