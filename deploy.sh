#!/usr/bin/env bash
set -euo pipefail

DEPLOY_ID=$(git rev-parse --short HEAD)
HEALTH_URL="https://kyle.vanhattum.xyz/health"

echo "$DEPLOY_ID" > deploy-id.txt
echo "Deploying $DEPLOY_ID..."

railway up 2>&1

echo "Waiting for $DEPLOY_ID to be live..."
for i in $(seq 1 30); do
  LIVE_ID=$(curl -sf "$HEALTH_URL" 2>/dev/null | grep -o '"deployId":"[^"]*"' | cut -d'"' -f4 || echo "")
  if [ "$LIVE_ID" = "$DEPLOY_ID" ]; then
    echo "Live! ($DEPLOY_ID)"
    rm -f deploy-id.txt
    exit 0
  fi
  sleep 5
done

echo "Timed out waiting for $DEPLOY_ID (last saw: $LIVE_ID)"
rm -f deploy-id.txt
exit 1
