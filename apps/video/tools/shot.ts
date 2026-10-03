// Screenshot a page of the dev server once it sets window.__ready: bun tools/shot.ts URL out.png
import { chromium } from 'playwright-core';
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push(e.message));
await p.goto(url!);
await p.waitForFunction(() => (window as any).__ready, null, { timeout: 30000 }).catch(() => {});
await p.screenshot({ path: out! });
if (logs.length) console.error(logs.join('\n'));
await b.close();
