import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const target of ['chrome', 'edge', 'firefox']) {
  const root = join('dist', target);
  const manifest = JSON.parse(
    await readFile(join(root, 'manifest.json'), 'utf8')
  );
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.default_locale, 'en');
  assert.equal(
    manifest.homepage_url,
    'https://github.com/keman5/authenticator-2fa'
  );
  assert.equal(manifest.action.default_popup, 'index.html');
  assert.deepEqual(
    manifest.permissions,
    target === 'firefox'
      ? ['storage', 'activeTab', 'scripting']
      : ['storage', 'activeTab', 'scripting', 'sidePanel']
  );
  assert.ok(!manifest.host_permissions);
  assert.ok(!manifest.content_scripts);
  assert.ok(
    manifest.content_security_policy.extension_pages.includes(
      "script-src 'self' 'wasm-unsafe-eval'"
    )
  );
  if (target === 'firefox')
    assert.equal(
      manifest.browser_specific_settings.gecko.id,
      'authenticator-2fa@macseek.cc'
    );
  await access(join(root, 'index.html'));
  for (const script of ['codePaster', 'pageScanner']) {
    const code = await readFile(join(root, 'assets', `${script}.js`), 'utf8');
    assert.ok(/^\(\(\)\s*=>\s*\{/.test(code), `${target}/${script} is isolated`);
    assert.ok(
      !/\b(?:import|export)\s*(?:\{|\*|\(|["'])/.test(code),
      `${target}/${script} is self-contained`
    );
  }
  for (const locale of await readdir(join(root, '_locales'))) {
    const messages = JSON.parse(
      await readFile(join(root, '_locales', locale, 'messages.json'), 'utf8')
    );
    for (const key of [
      'extensionName',
      'extensionShortName',
      'extensionDescription',
      'actionTitle',
      'commandOpenPopup'
    ]) {
      assert.ok(messages[key]?.message?.trim(), `${target}/${locale}/${key}`);
    }
    assert.ok(
      [...messages.extensionShortName.message].length <= 12,
      `${locale} short name`
    );
  }
  console.log(
    `Verified ${target} ${manifest.version}: identities, permissions, locales, isolated content scripts`
  );
}
