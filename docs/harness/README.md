# Development harness

How this project is built with AI agents (deliverable: "tu harness").

| Piece                | Where                                            | Purpose                                                                            |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Project instructions | `CLAUDE.md`                                      | Architecture rules, semantic commits, dataset gotchas, workflow                    |
| Decisions            | `docs/adr/`                                      | Why each design choice was made; the agent reads them before changing design       |
| Subagents            | `.claude/agents/` (drafts in `proposed/agents/`) | `bank-layout-analyst`, `ground-truth-labeler`, `architecture-guard`, `eval-runner` |
| Hooks                | `.claude/hooks/` (drafts in `proposed/hooks/`)   | Hexagonal boundary guard after each edit; block destructive git / commits on main  |
| Git hooks            | `.husky/`                                        | commitlint (semantic commits) and format + lint, run inside Docker                 |
| Lint boundaries      | `eslint.config.mjs`                              | Same hexagonal rules, enforced in CI                                               |
| Dev log              | `docs/dev-log/`                                  | Prompts and decisions from each session                                            |

The `.claude/` files are installed only after the developer reviews them; the coding agent is not
allowed to change its own permissions and hooks without approval.
