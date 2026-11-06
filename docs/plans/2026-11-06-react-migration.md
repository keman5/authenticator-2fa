# React Migration Implementation Plan

**Goal:** Migrate the complete extension UI to React, using the newest maintained design while preserving live vault data, encryption and synchronization.

**Architecture:** Preserve framework-independent authentication and extension modules. Replace the Svelte reactive vault with a testable observable store, and organize React views by feature.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, daisyUI, Vitest.

1. Establish baseline checks and document current browser identities, storage and supported workflows.
2. Introduce and test a framework-independent vault store with subscriptions; keep existing vault and sync tests passing.
3. Migrate shared controls and account workflows, then import/export, settings, synchronization, and the main application. Verify interaction parity for each feature.
4. Replace Svelte build tooling with React tooling while retaining independent extension entry points and manifest contracts.
5. Update architecture and installation documentation, run all checks, inspect generated manifests, and validate representative browser interactions in the background.

Latest approved scope supersedes the earlier legacy-backup preservation requirement: the newest maintained React design governs UI, workflows and backup formats, integrating the existing tested TypeScript auth and sync modules. Keep current React JSON/encrypted backups, live vault storage and sync behavior; remove obsolete prototype backup import compatibility. Demonstration data and unsupported prototype-only status toggles must not be presented as live functionality. Preserve the prototype under `legacy/prototype` for historical traceability only, without a backup compatibility promise.
