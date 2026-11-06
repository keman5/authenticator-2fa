# Verification

Run from the repository root with the locked pnpm version:

```bash
pnpm run check
pnpm run test
pnpm run build
pnpm run build:verify
```

`check` runs type-aware lint plus production and test TypeScript checks. `test` runs Vitest only, so a specific suite can run independently. Tests use Node or jsdom and do not take foreground windows. `build` always invokes `build.sh`, increments the patch version unless a release tag supplies it, and verifies generated Chrome/Edge/Firefox manifests and content-script assets. Development preview cannot prove browser-extension privileges.

## Regression coverage

The preserved domain suites exercise standard OTP vectors, import formats, storage structured cloning, encryption/session locking, stale-write serialization, reorder semantics, active-page matching, background import and sync conflicts/deletions/quota behavior.

React suites add real workflows for manual account creation, favorites, code copying, persisted reopening, password setup, incorrect/correct unlocking, Escape cancellation, explicit vault wipe confirmation, folded favorites/site matches, keyboard ordering, controlled password reveal and dropdown cancellation. Lifecycle tests exercise inactivity locking, never/close locking preferences and release of media tracks when a permission result arrives after unmount. PRF tests use actual WebCrypto for key wrapping/decryption while substituting the credential API boundary; they prove that missing PRF cannot enable cosmetic unlock and that another fingerprint or key fails decryption. Backup regression tests prove current JSON/encrypted round trips (including favorites and explicit sites), reject obsolete prototype JSON/encrypted wrappers and old account fields, and prevent unsupported marked wrappers from bypassing validation with current account records.

## Browser acceptance

Use an isolated local browser profile in headless/background mode. Do not overwrite a user's real extension or bring a test window to the front. Load the generated browser package, not the development server, for the extension checks below.

1. Open the actual toolbar popup and verify its preferred 380×600 size. In a tab/side panel at 380×600 and 320×480, check the compact horizontal cards, scrolling, visible navigation, long labels, dropdowns near the bottom and confirmation overlays. Use the latest maintained React design as the visual acceptance baseline; production must start without samples. The archived prototype is historical context only.
2. Add TOTP and HOTP accounts, reload, search, favorite, filter/fold and reorder. Verify a real clipboard copy and safe filling on a controlled OTP page. A password field must not be replaced. Advance HOTP deliberately and check persistence.
3. Import otpauth, current React JSON/encrypted backups and a supported QR image. Reject obsolete prototype JSON/encrypted `.2fa` files clearly without asking for their password. Pick the same file twice. Verify the separate-window picker path in applicable toolbar popups. Check clear messages for wrong passwords, duplicates and invalid files.
4. Export each format and reimport it in a separate profile. Check downloaded content, last-backup time and batch QR navigation.
5. Set a password, lock, verify that account names and codes disappear from the DOM even during deletion or a drag, reject a wrong password and restore using the correct one. Confirm another open page follows a lock. Close all pages beyond the inactivity timeout and reopen; require password entry. Check that activity in a second page postpones the shared timeout and that Never survives reopening. Exercise close locking, theme/language persistence and repeated Escape boundaries.
6. Create/join sync against controlled storage. Check recovery-key acknowledgement, real statuses, disconnect cancellation and local-account preservation. Real cross-device browser delivery requires two signed-in profiles/devices and is a separate acceptance step.
7. From the toolbar popup, verify the camera handoff hint, opening of a normal browser window with browser chrome, retention of the source window’s active tab and explicit camera start in the destination. Check localized recovery for denied/blocked/missing cameras and track cleanup. Fake media proves startup/cleanup only; test physical camera/screen capture separately on an authorized device. Verify short and expanded popup viewports fill the host with no outer scrollbars; only the content area should scroll. Test WebAuthn PRF using a compatible actual platform credential; an unsupported extension origin must show its error and retain password access.

Passing compilation, jsdom or virtual credentials does not prove physical camera permission, system keychain Passkey support, store signing, or cross-device sync delivery. Record those outcomes separately when performed.

## Camera/layout verification recorded for 0.0.16

Local background checks passed in isolated profiles: Firefox 159.0.1 actual toolbar first-open at 380×600, first-open forced host at 320×480, three direct-camera/cached reopen cycles, and host resizing to 320×480/498×480. Header/footer fill the viewport and document client/scroll dimensions agree. Edge 156 actual toolbar first-open remains 380×600; compiled viewport checks also pass at widths 320/380/498/800 and height 480.

Firefox camera handoff opens a normal browser window with visible browser chrome, preserves the original active page and page context, and requires an explicit camera click in the destination. Fake media startup and stopping every track passed in Firefox and Edge; these checks do not exercise physical camera authorization or QR capture.

## Camera placement/diagnostics verification recorded for 0.0.19

`pnpm run check`, all 365 tests in 35 files, and the scripted build passed. Generated Chrome/Edge/Firefox packages passed identity, permission, locale and isolated-content-script checks. Regression coverage includes desktop/mobile camera constraints, cross-realm camera errors and bounded diagnostics, late media cleanup, work-area bounds, and Firefox's native 500px normal-window minimum (440px preferred elsewhere).

In an isolated headless Firefox 159.0.1 profile configured for fake media, the generated package opened a 500×800 camera window at (1012, 80) beside a source window at (100, 80), width 900. With insufficient space beside a source at (400, 80), width 1450, the camera opened at (1350, 80), aligning both right edges at 1850. In both cases the 500×715 content viewport, app panel and footer filled the available height; the original active page and page context remained intact. The test driver closed both camera windows and its isolated profile. These placement checks did not request a physical camera stream.

Camera acquisition, preview playback and QR decoding failures now have separate localized guidance and expandable native error details. Passing clean-profile checks does not reproduce or resolve a camera failure specific to an existing user profile; capture its displayed stage/error details if it recurs.
