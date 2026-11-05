# Authenticator - 2FA

Browser extension for generating and managing two-factor authentication codes.

**Privacy:** Authenticator - 2FA does not track users or collect analytics. Accounts stay on your device by default. The optional password is an interface lock; local accounts and sync recovery credentials are stored without encryption. If you enable Browser Sync, account names and secrets are encrypted before upload through your browser provider's sync service.

![Authenticator - 2FA promo](assets/store/promotional/marquee-promo-tile.png)

## Install

[![Install from Chrome Web Store](https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/authenticator-2fa/pphhggggadbehnhklioamemafkeegfjf)
[![Install from Microsoft Edge Add-ons](https://img.shields.io/badge/Install%20from-Microsoft%20Edge%20Add--ons-0078D7?style=for-the-badge&logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/lngkiejjggjenmeelgcadhilloeffkdl)
[![Install from Firefox Add-ons](https://img.shields.io/badge/Install%20from-Firefox%20Add--ons-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/authenticator-2fa/)

## Features

- Generate TOTP, HOTP, and Steam-style 2FA codes.
- Add accounts from QR images, page QR scans, pasted otpauth text, or manual entry.
- Search, copy, manually reorder accounts, or focus on likely codes for the current site with one-click access to the rest.
- Import by dropping or picking QR images, otpauth text, JSON, or password-protected backups; export the same way.
- Optional local vault password protection.
- Optional encrypted Browser Sync across supported devices using the same browser account.
- Local-first storage with no account service.

**Important: Users are responsible for maintaining their own backups of 2FA codes and recovery methods. We are not responsible for lost, deleted, inaccessible, or unrecoverable 2FA codes.**

## Browser Sync

Open **Settings → Browser Sync**, set a local vault password, choose **Set up sync**, and save the generated recovery key. On another supported device, sign into the same browser account, choose **Connect to existing sync**, and enter that key. Enable extension syncing in your browser settings.

Sync works within one browser provider. Accounts, edits, and deletions sync while the extension is open and unlocked; preferences and ordering stay local. Keep independent backups and use HOTP accounts on one device at a time.

See [sync security, recovery, and limits](docs/browser-sync.md).

## Development

Use Node.js 24 and the pnpm version pinned in `package.json` (12.11.2).

```sh
pnpm install
pnpm run dev
```

Useful commands:

```sh
pnpm run check
pnpm run test
pnpm run build
pnpm run package
```

`./build.sh` builds extension resources for Chrome, Edge, Firefox, and Safari into `dist/<browser>/`. Other Chromium browsers can use the Chrome build. `pnpm run package` packages these resources into `artifacts/`; the Safari zip is source resources, not an installable Safari app.

On macOS with Xcode installed, `./build.sh safari` also generates an Xcode project and builds an unsigned macOS Safari container in `dist/safari-native/Build/Products/Release/`. This development build requires Safari's **Allow Unsigned Extensions** setting; distribution requires Apple signing and packaging. The minimum macOS deployment target is 13.3. No installed extension or browser setting is changed by the script.

The default password-bypass shortcut is **Command+Shift+8** on macOS and **Ctrl+Shift+8** elsewhere. It only bypasses the interface lock when explicitly enabled in settings. Clicking the toolbar icon still asks for the password. Chrome and Edge open their shortcut settings from the extension; Firefox opens its add-on manager, where **Manage Extension Shortcuts** is available. Safari displays the registered shortcut and uses its own extension settings; older Safari versions only support the manifest default. Existing installations may retain their previous shortcut assignment, and conflicting shortcuts may need reassignment.

Safari supports local accounts, imports, exports, and the interface lock, but Browser Sync is disabled: its `storage.sync` API stores locally and does not synchronize across devices. See [platform support](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync).

## Store Assets

Project assets are grouped under `assets/` by lifecycle:

- `assets/brand/` source artwork for generated extension icons
- `assets/extension/` static files copied into extension packages
- `assets/store/` store icons, screenshots, and promo tiles kept outside the extension bundle

Regenerate screenshots and promo tiles with:

```sh
pnpm run store:screenshots
```

This command uses synthetic demo accounts and a local browser to render store-ready images.
Temporary store listing text drafts can live in `.tmp/store-listing/`, which is ignored by git.

## Releases

Pushing a tag like `v1.2.3` runs the release workflow. The workflow applies the tag version, builds all targets, packages the zips, creates the GitHub release, and uploads the browser extension assets.

## Origins

Authenticator - 2FA was inspired by the open-source [Authenticator browser extension](https://github.com/Authenticator-Extension/Authenticator). This project is a complete from-scratch rewrite, created after that extension became unmaintained, with a new codebase focused on fixing many long-standing issues while preserving a simple local-first authenticator workflow.

## License

MIT
