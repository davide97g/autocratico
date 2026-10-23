// Captures the public demo (made-up register, scripted chat) through the Agenda story, as the textures of
// the Agenda promo (public/agenda/): the week before and after the agent adds and moves an event, the chat,
// the confirmations, the appointment found in a document, the month. Rectangles the scenes animate over go
// to public/agenda/layout.json (capture pixels, relative to the element they belong to).
//
//   pnpm --filter @autocratico/web dev:demo --port 5199     (from the repository root)
//   bun tools/capture-agenda.ts [--url http://localhost:5199]
import { type BrowserContext, chromium, type Locator, type Page } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const URL0 = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1]! : 'http://localhost:5199';
const OUT = path.resolve(import.meta.dir, '../public/agenda');
mkdirSync(OUT, { recursive: true });
const SCALE = 2;
const ASK = 'Metti in calendario la visita dal dentista giovedì alle 15';
const MOVE = 'Sposta la visita dal dentista a venerdì alle 17';
type Rect = { x: number; y: number; w: number; h: number };
const layout: Record<string, Rect> = {};

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function open(reduced: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: SCALE,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    colorScheme: 'light',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('autocratico.locale', 'it');
    localStorage.setItem('autocratico.privacy', '0');
    localStorage.setItem('autocratico.chat-open', '0');
    localStorage.setItem('autocratico.prefs', JSON.stringify({ agenda: 'week', splash: false }));
  });
  const page = await ctx.newPage();
  await page.goto(URL0, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Genera il registro' }).click();
  await page.getByRole('button', { name: 'Entra' }).click({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.goto(`${URL0}/#agenda`);
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** Hide what belongs to the demo, not to the app; show the whole day in the week. */
async function clean(p: Page) {
  await p.mouse.move(2, 2);
  await p.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('div.fixed')) if (/Demo: dati inventati/.test(el.textContent ?? '')) el.style.display = 'none';
    for (const el of document.querySelectorAll<HTMLElement>('[data-sonner-toaster]')) el.style.display = 'none';
    for (const el of document.querySelectorAll<HTMLElement>('main .overflow-y-auto')) el.style.maxHeight = 'none';
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
async function crop(p: Page, name: string, l: Locator) {
  await clean(p);
  await l.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  await l.screenshot({ path: path.join(OUT, `${name}.png`) });
  await rect(name, l);
  console.log(name);
}

const { ctx, page } = await open(true);
const grid = () => page.locator('main div.overflow-x-auto.rounded-lg.border').first();
const chat = () => page.getByRole('complementary', { name: 'Chiedi a Claude' });
const input = () => page.getByRole('textbox', { name: 'Domanda per Claude' });
const slot = (day: string, time: string) => grid().locator(`button[aria-label^="Aggiungi un evento ${day}"][aria-label$="alle ${time}"]`).first();
const event = (title: string) => grid().locator('button', { hasText: title }).first();

// 1. Next week, before the agent touches it.
await page.getByRole('button', { name: 'Successivo' }).click();
await page.waitForTimeout(800);
await crop(page, 'week-before', grid());
for (const [name, day, time] of [['thu15', 'Giovedì', '15:00'], ['thu16', 'Giovedì', '16:00'], ['fri17', 'Venerdì', '17:00'], ['fri18', 'Venerdì', '18:00']] as const) await rect(`slot-${name}`, slot(day, time), grid());
for (const [i, h] of (await grid().locator('div.border-l.py-2').all()).entries()) await rect(`day-${i}`, h, grid());
await rect('event-caf', event('CAF'), grid());
await rect('event-palestra', event('Palestra'), grid());

// 2. The agent adds the visit.
await page.keyboard.press('c');
await page.waitForTimeout(600);
await chat().getByRole('button', { name: 'Nuova chat' }).click();
await input().fill(ASK);
await input().press('Enter');
await page.waitForTimeout(2500);
await clean(page);
await page.screenshot({ path: path.join(OUT, 'chat-created.png') });
await rect('chat', chat());
await crop(page, 'confirm-created', chat().locator('a[href="#agenda"]').first());
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await crop(page, 'week-after', grid());
await crop(page, 'event-thu', event('Visita dal dentista'));
await rect('event-thu-in-grid', event('Visita dal dentista'), grid());

// 3. Moved, after the yes.
await page.keyboard.press('c');
await page.waitForTimeout(600);
await chat().getByRole('button', { name: 'Nuova chat' }).click();
await input().fill(MOVE);
await input().press('Enter');
await page.waitForTimeout(2500);
await clean(page);
await crop(page, 'chat-move-ask', chat());
await rect('yes', chat().getByRole('button', { name: 'Sì' }).last(), chat());
await chat().getByRole('button', { name: 'Sì' }).last().click();
await page.waitForTimeout(2500);
await clean(page);
await crop(page, 'chat-move-done', chat());
await crop(page, 'confirm-moved', chat().locator('a[href="#agenda"]').last());
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await crop(page, 'week-moved', grid());
await crop(page, 'event-fri', event('Visita dal dentista'));
await rect('event-fri-in-grid', event('Visita dal dentista'), grid());

// 4. The details of the event.
await event('Visita dal dentista').click();
await page.waitForTimeout(600);
await crop(page, 'dialog', page.getByRole('dialog'));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 5. The appointment found in a document, then the month.
await page.evaluate(() => window.scrollTo(0, 0));
const proposal = page.locator('main li', { hasText: 'Ritiro passaporto' }).first();
await crop(page, 'proposal', proposal);
await rect('proposal-add', proposal.getByRole('button', { name: 'Aggiungi' }), proposal);
await proposal.getByRole('button', { name: 'Aggiungi' }).click();
await page.waitForTimeout(800);
await page.getByRole('radio', { name: 'Mese' }).or(page.getByRole('button', { name: 'Mese' })).first().click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Successivo' }).click(); // November: the passport, the trip, the car
await page.waitForTimeout(800);
await crop(page, 'month', grid());
await page.getByRole('button', { name: 'Precedente' }).click();
await page.waitForTimeout(800);
await crop(page, 'month-oct', grid());
await ctx.close();

// 6. The question as it is typed and answered, in real time: chat panel frames.
{
  const { ctx: live, page: p } = await open(false);
  await p.keyboard.press('c');
  await p.waitForTimeout(800);
  const panel = p.getByRole('complementary', { name: 'Chiedi a Claude' });
  await panel.getByRole('button', { name: 'Nuova chat' }).click();
  await p.waitForTimeout(600);
  await clean(p);
  const field = p.getByRole('textbox', { name: 'Domanda per Claude' });
  const frames = { type: [] as string[], think: [] as { file: string; t: number }[] };
  for (let n = 0, i = 0; n <= ASK.length; n = Math.min(ASK.length, n + 3), i++) {
    await field.fill(ASK.slice(0, n));
    await p.mouse.move(2, 2);
    const file = `type-${String(i).padStart(2, '0')}.jpg`;
    await panel.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 });
    frames.type.push(file);
    if (n === ASK.length) break;
  }
  await field.press('Enter');
  const t0 = Date.now();
  let done = 0;
  for (let i = 0; Date.now() - t0 < 12000; i++) {
    const file = `think-${String(i).padStart(2, '0')}.jpg`;
    await panel.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 92 });
    frames.think.push({ file, t: (Date.now() - t0) / 1000 });
    if (!done && (await panel.locator('a[href="#agenda"]').count()) > 0) done = Date.now();
    if (done && Date.now() - done > 700) break;
  }
  await rect('panel', panel);
  await rect('live-confirm', panel.locator('a[href="#agenda"]').first(), panel);
  writeFileSync(path.join(OUT, 'live.json'), JSON.stringify(frames, null, 2));
  await live.close();
}

writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layout, null, 2));
await browser.close();
