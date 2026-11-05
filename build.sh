#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${1:-web}" != web && "${1:-web}" != safari ]]; then
  echo 'Usage: ./build.sh [web|safari]' >&2
  exit 1
fi
if command -v go >/dev/null 2>&1; then
  go clean -cache
fi
rm -rf .artifacts
pnpm run build
if [[ "${1:-web}" == safari ]]; then
  xcrun safari-web-extension-converter dist/safari \
    --project-location dist/safari-project --app-name 'Authenticator - 2FA' \
    --bundle-identifier local.Authenticator---2FA --macos-only --swift \
    --copy-resources --no-open --no-prompt --force
  xcodebuild -project 'dist/safari-project/Authenticator - 2FA/Authenticator - 2FA.xcodeproj' -scheme 'Authenticator - 2FA' \
    -configuration Release -derivedDataPath dist/safari-native \
    MACOSX_DEPLOYMENT_TARGET=13.3 ONLY_ACTIVE_ARCH=NO 'ARCHS=arm64 x86_64' CODE_SIGNING_ALLOWED=NO build
  safari_apps=(dist/safari-native/Build/Products/Release/*.app)
  test -d "${safari_apps[0]}/Contents/PlugIns"
fi
