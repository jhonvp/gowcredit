# ADR 0011 — Frontend: Vite + React in a pnpm monorepo

**Status:** accepted

**Repository layout.**

| Path | Contents |
|---|---|
| `apps/api` | NestJS |
| `apps/web` | Vite + React + TS + TanStack Query + React Router |
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
