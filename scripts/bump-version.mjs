import { readFile, writeFile } from 'node:fs/promises';
const path = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(await readFile(path, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const tagVersion = process.env.TAG_NAME?.replace(/^v/, '');
if (tagVersion && !/^\d+\.\d+\.\d+$/.test(tagVersion))
  throw new Error('TAG_NAME must be vX.Y.Z.');
pkg.version = tagVersion ?? `${major}.${minor}.${patch + 1}`;
await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`Building Authenticator - 2FA ${pkg.version}`);
