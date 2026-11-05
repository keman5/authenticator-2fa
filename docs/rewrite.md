# Independent implementation

The implementation on this branch was newly written from the product requirements, OTP standards, and platform APIs. No prior application source files are retained in the new source tree. The Git history and the previous MIT notice remain for provenance; this is not a certified clean-room process. Third-party libraries keep their licenses.

## Acceptance scope

- TOTP, HOTP and Steam codes, RFC test vectors, account editing, search and ordering.
- Standard otpauth URIs, Google migration QR batches, QR images, plaintext and encrypted backups; explicit import for old data.
- Optional screen password (minimum one character); shortcut bypass applies to one opened view. Default normal toolbar opens and hidden views are locked. Configurable verified-unlock deadlines persist across reopening and browser restart; shortcut bypass never refreshes them.
- Optional Apple Touch ID through a bounded native-messaging companion or Safari native handler; no credential data crosses the bridge.
- Independent local storage and extension ID. Encrypted browser sync with a shared recovery key; no claimed Safari cloud sync.
- Chrome/Edge/Firefox resources, Safari macOS container, tight CSP, local-only code.
- A new compact list/editor/data/settings UI; no upstream icons, fonts or store artwork.

## Architecture

`domain` contains standalone OTP, transfer, cryptography and record operations. `platform` owns browser I/O, transaction serialization, sync and commands. Svelte views own transient UI state. A versioned document with timestamped records and deletion markers replaces the former vault/session class. Preferences never sync.

## Data transition

The new browser identity intentionally cannot read another installed extension’s storage. Export a backup from the previous installation and import it here. Never uninstall the original until an import and OTP comparison succeed. The build does not install, publish, sign with Mozilla, or modify browser profiles.
