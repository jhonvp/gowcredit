# SPEC — Supplier Early-Payment Eligibility (v1)

## 1. Problem as understood

Suppliers of a distribution chain want to be paid their invoices before the due date
(factoring / early payment). Today an analyst reviews the documents by hand and it takes days.
v1 must:

1. **Receive** the supplier's documents.
2. **Extract** their information correctly, including from layouts it has never seen.
3. **Decide** if the supplier/invoice qualifies, with reasons.
4. When something is unclear, **ask the document owner**, and use the answer in the analysis.

## 2. What the dataset actually contains

The brief says "10 invoices". The development folder holds **9 Mexican bank statements**
(_estados de cuenta_, `EDC_*`), each from a different bank:

| File   | Bank         | Pages | Notable                                                                                   |
| ------ | ------------ | ----- | ----------------------------------------------------------------------------------------- |
| EDC_01 | Inbursa      | 8     | p6 has no text (non-content page)                                                         |
| EDC_02 | Hey Banco    | 15    | Multi-product summary                                                                     |
| EDC_03 | Fondeadora   | 4     | Includes CFDI stamp; one running-balance row out of order                                 |
| EDC_04 | Banamex      | 31    | p26–31 are image-only ads                                                                 |
| EDC_05 | BBVA         | 17    | p1 is an image-only "generic RFC" notice                                                  |
| EDC_06 | Mercado Pago | 17    | **Multi-month period** (Jun–Sep), mixed-language month names, signed single amount column |
| EDC_07 | Santander    | 32    | Multiple products (checking + investment), masked account numbers                         |
| EDC_08 | Nu           | 32    | Generic RFC `XAXX010101000`; balance split into "Cajitas"                                 |
| EDC_09 | HSBC         | 8     | **Text layer is EBCDIC-encoded** — looks like text, is garbage until decoded              |

Holder RFC, name, CLABE and address are blank or generic in all files (anonymized).

Many Mexican bank statements are themselves CFDIs (they say _"representación impresa de un CFDI"_),
so we already have one bridge between the two document types.

## 3. Assumptions

| #   | Assumption                                                                                                                                                                                                                                                                                                                               | Why                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The hidden evaluation set may contain **bank statements and/or CFDI invoices**, from banks/issuers not in the dev set. The system detects the document type.                                                                                                                                                                             | Brief and dataset disagree; supporting both is the safe reading. Questions sent to the evaluators (`docs/questions-to-evaluators.md`). |
| A2  | Inputs are PDFs (CFDI also accepted as XML). Currency MXN; other currencies → flagged.                                                                                                                                                                                                                                                   | Every dev file is a MXN PDF.                                                                                                           |
| A3  | "Extraction" is measured on: document type, issuer (bank/issuer), holder (RFC/name, may be null), period/dates, opening/closing balance, totals (credits/debits), and the transaction list (date, description, debit, credit, balance). For CFDI: UUID, issuer/receiver RFC, dates, subtotal/taxes/total, payment method/form, currency. | No schema given; these are the fields an underwriter needs. Output schema documented in `docs/output-schema.md`.                       |
| A4  | Null is a valid answer for anonymized fields. Inventing a value is worse than null.                                                                                                                                                                                                                                                      | Anonymized dataset.                                                                                                                    |
| A5  | The "document owner" is the supplier contact who uploaded it; reachable by email.                                                                                                                                                                                                                                                        | No channel specified. Email via Nodemailer; locally captured by Mailpit.                                                               |
| A6  | The eligibility policy is ours, deterministic and versioned (`docs/eligibility-policy.md`).                                                                                                                                                                                                                                              | Not defined in the brief.                                                                                                              |
| A7  | Evaluation date is an explicit `asOf` parameter (default: today) so results are reproducible.                                                                                                                                                                                                                                            | Recency rules otherwise change results day to day.                                                                                     |

## 4. Scope

**In scope (v1)**

- REST API (NestJS) + CLI: upload → async processing → result.
- Extraction cascade: deterministic → OCR → trained line classifier → Claude Haiku → Claude Opus repair agent → owner.
- Runtime agents: extraction repair (T4), clarification (T5), analyst copilot (read-only). See ADR 0010.
- Domain validators that decide when to escalate.
- Eligibility engine with reasons.
- Clarification loop: agent-written email question → magic-link answer (with follow-ups) → re-evaluation.
- CFDI invoices as **XML** (PDF invoices are detected and the owner is asked for the XML).
- Web app (React): supplier upload/status, analyst case view with per-tier field provenance, owner answer page.
- Auth: supplier / analyst (JWT), owner (magic link), integration (API key).
- Eval harness with hand-labeled ground truth for the dev set; per-field accuracy + tier provenance + cost.
- Docker Compose (Postgres, Floci, Mailpit), Terraform (AWS; `local` env targets Floci), GitHub Actions CI/CD.

**Out of scope (v1)**

- Real SAT validation of CFDI status (documented as a port with a stub adapter).
- CFDI PDF extraction, analyst override endpoints, Datadog monitors/dashboards as code, classifier cross-validation report.
- Fraud/tampering detection beyond arithmetic consistency checks.
- Real AWS deployment (Terraform is applied against Floci in CI; prod apply is documented).

## 5. Success criteria

- The evaluators run `docker compose up` + one command and get the same results we report.
- Every extracted field states which tier produced it.
- Every decision lists the rules that fired.
- Unclear cases end in `NEEDS_INFO` with a concrete question, never in a silent guess.
