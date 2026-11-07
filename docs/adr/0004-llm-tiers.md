# ADR 0004 — LLM tiers: Claude Haiku then Opus, replayable

**Status:** accepted

**Decision.**
- **Models:** T3 = `claude-haiku-5-5`, T4 = `claude-opus-5-5`, behind `LlmPort`.
- **Input:** only the failing section, as text plus a page image.
- **Output:** strict JSON via tool use, with a schema shared with the domain (zod).
- **Settings:** temperature 0, model ID pinned, prompts versioned in `prompts/`.
- **Reproducibility:** every response is stored under `fixtures/llm/<sha256(file+section+prompt version+model)>.json`.
  - `LLM_MODE=replay` (default for evaluators): reads fixtures and needs no API key.
  - `LLM_MODE=live` calls the API.
  - `LLM_MODE=record` calls the API and writes fixtures.
- **Trust:** the LLM never decides eligibility. Its output must pass the same validators as every
  other tier.

**Why.** The evaluators must get identical results by following the README. Replaying recorded
responses gives that guarantee. Running live on the hidden set is also supported and documented.
