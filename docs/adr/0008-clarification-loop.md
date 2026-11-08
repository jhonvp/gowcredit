# ADR 0008 — Clarification loop: email + magic link

**Status:** accepted

**Flow.**

1. A validator/rule result `NEEDS_INFO` creates `ClarificationQuestion` records (typed:
   `confirm_value | provide_value | upload_document | explain_discrepancy`).
2. The case moves to `AWAITING_OWNER`.
3. Nodemailer sends an email with a magic link to `/answer/:token`.
4. The answer is stored as an `Override` with provenance `owner`, plus an audit trail.
5. Validators and eligibility run again.

**Free-text answers.** Haiku normalizes the text into the typed value. The original text is kept
and an analyst can review it.

**Why.** Reading answers from a form we control is more reliable than parsing email replies.
Locally, Mailpit lets the evaluators see and click the email.

**Implementation (2026-11-07).**

- **One open request per case.** The questions cover the decision's current `missing` items. Identical
  questions are never resent; new missing information supersedes the open request. After three rounds
  (the first plus two follow-ups), or when the case has no owner email, the request is created as
  `escalated` for an analyst and no email is sent.
- **The magic link** is a 256-bit random token in the URL fragment: `${WEB_BASE_URL}/owner#<token>`. Browsers
  never send the fragment to a server, so the token stays out of CloudFront and load balancer logs and out
  of `Referer` (the page also sets `referrer` to `no-referrer`). Links in the old `/owner/<token>` form still
  open and move the token to the fragment at once. It is valid for
  7 days and single use: only its SHA-256 is stored, and the hash is cleared when the request is answered.
  The API reads it from the `X-Owner-Token` header (passport-custom `magic-link` strategy).
- **Answers.**
  - **Typed answers** (date, yes/no) become case facts through the domain's `applyAnswers`.
  - **Free text** for a typed question is normalized by T5 (Haiku). If T5 can't read it, the API returns
    422 and asks for the form field.
  - **Explanations** are stored for an analyst and never change facts on their own.
  - **Document questions** are answered by uploading through `/api/owner/documents`.
- **Re-decision** runs right after the answers, unless a document the owner uploaded is still being
  extracted. In that case the worker decides when it finishes.
- **Question text.** T5 writes the questions, falling back to deterministic Spanish templates when the
  model is unavailable or its output is off-schema. The owner always gets a question.
