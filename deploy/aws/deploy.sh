#!/bin/bash
# Deploy one release on the instance. Run by GitHub Actions over SSH after it has
# unpacked the release into ~/greenbranch/releases/<sha>:
#
#   bash ~/greenbranch/releases/<sha>/deploy/aws/deploy.sh <sha>
#
# Builds and starts the stack, waits for both /health endpoints, and switches back
# to the previous release if they don't pass within 90 seconds.
set -euo pipefail

SHA="${1:?usage: deploy.sh <release-sha>}"
ROOT="$HOME/greenbranch"
NEW="$ROOT/releases/$SHA"
CURRENT="$ROOT/current"
PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"

[ -f "$ROOT/.env" ] || { echo "Missing $ROOT/.env (see deploy/aws/.env.example)"; exit 1; }
[ -f /var/lib/greenbranch-setup-done ] || { echo "Instance setup has not finished yet"; exit 1; }

compose() {  # compose <release-dir> <args…>
  local dir="$1"; shift
  ln -sf "$ROOT/.env" "$dir/deploy/aws/.env"
  docker compose -f "$dir/deploy/aws/docker-compose.yml" "$@"
}

healthy() {  # both backends answer /health from inside their containers
  local dir="$1" service port
  for service in server-ai:8000 server-ec2:8001; do
    port="${service#*:}"
    compose "$dir" exec -T "${service%%:*}" python -c \
      "import urllib.request; urllib.request.urlopen('http://localhost:$port/api/v1/health', timeout=5)" \
      >/dev/null 2>&1 || return 1
  done
}

wait_healthy() {
  local dir="$1"
  for _ in $(seq 1 18); do
    healthy "$dir" && return 0
    sleep 5
  done
  return 1
}

echo "▶ Deploying $SHA"
compose "$NEW" up -d --build --remove-orphans

if wait_healthy "$NEW"; then
  ln -sfn "$NEW" "$CURRENT"
  echo "✓ $SHA is live"
  # Keep the three newest releases
  ls -1dt "$ROOT"/releases/*/ | tail -n +4 | xargs -r rm -rf
  docker image prune -f >/dev/null
  exit 0
fi

echo "✗ Health check failed for $SHA"
compose "$NEW" logs --tail 50 server-ai server-ec2 || true
if [ -n "$PREV" ] && [ -d "$PREV" ] && [ "$PREV" != "$NEW" ]; then
  echo "↩ Rolling back to $(basename "$PREV")"
  compose "$PREV" up -d --build --remove-orphans
  wait_healthy "$PREV" && echo "✓ Rolled back" || echo "✗ Rollback is unhealthy too"
fi
exit 1
