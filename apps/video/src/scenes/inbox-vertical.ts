// The upright cut (9:16) of the inbox plate, part B: the phone's Scadenze page, its October card
// rebuilt as vectors (after apps/web views/deadlines.tsx and the phone capture) so it can scroll and
// light up row by row, plus the lifted "Scadenze" tab whose badge counts on "ti avvisa".
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, TAU } from '../engine/util';
import { roundRect } from './_motifs';
import { icon, bars, truncate, textW } from './inbox-kit';

type St = 'overdue' | 'urgent' | 'soon' | 'planned';
interface DlRow { day: string; dow: string; title: string[]; chip: string; cat: string; sev: number; amount?: string; note?: string; st: St }

// The October card of the demo register, as the phone shows it (public/app/phone-deadlines*.png).
export const DL_ROWS: DlRow[] = [
  { day: '1', dow: 'GIO', title: ['Multa ZTL, pagamento ridotto'], chip: '2 gg fa', cat: 'Veicoli', sev: 3, amount: '83,30 €', note: 'Pagamento ridotto del 30% entro 5 giorni dalla notifica', st: 'overdue' },
  { day: '6', dow: 'MAR', title: ['Bollo auto'], chip: 'tra 3 gg', cat: 'Veicoli', sev: 3, amount: '245,00 €', st: 'urgent' },
  { day: '15', dow: 'GIO', title: ['Rata condominio'], chip: 'tra 12 gg', cat: 'Casa', sev: 2, amount: '180,00 €', st: 'urgent' },
  { day: '20', dow: 'MAR', title: ['Prenotare la carta', 'd’identità'], chip: 'tra 17 gg', cat: 'Documenti', sev: 2, st: 'urgent' },
  { day: '31', dow: 'SAB', title: ['Manutenzione caldaia'], chip: 'tra 28 gg', cat: 'Casa', sev: 1, st: 'soon' },
];
/** The next card, November (it scrolls in under October; its amber row lights with the last one). */
export const DL_NOV: DlRow[] = [
  { day: '15', dow: 'DOM', title: ['Gomme invernali'], chip: 'tra 43 gg', cat: 'Veicoli', sev: 1, st: 'planned' },
  { day: '30', dow: 'LUN', title: ['Secondo acconto IRPEF'], chip: 'tra 58 gg', cat: 'Fisco', sev: 3, amount: '320,00 €', note: 'Solo se previsto dal 730: trattenuto in busta paga', st: 'soon' },
];

const hexRGB = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; };
/** `hex` mixed towards its own grey by (1 - lit). */
function lightUp(hex: string, lit: number) {
  const [r, g, b] = hexRGB(hex);
  const y = 0.3 * r + 0.59 * g + 0.11 * b;
  const m = (v: number) => Math.round(y + (v - y) * clamp(lit));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const CHIP_BG: Record<St, string> = { overdue: '#fbe3e3', urgent: '#fce8dc', soon: '#fcf1d6', planned: '#eeeeee' };
const TILE: Record<St, string> = { overdue: HEX.overdue, urgent: HEX.urgent, soon: HEX.soon, planned: '#0f0f0f' };

/** Row geometry (pt): the separator above each row and its lines' baselines, from the capture. */
export function dlLayout(rows: DlRow[] = DL_ROWS, y0 = 415) {
  let y = y0;
  return rows.map((r) => {
    const top = y;
    const titles = r.title.map((_, i) => top + 31 + i * 20);
    const chipC = titles[titles.length - 1]! + 15;
    const amount = r.amount ? chipC + 25.5 : 0;
    const note = r.note ? (amount || chipC + 10) + 21 : 0;
    const last = note || amount || chipC + 4;
    const end = last + (r.amount ? 20.5 : 22);
    const mid = (titles[0]! - 15 + last + 4) / 2;
    y = end;
    return { top, titles, chipC, amount, note, end, mid };
  });
}

/**
 * The Scadenze screen in pt (393 × 852), scrolled by `scroll` pt: the capture's header (grey, its
 * legend dots lighting with the rows), the October card, the tab bar. `lit[i]` lights row i; `pop[i]`
 * a little scale kick on its tile and chip; `badge` the tab's count (0 = grey, as captured).
 */
export function dlScreen(c: CanvasRenderingContext2D, cap: ImageBitmap, grey: ImageBitmap, scroll: number,
  lit: number[], pop: number[], badge: { n: number; k: number }) {
  c.fillStyle = HEX.paper;
  c.fillRect(0, 0, 393, 852);
  // the header (date, title, search, tabs, legend) from the capture, in greys
  c.drawImage(grey, 0, 0, 1179, 942, 0, -scroll, 393, 314);
  // legend: Scaduta, Urgente, In arrivo light with their first rows
  const leg: [number, number, number][] = [[64, 256, lit[0]!], [292, 476, lit[1]!], [512, 701, lit[4]!]];
  for (const [x0, x1, a] of leg) {
    if (a <= 0) continue;
    c.globalAlpha = a;
    c.drawImage(cap, x0, 650, x1 - x0, 58, x0 / 3, 650 / 3 - scroll, (x1 - x0) / 3, 58 / 3);
    c.globalAlpha = 1;
  }
  // the cards: October, then November scrolling in under it
  const oct = 314, octEnd = dlLayout()[DL_ROWS.length - 1]!.end + 24;
  card(c, 'Ottobre 2026', '5 scadenze', DL_ROWS, oct, octEnd, scroll, lit, pop);
  const nov = octEnd + 22;
  const novEnd = dlLayout(DL_NOV, nov + 101)[DL_NOV.length - 1]!.end + 24;
  card(c, 'Novembre 2026', '2 scadenze', DL_NOV, nov, novEnd, scroll, [0, lit[4]!], [0, pop[4]!]);
  // the status bar fades the page under it
  const gt = c.createLinearGradient(0, 0, 0, 74);
  gt.addColorStop(0, 'rgba(230,230,230,1)'); gt.addColorStop(0.6, 'rgba(230,230,230,0.92)'); gt.addColorStop(1, 'rgba(230,230,230,0)');
  c.fillStyle = gt; c.fillRect(0, 0, 393, 74);
  c.fillStyle = HEX.pen;
  c.font = font(F.sans(600), 16);
  c.fillText('9:41', 52, 34);
  // tab bar
  const g = c.createLinearGradient(0, 735, 0, 790);
  g.addColorStop(0, 'rgba(230,230,230,0)'); g.addColorStop(1, 'rgba(230,230,230,1)');
  c.fillStyle = g; c.fillRect(0, 735, 393, 117);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.10)'; c.shadowBlur = 12; c.shadowOffsetY = 3;
  c.fillStyle = '#f9f9f9';
  roundRect(c, 15.7, 778.7, 362, 66, 24); c.fill();
  c.restore();
  c.save();
  roundRect(c, 15.7, 778.7, 362, 66, 24); c.clip();
  c.drawImage(grey, 47, 2336, 1086, 198, 15.7, 778.7, 362, 66);
  c.restore();
  tabBadge(c, 427 / 3, 2404 / 3, 1, badge.n, badge.k);
}

function card(c: CanvasRenderingContext2D, title: string, sub: string, rows: DlRow[], top: number, bottom: number, scroll: number, lit: number[], pop: number[]) {
  const L = dlLayout(rows, top + 101);
  const cTop = top - scroll;
  const cH = bottom - top;
  if (cTop > 852 || cTop + cH < 0) return;
  c.fillStyle = HEX.sheet;
  roundRect(c, 15.8, cTop, 362.2, cH, 17); c.fill();
  c.strokeStyle = '#d6d6d6'; c.lineWidth = 0.5;
  roundRect(c, 15.8, cTop, 362.2, cH, 17); c.stroke();
  c.fillStyle = '#0a0a0a';
  c.font = font(F.sans(500), 24);
  c.letterSpacing = '-0.6px';
  c.fillText(title, 40, cTop + 46.5);
  c.letterSpacing = '0px';
  c.fillStyle = HEX.muted;
  c.font = font(F.sans(400), 16);
  c.fillText(sub, 40, cTop + 71.5);
  rows.forEach((r, i) => {
    const g = L[i]!;
    const a = lit[i] ?? 0, p = pop[i] ?? 0;
    const yy = (v: number) => v - scroll;
    if (i > 0) { c.fillStyle = '#e8e8e8'; c.fillRect(40, yy(g.top) - 0.25, 314, 0.6); }
    // tile
    const col = TILE[r.st];
    c.save();
    c.translate(64, yy(g.mid));
    c.scale(1 + p, 1 + p);
    c.fillStyle = lightUp(col, a);
    roundRect(c, -24, -24, 48, 48, 9); c.fill();
    const ink = r.st === 'soon' ? (a > 0.5 ? '#1a1a1a' : '#fafafa') : '#fafafa';
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.font = font(F.mono(500), 18);
    c.fillText(r.day, 0, 1.5);
    c.globalAlpha = 0.85;
    c.font = font(F.sans(400), 11);
    c.fillText(r.dow, 0, 17.5);
    c.restore();
    // title, chip, category, amount, note
    c.fillStyle = '#0a0a0a';
    c.font = font(F.sans(500), 16);
    r.title.forEach((s, j) => c.fillText(s, 100, yy(g.titles[j]!)));
    c.font = font(F.sans(500), 14);
    const cw = c.measureText(r.chip).width + 30;
    c.save();
    c.translate(100, yy(g.chipC));
    c.scale(1 + p * 1.2, 1 + p * 1.2);
    c.fillStyle = lightUp(CHIP_BG[r.st], a);
    roundRect(c, 0, -10, cw, 20, 10); c.fill();
    c.fillStyle = r.st === 'planned' ? HEX.faint : lightUp(col, a);
    c.beginPath(); c.arc(12, 0, 3, 0, TAU); c.fill();
    c.fillStyle = r.st === 'soon' ? '#1a1a1a' : r.st === 'planned' ? HEX.graphite : lightUp(col, a);
    c.textBaseline = 'middle';
    c.fillText(r.chip, 21.5, 0.8);
    c.restore();
    c.fillStyle = HEX.muted;
    c.font = font(F.sans(400), 14);
    c.textBaseline = 'middle';
    c.fillText(r.cat, 100 + cw + 12.5, yy(g.chipC) + 0.8);
    c.textBaseline = 'alphabetic';
    bars(c, 100 + cw + 12.5 + c.measureText(r.cat).width + 11, yy(g.chipC) + 6, 0.8, r.sev, '#737373', '#d9d9d9');
    c.fillStyle = HEX.muted;
    if (r.amount) c.fillText(r.amount, 100, yy(g.amount));
    if (r.note) c.fillText(truncate(c, r.note, 200), 100, yy(g.note));
    // Segna fatto (the icon button)
    c.fillStyle = '#0f0f0f';
    roundRect(c, 315, yy(g.mid) - 18.75, 37.5, 37.5, 8.5); c.fill();
    icon(c, 'check', 315 + 10.75, yy(g.mid) - 8, 16, '#fafafa', 2);
  });
}

/** The orange count badge of the Scadenze tab (centre in the current units, `u` per pt). */
export function tabBadge(c: CanvasRenderingContext2D, x: number, y: number, u: number, n: number, k: number) {
  if (n <= 0) return;
  const s = 1 + 0.35 * Math.exp(-Math.max(0, k) * 14);
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = HEX.urgent;
  c.beginPath(); c.arc(0, 0, 8.6 * u, 0, TAU); c.fill();
  c.strokeStyle = '#0f0f0f'; c.lineWidth = 1.4 * u;
  c.stroke();
  c.fillStyle = '#fafafa';
  c.font = font(F.sans(600), 11 * u);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(n), 0, 0.6 * u);
  c.restore();
}

/** The Scadenze tab lifted out of the bar, `u` px per pt, centred at (0, 0). */
export function liftedTab(c: CanvasRenderingContext2D, cap: ImageBitmap, u: number, n: number, k: number) {
  const w = 66, h = 51.3;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.30)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 7 * u;
  c.fillStyle = '#0f0f0f';
  roundRect(c, -w / 2 * u, -h / 2 * u, w * u, h * u, 16 * u); c.fill();
  c.restore();
  c.save();
  roundRect(c, -w / 2 * u, -h / 2 * u, w * u, h * u, 16 * u); c.clip();
  c.drawImage(cap, 279, 2362, 198, 154, -w / 2 * u, -h / 2 * u, w * u, h * u);
  // the captured badge goes: the count is drawn fresh as it is announced
  c.fillStyle = '#0f0f0f';
  c.beginPath(); c.arc((427 - 279 - 99) / 3 * u, (2404 - 2362 - 77) / 3 * u, 9.6 * u, 0, TAU); c.fill();
  c.restore();
  tabBadge(c, (427 - 279 - 99) / 3 * u, (2404 - 2362 - 77) / 3 * u, u, n, k);
}

/** The widest size (≤ max) at which `text` in Geist `weight` fits `maxW`. */
export function fitW(c: CanvasRenderingContext2D, text: string, maxW: number, max = 400, weight = 900, tracking = -0.04) {
  return Math.min(max, maxW / textW(c, text, 100, weight, tracking) * 100);
}
