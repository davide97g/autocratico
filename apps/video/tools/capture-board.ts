// Captures the public demo (made-up register, no server, scripted chat) through the Board story, as the
// textures of the Board promo (public/board/), with the layout of what the scenes animate over
// (public/board/layout.json: element rectangles in capture pixels).
//
//   pnpm --filter @autocratico/web dev:demo --port 5199     (from the repository root)
//   bun tools/capture-board.ts [--url http://localhost:5199]
import { chromium, type Locator, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const URL0 = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1]! : 'http://localhost:5199';
const OUT = path.resolve(import.meta.dir, '../public/board');
mkdirSync(OUT, { recursive: true });
const SCALE = 2;
const layout: Record<string, { x: number; y: number; w: number; h: number }> = {};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: SCALE,
  locale: 'it-IT',
  timezoneId: 'Europe/Rome',
  colorScheme: 'light',
  reducedMotion: 'reduce', // the scripted chat answers at once; entrance animations are off
});
await ctx.addInitScript(() => {
  localStorage.setItem('autocratico.locale', 'it');
  localStorage.setItem('autocratico.privacy', '0');
  localStorage.setItem('autocratico.chat-open', '1');
});
const page = await ctx.newPage();

/** Hide what belongs to the demo, not to the app: its bottom bar and the notices. */
async function clean(p: Page) {
  await p.mouse.move(10, 470); // no tooltip left open by the last click (the gutter left of the sidebar)
  await p.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('div.fixed')) if (/Demo: dati inventati/.test(el.textContent ?? '')) el.style.display = 'none';
    for (const el of document.querySelectorAll<HTMLElement>('[data-sonner-toaster]')) el.style.display = 'none';
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
}
async function shot(name: string) {
  await clean(page);
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(name);
}
async function rect(name: string, l: Locator) {
  const b = await l.boundingBox();
  if (b) layout[name] = { x: Math.round(b.x * SCALE), y: Math.round(b.y * SCALE), w: Math.round(b.width * SCALE), h: Math.round(b.height * SCALE) };
}
async function crop(name: string, l: Locator) {
  await clean(page);
  await l.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await l.screenshot({ path: path.join(OUT, `${name}.png`) });
  await rect(name, l);
  console.log(name);
}
const chat = () => page.getByRole('complementary', { name: 'Chiedi a Claude' });
const input = () => page.getByRole('textbox', { name: 'Domanda per Claude' });
async function ask(text: string) {
  await input().fill(text);
  await input().press('Enter');
  await page.waitForTimeout(1500);
}

// The demo's intro "generates" a register, then the app opens.
await page.goto(URL0, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Genera il registro' }).click();
await page.getByRole('button', { name: 'Entra' }).click({ timeout: 30_000 });
await page.waitForTimeout(1200);
await page.goto(`${URL0}/#board`);
await page.waitForTimeout(1500);
if (!(await chat().isVisible())) await page.keyboard.press('c');
await chat().getByRole('button', { name: 'Nuova chat' }).click();
await page.waitForTimeout(500);

// 1. The Board as it is, the chat empty.
await shot('board-start');
await rect('chat', chat());
await rect('input', input());
await rect('main', page.locator('main'));
for (const [i, card] of (await page.locator('main [data-slot="card"]').all()).entries()) await rect(`board-card-${i}`, card);

// 2. A widget from the catalog.
await input().fill('Fammi un widget con quanto devo pagare nei prossimi 6 mesi, per area');
await shot('chat-typed');
await input().press('Enter');
await page.waitForTimeout(2500);
await shot('chat-proposal');
const proposal = chat().locator('div.rounded-lg.bg-muted\\/60').filter({ hasText: 'Pagamenti per area' }).first();
await crop('proposal-card', proposal);
await crop('proposal-widget', proposal.locator('div.rounded-lg.bg-card').first());
await rect('chat-messages', chat().locator('div.overflow-y-auto').first());
await proposal.getByRole('button', { name: 'Aggiungi alla Bacheca' }).click();
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(600);
await shot('board-added');
await crop('board-widget-area', page.locator('main [data-slot="card"]').filter({ hasText: 'Pagamenti per area' }).first());

// 3. Custom mode: asked first, then run in the sandbox only on the user's yes.
await page.evaluate(() => window.scrollTo(0, 0));
await chat().getByRole('button', { name: 'Nuova chat' }).click();
await page.waitForTimeout(400);
await input().fill('Fammi una mappa di calore dei pagamenti, cliccabile per mese');
await shot('chat-custom-typed');
await input().press('Enter');
await page.waitForTimeout(2500);
await shot('chat-custom-ask');
await rect('yes', chat().getByRole('button', { name: 'Sì' }));
await chat().getByRole('button', { name: 'Sì' }).click();
await page.waitForTimeout(3500);
await shot('chat-gate');
const gate = chat().locator('div.rounded-lg.bg-muted\\/60').filter({ hasText: 'Esegui in sandbox' }).first();
await crop('gate-card', gate);
await rect('run', gate.getByRole('button', { name: 'Esegui in sandbox' }));
await gate.getByRole('button', { name: 'Mostra codice' }).click();
await page.waitForTimeout(400);
await crop('gate-code', gate);
await gate.getByRole('button', { name: 'Nascondi codice' }).click();
await gate.getByRole('button', { name: 'Esegui in sandbox' }).click();
await page.waitForTimeout(2500);
await shot('chat-heatmap');
const heat = chat().locator('div.rounded-lg.bg-muted\\/60').filter({ hasText: 'Mappa dei pagamenti' }).first();
await crop('heatmap-card', heat);
await crop('heatmap-widget', heat.locator('div.rounded-lg.bg-card').first());
await heat.getByRole('button', { name: 'Aggiungi alla Bacheca' }).click();
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1500);
await shot('board-final');
await crop('board-heatmap', page.locator('main [data-slot="card"]').filter({ hasText: 'Mappa dei pagamenti' }).first());
await page.evaluate(() => window.scrollTo(0, 0));
await page.keyboard.press('Escape'); // the chat closes: the Board alone, full width
await page.waitForTimeout(800);
await shot('board-wide');
await page.screenshot({ path: path.join(OUT, 'board-wide-full.png'), fullPage: true });
for (const [i, card] of (await page.locator('main [data-slot="card"]').all()).entries()) await rect(`wide-card-${i}`, card);

// 4. The question as it is typed and answered, in real time (no reduced motion): chat panel frames.
{
  const live = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE, locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: 'light' });
  await live.addInitScript(() => {
    localStorage.setItem('autocratico.locale', 'it');
    localStorage.setItem('autocratico.privacy', '0');
    localStorage.setItem('autocratico.chat-open', '1');
  });
  const p = await live.newPage();
  await p.goto(URL0, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Genera il registro' }).click();
  await p.getByRole('button', { name: 'Entra' }).click({ timeout: 30_000 });
  await p.waitForTimeout(1500);
  await p.goto(`${URL0}/#board`);
  await p.waitForTimeout(1500);
  const panel = p.getByRole('complementary', { name: 'Chiedi a Claude' });
  if (!(await panel.isVisible())) await p.keyboard.press('c');
  await panel.getByRole('button', { name: 'Nuova chat' }).click();
  await p.waitForTimeout(800);
  await clean(p);
  const field = p.getByRole('textbox', { name: 'Domanda per Claude' });
  const prompt = 'Fammi un widget con quanto devo pagare nei prossimi 6 mesi, per area';
  const live_ = { type: [] as string[], think: [] as { file: string; t: number }[] };
  for (let n = 0, i = 0; n <= prompt.length; n = Math.min(prompt.length, n + 3), i++) {
    await field.fill(prompt.slice(0, n));
    await p.mouse.move(10, 470);
    const file = `type-${String(i).padStart(2, '0')}.jpg`;
    await panel.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 });
    live_.type.push(file);
    if (n === prompt.length) break;
  }
  await field.press('Enter');
  const t0 = Date.now();
  // until the preview has finished its own entrance (the donut draws itself in about 1.5 s)
  let shown = 0;
  for (let i = 0; Date.now() - t0 < 12000; i++) {
    const file = `think-${String(i).padStart(2, '0')}.jpg`;
    await panel.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 });
    live_.think.push({ file, t: (Date.now() - t0) / 1000 });
    if (!shown && (await panel.getByRole('button', { name: 'Aggiungi alla Bacheca' }).isVisible().catch(() => false))) shown = Date.now();
    if (shown && Date.now() - shown > 2000) break;
  }
  // where the preview's parts are, in chat-panel pixels (for the reveal over the last frame)
  const pb = (await panel.boundingBox())!;
  const rel = async (name: string, l: Locator) => {
    const b = await l.boundingBox();
    if (b) layout[name] = { x: Math.round((b.x - pb.x) * SCALE), y: Math.round((b.y - pb.y) * SCALE), w: Math.round(b.width * SCALE), h: Math.round(b.height * SCALE) };
  };
  const card = panel.locator('div.rounded-lg.bg-muted\\/60').filter({ hasText: 'Pagamenti per area' }).first();
  await rel('live-card', card);
  await rel('live-widget', card.locator('div.rounded-lg.bg-card').first());
  await rel('live-number', card.getByText('3401,22 €').first());
  await rel('live-donut', card.locator('svg.recharts-surface').first());
  for (const [i, li] of (await card.locator('li').all()).entries()) await rel(`live-legend-${i}`, li);
  await rel('live-note', card.getByText('Le stime vengono').first());
  await rel('live-add', card.getByRole('button', { name: 'Aggiungi alla Bacheca' }));
  layout.panel = { x: Math.round(pb.x * SCALE), y: Math.round(pb.y * SCALE), w: Math.round(pb.width * SCALE), h: Math.round(pb.height * SCALE) };
  writeFileSync(path.join(OUT, 'live.json'), JSON.stringify(live_, null, 2));
  await live.close();
}

writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout, null, 2));
await browser.close();
