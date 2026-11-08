# GowCredit — Supplier early-payment eligibility

Ingests bank statements and CFDI invoices, extracts their data through a cost-ordered cascade
(deterministic → OCR → trained classifier → Claude Haiku → Claude Opus agent → document owner),
validates it, and decides whether the supplier qualifies. When something is unclear, it asks the owner
and uses the answer.

> Status: complete per [`docs/PLAN.md`](docs/PLAN.md): extraction cascade T0–T4, eligibility engine,
> CFDI XML, auth, owner clarification loop, three web screens, analyst copilot, Terraform and CI/CD.
> LLM replay fixtures are not recorded yet (`make eval-record` with an API key).

## Requirements

Only **Docker** (with Compose v2) and `make`. Node, pnpm, Tesseract, Terraform and the browsers all
run in containers.

## Quick start

```bash
make up        # builds and starts api, worker, web, postgres, floci (local AWS), mailpit
make smoke     # checks every service
```

| Service                                  | URL                          |
| ---------------------------------------- | ---------------------------- |
| Web app                                  | http://localhost:5173        |
| API health                               | http://localhost:3000/health |
| Mailpit (emails sent to document owners) | http://localhost:8025        |
| Floci (local S3/SQS/Secrets/SES)         | http://localhost:4566        |

## Tests

| Level       | Tool                                                                 | Command                 | Needs running stack         |
| ----------- | -------------------------------------------------------------------- | ----------------------- | --------------------------- |
| Unit        | Vitest                                                               | `make test`             | no                          |
| Integration | Vitest + supertest + real Postgres (`gowcredit_test`) + Floci S3/SQS | `make test-integration` | no (starts postgres, floci) |
| E2E         | Playwright (Chromium)                                                | `make test-e2e`         | yes (`make up`)             |
| Load        | Artillery: health, uploads, case reads (p95 < 200 ms, p99 < 500 ms)  | `make test-load`        | yes (`make up`)             |
| All of it   |                                                                      | `make check-all`        | starts it                   |

`make check` runs lint, typecheck, unit and integration tests, which is what CI runs on every PR.

## Try it in the browser

Open http://localhost:5173 and sign in as `supplier@demo.mx` / `demo1234`. Upload a statement from
`facturas/` (and a sample CFDI from `samples/cfdi/` into the same case). When the system needs
something, the owner's email lands in Mailpit (http://localhost:8025); its link opens the owner page.
Then sign in as `analyst@demo.mx` to see the decision, the extracted fields coloured by cascade tier,
and the clarification history.

## Try it: upload a statement (API)

Seed users (created by `make up`): `supplier@demo.mx`, `supplier2@demo.mx`, `analyst@demo.mx`, password
`demo1234`, and the integration key `gk_local_demo_key_0001` (header `X-API-Key`).

```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"supplier@demo.mx","password":"demo1234"}' | jq -r .accessToken)
curl -H "Authorization: Bearer $TOKEN" -F "file=@facturas/EDC_02_Hey_2025-04.pdf;type=application/pdf" \
  -F ownerEmail=owner@demo.mx localhost:3000/api/documents
# → 202 {"caseId": "...", "documentId": "...", "status": "RECEIVED"}
curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/cases/<caseId>
# → status EXTRACTED (or AWAITING_OWNER when the validators fail), with the extraction,
#   the checks and every tier attempt
```

The API stores the file in S3 (Floci) and queues a job on SQS; the `worker` service runs the
cascade, writes the result to Postgres and runs the eligibility policy (`make logs` to watch it).

Add an invoice to the same case so both are decided together (synthetic CFDIs in `samples/cfdi/`):

```bash
curl -H "Authorization: Bearer $TOKEN" -F "file=@samples/cfdi/factura-ppd-anchor.xml;type=application/xml" \
  localhost:3000/api/cases/<caseId>/documents
curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/cases/<caseId>     # decision: outcome, score, rules, missing info, suggested advance
```

## The clarification loop (owner)

When a decision is `NEEDS_INFO`, the API emails the document owner (`ownerEmail` at upload) a magic link.
Open Mailpit at http://localhost:8025 to see it. The link opens the owner page; the API side is:

```bash
curl -H "X-Owner-Token: <token from the email>" localhost:3000/api/owner/request
curl -H "X-Owner-Token: <token>" -H 'content-type: application/json' \
  -d '{"answers":[{"code":"INVOICE_DUE_DATE","value":"2026-12-20"}]}' localhost:3000/api/owner/answers
# → {"status":"DECIDED","outcome":"QUALIFIES",...}; the link is single-use
```

## Extraction eval and LLM modes

```bash
make eval          # T0 → T1 OCR → T2 classifier → T3 Haiku → T4 Opus agent (LLM replayed from fixtures/llm)
make eval-t0       # deterministic baseline only
make eval-record   # record missing LLM fixtures (needs ANTHROPIC_API_KEY in .env)
make train-classifier  # retrain the T2 line classifier (labels come from T0-validated documents)
```

`LLM_MODE` controls the LLM tiers everywhere (API and eval): `replay` (default, no key needed),
`record`, `live`, `off`. See [`eval/README.md`](eval/README.md) and ADR 0004.

## Other commands

```bash
make logs                              # follow api + web logs
make sh                                # shell in a tools container (pnpm available)
make migrate                           # run TypeORM migrations
make migration-generate name=AddX      # generate a migration from entity changes
make lint typecheck format
make build-images                      # production images (api-runtime, web-runtime)
make clean                             # stop and DELETE volumes (db data, node_modules)
```

## CI/CD and deploy

- **CI** (`.github/workflows/ci.yml`) runs on every PR: lint, typecheck, unit and integration tests;
  `terraform validate` plus `apply envs/local` on Floci; the stack with smoke, Playwright and Artillery;
  and the production image builds.
- **Deploy** (`.github/workflows/deploy.yml`): OIDC to AWS, then ECR, `terraform apply`, the migration
  task, ECS rollout, and the web app to S3 + CloudFront. It is gated on the `AWS_DEPLOY_ROLE_ARN`
  repository variable and was not run for the worksample.
- **The plan** (architecture, first-time setup, rollback, gaps) is in [`docs/deploy.md`](docs/deploy.md).

```bash
make tf-validate   # terraform fmt + validate, local and prod
make tf-local      # create the local AWS resources in Floci with the same module as prod
```

## Dataset

Put the development files in `facturas/` (git-ignored: they belong to the evaluators and are not
redistributed).

## Repository layout

```
apps/api            NestJS, hexagonal: domain/ · application/ (use cases, ports) · infrastructure/ (adapters) · interfaces/ · bootstrap/
apps/web            Vite + React (supplier, analyst, owner screens)
packages/contracts  zod schemas shared by api and web
tests/e2e           Playwright
tests/load          Artillery
docker/             Dockerfile (dev, api-runtime, web-runtime targets)
docs/               SPEC, ADRs, eligibility policy, plan, dev log, harness
.claude/            Claude Code harness: subagents, hooks, permissions (docs/harness)
```

## Documentation

- [`docs/SPEC.md`](docs/SPEC.md): problem, dataset findings, assumptions, scope
- [`docs/adr/`](docs/adr): design decisions and why
- [`docs/eligibility-policy.md`](docs/eligibility-policy.md): the policy used to decide
- [`docs/harness/`](docs/harness): how the development environment with agents is set up
- [`docs/dev-log/`](docs/dev-log): prompts and artifacts from each development session

## Contributing

Semantic commits (`<type>(<scope>): <subject>`), enforced by commitlint. Work on feature branches
with one commit per step and a PR per branch.
