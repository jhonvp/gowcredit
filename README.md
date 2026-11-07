# GowCredit — Supplier early-payment eligibility

Ingests bank statements and CFDI invoices, extracts their data through a cost-ordered cascade
(deterministic → OCR → trained classifier → Claude Haiku → Claude Opus agent → document owner),
validates it, and decides whether the supplier qualifies. When something is unclear, it asks the owner
and uses the answer.

> Status: extraction T0 (deterministic) and the LLM tiers T3/T4 are in. Eligibility and the
> clarification loop land in follow-up PRs (see [`docs/PLAN.md`](docs/PLAN.md)).

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

## Try it: upload a statement

```bash
curl -F "file=@facturas/EDC_02_Hey_2025-04.pdf;type=application/pdf" localhost:3000/api/documents
# → 202 {"caseId": "...", "documentId": "...", "status": "RECEIVED"}
curl localhost:3000/api/cases/<caseId>
# → status EXTRACTED (or AWAITING_OWNER when the validators fail), with the extraction,
#   the checks and every tier attempt
```

The API stores the file in S3 (Floci) and queues a job on SQS; the `worker` service runs the
cascade and writes the result to Postgres (`make logs` to watch it).

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
