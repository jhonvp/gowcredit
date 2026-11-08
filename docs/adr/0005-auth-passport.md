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

**Hardening (2026-11-08, security review).**

- **JWTs** also carry `iss=gowcredit-api` and `aud=gowcredit-web`, and the strategy rejects any other. After
  the signature check the user is read again: a deleted user is rejected at once, and the role comes from
  the database, not from the token. The 8-hour TTL stays, because a role change or removal no longer waits
  for expiry.
- **Login rate limit** (`@nestjs/throttler`, login route only): `LOGIN_ATTEMPTS_PER_MINUTE` per email
  (default 10) and 5x that per IP, counted before the password check; over the limit the answer is `429`
  with `Retry-After`. Counters are in memory per task. With several tasks, a shared store (Redis) would
  make the limit exact.
- **Client IP.** `TRUST_PROXY_HOPS` (2 in AWS: CloudFront, then the ALB) makes `req.ip` the client.
- **Headers.** helmet on the API. CloudFront sends a strict CSP plus `no-referrer`, `nosniff`, `DENY`
  and HSTS for the web app (`apps/web/security-headers.ts` and `infra/terraform/modules/web`).
- **Errors.** One `ApplicationErrorFilter` maps application errors to HTTP for every route.
