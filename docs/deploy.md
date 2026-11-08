# Deploy plan (AWS)

Infrastructure as code lives in `infra/terraform` (ADR 0006). The same `storage` module runs locally
against Floci (`make tf-local`) and in production. CI validates both environments on every PR.

## Architecture

```
Browser ──► CloudFront ──► S3 (web app, OAC, SPA fallback)
                 │ /api/*
                 ▼
               ALB ──► ECS Fargate "api"    (2 tasks, private subnets) ──┐
                                                                        ├──► RDS Postgres 17 (private, encrypted, backups 7 d)
             SQS extract ◄── api enqueues                                ├──► S3 documents (private, lifecycle 365 d)
                 │ (DLQ after 5 receives)                                ├──► Secrets Manager (JWT, Anthropic, Datadog, RDS-managed DB password)
                 ▼                                                       └──► SES (SMTP via Nodemailer) → owner emails
             ECS Fargate "worker" (1..6 tasks, autoscaled on queue depth)
Each task: app container + Datadog agent sidecar (APM); logs → CloudWatch (/ecs/gowcredit-prod)
```

| Module     | What it creates                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `network`  | VPC, 2 public subnets (ALB, NAT) and 2 private subnets (tasks, RDS) across 2 AZs, 1 NAT gateway                                                  |
| `storage`  | Documents bucket (public access blocked, optional KMS, lifecycle), extraction queue + DLQ (redrive after 5), app secrets                         |
| `database` | RDS Postgres 17. Master password managed by RDS in Secrets Manager. Security group only allows the app                                           |
| `app`      | ECR (immutable tags, scan on push), ECS cluster, API + worker services with circuit-breaker rollback, migrate task, ALB, IAM, worker autoscaling |
| `web`      | S3 + CloudFront (OAC); `/api/*` goes to the ALB, so the browser talks to one origin (no CORS)                                                    |

## Pipeline

| Trigger      | Workflow                | Steps                                                                                                                                                                                                                                                                                        |
| ------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pull request | `ci.yml`                | **check**: lint, typecheck, unit, integration (Postgres + Floci + Mailpit). **infra**: `terraform fmt/validate` for local and prod, `apply envs/local` on Floci. **e2e**: `make up`, smoke, Playwright, Artillery. **images**: production images build and fail fast without config          |
| Push to main | `ci.yml` + `deploy.yml` | Deploy runs only when the repository variable `AWS_DEPLOY_ROLE_ARN` is set (it is not set for the worksample). Steps: OIDC to AWS → ECR → build and push the image (tag = git sha) → `terraform apply` → migrate task → wait for services to be stable → web to S3 + CloudFront invalidation |

The extraction eval (`make eval`) is not in CI: the dataset belongs to the evaluators and is not
committed. Run it locally, or add a private dataset download step.

## First-time setup (once per AWS account)

1. **State bucket.** An S3 bucket for Terraform state (versioned). Set it as the repository variable
   `TF_STATE_BUCKET`. Locking uses S3 lockfiles (`use_lockfile`).
2. **OIDC role.** An IAM role trusted by `token.actions.githubusercontent.com` for this repository's
   `main` branch / `production` environment, with rights to apply the stack. Set it as
   `AWS_DEPLOY_ROLE_ARN`.
3. **SES.** Verify the domain (`aws_sesv2_email_identity`, then the DKIM DNS records), request
   production access, create SMTP credentials, and store the SMTP URL in the repository secret
   `SMTP_URL`.
4. **Secret values.** Terraform creates the secrets with no value, so plaintext never enters the state.
   Set them once:
   `aws secretsmanager put-secret-value --secret-id gowcredit-prod/jwt-secret --secret-string "$(openssl rand -base64 48)"`,
   and the same for `anthropic-api-key` and `datadog-api-key`.
5. **First deploy.** Run the `deploy` workflow (or push to main).
6. **Users.** Create production users. Demo seeds refuse to run when `NODE_ENV=production`.

## Releases, migrations and rollback

- **Image tags are immutable git SHAs.** A release is a new task definition revision, and ECS rolls it
  out with the deployment circuit breaker: if the new tasks fail health checks, ECS rolls back by itself.
- **Migrations run before the services roll**, as a one-off task (`node dist/migrate.js`). They must be
  backward compatible with the running version (expand, deploy, then contract in a later release), so
  that a rollback never needs a down migration.
- **Manual rollback:** re-run `deploy` on the previous commit, or
  `aws ecs update-service --task-definition <family>:<previous revision>`.
- **Poison messages** land in the DLQ after 5 receives. The case shows `FAILED`. Redrive from the
  console after fixing the cause.

## Operations

- **Datadog:** APM from the sidecar (`dd-trace`), and logs with request ids. Monitors and dashboards
  were an agreed cut (PLAN.md).
- **Scaling:** the worker scales on visible messages (target 5 per task, 1–6 tasks); the API has a
  fixed desired count of 2 behind the ALB.
- **LLM spend:** `LLM_MODE=live` in production. The T4 agent is capped at 8 turns and 1 USD per
  document; cost per document is stored with each extraction.
- **Data minimization:** documents are deleted after `document_retention_days` (default 365). Logs
  carry ids, never extracted values (CLAUDE.md).

## Known gaps before real production

- TLS between CloudFront and the ALB (an ACM certificate and an HTTPS listener). Viewers already get
  HTTPS from CloudFront.
- A second NAT gateway for AZ redundancy, and RDS Multi-AZ.
- WAF on CloudFront, rate limiting on `/api/auth/login`.
- A real SAT CFDI-status adapter (C-K6), and API key management endpoints.
