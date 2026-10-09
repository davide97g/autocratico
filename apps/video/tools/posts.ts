// Capture every Instagram post slide (posts.html) as 1080x1350 PNG + JPEG, and a contact sheet:
//   bun tools/posts.ts [--url http://localhost:5173] [--only lancio,phishing]   -> ../../var/video/posts/
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const APP = path.resolve(import.meta.dir, '..');
const OUT = path.resolve(APP, '../../var/video/posts');

async function isTrailer(url: string) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok && (await r.text()).includes('Autocratico — trailer'); } catch { return false; }
}
let url = opt('url', 'http://localhost:5173')!;
let stop = () => {};
if (!(await isTrailer(url))) {
  const port = 5300 + Math.floor(Math.random() * 500);
  const proc = Bun.spawn(['bunx', 'vite', '--port', String(port), '--strictPort'], { cwd: APP, stdout: 'ignore', stderr: 'ignore', env: { ...process.env, VIDEO_NO_HMR: '1' } });
  url = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !(await isTrailer(url)); i++) await Bun.sleep(100);
  stop = () => proc.kill();
}

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push(e.message));
try {
  await p.goto(`${url}/posts.html?p=none`);
  await p.waitForFunction(() => (window as any).__ready, null, { timeout: 60000 });
  const posts: Record<string, { title: string; n: number }> = await p.evaluate(() => (window as any).__posts);
  const only = opt('only')?.split(',');
  const files: string[] = [];
  for (const [id, { n }] of Object.entries(posts)) {
    if (only && !only.includes(id)) continue;
    mkdirSync(path.join(OUT, id), { recursive: true });
    for (let s = 1; s <= n; s++) {
      await p.goto(`${url}/posts.html?p=${id}&s=${s}`);
      await p.waitForFunction(() => (window as any).__ready, null, { timeout: 60000 });
      const err = await p.evaluate(() => (window as any).__error);
      if (err) throw new Error(`${id} ${s}: ${err}`);
      const f = path.join(OUT, id, `${String(s).padStart(2, '0')}.png`);
      await p.screenshot({ path: f, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
      await p.screenshot({ path: f.replace(/\.png$/, '.jpg'), type: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
      files.push(f);
      console.log(f);
    }
  }
  // contact sheet: one row per post
  const rows = Object.entries(posts).filter(([id]) => !only || only.includes(id));
  const cols = Math.max(...rows.map(([, v]) => v.n));
  const args = ['ffmpeg', '-y', '-loglevel', 'error'];
  const inputs: string[] = [];
  for (const [id, { n }] of rows) for (let s = 1; s <= cols; s++) inputs.push(s <= n ? path.join(OUT, id, `${String(s).padStart(2, '0')}.png`) : '');
  const filter: string[] = [];
  let k = 0;
  const labels: string[] = [];
  for (const f of inputs) {
    if (f) { args.push('-i', f); filter.push(`[${k}]scale=270:338[v${labels.length}]`); k++; } else { args.push('-f', 'lavfi', '-i', 'color=c=0x222222:s=270x338:d=1'); filter.push(`[${k}]null[v${labels.length}]`); k++; }
    labels.push(`[v${labels.length}]`);
  }
  filter.push(`${labels.join('')}xstack=inputs=${labels.length}:layout=${labels.map((_, i) => `${(i % cols) * 274}_${Math.floor(i / cols) * 342}`).join('|')}:fill=0x222222[out]`);
  args.push('-filter_complex', filter.join(';'), '-map', '[out]', '-frames:v', '1', path.join(OUT, 'sheet.png'));
  await Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' }).exited;
  console.log(path.join(OUT, 'sheet.png'));
} finally {
  if (logs.length) console.error(logs.join('\n'));
  await b.close();
  stop();
}
