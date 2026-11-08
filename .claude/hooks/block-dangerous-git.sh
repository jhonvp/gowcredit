#!/usr/bin/env bash
# PreToolUse hook (Bash): block destructive git operations and commits on main.
cmd=$(jq -r '.tool_input.command // empty')
echo "$cmd" | grep -qE "git push.*(--force|-f\b)|git reset --hard|git clean -fd" && { echo "Blocked destructive git command. Ask the user first." >&2; exit 2; }
if echo "$cmd" | grep -qE "git commit" && [[ "$(git -C "$CLAUDE_PROJECT_DIR" branch --show-current 2>/dev/null)" == "main" ]]; then
  echo "Do not commit on main: use a feature branch and open a PR." >&2; exit 2
fi
exit 0
