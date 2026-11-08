# Session 10 — security hardening (2026-11-08)

**Prompt.** "Lets install this skill … typescript-security-review and make the check and apply best
practices", then "fix all" for the review's six findings.

**What the review found and what changed.**

| Finding                                                                              | Fix                                                                                       |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| No login rate limit                                                                  | `@nestjs/throttler` on the login route: per email and per IP, 429 + `Retry-After`         |
| Owner token in the URL path (CDN/ALB logs, history, Referer)                         | `/owner#<token>`; `referrer=no-referrer`; old links redirect                              |
| No security headers                                                                  | helmet on the API; CloudFront response headers policy (CSP, HSTS, DENY…) for the web      |
| JWT trusted the role in the token; no iss/aud                                        | iss/aud pinned; user and role read from the DB per request                                |
| Same error → 415 on one route, 400 on another                                        | one `ApplicationErrorFilter`                                                              |
| React: no hooks lint, stale viewer responses and leaked blob URLs, no error boundary | `eslint-plugin-react-hooks`, cancelled effect, `ErrorBoundary`; Owner page on React Query |

**Notes.**

- The throttler only sends a plain `Retry-After` header for the throttler named `default`; named ones get
  a suffix (`Retry-After-login-ip`). The per-email limit is therefore named `default`.
- The CSP was checked against the production build (`vite preview` with the same headers): the
  Playwright suite has no CSP violations, and in a real Chrome the PDF viewer (a `blob:` iframe, which
  inherits the page's CSP) still renders. That is why `object-src` allows `blob:`.
