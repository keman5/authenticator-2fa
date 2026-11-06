# React migration design

The extension will migrate its UI and reactive state from Svelte 5 to React and TypeScript while preserving existing functionality, visual behavior, browser identities, permissions, storage records, encryption, current React backup formats, and sync protocols.

Keep framework-independent authentication and browser integration modules as the compatibility baseline. Replace Svelte-specific state with a framework-independent observable store consumed by React, retaining serialized plain objects and the mutation queue. Organize React components around accounts, import and export, settings, synchronization, and shared controls. Keep extension entry points and self-contained content scripts in the existing build pipeline.

Verify existing vault and sync tests against the new store, add meaningful subscription and UI workflow coverage, and exercise extension workflows in background browser sessions. Inspect generated manifests for all supported browsers. Update the README and architecture documentation to match actual code, supported platforms, and installation limitations.

Latest approved scope supersedes the earlier legacy-backup preservation requirement: the newest maintained React design governs UI, workflows and backup formats, integrating the existing tested TypeScript auth and sync modules. Keep current React JSON/encrypted backups, live vault storage and sync behavior; remove obsolete prototype backup import compatibility. Demonstration data and unsupported prototype-only status toggles must not be presented as live functionality. Preserve the prototype under `legacy/prototype` for historical traceability only, without a backup compatibility promise.
