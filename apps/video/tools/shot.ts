// Screenshot a page of the dev server once it sets window.__ready: bun tools/shot.ts URL out.png [WxH]
import { chromium } from 'playwright-core';
const [url, out, size = '1920x1080'] = process.argv.slice(2);
const [vw, vh] = size.split('x').map(Number) as [number, number];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
const p = await b.newPage({ viewport: { width: vw, height: vh } });
const logs: string[] = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push(e.message));
await p.goto(url!);
await p.waitForFunction(() => (window as any).__ready, null, { timeout: 30000 }).catch(() => {});
await p.screenshot({ path: out! });
if (logs.length) console.error(logs.join('\n'));
await b.close();
