// Captures the public demo (made-up register) through the phishing story, as the textures of the phishing
// promo (public/phishing/): the inbox with the flagged email, its row, the analysis the agent wrote (verdict,
// reasons, checks, links) and the email with its suspicious parts marked. Rectangles the scene animates over
// go to public/phishing/layout.json (capture pixels, relative to the element they belong to).
//
//   pnpm --filter @autocratico/web dev:demo --port 5199     (from the repository root)
//   bun tools/capture-phishing.ts [--url http://localhost:5199]
import { chromium, type Locator, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const URL0 = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1]! : 'http://localhost:5199';
const OUT = path.resolve(import.meta.dir, '../public/phishing');
mkdirSync(OUT, { recursive: true });
const SCALE = 2;
const SUBJECT = 'Rimborso fiscale in attesa di conferma';
type Rect = { x: number; y: number; w: number; h: number };
const layout: Record<string, Rect> = {};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: SCALE,
  locale: 'it-IT',
  timezoneId: 'Europe/Rome',
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
await ctx.addInitScript(() => {
  localStorage.setItem('autocratico.locale', 'it');
  localStorage.setItem('autocratico.privacy', '0');
  localStorage.setItem('autocratico.chat-open', '0');
  localStorage.setItem('autocratico.prefs', JSON.stringify({ splash: false }));
});
const page = await ctx.newPage();
await page.goto(URL0, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Genera il registro' }).click();
await page.getByRole('button', { name: 'Entra' }).click({ timeout: 30_000 });
await page.waitForTimeout(1200);
await page.goto(`${URL0}/#inbox`);
await page.waitForTimeout(1500);

/** Hide what belongs to the demo, not to the app. */
async function clean(p: Page) {
  await p.mouse.move(2, 2);
  await p.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('div.fixed')) if (/Demo: dati inventati/.test(el.textContent ?? '')) el.style.display = 'none';
    for (const el of document.querySelectorAll<HTMLElement>('[data-sonner-toaster]')) el.style.display = 'none';
    // the app's top bars float over the content while it scrolls: not part of a crop
    for (const el of document.querySelectorAll<HTMLElement>('.topbar')) el.style.visibility = 'hidden';
    for (const el of document.querySelectorAll<HTMLElement>('pre')) { el.style.maxHeight = 'none'; el.style.overflow = 'visible'; }
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await p.waitForTimeout(300);
}
async function box(l: Locator, rel?: Locator): Promise<Rect | null> {
  const b = await l.boundingBox();
  const o = rel ? await rel.boundingBox() : { x: 0, y: 0 };
  if (!b || !o) return null;
  return { x: Math.round((b.x - o.x) * SCALE), y: Math.round((b.y - o.y) * SCALE), w: Math.round(b.width * SCALE), h: Math.round(b.height * SCALE) };
}
async function rect(name: string, l: Locator, rel?: Locator) {
  const r = await box(l, rel);
  if (r) layout[name] = r;
}
async function crop(name: string, l: Locator) {
  await clean(page);
  await l.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await l.screenshot({ path: path.join(OUT, `${name}.png`) });
  await rect(name, l);
  console.log(name);
}

const card = page.locator('main [data-slot="card"]', { hasText: 'Arrivati' }).first();
const row = card.locator('li', { hasText: SUBJECT }).first();

// 1. The inbox as it arrives: the list, the flagged row.
await crop('inbox', card.locator('ul').first());
await rect('row-in-inbox', row, card.locator('ul').first());
await crop('row', row);
await rect('badge', row.getByText('Possibile phishing', { exact: true }).first(), row);

// 2. The analysis: verdict, reasons, the technical checks, the links; the email with its marks.
await row.getByRole('button', { name: 'Mostra' }).click();
await page.waitForTimeout(1200);
const report = row.locator('div.ring-1', { hasText: 'Da cosa si capisce' }).first();
await crop('report', report);
const reasons = report.locator('section').first();
for (const [i, li] of (await reasons.locator(':scope > ul > li').all()).entries()) await rect(`reason-${i}`, li, report);
const tech = report.locator('section').nth(1);
await rect('tech', tech, report);
await rect('auth', tech.locator('div.flex-wrap').first(), report);
await rect('link', tech.locator('ul > li').first(), report);
await crop('links', tech.locator('ul > li').first());
const email = row.locator('pre').first();
await crop('email', email);
for (const [i, m] of (await email.locator('mark').all()).entries()) await rect(`mark-${i}`, m, email);

// 3. The same email before the marks (dismissed: nothing marked), for the marks to sweep in on the beat.
await row.getByRole('button', { name: 'Non è phishing' }).click();
await page.waitForTimeout(1200);
await crop('email-plain', row.locator('pre').first());

writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout, null, 2));
await browser.close();
