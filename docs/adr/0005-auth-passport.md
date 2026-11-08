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

**Implementation (2026-11-07).**

- **JWTs** are HS256. `JWT_SECRET` must be at least 32 characters (in AWS it comes from Secrets Manager);
  `JWT_TTL_SECONDS` defaults to 8 hours.
- **API keys** are stored as the SHA-256 of the secret and can be revoked. A key acts as its supplier.
- **Guards.** A global `ApiAuthGuard` accepts a JWT or an API key on every route except `@Public()` ones.
  `RolesGuard` applies `@Roles()` and `@AllowPrincipals()`.
- **Isolation.** Another supplier's case returns `404`, so the API doesn't reveal that it exists.
- **Login timing.** Login verifies a hash even when the email is unknown.
- **Seeds:** `supplier@demo.mx`, `supplier2@demo.mx` (to show isolation), `analyst@demo.mx`, password
  `demo1234`, plus the key `gk_local_demo_key_0001`. Seeding is refused when `NODE_ENV=production`.
- **The owner magic link** comes with the clarification loop (next PR).
