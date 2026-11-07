# ADR 0007 — Eligibility is a deterministic, versioned policy

**Status:** accepted

The policy is in `config/eligibility-policy.v1.yaml` and described in `docs/eligibility-policy.md`.

- Outcomes: `QUALIFIES | DOES_NOT_QUALIFY | NEEDS_INFO`.
- Each outcome comes with the rules that fired and the policy version.
- Integrity problems never cause a rejection; they lead to a question for the owner.
- The evaluation date is an explicit `asOf`, so results are reproducible.

**Why.** Credit decisions must be explainable, reproducible and auditable. The rules are business
configuration, not something to leave to an LLM.
