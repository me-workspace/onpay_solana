#!/usr/bin/env bash
# ============================================================================
# OnPay — deploy script (runs ON the VPS, not locally).
#
# Usage:
#   ssh deploy@onpay.id "cd onpay_solana && ./deploy/deploy.sh"
# or via GitHub Actions, which just SSHes in and runs this.
#
# Steps:
#   1. Pull main
#   2. Install deps (frozen lockfile)
#   3. Run migrations
#   4. Build (standalone)
#   5. Stage the build so PM2 can swap it atomically
#   6. Reload PM2 with the new .env.production loaded
#   7. Health-check the new process
# ============================================================================
set -euo pipefail

REPO_DIR="/home/deploy/onpay_solana"
APP_NAME="onpay"
# OnPay binds to 3456 on this VPS because 3000/3001 are taken by other
# Wira projects. Keep this in sync with ecosystem.config.cjs.
HEALTH_URL="http://127.0.0.1:3456/api/health"

echo "==> Deploying $APP_NAME"
cd "$REPO_DIR"

echo "==> git reset --hard origin/main"
# We treat the VPS working tree as disposable — the canonical source of
# truth is origin/main. Any local diffs (executable bits from chmod,
# one-off manual fixes, etc.) get wiped. Do NOT edit code on the VPS
# directly; make the change, commit, push, then deploy.
git fetch --quiet
git reset --hard origin/main

echo "==> npm ci"
npm ci --no-audit --no-fund

echo "==> db:migrate"
# Drizzle reads DATABASE_URL from .env.local, but prod uses .env.production.
# Point drizzle-kit at the prod env file for this one command.
set -a
# shellcheck disable=SC1091
source .env.production
set +a
npm run db:migrate

echo "==> next build (standalone)"
npm run build

echo "==> copy static assets into the standalone bundle"
# Next's standalone output excludes the static folder and the public folder;
# we have to copy them over manually so they're served by the embedded server.
cp -R .next/static .next/standalone/.next/static
if [ -d "public" ]; then
  cp -R public .next/standalone/public
fi

echo "==> reload PM2"
# shellcheck disable=SC2046
export $(grep -v '^#' .env.production | xargs -d '\n' -I {} echo {})
pm2 reload ecosystem.config.cjs --update-env

echo "==> wait for process to settle"
sleep 5

echo "==> health check"
if ! curl -fsS "$HEALTH_URL" > /dev/null; then
  echo "ERROR: health check failed at $HEALTH_URL"
  pm2 logs "$APP_NAME" --lines 30 --nostream
  exit 2
fi

echo "==> deploy complete"
pm2 status
