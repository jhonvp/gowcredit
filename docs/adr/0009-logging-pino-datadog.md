# ADR 0009 — Logging and observability: pino + Datadog

**Status:** accepted

**Decision.**

**Logger: `nestjs-pino`.** It replaces Nest's default logger.
- Output is JSON lines on stdout.
- Every HTTP request gets a request id automatically.
- `pino-pretty` is used in local dev only.

**APM: `dd-trace`.** It is initialized before Nest boots (`src/tracing.ts`, imported first in `main.ts`).
- `logInjection: true` adds `dd.trace_id` / `dd.span_id` to every pino line.
- Logs and traces are correlated in Datadog.
- Custom spans for each cascade tier: `cascade.tier`, with tags `tier`, `section`, `bank`, `outcome`.

**Shipping.**
- **Production (ECS Fargate):** a Datadog Agent sidecar container in each task definition
  (APM on 8126). Logs go through FireLens (Fluent Bit) to Datadog. The API key comes from
  Secrets Manager. All of it is defined in Terraform.
- **Local:** logs go to stdout only. The `datadog-agent` service in Docker Compose sits behind a
  profile (`docker compose --profile observability up`). The evaluators don't need a Datadog
  account to run the system. `DD_TRACE_ENABLED=false` by default.

**Structured context in every log line.** `caseId`, `documentId`, `docType`, `tier`, `section`,
`model`, `tokensIn/out`, `costUsd`, `durationMs`, `validator`, `outcome`, `policyVersion`.

**Metrics (DogStatsD through dd-trace).**
- `extraction.tier.resolved{tier}`
- `extraction.escalations{from,to}`
- `llm.cost_usd{model}`
- `eligibility.outcome{outcome}`
- `clarification.sent / answered`

**PII.** The pino `redact` paths mask RFC, CLABE, account numbers, names, emails and raw document
text. Extracted values are never logged, only field names and validation results.

**Terraform (optional module `observability/`).** Datadog provider resources:
- Monitors for SQS DLQ depth, LLM cost per day and error rate.
- One dashboard.

**Why.**
- pino is the fastest structured logger for Node and has first-class Nest integration.
- Datadog correlates logs, APM and metrics, so you can see why a document escalated to Opus and
  what it cost, all in one trace.
- The logger is set up through a Nest module, so the domain stays free of logging dependencies.
  Use cases log through an injected `LoggerPort`.
