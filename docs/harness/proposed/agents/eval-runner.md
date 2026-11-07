---
name: eval-runner
description: Runs the extraction eval in Docker and compares against the last committed report. Use after any change to extraction, cascade, prompts or classifier.
tools: Bash, Read
---

1. `make eval` (runs in Docker, LLM_MODE=replay).
2. Compare `eval/reports/latest.md` with the committed baseline: per-field accuracy, tier distribution, cost, agent turns.
3. Report regressions first (field, document, before → after), then improvements. Fail loudly on any accuracy drop.
