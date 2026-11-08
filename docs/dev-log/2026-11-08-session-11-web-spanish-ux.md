# Session 11 — Spanish-only UI and UX pass (2026-11-08)

**Prompt.** "let's improve the mixing the english and spanish we should only have spanish and lets
improve the ui ux experience using the best practices use the skill reactjs"

**Skills.** `vercel-react-best-practices` and `web-design-guidelines` (installed in the harness PR,
after reading them). The guidelines ask for English Title Case; the app uses Spanish sentence case and
"usted" instead.

**Decision.** Validators keep their English `detail`, because the T3/T4 prompts include it and changing
it would invalidate the recorded fixtures. They gain a Spanish `message`, which is what people see. The
eval is identical apart from timings.
