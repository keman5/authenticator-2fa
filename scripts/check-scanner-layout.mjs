import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const temporary = await mkdtemp(join(tmpdir(), 'authenticator-layout-'));
try {
  const css = await readFile('dist/app/assets/index.css', 'utf8');
  const file = join(temporary, 'layout.html');
  await writeFile(
    file,
    `<!doctype html><style>${css}</style><div class="pui"><header class="p-head">Authenticator</header><main class="p-body"><div class="cam-frame"><div class="cam-placeholder">Camera</div><div class="scan-corners"><i></i></div></div></main><nav class="p-nav"><button>Codes</button><button>Data</button><button>Settings</button></nav></div><pre id="result"></pre><script>
    const root=document.querySelector('.pui');const results=[];
    for(const theme of ['light','dark'])for(const height of [400,600,800]){
      root.dataset.theme=theme;root.style.height=height+'px';
      const css=getComputedStyle(root);const frame=getComputedStyle(document.querySelector('.cam-frame'));
      const expected=document.createElement('div');expected.style.background=css.getPropertyValue('--panel2');document.body.append(expected);
      results.push({theme,height,nav:document.querySelector('nav').getBoundingClientRect().height,background:frame.backgroundColor,expected:getComputedStyle(expected).backgroundColor,overflow:root.scrollWidth>root.clientWidth});expected.remove();
    }
    document.querySelector('#result').textContent=JSON.stringify(results);
  </script>`
  );
  const result = spawnSync(
    process.env.EDGE_BINARY ??
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    [
      '--headless=new',
      `--user-data-dir=${join(temporary, 'profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--dump-dom',
      `file://${file}`
    ],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 2_000_000 }
  );
  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
  assert.ok(match, 'Computed layout results');
  const measurements = JSON.parse(match[1]);
  for (const row of measurements) {
    assert.equal(row.nav, 38, JSON.stringify(row));
    assert.equal(row.background, row.expected);
    assert.equal(row.overflow, false);
  }
  assert.notEqual(measurements[0].background, measurements[3].background);
  console.log(
    'Verified scanner theme backgrounds and 38px navigation in light/dark at 400/600/800px.'
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
