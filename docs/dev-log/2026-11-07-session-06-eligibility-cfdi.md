# Session 06 — Eligibility engine and CFDI XML (2026-11-07)

Plan block 9.

## Built

- **Domain.**
  - RFC format check, with generic RFCs told apart.
  - CFDI model and integrity checks: I1 required fields, I3 arithmetic, I4 RFCs.
  - Statement signals: monthly averages, a time-weighted daily balance, bounced entries, top-payer share,
    credits/debits ratio.
  - `decide()`, implementing `docs/eligibility-policy.md` rule by rule. 22 domain tests cover every
    outcome path.
- **Adapters.**
  - The YAML policy is validated at boot.
  - The CFDI parser (fast-xml-parser) rejects documents with external entities.
  - A SAT status stub.
- **Persistence.** A `decisions` table, CFDI extractions, and case facts.
- **Flow.** The worker extracts the document (statement cascade, or CFDI parse), the case moves to
  EXTRACTED, and `DecideCaseUseCase` moves it to DECIDED or AWAITING_OWNER.
  - `POST /api/cases/:id/documents` lets a statement and an invoice be decided together.
  - A second document arriving while the case is busy is retried later instead of dropped.
  - Unparseable XML is acked instead of being retried into the DLQ.
- **Eval.** The report gained an "Eligibility" section with two dates: period end + 5, and today.

## Found along the way

- **A PR #5 regression.** The intake integration test still expected only T0/T3/T4 after T1/T2 joined
  the module. The integration run in that PR happened before the wiring commit. The fix is backported to
  `feat/ocr-classifier` with a commit of its own.
- **First edit of the integration test didn't apply.** Prettier had wrapped the line the edit was anchored
  on. The failing test made it visible right away.
- **XXE.** fast-xml-parser refuses `<!ENTITY … SYSTEM>` outright. The test now asserts the refusal,
  rather than only checking that entities aren't expanded.

## Results

| Check                           | Result                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `make test`                     | 105 passed                                                                                                |
| `make test-integration`         | 9 passed (new: PUE → DECIDED/DOES_NOT_QUALIFY; PPD → questions; second document)                          |
| `make eval`                     | 78/80 extraction, unchanged. Eligibility at period end + 5: 6 QUALIFIES, 1 DOES_NOT_QUALIFY, 2 NEEDS_INFO |
| Full stack: Mercado Pago + CFDI | Every rule passes except C-K4 (a CFDI has no due date) → AWAITING_OWNER, asking for it                    |
