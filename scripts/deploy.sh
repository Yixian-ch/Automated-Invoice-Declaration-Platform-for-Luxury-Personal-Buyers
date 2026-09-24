#!/bin/bash
# Production deploy — run ON THE SERVER (invoked by GitHub Actions over SSH,
# or manually). Pulls latest main, rebuilds images, restarts containers.
# The api container applies pending Prisma migrations itself on startup
# (see api/Dockerfile CMD: prisma migrate deploy).
set -euo pipefail

REPO_DIR="${DEPLOY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE="docker compose -f docker-compose.prod.yml"
LOCK="/tmp/ruichi-deploy.lock"

cd "$REPO_DIR"

# Serialize deploys — a second push during a running deploy waits its turn
exec 9>"$LOCK"
flock 9

echo "[deploy] $(date -Is) — fetching origin/main"
git fetch origin main
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)

# Compare against the last successfully deployed commit — not the checkout
# before the pull, which the workflow may already have advanced
STAMP=".last-deployed-commit"
BEFORE=$(cat "$STAMP" 2>/dev/null || echo "none")
echo "[deploy] deployed=${BEFORE:0:7} → target=${AFTER:0:7}"

if [ "$BEFORE" = "$AFTER" ] && [ "${FORCE:-}" != "1" ]; then
  echo "[deploy] already deployed — nothing to do (FORCE=1 to redeploy anyway)"
  exit 0
fi

echo "[deploy] building images"
$COMPOSE build --pull api web

echo "[deploy] restarting containers (api runs prisma migrate deploy on start)"
$COMPOSE up -d

# nginx 配置目录是只读挂载,up -d 不会重建容器,改了 default.conf 要显式 reload。
# 配置有语法错误就让部署失败(不写 stamp),避免旧配置悄悄留在线上
echo "[deploy] reloading nginx config"
if ! $COMPOSE exec -T nginx nginx -t; then
  echo "[deploy] ERROR: nginx config test failed — deploy aborted, old config still active"
  exit 1
fi
$COMPOSE exec -T nginx nginx -s reload

echo "[deploy] waiting for api health"
for i in $(seq 1 30); do
  if docker exec lidp_api wget -qO- http://localhost:3001/api/v1 >/dev/null 2>&1 \
     || [ "$(docker inspect -f '{{.State.Status}}' lidp_api 2>/dev/null)" = "running" ]; then
    sleep 5
    if [ "$(docker inspect -f '{{.State.Status}}' lidp_api)" = "running" ]; then
      echo "[deploy] api is running"
      break
    fi
  fi
  [ "$i" = 30 ] && { echo "[deploy] ERROR: api container not healthy"; docker logs --tail 50 lidp_api; exit 1; }
  sleep 2
done

echo "[deploy] pruning dangling images"
docker image prune -f >/dev/null

echo "$AFTER" > "$STAMP"
echo "[deploy] done — deployed ${AFTER:0:7}"
