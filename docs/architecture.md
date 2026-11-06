# Architecture

The maintained entry point is `index.html` → `src/main.tsx` → `src/app/App.tsx`. React owns every screen, control and lifecycle effect. The newest maintained React design governs the UI and workflows. The former root popup is retained unchanged under `legacy/prototype` as a historical reference; it is not a second production implementation.

## Modules

| Directory | Responsibility |
| --- | --- |
| `src/app` | React composition, vault context/subscription, route handoff, active-page messaging, theme, automatic locking |
| `src/features/accounts` | Cards, contextual filtering, favorites, manual ordering, account editor and QR display |
| `src/features/import-export` | Text/file import, encrypted-backup queue, exports, camera/screen/page QR workflows |
| `src/features/settings` | Appearance/behavior preferences, password protection and Passkey setup |
| `src/features/sync` | Recovery-key create/join flows and actual sync/disconnect/delete operations |
| `src/shared/ui` | Accessible password reveal, dropdowns, confirmation dialogs, file-picker handoff and countdown logo |
| `src/lib/state/authenticator.ts` | Framework-independent vault state, mutation queue, persistence and sync orchestration |
| `src/lib/auth` | OTP, parsing, backup, crypto, record normalization, site matching, QR decode and browser-sync protocols |
| `src/lib/extension` | Popup/new-window routing and originating browser-window identity |
| `src/lib/i18n` | Existing vault translations, approved interface labels, language resolution and shared meaning map |
| `src/background.ts` | Independent extension worker, page-scan and code-paste coordination |
| `src/content` | Independently packaged and isolated page scanner and safe code paster |

## State and compatibility

`AuthenticatorVault` exposes stable `subscribe` and `getSnapshot` functions. Observable field setters increment a numeric revision; `useVault()` reads that revision with React's `useSyncExternalStore`. React hooks manage transient form/navigation state. Domain objects are plain objects and arrays, without framework proxies, subscribers or crypto key objects in serialized data.

The existing mutation queue and cross-page vault lock remain authoritative. Each queued write rereads storage inside the lock, so a stale popup does not overwrite another extension page's committed mutation. Failed writes do not leave a fake imported account. OTP refreshes carry a request counter and reject results for an obsolete account snapshot. Derived account ordering is cached by source-array identity.

Persistent storage keys, v1 records, PBKDF2 parameters, AES-GCM envelopes, session-key fingerprints and encrypted sync records remain compatible. `favorite` and `site` are optional account fields. `autoLockMinutes` and `lastBackupAt` are optional preferences with normalized defaults. Backup imports accept the current React `app: "2fa-authenticator"`, `version: 1` JSON/encrypted envelopes and JSON account lists using the current account schema, plus otpauth and supported standard migration QR formats. Obsolete prototype `format: "2fa-backup"` wrappers and `name`/`acct`/`step`/`algo`/`fav` account records are unsupported. Marked unsupported backups fail through the existing import error flow before account normalization or password prompting.

Local preferences and ordering stay on the device according to the original sync protocol. Device sample rows from the visual prototype are not represented as real device registrations. Use the protocol's delete-group/create-new-group workflow to exclude an old device; already downloaded copies cannot be erased remotely.

## Security and lifecycle

- Without password protection the original plain-vault behavior is retained. Setting a password encrypts the vault; locking clears keys, accounts, codes and sync metadata from the live store and removes the shared session key.
- All open extension pages watch local, session and sync storage. Removing a session key in another page also locks the current page. Background workers do not retain unlocked keys.
- Inactivity uses session activity shared across pages and checked before restoring an unlocked vault. Closing and reopening a page does not renew the deadline. Activity updates contain no key material and belong to one unlock session, so a delayed update cannot recreate a removed key or renew a later session.
- Passkey enrollment uses WebAuthn PRF to AES-GCM-wrap the existing raw vault key. The local record contains the credential ID, random PRF salt, IV, ciphertext and vault fingerprint; it never contains a plaintext vault key. The fingerprint is authenticated additional data. Incorrect credentials or a different vault cannot decrypt it. Password changes invalidate enrollment. Unsupported origins/authenticators fail explicitly.
- Camera and shared-screen tracks stop on success, failure, mode changes and unmount, including permission results that arrive after navigation. Camera errors distinguish acquisition, preview playback and QR decoding, with bounded native diagnostics kept only in the current view. Desktop requests leave camera selection to the browser; mobile scanning retains an ideal rear-camera preference. QR image bounds and file limits stay enforced by domain modules.
- Toolbar popup layout first gives the body explicit preferred dimensions for intrinsic browser sizing, then follows the native host resize event. Narrow, short and expanded hosts use their actual viewport; scrolling stays inside the content area. Tabs and side panels keep responsive sizing.
- Camera startup in a toolbar popup hands off to an extension tab in a normal browser window with permission UI. The camera starts only after another explicit click there. Camera windows prefer 440×800 outer dimensions (500×800 in Firefox to match its native minimum width), open beside the source browser when there is room, otherwise align inside its right edge, and clamp to the available work area. The camera surface fills the taller viewport. Opening a new window preserves the source window’s active tab for site context, scanning and filling. Without window management, the existing tab fallback is retained. No camera manifest permission is added.
- Native file selection hands the task to an extension window where necessary. The originating browser window ID travels with it for accurate site context and filling.
- Safe filling preserves password-field and OTP-field checks, split-code inputs, and supported shadow/contenteditable handling. No persistent host access or automatic all-sites injection was added.
- Confirmation dialogs mount above scrolling content, make background controls inert, and trap Tab only after navigation begins. They do not set initial focus. Escape cancels and never accepts a destructive operation. Wiping a vault additionally requires `DELETE`.

## Build boundaries

`build.sh` runs local cache cleanup, version assignment, Vite, browser manifest generation and build verification. Version numbers increment by default; a valid release `TAG_NAME` selects its exact version. All three browser packages include the same React bundle plus platform-specific manifests. Firefox's existing extension ID and background-script model are retained. Chromium variants retain their side panel.

The content-script render plugin rejects shared imports/exports and wraps each entry in an IIFE. `scripts/verify-build.mjs` checks this output along with permissions, localized metadata and identity. CSP continues to allow only bundled scripts plus the existing WASM QR decoder; no remote code is introduced.

The historical prototype is excluded from lint/build inputs. Tailwind source scanning is restricted to maintained `src` files, so archived HTML and project skill documentation do not inflate production CSS.
