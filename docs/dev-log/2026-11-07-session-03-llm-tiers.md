# Session 03 — LLM tiers T3/T4 with record/replay fixtures (2026-11-07)

Prompts: "yes, start feat/llm-tiers with fixtures for now" and "continue until finish but remember
create the prs and the proccess".

There was no API key in this session, so no real fixtures were recorded. Everything that can be proven
without a live model is proven with scripted models in tests. The real fixtures for the two unresolved
dev documents are recorded with `make eval-record` once a key is available.

## Design steps

1. **API constraints checked before coding** (Claude API reference, model ids and pricing as of
   2026-11-07):
   - Opus 5.5 rejects forced `tool_choice`, so T3 uses structured outputs and the agent uses `auto`
     with strict tools.
   - Current models reject `temperature`, so reproducibility comes from fixtures only.
   - Thinking blocks must go back verbatim in multi-turn loops, so they travel as `opaque` content.
   - Prices: Haiku 5.5 is $0.10/$0.50 per MTok, Opus 5.5 is $4/$20.
2. **Ports first.** `LlmPort` is provider-neutral, so the application never imports the SDK. `AgentPort`
   and `ToolLoopAgent` own the loop, so turn and cost caps are hard limits and every turn is a plain
   request that the fixtures can store.
3. **Fixture key = hash of the canonical request.** Any change to the prompt, the model, the input text
   or the agent history misses the fixture instead of replaying a stale answer.
4. **Cascade contract.** Each tier receives the best earlier candidate and its failed checks. A tier can
   report itself skipped. A later tier replaces the candidate only if it fails fewer blocking checks.
5. **T4 edits instead of rewriting.** Re-emitting a 160-row statement on every correction costs about
   10k output tokens on Opus each time. Small edit tools plus `run_validators` keep the agent cheap and
   make each change traceable.

## Bug found along the way

Writing the new `rows-well-formed` validator showed that `isIsoDate('2025-02-30')` returned true:
`Date.parse` rolls the date over to March 2. That also made `dates-in-period` vacuous for malformed
dates. T0 never produced such dates, but LLM output can. Fixed with a round-trip check. The eval
result did not change.

## Results

- 73 unit tests, all passing. New tests cover:
  - the agent loop: verbatim history, tool errors, turn cap, cost cap;
  - the adapters: strict tools, opaque thinking, fallback opt-in, pricing;
  - the fixture store, the replay miss, and record-then-replay;
  - T3 and T4 with scripted models;
  - a full T0 → T3 → T4 cascade recorded once and replayed to the identical outcome without calling the
    model.
- `make eval` (replay, no fixtures yet): 78/80 fields, 7/9 validated, 2/2 anomalies flagged. Same as the
  T0 baseline; T3/T4 are reported as skipped on Fondeadora and Nu.
- Integration test (boots `AppModule` with `ExtractionModule`) passes.

## Prompts

The runtime prompts are versioned in `apps/api/src/infrastructure/extraction/llm/prompts.ts`:

- `t3-extract-statement@v1` for T3;
- `t4-repair-statement@v1` for T4, with the agent's tools.

## Next

- Record fixtures: `make eval-record` with a key, then commit `fixtures/llm/` and the new report.
- Cascade orchestrator: per-section escalation and the SQS worker.
