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
