# Session 07 — Auth (Passport) and the clarification loop (2026-11-07)

Plan block 10, split into two PRs so each stays reviewable: `feat/auth` and `feat/clarification`.

## Auth

- Passport `local` → HS256 JWT for suppliers and analysts, and `headerapikey` for integrations (the key
  is stored as SHA-256 and acts as its supplier). Global guards, with `@Public`, `@Roles` and
  `@AllowPrincipals`.
- Case isolation is a pure domain rule (`canReadCase`). Another supplier's case returns 404.
- Seeds run with the migrations: `supplier@demo.mx`, `supplier2@demo.mx`, `analyst@demo.mx` /
  `demo1234`, and the key `gk_local_demo_key_0001`.

## Clarification

- A NEEDS_INFO decision opens a request with Spanish questions, a single-use 7-day magic link (hash
  stored) and an email through Nodemailer to Mailpit.
- The owner answers with typed values, or with free text that T5 normalizes. The facts are applied and
  the case is decided again.
- After three rounds, or with no owner email, the case is escalated to an analyst.
- T5 has two bounded calls, both with deterministic fallbacks. In replay mode without fixtures the
  templates are used, so the loop works with no API key.

## Problem hit twice: edits that silently didn't apply

Python `str.replace` edits anchored on code that prettier had since reformatted changed nothing and
reported no error. It happened once in the controller (the private `receive`) and once in the documents
module (the `DecideCase` provider). In both cases a test caught it: the type checker, and then Nest's DI
error at boot. From now on, edits on formatted files assert that the anchor is present, or use the Edit
tool, which fails loudly.

## Results

| Check                           | Result                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `make test`                     | 122 passed                                                                                     |
| `make test-integration`         | 15 passed. Includes the full loop: email in Mailpit → link → answer → QUALIFIES → link refused |
| `make smoke` / `make test-load` | 6/6. Load: 3,855 requests, 0 failed, authenticated with the demo key                           |
