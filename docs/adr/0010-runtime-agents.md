# ADR 0010 — Runtime agents: only where acting autonomously helps

**Status:** accepted

**Context.** The brief asks whether we use agents and which ones. The cascade is a fixed pipeline,
and modelling it as an agent would make it slower, more expensive and harder to reproduce.

**Decision.** The pipeline stays deterministic. There are three bounded agents, all behind `AgentPort`.
They are built on the Anthropic SDK tool-use loop. Every turn is recorded so replay mode keeps working.

| Agent                                                                                                                                                                             | Model                                 | Tools                                                                                              | Limits                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Extraction repair (T4)** — extracts the failing section, runs the validators on its own output, corrects itself                                                                 | `claude-opus-5-5`                     | `get_page_text`, `get_page_image`, `run_validators`, `submit_extraction`                           | ≤ 6 turns, USD cost cap per document, output still goes through the domain validators |
| **Clarification (T5)** — writes the question in Spanish from the failed checks; turns a free-text answer into a typed override, asks a follow-up, or sends the case to an analyst | `claude-haiku-5-5` (Opus as fallback) | `get_case_context`, `get_failed_checks`, `propose_override`, `ask_followup`, `escalate_to_analyst` | ≤ 2 follow-ups; cannot change the eligibility outcome directly                        |
| **Analyst copilot** — answers "why this decision / where does this value come from"                                                                                               | `claude-haiku-5-5`                    | read-only: `get_case`, `get_decision_trace`, `get_field_provenance`                                | Read-only; it can't take any action                                                   |

**Why not the Claude Agent SDK.** It is heavy for a stateless queue worker. The plain SDK gives full
control over turns, cost caps and recording.

**Guardrails.**

- Agent outputs are proposals; the domain validates and applies them.
- Tool calls are logged with Datadog spans per turn.
- The eval reports turns and cost per agent.
