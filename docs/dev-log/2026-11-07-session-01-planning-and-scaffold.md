# Session 01 — Planning and scaffold (2026-11-07)

Tooling: Claude Code (Opus 5.5) in the terminal, Google Drive connector for the dataset, Docker.

## Prompts from the developer (in order, verbatim or near-verbatim)

1. Pasted the worksample brief. → "Lets plan a discuss about this"
2. "Here there files …/facturas lets discus a make me question, I would like to have this approach a cascade way first a deterministic approach, then ocr if needed, then a internal model, the basic model and big model, the tech stack it is typescript, nodejs, typeorm, migrations, docker."
3. Answers: internal model = **own trained classifier**; LLMs = **Claude Haiku → Opus**; handle **both** statements and invoices; **NestJS**.
4. "LEt's implement passport for authentication, nodemail for emails, and the architecture should be hexagonal architecture with nestjs"
5. "LEts use terraform, and the aws local stack could be floci"
6. Auth roles: supplier + analyst + owner link (+ API key).
7. "You define the eligibility policy, the deadeline two days"
8. "we should use semmantic commits in this project"
9. "The log system should be using pynno and datadog" (→ pino)
10. "What about agents? What about frontend?" → 3-screen React app; agents: extraction repair, clarification, analyst copilot; agreed cuts.
11. "lets start with git init"
12. "Remember the exagonal architecture and everything in docker"
13. "The commit should be step by step adn feature branch" + remote `jhonvp/gowcredit`
14. "LEts create the prs with fully descriptions"
15. "we should be able to test locally"
16. "Don't forget unit test, integration test, and e2e test playwrigth, load test artillery"

## What the agent found that changed the plan

- The dataset is **9 bank statements, not 10 invoices** → SPEC A1, questions to the evaluators.
- **HSBC's text layer is EBCDIC** (cp500), so it looks like text but is garbage → T0 needs a text-quality gate.
- Textless pages are **ads/notices**, not scans → classify pages before running OCR.
- Holder data is anonymized → null is a valid extraction.

## Decisions made during scaffold

| Topic              | Decision                                                                        | Why                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| TypeScript         | Pinned to **6.0.x**                                                             | The npm `latest` is TS 7 (native compiler); `@nestjs/cli@12` requires `~6.0.2` and typescript-eslint supports `<6.1` |
| API module system  | `NodeNext` → CommonJS output                                                    | TS 6 deprecates `node10` resolution; Nest still expects CommonJS                                                     |
| Vite               | `allowedHosts: ['web','localhost']`                                             | Vite 8 returned 403 to other containers; the smoke test caught it                                                    |
| Test DB            | `gowcredit_test`, created and migrated from scratch on every integration run    | Never touches dev data; also proves the migrations work                                                              |
| Playwright         | Exact `1.65.0`, matching the `mcr.microsoft.com/playwright:v1.65.0-noble` image | Browser binaries come from the image                                                                                 |
| Artillery          | `artilleryio/artillery:2.0.34`, `platform: linux/amd64`                         | Image is amd64 only                                                                                                  |
| Git remote         | SSH (`git@github.com:jhonvp/gowcredit.git`)                                     | `gh` is configured for SSH; the HTTPS push had no credentials                                                        |
| `.claude/` harness | Drafted in `docs/harness/proposed/`, installed after developer review           | The agent's auto mode correctly refused to change its own hooks/permissions                                          |
