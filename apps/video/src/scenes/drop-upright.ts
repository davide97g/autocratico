// drop, the upright cut (9:16, Reels / Shorts). Same beats as the wide plate, recomposed for a phone:
//  - "Il futuro è / automatico," stacked big over white; the black bar wipes on bar 17;
//  - on ink, deadlines.toml in one column at a readable mono size, the camera tilting down the file
//    as it types itself;
//  - AUTO / CRATICO, a stacked lockup filling the safe width;
//  - "Pratico, rapido, / autocratico!": the blocks slam into the phone's Panoramica cards, re-flowed into
//    two tall columns; on the last word the camera pushes into the left column, which *is* the phone's
//    screen, and the iPhone forms around it on the studio grey.
import type * as THREE from 'three';
import type { Frame, PostOverrides, SceneCtx } from '../engine/scene';
import { W, SAFE } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font, glyphX, measure } from '../engine/type';
import { clamp, ease, lerp } from '../engine/util';
import { app, display, drawPhone, drawStudio, loadImage, roundRect, statusOf } from './_motifs';
import { BLOCKS, COLUMN, PHONE_CARDS, type PhoneCardId } from './drop-data';
import type Drop from './drop';
import type { Placed } from './drop';

const TRACK = -0.04;
const FLY = 0.26;
const PUSH = 0.3;
/** Width everything is set to: the safe box. */
const TW = SAFE.right - SAFE.left;
// the toml column
const MONO = 30, LH = 46, PAD = 30, GAP = 22;
/** How far the camera tilts down the file (px). */
const TILT = 1500;
// the bento: two columns of the phone's cards at S0; the phone at the end (screen at S1)
const S0 = 0.45;
const COLX = [SAFE.left, SAFE.left + 1083 * S0 + 28];
const PHONE = { cx: 492, cy: 1320, h: 1500 };
const PK = PHONE.h / 900, S1 = (393 * PK) / 1179, PSX = PHONE.cx - (393 * PK) / 2, PSY = PHONE.cy - 426 * PK;

type R = { x: number; y: number; w: number; h: number };

export interface Upright {
  page: ImageBitmap; screen: ImageBitmap;
  blocks: (Placed & { cy: number })[];
  cards: Record<PhoneCardId, R>;
  ox: number; oy: number;
  pk: number; pkY: number; colY: number;
  ac: [number, number]; acY: [number, number];
  hs: [number, number]; hsY: [number, number];
}

const sinIO = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));

export async function initUpright(d: Drop, ctx: SceneCtx) {
  const [page, screen] = await Promise.all([loadImage(app('phone', 'overview-full')), loadImage(app('phone', 'overview'))]);
  d.img = screen;
  const ly = ctx.lyrics;
  d.l1 = ly.get('Il futuro è automatico', 0);
  d.l2 = ly.get('Pratico');
  d.tBar = ctx.audio.downbeats[17]!;
  d.tAuto = d.l1.words[3]!.start;
  d.tAutoEnd = d.l1.words[3]!.end;
  d.tAc = d.l1.words[4]!.start;
  d.tAcEnd = d.l1.words[4]!.end;
  d.hits = [d.l2.words[0]!.start, d.l2.words[1]!.start, d.l2.words[2]!.start];
  d.ty = { mono: MONO, lh: LH, pad: PAD, big: 64, small: 28, bigY: PAD + 52, smallY: PAD + 90, edge: 28 };
  d.charW = measure('0', F.mono(400), MONO);

  const fit = (s: string, weight: number, cap = 999) => Math.min(cap, (100 * TW) / measure(s, F.sans(weight), 100, TRACK * 100));
  // the pickup, two lines at one size, centred on the safe box's optical centre
  const pk = Math.min(fit('Il futuro è', 600), fit('automatico,', 600));
  const pkY = 845 - 0.97 * pk + 0.74 * pk;
  const colY = pkY + pk * 1.0 + 0.3 * pk + 70;
  // AUTO / CRATICO
  const ac: [number, number] = [fit('AUTO', 900), fit('CRATICO', 900)];
  const acH = 0.73 * ac[0] + 0.1 * ac[0] + 0.73 * ac[1];
  const acY: [number, number] = [845 - acH / 2 + 0.73 * ac[0], 845 + acH / 2];
  // the headline lockup
  const hs: [number, number] = [fit('Pratico, rapido,', 900, 150), fit('autocratico!', 900, 150)];
  const hsY: [number, number] = [SAFE.top + 18 + 0.74 * hs[0], 0];
  hsY[1] = hsY[0] + 0.24 * hs[0] + 0.76 * hs[1];

  // the toml column; each block types once it enters the frame
  const scroll = (t: number) => TILT * sinIO((t - d.tBar) / (d.hits[0] + 0.6 - d.tBar));
  const h = 7 * LH + PAD * 2 - 6;
  const blocks = COLUMN.map((bi, j) => {
    const b = BLOCKS[bi]!;
    const y = colY + j * (h + GAP);
    let t0 = d.tBar + 0.03 + j * 0.05;
    while (y - scroll(t0) > 1760 && t0 < d.hits[2]) t0 += 0.005;
    const chars = b.lines.reduce((n, l) => n + l.length + 1, 0);
    let dateAt = 0;
    for (const l of b.lines) { if (l.startsWith('date')) break; dateAt += l.length + 1; }
    return { ...b, x: SAFE.left, y, cy: y, w: TW, h, t0, chars, dateAt, status: b.days === null ? null : statusOf(b.days, b.severity) };
  });

  // the bento: the left column is the page itself (header + Calendario), then the next task; the right
  // column stacks the rest
  const oy = hsY[1] + 0.22 * hs[1] + 46, ox = SAFE.left - 48 * S0;
  const cards = {} as Record<PhoneCardId, R>;
  const at = (id: PhoneCardId, x: number, y: number) => {
    const [, , w, hh] = PHONE_CARDS[id].rect;
    cards[id] = { x, y, w: w * S0, h: hh * S0 };
    return y + hh * S0 + 22;
  };
  cards.sidebar = { x: ox, y: oy, w: 1179 * S0, h: 470 * S0 };
  let y = at('cal', COLX[0]!, oy + 495 * S0);
  at('next', COLX[0]!, y);
  y = at('watch', COLX[1]!, oy + 495 * S0);
  y = at('load', COLX[1]!, y);
  y = at('dates', COLX[1]!, y);
  at('prat', COLX[1]!, y);
  d.up = { page, screen, blocks, cards, ox, oy, pk, pkY, colY, ac, acY, hs, hsY };
}

// ------------------------------------------------------------------ camera
function scroll(d: Drop, t: number) { return TILT * sinIO((t - d.tBar) / (d.hits[0] + 0.6 - d.tBar)); }
/** The push into the phone (0..1), landing on the last word. */
function push(d: Drop, t: number) { return ease.inOutCubic(clamp((t - (d.hits[2] - PUSH)) / PUSH)); }
/** A bento rect on screen at t: a slow settling pull back, then the push maps the page onto the phone's screen. */
function place(d: Drop, r: R, t: number): R {
  const u = d.up!;
  const s = lerp(1.06, 1, ease.outCubic(clamp((t - (d.hits[0] - FLY)) / (d.hits[2] - d.hits[0]))));
  const ax = 492, ay = u.oy;
  // re-flow: alone, the first column sits centred; it slides aside as the second one lands on "rapido,"
  const dx = ((TW - 1083 * S0) / 2) * (1 - ease.inOutCubic(clamp((t - (d.hits[1] - FLY - 0.08)) / (FLY + 0.08))));
  const a = { x: ax + (r.x + dx - ax) * s, y: ay + (r.y - ay) * s, w: r.w * s, h: r.h * s };
  const p = push(d, t);
  if (p <= 0) return a;
  const m = S1 / S0;
  const b = { x: PSX + (r.x - u.ox) * m, y: PSY + (r.y - u.oy) * m, w: r.w * m, h: r.h * m };
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}
const hitOf = (d: Drop, id: PhoneCardId) => d.hits[PHONE_CARDS[id].hit]!;

function drawCard(d: Drop, c: CanvasRenderingContext2D, id: PhoneCardId, t: number) {
  const u = d.up!;
  const card = PHONE_CARDS[id];
  const r = place(d, u.cards[id], t);
  const k = t - hitOf(d, id);
  const g = 1 + 0.035 * Math.exp(-k * 13) * Math.cos(k * 34);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const w = r.w * g, h = r.h * g, x = cx - w / 2, y = cy - h / 2;
  const rad = 44 * (r.w / card.rect[2]) * g;
  const keep = id === 'sidebar' || id === 'cal';
  c.save();
  c.globalAlpha *= keep ? 1 : 1 - push(d, t);
  roundRect(c, x, y, w, h, id === 'sidebar' ? rad * 0.6 : rad);
  c.clip();
  const [sx, sy, sw, sh] = card.rect;
  c.drawImage(u.page, sx, sy, sw, sh, x, y, w, h);
  c.restore();
  if (card.dark) {
    c.save();
    c.globalAlpha *= 1 - push(d, t);
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.lineWidth = 1.5;
    roundRect(c, x + 0.75, y + 0.75, w - 1.5, h - 1.5, rad); c.stroke();
    c.restore();
  }
}

// ------------------------------------------------------------------ lyric type
function drawPickup(d: Drop, c: CanvasRenderingContext2D, t: number, col: string, autoFull: boolean, dy0 = 0) {
  const u = d.up!;
  const size = u.pk, fam = F.sans(600);
  const rows = [[0, 1, 2], [3]];
  rows.forEach((r, ri) => {
    const text = r.map((i) => d.l1.words[i]!.w).join(' ');
    const y = u.pkY + ri * size * 1.0 + dy0;
    let ci = 0;
    for (const i of r) {
      const w = d.l1.words[i]!;
      const k = t - w.start + 0.02;
      const s = i === 3 && !autoFull ? 'auto' : w.w;
      if (k >= 0) {
        c.save();
        c.globalAlpha *= clamp(k / 0.06);
        const dy = (1 - ease.outCubic(clamp(k / 0.12))) * 14;
        display(c, s, SAFE.left + glyphX(text, ci, fam, size, TRACK * size), y + dy, size, { weight: 600, color: col });
        c.restore();
      }
      ci += Array.from(w.w).length + 1;
    }
  });
}

function drawHeadline(d: Drop, c: CanvasRenderingContext2D, t: number, col: string) {
  const u = d.up!;
  const fam = F.sans(900);
  const rows = [[0, 1], [2]];
  rows.forEach((r, ri) => {
    const size = u.hs[ri]!, y = u.hsY[ri]!;
    const text = r.map((i) => d.l2.words[i]!.w).join(' ');
    let ci = 0;
    for (const i of r) {
      const w = d.l2.words[i]!;
      const k = t - w.start + 0.03;
      if (k >= 0) {
        const a = clamp(k / 0.06);
        const s = a < 1 ? 1.14 - 0.14 * ease.inQuad(a) : 1;
        const x = SAFE.left + glyphX(text, ci, fam, size, TRACK * size);
        c.save();
        c.translate(x, y - size * 0.35);
        c.scale(s, s);
        c.globalAlpha *= 0.25 + 0.75 * a;
        display(c, w.w, 0, size * 0.35, size, { weight: 900, color: col });
        c.restore();
      }
      ci += Array.from(w.w).length + 1;
    }
  });
}

/** AUTO / CRATICO: the giant word as a stacked lockup, both lines filling the safe width. */
function drawAutocratico(d: Drop, c: CanvasRenderingContext2D, t: number) {
  const u = d.up!;
  const k = t - d.tAc + 0.03;
  if (k < 0 || t >= d.hits[0]) return;
  const a = clamp(k / 0.07);
  const s = a < 1 ? 1.1 - 0.1 * ease.inQuad(a) : 1 + 0.012 * (t - d.tAc);
  c.save();
  c.translate(492, 845);
  c.scale(s, s);
  c.translate(-492, -845);
  c.globalAlpha = 0.3 + 0.7 * a;
  display(c, 'AUTO', SAFE.left - u.ac[0] * 0.02, u.acY[0], u.ac[0], { weight: 900, color: HEX.sheet });
  display(c, 'CRATICO', SAFE.left - u.ac[1] * 0.02, u.acY[1], u.ac[1], { weight: 900, color: HEX.sheet });
  c.restore();
}

// ------------------------------------------------------------------ render
export function renderUpright(d: Drop, ctx: SceneCtx, f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
  const u = d.up!;
  const t = f.t;
  const c = d.layer.ctx;
  const [h1, , h3] = d.hits;
  let post: PostOverrides;

  if (t < d.tBar) {
    d.layer.clear(HEX.sheet);
    drawPickup(d, c, t, HEX.pen, false);
    const v = clamp((t - (d.tBar - 0.28)) / 0.28);
    if (v > 0) {
      c.fillStyle = HEX.ink;
      c.fillRect(0, 0, W * ease.inQuad(v), 1920);
    }
    post = { paper: 1, grain: 0.02, vignette: 0.1, ca: 0 };
  } else if (t < h3) {
    d.layer.clear(HEX.ink);
    const sc = scroll(d, t);
    // the line goes on, white, and the file scrolls up under it
    const la = 1 - clamp((t - (d.tAutoEnd + 0.06)) / 0.18);
    if (la > 0) {
      c.save(); c.globalAlpha = la;
      drawPickup(d, c, Math.max(t, d.tAuto + 0.2), HEX.sheet, true, -sc);
      c.restore();
    }
    const dim = t >= h1 ? 0.3 * (1 - clamp((t - h1) / 0.2)) : 1 - 0.65 * clamp((t - d.tAc + 0.03) / 0.08);
    for (const b of u.blocks) {
      if (t >= hitOf(d, b.card) - FLY) continue;
      const y = b.cy - sc;
      if (y > 1920 || y + b.h < 0) continue;
      d.drawBlockBody(c, b, b.x, y, t, dim);
    }
    // the file's name, in the editor's title bar
    const fa = clamp((t - d.tBar) / 0.2) * (1 - clamp((t - h1 + 0.1) / 0.1));
    if (fa > 0) {
      c.save();
      const g = c.createLinearGradient(0, 0, 0, SAFE.top + 130);
      g.addColorStop(0, 'rgba(10,10,10,1)'); g.addColorStop(0.7, 'rgba(10,10,10,0.92)'); g.addColorStop(1, 'rgba(10,10,10,0)');
      c.globalAlpha = fa;
      c.fillStyle = g;
      c.fillRect(0, 0, W, SAFE.top + 130);
      c.font = font(F.mono(400), 30);
      c.fillStyle = HEX.muted;
      c.textBaseline = 'alphabetic';
      c.fillText('~/registro/deadlines.toml', SAFE.left, SAFE.top + 34);
      c.restore();
    }
    for (const id of Object.keys(PHONE_CARDS) as PhoneCardId[]) if (t >= hitOf(d, id)) drawCard(d, c, id, t);
    // blocks in flight into their cards (the card's content shows through the growing window)
    for (const b of u.blocks) {
      const T = hitOf(d, b.card);
      if (t < T - FLY || t >= T) continue;
      const v = clamp((t - (T - FLY)) / FLY);
      const e = ease.inCubic(v);
      const r = place(d, u.cards[b.card], t);
      // a block scrolled out above comes back in from below, so it never crosses the headline
      let y0 = b.cy - scroll(d, T - FLY);
      if (y0 < u.oy - 120) y0 = 1960;
      const x = lerp(b.x, r.x, e), y = lerp(y0, r.y, e), w = lerp(b.w, r.w, e), h = lerp(b.h, r.h, e);
      const ca = ease.inOutQuad(clamp((v - 0.3) / 0.45));
      c.save();
      roundRect(c, x, y, w, h, lerp(16, 44 * (r.w / PHONE_CARDS[b.card].rect[2]), e));
      c.fillStyle = HEX.ink2;
      c.fill();
      c.clip();
      c.globalAlpha = ca;
      const [sx, sy, sw, sh] = PHONE_CARDS[b.card].rect;
      c.drawImage(u.page, sx, sy, sw, sh, x + w / 2 - r.w / 2, y + h / 2 - r.h / 2, r.w, r.h);
      c.restore();
      d.drawBlockBody(c, b, x, y, t, 1 - clamp(v / 0.5), true);
    }
    // the header slides in with the first hit; Pratiche rises in with the second
    const Ts = hitOf(d, 'sidebar'), ks = t - (Ts - FLY);
    if (ks >= 0 && t < Ts) {
      const r = place(d, u.cards.sidebar, t);
      const e = ease.inCubic(clamp(ks / FLY));
      c.save();
      c.translate(lerp(-r.x - r.w - 40, 0, e), 0);
      roundRect(c, r.x, r.y, r.w, r.h, 26 * S0); c.clip();
      c.drawImage(u.page, 0, 0, 1179, 470, r.x, r.y, r.w, r.h);
      c.restore();
    }
    const Tp = hitOf(d, 'prat'), kp = t - (Tp - FLY);
    if (kp >= 0 && t < Tp) {
      const r = place(d, u.cards.prat, t);
      const e = ease.inCubic(clamp(kp / FLY));
      c.save();
      c.translate(0, lerp(1920 - r.y + 40, 0, e));
      roundRect(c, r.x, r.y, r.w, r.h, 44 * S0); c.clip();
      const [sx, sy, sw, sh] = PHONE_CARDS.prat.rect;
      c.drawImage(u.page, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
      c.restore();
    }
    // the giant word stays on top of the flights while it is sung
    drawAutocratico(d, c, t);
    if (t >= h1 - 0.03) drawHeadline(d, c, t, HEX.sheet);
    const punch = 0.035 * Math.exp(-(t - d.tBar) * 9) + d.hits.reduce((m, T) => Math.max(m, t >= T ? 0.012 * Math.exp(-(t - T) * 12) : 0), 0);
    post = { paper: 0, grain: 0.045, vignette: 0.28, ca: 0.3, bloom: 0, halation: 0, zoom: 1 + punch };
  } else {
    // ---- the real thing: the iPhone forms around the column, on the studio grey
    d.layer.clear(HEX.paper);
    drawStudio(c, { drift: t * 0.3 });
    const k = t - h3;
    const g = 1 + 0.012 * Math.exp(-k * 12) * Math.cos(k * 30);
    const rise = 26 * ease.inOutQuad(clamp(k / 0.9));
    c.save();
    c.translate(PHONE.cx, PSY);
    c.scale(g, g);
    c.translate(-PHONE.cx, -PSY - rise);
    drawPhone(c, u.screen, PHONE.cx, PHONE.cy, PHONE.h, { shadow: clamp(k / 0.3) });
    c.restore();
    drawHeadline(d, c, t, HEX.pen);
    post = { paper: 1, grain: 0.03, vignette: 0.15, halation: 0, zoom: 1 + 0.01 * Math.exp(-k * 12) };
  }

  ctx.comp.draw(ctx.renderer, d.layer.upload(), out, { mode: 'replace' });
  return post;
}
