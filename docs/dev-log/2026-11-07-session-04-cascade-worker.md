# Session 04 — Cascade orchestrator and SQS worker (2026-11-07)

Prompt: "continue until finish but remember create the prs and the proccess" (plan block 7).

## What was built

- **Per-section escalation.** When a later tier runs, the use case also scores two hybrids: the earlier
  summary with the new rows, and the new summary with the earlier rows. The variant with the fewest
  failures wins, and ties keep the earlier candidate. A unit test covers the case where T0 has the right
  summary and T3 has the right rows.
- **Intake.** `POST /api/documents` sniffs the real file type from the bytes, stores the file in S3
  (Floci), creates the case and queues a job on SQS, then returns 202. `GET /api/cases/:id` returns the
  case through the shared contract.
- **Worker.** A separate Nest application context. It long-polls SQS, moves the case to EXTRACTING with a
  compare-and-set (so duplicate deliveries are skipped), runs the cascade, and saves the extraction as
  JSONB. The case then moves to EXTRACTED or AWAITING_OWNER, or to FAILED with the message left for
  redelivery.
- **Persistence.** A migration adds the `extractions` table and the EXTRACTED status. The repository
  passes an integration test against real Postgres.

## Verification

| Check                        | Result                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `make test`                  | 81 passed                                                                                            |
| `make test-integration`      | 6 passed, including HTTP upload → S3 → SQS → worker → poppler → cascade → Postgres on real services  |
| Full stack, real statement   | Hey statement: 202, then EXTRACTED in about 7 s, 282 rows, resolved by T0                            |
| `make test-load` (`api.yml`) | 3,880 requests (436 uploads): p95 10 ms, p99 23 ms, 0 failures. The worker processed all 436 uploads |
| `make smoke`                 | 6/6                                                                                                  |

## Problems hit

- A commit subject with "EXTRACTED" failed commitlint's lower-case rule. The commit hook stopped it,
  but the staged files then went into the next commit. I split that commit with a soft reset; the branch
  was not pushed yet.
- ESLint's hexagonal boundary rule caught an application spec importing infrastructure fakes. The spec
  now has its own fakes.
- `Express.Multer.File` is not visible under the API tsconfig. The controller declares the three fields
  it uses instead.

## Known limits (follow-ups)

- A worker killed in the middle of a job leaves its case in EXTRACTING. A lease timestamp would let
  another worker take it over.
- CFDI XML is accepted and stored, then parked in AWAITING_OWNER until the CFDI parser lands (next PR).
