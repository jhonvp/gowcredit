#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): fast hexagonal-boundary check using only grep (no Node on the host).
# Exit code 2 sends the message back to Claude so it fixes the violation right away.
f=$(jq -r '.tool_input.file_path // empty')
[[ -z "$f" || "$f" != *.ts ]] && exit 0
[[ -f "$f" ]] || exit 0
banned="@nestjs/|from 'typeorm'|from 'pg'|nestjs-pino|from 'pino|dd-trace|@anthropic-ai/|@aws-sdk/|nodemailer|passport|from 'express'|node:fs|node:child_process"
case "$f" in
  */apps/api/src/domain/*)
    grep -nE "($banned|/application/|/infrastructure/|/interfaces/)" "$f" >&2 && { echo "Hexagonal violation: domain must be pure TS (ADR 0001)." >&2; exit 2; } ;;
  */apps/api/src/application/*)
    grep -nE "($banned|/infrastructure/|/interfaces/)" "$f" >&2 && { echo "Hexagonal violation: application depends only on domain + its ports (ADR 0001)." >&2; exit 2; } ;;
esac
grep -nE "synchronize:\s*true" "$f" >&2 && { echo "Schema changes only via migrations (CLAUDE.md)." >&2; exit 2; }
[[ "$f" == */apps/api/src/* ]] && grep -nE "console\.(log|info|warn|error|debug)" "$f" >&2 && { echo "Use LoggerPort / pino, never console.* (ADR 0009)." >&2; exit 2; }
exit 0
