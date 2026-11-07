#!/usr/bin/env sh
# Smoke test for the running local stack (`make up` first). Runs inside the tools container.
set -u
fail=0
check() {
  name=$1; url=$2; expect=${3:-200}
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url")
  if [ "$code" = "$expect" ]; then echo "  ok    $name ($url)"; else echo "  FAIL  $name ($url) → $code"; fail=1; fi
}
echo "Smoke test:"
check "api health"  http://api:3000/health
check "web"         http://web:5173/
check "web → api"   http://web:5173/api/health 404
check "floci"       http://floci:4566/_localstack/health
check "mailpit"     http://mailpit:8025/
exit $fail
