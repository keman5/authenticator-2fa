#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

extension_root="$HOME/Library/Application Support/Authenticator - 2FA/Local Extensions"
safari_source='dist/safari-native/Build/Products/Release/Authenticator - 2FA.app'
safari_app='/Applications/Authenticator - 2FA.app'
test -d "$safari_source/Contents/PlugIns"
for target in edge firefox; do
  test -f "dist/$target/manifest.json"
  mkdir -p "$extension_root/$target"
  rsync -a --delete "dist/$target/" "$extension_root/$target/"
  cmp "dist/$target/manifest.json" "$extension_root/$target/manifest.json"
done
if [[ -e "$safari_app" ]]; then
  installed_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$safari_app/Contents/Info.plist")
  [[ "$installed_id" == local.Authenticator---2FA ]]
fi
ditto "$safari_source" "$safari_app"
entitlements_file=$(mktemp)
trap 'rm -f "$entitlements_file"' EXIT
cat > "$entitlements_file" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>com.apple.security.app-sandbox</key><true/>
<key>com.apple.security.files.user-selected.read-only</key><true/>
</dict></plist>
PLIST
codesign --force --sign - --entitlements "$entitlements_file" "$safari_app/Contents/PlugIns/Authenticator - 2FA Extension.appex"
/usr/libexec/PlistBuddy -c 'Add :com.apple.security.network.client bool true' "$entitlements_file"
codesign --force --sign - --entitlements "$entitlements_file" "$safari_app"
codesign --verify --deep --strict "$safari_app"
test -f "$safari_app/Contents/PlugIns/Authenticator - 2FA Extension.appex/Contents/Resources/manifest.json"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$safari_app"
pluginkit -a "$safari_app/Contents/PlugIns/Authenticator - 2FA Extension.appex"
printf 'Local extension resources: %s\nSafari container: %s\n' "$extension_root" "$safari_app"
echo 'Browser loading and enabling remain manual. Existing browser profiles are unchanged.'
