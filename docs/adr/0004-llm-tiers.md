# ADR 0004 — LLM tiers: Claude Haiku then Opus, replayable

**Status:** accepted (revised 2026-11-07 while implementing, see "Changes from the first draft")

**Decision.**

- **Models:** T3 = `claude-haiku-5-5`, T4 = `claude-opus-5-5`, behind `LlmPort` (slots `basic` / `big`,
  overridable with `LLM_MODEL_BASIC` / `LLM_MODEL_BIG`).
- **T3:** one structured-output call (`output_config.format` with a JSON schema) over the repaired page
  text. It extracts from scratch; the earlier tier's failed checks go in as a hint.
- **T4:** the extraction repair agent (ADR 0010). It edits the best candidate through small tools.
- **Output:** amounts in pesos on the wire, cents in the domain. Rows the model takes from the summary
  section (interest, tax, fees not listed as rows) are marked `fromSummary` and prefixed `[resumen]`.
- **Settings:** model ids pinned, effort set per tier (`medium` for T3, `high` for T4), prompts versioned in
  `apps/api/src/infrastructure/extraction/llm/prompts.ts`. The big model opts into server-side refusal
  fallback (`fallbacks: "default"`).
- **Reproducibility:** every response is stored as `fixtures/llm/<purpose>/<sha256(canonical request)>.json`.
  - `LLM_MODE=replay` (default for evaluators): reads fixtures and needs no API key.
  - `LLM_MODE=record` calls the API for requests without a fixture and writes them.
  - `LLM_MODE=live` calls the API and writes nothing. `LLM_MODE=off` disables the LLM tiers.
  - A miss in replay mode skips the tier (reported in the eval); it never crashes the pipeline.
- **Trust:** the LLM never decides eligibility. Its output must pass the same validators as every
  other tier, and a later tier replaces a candidate only if it fails fewer blocking checks.
- **Flag, never fix, the document (added 2026-11-08).** A repair that makes the arithmetic pass by
  moving rows from where the bank printed them, or by adding rows that only the summary shows, adds the
  blocking check `rows-as-printed` (`domain/validation/repair-flags.ts`). The document then goes to
  review (owner question + analyst). T4 reports the rows it reordered; summary-only rows are counted
  for every tier. The T4 prompt (`t4-repair-statement@v2`) says which failures are the document's.

**Why.** The evaluators must get identical results by following the README. Replaying recorded
responses gives that guarantee. Running live on the hidden set is also supported and documented.

**Changes from the first draft.**

| Draft                                   | Now                                         | Why                                                                                                                                         |
| --------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict JSON via forced tool use         | Structured outputs (`output_config.format`) | Opus 5.5 rejects forced `tool_choice`; structured outputs give the same schema guarantee for single calls                                   |
| Temperature 0                           | Model defaults + fixtures                   | Current models do not accept sampling parameters; reproducibility comes from replay, not sampling                                           |
| Key = file + section + prompt + model   | Key = hash of the whole canonical request   | Covers everything that changes the answer (input text, schema, agent history), so stale fixtures miss instead of replaying the wrong answer |
| Failing section as text plus page image | Text only                                   | Page images are a follow-up (`get_page_image`); the dev set's failures are in text pages                                                    |
| Prompts in `prompts/`                   | Prompts in code, versioned constants        | They ship with the API image and their version is part of the fixture key                                                                   |

**What the first recording showed (2026-11-08).** With prompt v1, T4 made both known-anomaly
documents pass. On Fondeadora it moved the interest and ISR rows earlier and re-dated them; on Nu it
added the summary-only interest. Field accuracy was the same, but "known anomalies flagged" fell from
2/2 to 0/2, and the decisions became QUALIFIES / DOES_NOT_QUALIFY instead of NEEDS_INFO. The agent was
transparent in its notes, but the notes are not part of the decision. The guard above works whatever
the model does; prompt v2 makes the agent stop earlier (Nu: 95 s → 8 s).

**Addendum (2026-11-08): what the document prints beyond its movements.** The flag-never-fix rule stands
for rows: no tier moves or invents them. Three cases are now resolved without asking the owner, always
verified by the domain (`adjustStatement`, every tier):

- **Internal transfers.** Mirror pairs (same date, amount and concept, opposite side) are marked `internal`
  only if removing them makes the rows match the totals the bank printed. They stay visible but do not count.
- **Summary-only amounts** (e.g. interest). T0 reads known labels; T3 reports `summaryItems` and T4 calls
  `add_summary_item` for any other concept. They count only if they close the difference to the cent.
- **Rows printed out of order.** A broken running balance is a notice when the statement reconciles and the
  breaks are a few rows in the last 20% of the table. Anywhere else it stays blocking.

Prompts are `t3-extract-statement@v2` and `t4-repair-statement@v3`. With these rules T0 resolves the whole
development set, so the earlier fixtures were removed.
