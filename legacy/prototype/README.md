# Historical visual prototype

This is the original root popup implementation, kept unchanged as a historical visual reference. The newest maintained React design governs the product. It is **not** the installable build. It contains demonstration accounts, device rows and connection statuses, an in-memory passkey reference, and controls whose effect was limited to a toast. Do not use it with real secrets.

The maintained React implementation is under `src/`; install a generated `dist/chrome`, `dist/edge` or `dist/firefox` directory. It uses the tested vault/sync protocols and does not seed sample accounts. It supports current React JSON/encrypted backups; obsolete prototype JSON and encrypted `.2fa` exports are unsupported. This archive does not promise backup compatibility.
