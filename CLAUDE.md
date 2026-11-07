# CLAUDE.md — GowCredit worksample

Supplier early-payment eligibility: ingest bank statements / CFDI invoices → extract → validate →
decide → ask the owner when unclear. Read `docs/SPEC.md` and `docs/adr/` before changing design.

## Stack
TypeScript, Node, NestJS (hexagonal), TypeORM + migrations, Postgres, Docker Compose, Passport,
Nodemailer, Anthropic SDK, nestjs-pino + Datadog (dd-trace), Terraform (AWS; Floci locally), GitHub Actions.

## Layout
pnpm monorepo: `apps/api` (NestJS), `apps/web` (Vite + React), `packages/contracts` (zod schemas shared by both).
Domain paths below are relative to `apps/api`.

## Architecture rules
- `src/domain` is pure TS: never import Nest, TypeORM, SDKs or Node I/O there.
- New external technology = new port in `src/application/ports` + adapter in `src/infrastructure`.
- Eligibility is decided only by the domain policy engine, never by an LLM or agent.
- Runtime agents (ADR 0010) go through `AgentPort`, have turn and cost caps, and only *propose*; the domain validates and applies.
- API/web types come from `packages/contracts`; never duplicate DTOs in `apps/web`.
- Every extracted field carries provenance (tier). Every tier's output passes the domain validators.
- Schema changes only via TypeORM migrations (`npm run migration:generate`); never `synchronize: true`.
- LLM calls go through `LlmPort`; default `LLM_MODE=replay`. Record new fixtures with `LLM_MODE=record`.
- Logging: use the injected pino logger / `LoggerPort`, never `console.*`. Never log extracted values or PII (RFC, CLABE, names, raw text); log ids, tiers, validator results, costs.

## Commits — semantic commits (enforced by commitlint)
Format: `<type>(<scope>): <subject>` — subject in present tense, imperative, lowercase, no period.
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore` (also `ci`, `build`, `perf`).
Scopes (optional): `domain`, `cascade`, `t0`, `ocr`, `classifier`, `llm`, `agents`, `eligibility`,
`clarification`, `auth`, `mail`, `db`, `web`, `contracts`, `infra`, `ci`, `eval`, `harness`.
Examples: `feat(t0): detect transaction table by header synonyms`, `docs(adr): add cascade decision`.
One logical change per commit.

## Dataset gotchas
- `facturas/` = 9 bank statements (not invoices). Holder data is anonymized → null is valid.
- HSBC text layer is EBCDIC (decode as cp500). Textless pages are mostly ads: classify before OCR.
- Mercado Pago covers several months and uses a signed single amount column.

## Workflow
- Run `npm run eval` after any change to extraction; do not regress per-field accuracy.
- Save prompts used during development in `docs/dev-log/`.
