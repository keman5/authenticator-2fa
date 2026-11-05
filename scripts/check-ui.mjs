import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
import QRCode from "qrcode";
const browser =
  process.env.EDGE_BINARY ??
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const profile = await mkdtemp(join(tmpdir(), "authenticator-ui-"));
let child = launch();
function launch() {
  return spawn(
    browser,
    [
      "--headless=new",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      `--disable-extensions-except=${resolve("dist/edge")}`,
      `--load-extension=${resolve("dist/edge")}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(work, label) {
  for (let i = 0; i < 100; i++) {
    const result = await work();
    if (result) return result;
    await pause(100);
  }
  throw new Error("Timed out: " + label);
}
class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve) =>
      this.socket.addEventListener("open", resolve, { once: true }),
    );
    this.socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      const pair = this.pending.get(data.id);
      if (pair) {
        this.pending.delete(data.id);
        if (data.error) pair.reject(new Error(data.error.message));
        else pair.resolve(data.result);
      }
    });
  }
  async call(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  close() {
    this.socket.close();
  }
}
let worker, page;
try {
  const port = await until(async () => {
    try {
      return (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
    } catch {
      return null;
    }
  }, "debug port");
  const endpoint = `http://127.0.0.1:${port}`;
  const targets = () => fetch(endpoint + "/json/list").then((r) => r.json());
  const target = await until(
    async () =>
      (await targets()).find(
        (t) =>
          t.type === "service_worker" && t.url.includes("/assets/worker.js"),
      ),
    "extension worker",
  );
  const root = target.url.slice(0, target.url.indexOf("/assets/"));
  worker = new CDP(target.webSocketDebuggerUrl);
  await worker.call("Runtime.enable");
  await until(
    () =>
      worker.evaluate(
        "typeof chrome!=='undefined'&&Boolean(chrome.runtime?.id)",
      ),
    "worker startup",
  );
  assert.equal(
    await worker.evaluate("chrome.runtime.getManifest().name"),
    "Authenticator - 2FA",
  );
  await worker.evaluate(
    "chrome.storage.local.set({'keman5.authenticator.workspace.v2':{schema:2,records:{},preferences:{locale:'en',theme:'light',conceal:false,seconds:true,paste:false,matchSite:false}}})",
  );
  const opened = await fetch(
    endpoint + "/json/new?" + encodeURIComponent(root + "/index.html"),
    { method: "PUT" },
  ).then((r) => r.json());
  page = new CDP(opened.webSocketDebuggerUrl);
  await page.call("Page.enable");
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 380,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await until(
    () => page.evaluate("document.querySelector('nav')!==null"),
    "first screen",
  );
  const click = (label) =>
    page.evaluate(
      `(()=>{const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing button '+${JSON.stringify(label)});button.click();})()`,
    );
  const field = (label, value) =>
    page.evaluate(
      `(()=>{const label=Array.from(document.querySelectorAll('label')).find(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)});const input=label?.querySelector('input,textarea');if(!input)throw Error('Missing input '+${JSON.stringify(label)});const setter=Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await click("＋ Add account");
  await until(
    () => page.evaluate('document.querySelector("form")!==null'),
    "editor",
  );
  await field("Service", "Example");
  await field("Account name", "alice@example.com");
  await field("Secret key", "JBSWY3DPEHPK3PXP");
  await click("Save");
  await until(
    () =>
      page.evaluate(
        "document.querySelector('.code-button')?.textContent.match(/^[0-9]{6}$/)?.[0]",
      ),
    "rendered OTP",
  );
  assert.equal(
    await page.evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
    "380px no horizontal clipping",
  );
  await mkdir("artifacts", { recursive: true });
  const screen = await page.call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "artifacts/rewrite-codes.png",
    Buffer.from(screen.data, "base64"),
  );
  await click("Transfer");
  await until(
    () => page.evaluate("document.querySelector('input[type=file]')!==null"),
    "transfer screen",
  );
  const qrPath = join(profile, "account-qr.png");
  await writeFile(
    qrPath,
    await QRCode.toBuffer(
      "otpauth://totp/Example%3Abob?secret=JBSWY3DPEHPK3PXP&issuer=Example",
    ),
  );
  const doc = await page.call("DOM.getDocument");
  const input = await page.call("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector: "input[type=file]",
  });
  await page.call("DOM.setFileInputFiles", {
    nodeId: input.nodeId,
    files: [qrPath],
  });
  await until(
    () =>
      worker.evaluate(
        "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>Object.keys(x['keman5.authenticator.workspace.v2'].records).length===2)",
      ),
    "real PNG QR import with packaged WASM",
  );
  await click("Settings");
  await until(
    () =>
      page.evaluate(
        "document.querySelector('input[autocomplete=\"new-password\"]')!==null",
      ),
    "settings",
  );
  await field("New password (1+ characters)", "1");
  await field("Confirm password", "1");
  await click("Save");
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "locked after setting password",
  );
  await field("Password", "1");
  await click("Unlock");
  await until(
    () => page.evaluate("document.querySelector('nav')!==null"),
    "single character unlock",
  );
  await click("Settings");
  await until(
    () =>
      page.evaluate(
        "Array.from(document.querySelectorAll('label')).some(l=>l.textContent.includes('shortcut')&&l.querySelector('input[type=checkbox]'))",
      ),
    "shortcut setting",
  );
  await page.evaluate(
    "(()=>{const input=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('shortcut')&&l.querySelector('input[type=checkbox]')).querySelector('input');input.click();})()",
  );
  await until(
    () =>
      worker.evaluate(
        "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.quick)",
      ),
    "persist quick toggle",
  );
  await page.call("Page.navigate", { url: root + "/index.html?entry=quick" });
  await until(
    () => page.evaluate("document.querySelector('.code-button')!==null"),
    "quick entry bypass",
  );
  assert.equal(
    await page.evaluate("new URL(location.href).searchParams.has('entry')"),
    false,
    "consumed quick entry",
  );
  await page.call("Page.reload");
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "refresh requires password again",
  );
  await page.call("Page.navigate", { url: root + "/index.html" });
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "ordinary entry stays locked",
  );
  await field("Password", "wrong");
  await click("Unlock");
  await until(
    () => page.evaluate("document.querySelector('[role=alert]')!==null"),
    "wrong password error",
  );
  assert.equal(
    await page.evaluate("document.querySelector('.code-button')===null"),
    true,
  );
  await page.call("Page.navigate", { url: root + "/index.html?entry=quick" });
  await until(
    () => page.evaluate("document.querySelector('.code-button')!==null"),
    "second explicit quick entry",
  );
  const other = await fetch(
    endpoint + "/json/new?" + encodeURIComponent(root + "/index.html"),
    { method: "PUT" },
  ).then((r) => r.json());
  const normal = new CDP(other.webSocketDebuggerUrl);
  await until(
    () => normal.evaluate("document.querySelector('.gate')!==null"),
    "separate normal panel locked",
  );
  normal.close();
  page.close();
  worker.close();
  page = undefined;
  worker = undefined;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(join(profile, "DevToolsActivePort"), { force: true });
  child = launch();
  const restartPort = await until(async () => {
    try {
      return (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
    } catch {
      return null;
    }
  }, "restart port");
  const restartEndpoint = `http://127.0.0.1:${restartPort}`;
  const restartTarget = await until(
    async () =>
      (await fetch(restartEndpoint + "/json/list").then((r) => r.json())).find(
        (t) =>
          t.type === "service_worker" && t.url.includes("/assets/worker.js"),
      ),
    "restart worker",
  );
  worker = new CDP(restartTarget.webSocketDebuggerUrl);
  await worker.call("Runtime.enable");
  await until(
    () =>
      worker.evaluate(
        "typeof chrome!=='undefined'&&Boolean(chrome.runtime?.id)",
      ),
    "restart worker context",
  );
  assert.equal(
    await worker.evaluate(
      "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.quick)",
    ),
    true,
  );
  const restartPage = await fetch(
    restartEndpoint +
      "/json/new?" +
      encodeURIComponent(root + "/index.html?entry=quick"),
    { method: "PUT" },
  ).then((r) => r.json());
  page = new CDP(restartPage.webSocketDebuggerUrl);
  await page.call("Page.enable");
  await until(
    () => page.evaluate("document.querySelector('.code-button')!==null"),
    "direct entry after browser restart",
  );
  await page.call("Page.navigate", { url: root + "/index.html" });
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "ordinary entry after browser restart",
  );
  await field("Password", "1");
  await click("Unlock");
  await until(
    () => page.evaluate("document.querySelector('nav')!==null"),
    "unlock for native setup",
  );
  await worker.evaluate(
    "globalThis.nativeMode='success';chrome.runtime.sendNativeMessage=(_host,request,reply)=>reply({version:1,nonce:request.nonce,supported:true,verified:globalThis.nativeMode==='success',error:globalThis.nativeMode==='cancel'?'cancelled':null});",
  );
  await click("Settings");
  await until(
    () =>
      page.evaluate(
        "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Set up Touch ID')",
      ),
    "Touch ID setup action",
  );
  await click("Set up Touch ID");
  await until(
    () =>
      worker.evaluate(
        "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.touchID)",
      ),
    "persist Touch ID after verified native reply",
  );
  await click("Lock");
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "manual lock",
  );
  await until(
    () =>
      worker.evaluate(
        "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.unlockedAt===undefined)",
      ),
    "manual lock persists cache removal",
  );
  await worker.evaluate("globalThis.nativeMode='cancel'");
  await click("Unlock with Touch ID");
  await until(
    () =>
      page.evaluate(
        "document.querySelector('[role=alert]')?.textContent.includes('cancelled')",
      ),
    "cancelled biometric authentication",
  );
  assert.equal(
    await page.evaluate("document.querySelector('.gate')!==null"),
    true,
  );
  assert.equal(
    await worker.evaluate(
      "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.unlockedAt??null)",
    ),
    null,
  );
  await worker.evaluate("globalThis.nativeMode='success'");
  await click("Unlock with Touch ID");
  await until(
    () => page.evaluate("document.querySelector('nav')!==null"),
    "successful mocked native authentication",
  );
  await click("Settings");
  await page.evaluate(
    "(()=>{const select=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('Auto-lock after')).querySelector('select');select.value='30';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await until(
    () =>
      worker.evaluate(
        "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.lockAfter===30)",
      ),
    "30-second duration",
  );
  const cachedAt = await worker.evaluate(
    "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.unlockedAt)",
  );
  assert.ok(cachedAt > 0);
  await page.call("Page.navigate", { url: root + "/index.html" });
  await until(
    () => page.evaluate("document.querySelector('.code-button')!==null"),
    "ordinary entry within cached duration",
  );
  await page.call("Page.navigate", { url: root + "/index.html?entry=quick" });
  await until(
    () => page.evaluate("document.querySelector('.code-button')!==null"),
    "direct entry within cached duration",
  );
  assert.equal(
    await worker.evaluate(
      "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.unlockedAt)",
    ),
    cachedAt,
    "reopening and bypass must not extend deadline",
  );
  page.close();
  worker.close();
  page = undefined;
  worker = undefined;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(join(profile, "DevToolsActivePort"), { force: true });
  child = launch();
  const timedPort = await until(async () => {
    try {
      return (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
    } catch {
      return null;
    }
  }, "timed restart port");
  const timedEndpoint = `http://127.0.0.1:${timedPort}`;
  const timedTarget = await until(
    async () =>
      (await fetch(timedEndpoint + "/json/list").then((r) => r.json())).find(
        (t) =>
          t.type === "service_worker" && t.url.includes("/assets/worker.js"),
      ),
    "timed restart worker",
  );
  worker = new CDP(timedTarget.webSocketDebuggerUrl);
  await worker.call("Runtime.enable");
  await until(
    () =>
      worker.evaluate(
        "typeof chrome!=='undefined'&&Boolean(chrome.runtime?.id)",
      ),
    "timed restart context",
  );
  const timedPage = await fetch(
    timedEndpoint + "/json/new?" + encodeURIComponent(root + "/index.html"),
    { method: "PUT" },
  ).then((r) => r.json());
  page = new CDP(timedPage.webSocketDebuggerUrl);
  await page.call("Page.enable");
  await until(
    () => page.evaluate("document.querySelector('.code-button')!==null"),
    "cached unlock survives actual browser restart",
  );
  assert.equal(
    await worker.evaluate(
      "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.unlockedAt)",
    ),
    cachedAt,
  );
  await page.evaluate(
    "globalThis.originalNow=Date.now;Date.now=()=>globalThis.originalNow()+31000;",
  );
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "automatic timer expiry in an open panel",
  );
  await worker.evaluate(
    "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(async x=>{const s=x['keman5.authenticator.workspace.v2'];s.gate.unlockedAt=Date.now()-31000;await chrome.storage.local.set({'keman5.authenticator.workspace.v2':s});})",
  );
  await page.evaluate("Date.now=globalThis.originalNow");
  await page.call("Page.reload");
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "expired cache remains locked after reload",
  );
  await field("Password", "1");
  await click("Unlock");
  await until(
    () => page.evaluate("document.querySelector('nav')!==null"),
    "password resets expired timer",
  );
  await click("Settings");
  await page.evaluate(
    "(()=>{const select=Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('Auto-lock after')).querySelector('select');select.value='-1';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await until(
    () =>
      worker.evaluate(
        "chrome.storage.local.get('keman5.authenticator.workspace.v2').then(x=>x['keman5.authenticator.workspace.v2'].gate.lockAfter===-1)",
      ),
    "permanent setting",
  );
  await page.call("Page.reload");
  await until(
    () => page.evaluate("document.querySelector('nav')!==null"),
    "permanent cached entry",
  );
  await click("Lock");
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "manual lock overrides permanent",
  );
  await page.call("Page.reload");
  await until(
    () => page.evaluate("document.querySelector('.gate')!==null"),
    "manual lock clears persistent cache",
  );
  await page.evaluate(
    "document.body.innerHTML='<form><input name=username><input type=password autocomplete=current-password><input autocomplete=one-time-code></form>';window.submits=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();window.submits++;};",
  );
  await page.evaluate(await readFile("dist/edge/assets/injected.js", "utf8"));
  assert.equal(
    await worker.evaluate(
      "chrome.runtime.sendMessage({kind:'fill',code:'123456'})",
    ),
    true,
  );
  assert.deepEqual(
    await page.evaluate(
      "Array.from(document.querySelectorAll('input')).map(x=>x.value)",
    ),
    ["", "", "123456"],
  );
  assert.equal(await page.evaluate("window.submits"), 0);
  await page.evaluate(
    "document.body.innerHTML='<input name=username><input type=password autocomplete=current-password>';document.querySelector('input').focus();",
  );
  assert.equal(
    await worker.evaluate(
      "chrome.runtime.sendMessage({kind:'fill',code:'123456'})",
    ),
    false,
    "no generic or password fill",
  );
  await page.evaluate(
    "document.body.innerHTML='<input name=otp><input name=otp>';",
  );
  assert.equal(
    await worker.evaluate(
      "chrome.runtime.sendMessage({kind:'fill',code:'123456'})",
    ),
    false,
    "no ambiguous fill",
  );
  await page.evaluate(
    "document.body.innerHTML='<form>'+Array.from({length:6},()=>'<input maxlength=1 autocomplete=one-time-code>').join('')+'</form>';",
  );
  assert.equal(
    await worker.evaluate(
      "chrome.runtime.sendMessage({kind:'fill',code:'123456'})",
    ),
    true,
  );
  assert.equal(
    await page.evaluate(
      "Array.from(document.querySelectorAll('input')).map(x=>x.value).join('')",
    ),
    "123456",
  );
  console.log(
    "PASS actual Edge extension: add/OTP, real PNG QR import, 380px layout, one-character lock, wrong password, opt-in direct entry, refresh/new panel re-lock, browser restart, safe OTP fill, biometric replies/cancellation, persistent auto-lock deadlines, expiry, and permanent/manual lock.",
  );
} catch (error) {
  if (page) {
    try {
      console.error("PAGE:", await page.evaluate("document.body.innerText"));
    } catch {}
  }
  throw error;
} finally {
  page?.close();
  worker?.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await rm(profile, { recursive: true, force: true });
}
