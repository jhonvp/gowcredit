# Development harness

How this project is built with AI agents (deliverable: "tu harness").

| Piece                | Where               | Purpose                                                                            |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| Project instructions | `CLAUDE.md`         | Architecture rules, semantic commits, dataset gotchas, workflow                    |
| Decisions            | `docs/adr/`         | Why each design choice was made; the agent reads them before changing design       |
| Subagents            | `.claude/agents/`   | `bank-layout-analyst`, `ground-truth-labeler`, `architecture-guard`, `eval-runner` |
| Hooks                | `.claude/hooks/`    | Hexagonal boundary guard after each edit; block destructive git / commits on main  |
| Git hooks            | `.husky/`           | commitlint (semantic commits) and format + lint, run inside Docker                 |
| Lint boundaries      | `eslint.config.mjs` | Same hexagonal rules, enforced in CI                                               |
| Dev log              | `docs/dev-log/`     | Prompts and decisions from each session                                            |

The `.claude/` files (subagents, hooks, `settings.json` permissions) were drafted under
`docs/harness/proposed/`, reviewed by the developer, and then installed. The coding agent does not
change its own permissions or hooks without the developer's approval.

Hooks need `jq` on the host. `hexagonal-guard.sh` runs after every Edit/Write and returns exit 2 (the
violation goes back to the agent) for framework imports in `domain`/`application`, `synchronize: true`
and `console.*`. `block-dangerous-git.sh` runs before every Bash call and blocks force-push,
`reset --hard`, `clean -fd` and commits on `main`.
