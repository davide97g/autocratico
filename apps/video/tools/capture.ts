// Captures the real web app, running on the made-up example/ dataset in Italian, as the textures the
// device mockups show (public/app/). Never point it at a server with personal data.
//
//   AUTOCRATICO_DATA=../../var/video/appdata python3 ../../scripts/init.py      (from apps/video)
//   AUTOCRATICO_DATA=$PWD/../../var/video/appdata PORT=8799 node ../../apps/server/src/main.ts
//   bun tools/capture.ts [--url http://127.0.0.1:8799]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const URL0 = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1]! : 'http://127.0.0.1:8799';
const OUT = path.resolve(import.meta.dir, '../public/app');
mkdirSync(OUT, { recursive: true });

const VIEWS = ['overview', 'deadlines', 'cases', 'inbox', 'activity', 'profile', 'settings', 'timeline', 'catalog'];
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [dev, opts] of Object.entries(DEVICES)) {
  for (const privacy of [false, true]) {
    const ctx = await browser.newContext({ ...opts, locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: 'light' });
    await ctx.addInitScript((p) => {
      localStorage.setItem('autocratico.locale', 'it');
      localStorage.setItem('autocratico.privacy', p ? '1' : '0');
    }, privacy);
    const page = await ctx.newPage();
    for (const v of VIEWS) {
      if (privacy && v !== 'overview' && v !== 'deadlines') continue;
      await page.goto(`${URL0}/#${v}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900); // entrance animations
      const file = path.join(OUT, `${dev}-${v}${privacy ? '-privacy' : ''}.png`);
      await page.screenshot({ path: file });
      if (!privacy && (v === 'overview' || v === 'deadlines' || v === 'inbox' || v === 'activity')) await page.screenshot({ path: file.replace('.png', '-full.png'), fullPage: true });
      console.log(file);
    }
    await ctx.close();
  }
}
await browser.close();
