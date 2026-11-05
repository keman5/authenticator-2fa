# Authenticator - 2FA

An independently written WebExtension for TOTP, HOTP and Steam codes. This branch replaces the previous application's implementation, UI, storage model and artwork. The prior MIT notice is retained in `docs/previous-license.txt`; Git history is retained. This is not a certified clean-room rewrite.

## Use

- Add accounts manually, import `otpauth://` links, QR images, Google migration QR codes, or JSON backups. Search, edit and reorder accounts from the code list.
- Click a code to copy it. HOTP advances after copying. Optional page fill writes only to identifiable OTP inputs and never submits a form.
- Password protection is off initially. Enable a screen password in Settings; one character is sufficient. This is an **interface lock**: account secrets remain unencrypted in this extension's local storage.
- Enable direct entry explicitly in Settings. The `open-direct` command defaults to Command+Shift+8 on macOS / Ctrl+Shift+8 elsewhere. The normal action defaults to Command+Shift+2 / Ctrl+Shift+2. Browser conflicts may require changing these shortcuts. A direct entry is consumed once and never updates the saved unlock timestamp. With the default “lock on close” setting, normal reopening requires the password. The direct-entry setting survives browser restarts.
- Auto-lock defaults to closing the panel. Other choices are 30 seconds, every minute from 1–10 minutes, 30 minutes, every hour from 1–24 hours, every day from 3–30 days, or forever. Successful password or Touch ID authentication starts a fresh deadline. Normal reopening and browser restart preserve access until that deadline; activity and shortcut bypass do not extend it. Explicit Lock clears the cached timestamp, including for forever. Timed panels check expiry once per second.
- Optional Touch ID on supported Macs verifies a fingerprint through Apple LocalAuthentication. Set a screen password first, then enable Touch ID in Settings. It does not encrypt local account data.
- Export an encrypted backup with a separate password, or an explicitly selected plaintext JSON/URI file. Backups contain accounts, not the screen password or cloud recovery key.
- Encrypted browser sync uses a separate recovery key. Create a sync group on the first device, copy its recovery key, then join on another device using the same browser sync account. Preferences and screen passwords remain local. Safari's `storage.sync` is local only, so this sync option is disabled there. Different browser vendors do not share their sync services.

## Local development and builds

Requires Node.js 24 and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run build
./build.sh package
```

`build.sh` performs all builds locally and cleans Go's build cache when Go is available, plus this project's `.artifacts` cache. Output resources are `dist/chrome`, `dist/edge`, `dist/firefox` and `dist/safari`. Package archives and a review-source archive appear in `artifacts/`. Third-party license notices are included. No build installs an extension, modifies browser profiles or publishes a release.

For a universal macOS Safari container, install Xcode and run:

```sh
./build.sh safari
```

This generates a new `Authenticator Workspace.app` with bundle identifier `local.Authenticator-Workspace`, built for arm64 and x86_64, under `dist/safari-native/Build/Products/Release/`. It is unsigned. Safari distribution requires Apple signing and the applicable distribution workflow. The extension inside retains the product name Authenticator - 2FA.

## Touch ID on macOS

Chrome, Edge and Firefox need the local native-messaging companion. Build it locally:

```sh
./build.sh native
```

Copy the Chromium extension ID shown in Settings, then register the companion (this command explicitly installs into your user Library and registers the three browsers):

```sh
node scripts/install-touch-id.mjs YOUR_CHROMIUM_EXTENSION_ID
```

You can pass multiple Chromium IDs separated by spaces. Firefox uses the fixed extension ID automatically; local unpacked `dist/chrome` and `dist/edge` IDs are also included. Registration allows only these exact IDs. Restart the browser after registration if needed, then use “Set up Touch ID”. No password, account secret or encryption key is sent to the native component. Cancelled or failed fingerprint verification leaves the panel locked, with the screen password available as fallback. Toolbar popups move into a persistent extension window for authentication because system dialogs can dismiss browser popups.

`./build.sh package` includes the built companion and installer in a separate macOS ZIP. After extracting it, run `node install-touch-id.mjs YOUR_CHROMIUM_EXTENSION_ID` from that folder. The companion is ad-hoc signed locally, not Developer ID signed or notarized; public distribution requires that separate signing workflow. Safari's generated app embeds the same Touch ID handler and needs no separate host registration, but must be signed and enabled through Safari's normal extension workflow.

The following background check validates the actual native framing, availability probe and installer in a disposable directory; it never requests a fingerprint or installs into your regular profile:

```sh
node scripts/check-native.mjs
```

An optional real-extension smoke check runs Edge in a temporary headless profile and removes the profile when done:

```sh
node scripts/check-ui.mjs
```

It uses the local Edge binary by default; set `EDGE_BINARY` to another Chromium-compatible binary if necessary. It does not open foreground windows or touch your everyday profile.

## Identity, migration and Firefox distribution

Firefox uses a new fixed extension ID: `{7a3868f2-5531-488e-9378-ac5c769c3c01}`. No original publisher key or store listing is reused. Chromium store identity will be assigned by the new store listing. Do not upload this as an update to someone else's listing.

The new extension cannot automatically read the previous extension's private storage. Export from the old installation first, then import here. Plain account JSON and the former PBKDF2/AES-GCM backup envelope are supported. Keep the old installation until import and code comparison succeed. Screen-lock settings and browser-sync recovery keys are not imported.

Rewriting does not bypass signing or store review. Mozilla signing is needed for ordinary Firefox installs. An unlisted signed XPI supports manual installation but does not provide automatic add-on installation through Firefox Sync. For that workflow, publish and obtain approval for your own public AMO listing, then enable add-on synchronization. Syncing the installation and syncing account records are separate operations. This repository's build does not submit or sign an XPI.

See `docs/rewrite.md` for architecture and scope. Runtime code and QR decoding stay within the package; there is no remote executable code, analytics or developer-operated server.
