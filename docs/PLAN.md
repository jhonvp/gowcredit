# Delivery plan — 2 days

Priority rule: whatever the evaluators measure (extraction on unseen docs + reproducibility) comes first.

## Agreed cuts

- **CFDI:** XML only. PDF invoices are detected and answered with `NEEDS_INFO` ("please upload the XML").
- **Classifier:** trained and used, but no leave-one-bank-out report.
- **Datadog:** no monitors/dashboard Terraform module. Instrumentation and the agent sidecar stay.
- **Analysts:** no override endpoints. They can read cases and use the copilot.

## Day 1 — extraction that works and can be measured

| #   | Block            | Output                                                                                                                                                                                                                                                                                 |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Scaffold         | pnpm monorepo (`apps/api`, `apps/web`, `packages/contracts`), NestJS hexagonal skeleton, TypeORM + first migration, nestjs-pino + dd-trace, Docker Compose (postgres, floci, mailpit, datadog-agent behind a profile), husky + commitlint, ESLint/Prettier, Vitest, `.claude/` harness |
| 2   | Ground truth     | `eval/ground-truth/*.json` for the 9 statements, drafted by the `ground-truth-labeler` subagent and checked against each statement's own arithmetic                                                                                                                                    |
| 3   | Domain           | Money, Period, Rfc, `BankStatement`, `CfdiInvoice`, validators                                                                                                                                                                                                                         |
| 4   | T0 deterministic | pdfjs text + coordinates, page classifier, quality gate + EBCDIC repair, header synonyms, columns by X, multi-line rows, Spanish dates/amounts                                                                                                                                         |
| 5   | Eval harness     | `pnpm eval` → per-field accuracy, tier provenance, cost, agent turns; markdown report                                                                                                                                                                                                  |
| 6   | T3 + T4 agent    | `LlmPort`/`AgentPort`, Haiku single call, Opus extraction repair agent, record/replay fixtures                                                                                                                                                                                         |

**End of day 1:** `pnpm eval` covers all 9 documents and reports numbers.

## Day 2 — decision, loop, UI, platform

| #   | Block                  | Output                                                                                                                                       |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Cascade orchestrator   | Escalation per section, provenance, SQS worker                                                                                               |
| 8   | T1 OCR + T2 classifier | Tesseract (spa) on content pages only; logistic regression line classifier                                                                   |
| 9   | Eligibility + CFDI XML | YAML policy v1, engine with reasons, CFDI XML parser                                                                                         |
| 10  | Auth + clarification   | Passport (local/jwt/magic-link/api-key), seeds, clarification agent, Nodemailer → Mailpit, re-evaluation                                     |
| 11  | Frontend               | Supplier upload/status, analyst case view (PDF + fields coloured by tier), owner answer page                                                 |
| 12  | Analyst copilot        | Read-only agent + UI panel                                                                                                                   |
| 13  | Infra + CI/CD          | Terraform (ECS + DD sidecar/FireLens, RDS, S3, SQS, Secrets, SES, S3+CloudFront for web), `envs/local` on Floci, `envs/prod`; GitHub Actions |
| 14  | Docs                   | README (run in ≤ 3 commands), SPEC/ADRs, `docs/dev-log/`, harness description                                                                |

## If we fall behind (in this order)

1. Analyst copilot (#12)
2. Bounding-box highlight in the analyst view (keep tier colours in the field list)
3. Supplier screen (upload through API/CLI instead)

Never cut: T0 + validators, eval harness, replay fixtures, clarification loop, README reproducibility.
