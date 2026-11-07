# ADR 0001 — Hexagonal architecture on NestJS

**Status:** accepted

**Context.** Extraction has many interchangeable technologies: pdf text, OCR, a trained classifier,
two LLMs, email, storage, queue. Each of them changes between local and cloud.

**Decision.** Ports and adapters.
- `domain/` is pure TypeScript: entities, value objects, validators, eligibility rules. It imports
  nothing from Nest or TypeORM.
- `application/` holds the use cases and the ports (interfaces).
- `infrastructure/` holds the adapters: TypeORM, pdfjs, tesseract, onnx/JSON model, Anthropic,
  Nodemailer, Passport, S3, SQS.
- `interfaces/` holds the HTTP controllers and the CLI.
- Nest modules only wire ports to adapters through DI tokens.

**Consequences.**
- Domain and cascade logic can be unit-tested without I/O.
- Swapping Floci for AWS, or Mailpit for SES, is a configuration change.
- More files than a plain Nest app.
