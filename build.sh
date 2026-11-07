#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if command -v go >/dev/null 2>&1; then go clean -cache; fi
trap 'rm -rf .artifacts' EXIT
node scripts/bump-version.mjs
node scripts/generate-icons.mjs
pnpm exec vite build --mode "${1:-production}"
node scripts/build-extension.mjs
node scripts/verify-build.mjs
