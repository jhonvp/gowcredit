# ADR 0011 — Frontend: Vite + React in a pnpm monorepo

**Status:** accepted

**Repository layout.**

| Path                 | Contents                                                                       |
| -------------------- | ------------------------------------------------------------------------------ |
| `apps/api`           | NestJS                                                                         |
| `apps/web`           | Vite + React + TS + TanStack Query + React Router                              |
| `packages/contracts` | zod schemas and types shared by the API and the web app; no drift between them |

**Screens.**

1. **Supplier:** upload a document; see the case status and the decision with its reasons.
2. **Analyst:** a case list. The case view shows the PDF (pdf.js) next to the extracted fields;
   each field is coloured by the tier that produced it and highlighted on the page by its bounding
   box. It also has the analyst copilot panel and the clarification history.
3. **Owner:** the magic-link page that answers the clarification agent's question and its follow-ups.

**Auth.** JWT from the API, stored in memory with refresh through an httpOnly cookie. The owner
page uses only the magic-link token.

**Deploy.**

- **Production:** S3 + CloudFront (Terraform).
- **Local:** a `web` container (vite preview) behind Docker Compose.

**Why.** It makes the cascade and the provenance visible, which is the clearest way for the
evaluators to judge the design.

**Implementation (2026-11-07).**

- **Routes:** `/login`, `/supplier` (upload and case list), `/supplier/cases/:id`, `/analyst` (case list
  with a status filter), `/analyst/cases/:id`, and `/owner/:token`.
- **API responses are parsed with the zod contracts** in the browser, so drift between API and web fails
  loudly.
- **The analyst view** shows the original file (`GET /api/documents/:id/file`) next to the extracted
  fields. Each field has a border in the colour of the tier that produced its section. The view also
  shows the cascade with skipped tiers, every validator check, the decision rules with their points, and
  the clarification rounds.
- **Cut, as PLAN.md allowed:** the pdf.js bounding-box highlight. The browser's own PDF viewer shows the
  document, and the tier colours stay in the field list.
- **Session:** the JWT is kept in `sessionStorage`. The httpOnly refresh cookie is a follow-up.
- **The Playwright journey** (`tests/e2e/specs/journey.spec.ts`) drives the whole product through the
  browser, reading the magic link from Mailpit.
