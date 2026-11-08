# ADR 0006 — AWS with Terraform; Floci for local emulation

**Status:** accepted (replaces an earlier GCP option)

**Decision.**

| Need          | Production                            | Local              |
| ------------- | ------------------------------------- | ------------------ |
| API + worker  | ECS Fargate (one image, two services) | Containers         |
| Database      | RDS Postgres                          | Postgres container |
| Documents     | S3                                    | Floci S3           |
| Cascade queue | SQS + DLQ                             | Floci SQS          |
| Secrets       | Secrets Manager                       | Floci / `.env`     |
| Email         | SES (Nodemailer transport)            | Mailpit            |
| Images        | ECR                                   | Local build        |

Terraform modules are shared by `envs/local` (provider endpoints → `http://localhost:4566`, Floci)
and `envs/prod` (S3 backend for state).

**Why Floci.** It is an MIT-licensed LocalStack replacement (the LocalStack community edition was
sunset in March 2026), it runs on port 4566 and works with the standard AWS provider.
**Risk:** fidelity is lower than real AWS. Mitigation: we only use core services (S3, SQS, Secrets
Manager), and the prod plan is validated with `terraform validate/plan`.

**CI/CD (GitHub Actions).**

- **PR:** lint, typecheck, unit tests, then Floci as a service: `terraform apply envs/local`,
  integration tests, extraction eval.
- **main:** OIDC → `terraform apply envs/prod` → push to ECR → ECS deploy (documented; not run for
  the worksample).

**Implementation (2026-11-07).**

- **Modules:** `network`, `storage`, `database`, `app` and `web` in `infra/terraform/modules`.
  - `envs/local` applies `storage` to Floci (`make tf-local`), creating the same bucket, queue and DLQ
    names the app uses locally.
  - `envs/prod` composes every module and uses an S3 backend with lockfiles.
- **CI** (`.github/workflows/ci.yml`) runs `make tf-validate` and `make tf-local` on every PR, next to the
  checks, the e2e and load tests, and the image builds. `deploy.yml` is gated on `AWS_DEPLOY_ROLE_ARN`.
- **The extraction eval stays out of CI**, because the dataset is not committed.
- **The plan, first-time setup, rollback and known gaps** are in `docs/deploy.md`.
