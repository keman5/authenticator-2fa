import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import sharp from "sharp";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
let notices =
  (await readFile("LICENSE", "utf8")) +
  "\n\nPrevious implementation notice:\n" +
  (await readFile("docs/previous-license.txt", "utf8"));
for (const [name, file, from] of [
  ["qrcode", "license"],
  ["svelte", "LICENSE.md"],
  ["zxing-wasm", "LICENSE"],
  ["daisyui", "LICENSE"],
  ["tailwindcss", "LICENSE"],
  ["dijkstrajs", "LICENSE.md", "qrcode"],
  ["clsx", "license", "svelte"],
  ["esm-env", "LICENSE", "svelte"],
]) {
  const resolver = from
    ? createRequire(require.resolve(from + "/package.json"))
    : require;
  let root = dirname(resolver.resolve(name));
  while (true) {
    try {
      if (
        JSON.parse(await readFile(join(root, "package.json"), "utf8")).name ===
        name
      )
        break;
    } catch {}
    if (dirname(root) === root)
      throw new Error("Missing package license: " + name);
    root = dirname(root);
  }
  notices +=
    "\n\n--- " + name + " ---\n" + (await readFile(join(root, file), "utf8"));
}
notices +=
  "\n\nZXing-C++ and ZXingWasm.cpp: Apache-2.0\n" +
  (await readFile("docs/licenses/Apache-2.0.txt", "utf8")) +
  "\n\nzint:\n" +
  (await readFile("docs/licenses/zint.txt", "utf8"));
const { version } = JSON.parse(await readFile("package.json", "utf8"));
// Original three-bar mark; no inherited artwork or fonts.
const icon = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#236554"/><path d="M33 37h14v54H33zm24 0h14v36H57zm24 0h14v54H81z" fill="#f5f3e9"/></svg>',
);
for (const size of [16, 32, 48, 128])
  await sharp(icon)
    .resize(size, size)
    .png()
    .toFile(`assets/extension/icons/icon${size}.png`);
const locales = {
  en: [
    "One-time codes, optional screen lock and encrypted portable backups.",
    "Open with screen lock",
    "Open directly",
  ],
  zh_CN: ["动态验证码、可选界面锁与加密备份。", "通过界面锁打开", "直接打开"],
  de: [
    "Einmalcodes, optionale Bildschirmsperre und verschlüsselte Backups.",
    "Mit Sperre öffnen",
    "Direkt öffnen",
  ],
  fr: [
    "Codes uniques, verrouillage facultatif et sauvegardes chiffrées.",
    "Ouvrir avec verrouillage",
    "Ouvrir directement",
  ],
  es: [
    "Códigos de un solo uso, bloqueo opcional y copias cifradas.",
    "Abrir con bloqueo",
    "Abrir directamente",
  ],
  pt_BR: [
    "Códigos temporários, bloqueio opcional e backups criptografados.",
    "Abrir com bloqueio",
    "Abrir diretamente",
  ],
  ja: [
    "ワンタイムコード、任意の画面ロック、暗号化バックアップ。",
    "画面ロックで開く",
    "直接開く",
  ],
  ru: [
    "Одноразовые коды, блокировка экрана и зашифрованные копии.",
    "Открыть с блокировкой",
    "Открыть напрямую",
  ],
  tr: [
    "Tek kullanımlık kodlar, isteğe bağlı ekran kilidi ve şifreli yedekler.",
    "Kilitle aç",
    "Doğrudan aç",
  ],
  ar: [
    "رموز مؤقتة وقفل شاشة اختياري ونسخ احتياطية مشفرة.",
    "فتح مع القفل",
    "فتح مباشرة",
  ],
  hi: [
    "एक बार के कोड, वैकल्पिक स्क्रीन लॉक और एन्क्रिप्टेड बैकअप।",
    "लॉक के साथ खोलें",
    "सीधे खोलें",
  ],
  bn: [
    "একবারের কোড, ঐচ্ছিক স্ক্রিন লক ও এনক্রিপ্ট করা ব্যাকআপ।",
    "লক দিয়ে খুলুন",
    "সরাসরি খুলুন",
  ],
};
for (const [locale, [description, normal, direct]] of Object.entries(locales)) {
  const path = `assets/extension/_locales/${locale}`;
  await mkdir(path, { recursive: true });
  const messages = {
    name: "Authenticator - 2FA",
    shortName: "2FA Codes",
    description,
    title: "Authenticator - 2FA",
    normal,
    direct,
  };
  await writeFile(
    `${path}/messages.json`,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(messages).map(([key, message]) => [key, { message }]),
      ),
      null,
      2,
    ),
  );
}
for (const target of ["chrome", "edge", "firefox", "safari"]) {
  const path = `dist/${target}`;
  await rm(path, { recursive: true, force: true });
  await cp("dist/web", path, { recursive: true });
  await cp("assets/extension", path, { recursive: true });
  await writeFile(`${path}/LICENSE.txt`, notices);
  const manifest = {
    manifest_version: 3,
    name: "__MSG_name__",
    short_name: "__MSG_shortName__",
    description: "__MSG_description__",
    version,
    default_locale: "en",
    homepage_url: "https://github.com/keman5/authenticator-2fa",
    icons: Object.fromEntries(
      [16, 32, 48, 128].map((n) => [n, `icons/icon${n}.png`]),
    ),
    action: {
      default_popup: "index.html",
      default_title: "__MSG_title__",
      default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png" },
    },
    permissions: ["storage", "activeTab", "scripting", "nativeMessaging"],
    commands: {
      _execute_action: {
        suggested_key: { default: "Ctrl+Shift+2", mac: "Command+Shift+2" },
        description: "__MSG_normal__",
      },
      "open-direct": {
        suggested_key: { default: "Ctrl+Shift+8", mac: "Command+Shift+8" },
        description: "__MSG_direct__",
      },
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'",
    },
  };
  if (target === "firefox") {
    manifest.background = { scripts: ["assets/worker.js"], type: "module" };
    manifest.browser_specific_settings = {
      gecko: {
        id: "{7a3868f2-5531-488e-9378-ac5c769c3c01}",
        strict_min_version: "140.0",
        data_collection_permissions: { required: ["none"] },
      },
      gecko_android: { strict_min_version: "142.0" },
    };
  } else if (target === "safari") {
    manifest.background = { page: "background.html" };
    await writeFile(
      `${path}/background.html`,
      '<!doctype html><html><head><meta charset="utf-8"><script type="module" src="assets/worker.js"></script></head><body></body></html>',
    );
  } else
    manifest.background = {
      service_worker: "assets/worker.js",
      type: "module",
    };
  await writeFile(
    `${path}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
console.log(
  "Built independent Chrome, Edge, Firefox and Safari extension resources.",
);
