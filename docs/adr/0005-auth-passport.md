# ADR 0005 — Authentication with @nestjs/passport

**Status:** accepted

| Actor          | Strategy                                                               | Access                           |
| -------------- | ---------------------------------------------------------------------- | -------------------------------- |
| Supplier       | `local` → `jwt`                                                        | Their own documents and cases    |
| Analyst        | `local` → `jwt`                                                        | All cases, overrides, re-runs    |
| Document owner | `magic-link` (signed, single-use, expiring token tied to one question) | Answer that question only        |
| Integration    | `headerapikey` (hashed key in DB)                                      | Upload documents through the API |

- Authorization uses `RolesGuard` with the `@Roles()` decorator.
- Passwords are hashed with argon2.
- Seed users are created for each role so the evaluators can run the full flow.
