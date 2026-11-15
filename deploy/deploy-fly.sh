#!/usr/bin/env bash
# Deploy Fusion (github.com/Runfusion/Fusion) to Fly.io.
#
#   FLY_API_TOKEN=... FLY_APP=fusion-dashboard ./deploy/deploy-fly.sh
#
# Optional:
#   FUSION_REF              git ref of Runfusion/Fusion to deploy (default: main)
#   FLY_REGION              primary region (default: iad)
#   FUSION_DASHBOARD_TOKEN  stable bearer token for the dashboard
#   ANTHROPIC_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY / GITHUB_TOKEN
#                           forwarded to the app as Fly secrets
#
# Requires: git and flyctl (curl -L https://fly.io/install.sh | sh).
# Docker is not needed — Fly's remote builder builds the repo's Dockerfile.
set -euo pipefail

REPO_URL="https://github.com/Runfusion/Fusion"
REF="${FUSION_REF:-main}"
APP="${FLY_APP:-fusion-dashboard}"
REGION="${FLY_REGION:-iad}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"

FY="$(command -v flyctl || command -v fly || true)"
[ -n "$FY" ] || { echo "missing flyctl — curl -L https://fly.io/install.sh | sh" >&2; exit 1; }
command -v git >/dev/null || { echo "missing git" >&2; exit 1; }

echo "==> Fetching $REPO_URL @ $REF"
git clone --depth 1 --branch "$REF" --quiet "$REPO_URL" "$WORK/fusion"
cp "$HERE/fly.toml" "$WORK/fusion/fly.toml"
sed -i "s/^app = .*/app = \"$APP\"/; s/^primary_region = .*/primary_region = \"$REGION\"/" \
  "$WORK/fusion/fly.toml"

echo "==> Ensuring app exists"
if ! "$FY" apps list --json | grep -q "\"$APP\""; then
  "$FY" apps create "$APP"
fi

echo "==> Ensuring volumes exist (both path- and region-bound)"
for vol in fusion_home fusion_workspace; do
  if ! "$FY" volumes list -a "$APP" --json | grep -q "\"$vol\""; then
    "$FY" volumes create "$vol" -a "$APP" --region "$REGION" --size 20 --yes
  fi
done

echo "==> Secrets"
if [ -n "${FUSION_DASHBOARD_TOKEN:-}" ]; then
  "$FY" secrets set -a "$APP" "FUSION_DASHBOARD_TOKEN=$FUSION_DASHBOARD_TOKEN"
fi
for key in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY GITHUB_TOKEN; do
  if [ -n "${!key:-}" ]; then "$FY" secrets set -a "$APP" "$key=${!key}"; fi
done

echo "==> Building and deploying (remote builder; the first build is slow)"
cd "$WORK/fusion"
"$FY" deploy --remote-only --ha=false

echo "==> https://$APP.fly.dev"
