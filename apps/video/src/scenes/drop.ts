// drop — il futuro è automatico (chorus a). The pickup "Il futuro è" over the white the follia plate
// left; on "auto-MA-tico" (bar 17) the black redaction bar wipes the frame. On ink, deadlines.toml
// types itself at speed (the made-up demo register), each block ruled and counted by its status.
// AUTOCRATICO, giant. Then "Pratico, rapido, autocratico!": three hits where the toml blocks slam
// into the bento cards of the Panoramica, which resolves into the real capture in a browser window
// on the studio grey: from rage to the calm register.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, VERTICAL } from '../engine/gl';
import { HEX, rgba } from '../engine/palette';
import { F, font, glyphX, measure } from '../engine/type';
import type { Line } from '../engine/lyrics';
import { clamp, ease, lerp } from '../engine/util';
import { renderUpright, initUpright, type Upright } from './drop-upright';
import {
  app, display, drawBar, drawBrowser, drawStudio, loadImage, roundRect, statusOf,
  STATUS_COLOR, type Status,
} from './_motifs';
import { BLOCKS, CARDS, type Block, type CardId } from './drop-data';

const TRACK = -0.04;
// the final framing: the browser window (1440 px wide, so the 2880 px capture lands at 0.5)
const BX = 240, BY = 200, BW = 1440, BAR = 52, CY = BY + BAR, CS = 0.5;
// toml blocks on ink
const MONO = 15, LH = 24, BLK_W = 410, BLK_PAD = 22;
const COLS = [95, 527, 959, 1391], ROWS = [84, 776];
const FLY = 0.26; // a block's flight into its card (s), landing on the word

export interface Placed extends Block {
  x: number; y: number; w: number; h: number;
  t0: number; chars: number; status: Status | null;
  /** char index where the date line starts (the counter appears once it is typed) */
  dateAt: number;
}

export default class Drop extends Scene {
  layer = new Layer2D();
  img!: ImageBitmap;
  blocks: Placed[] = [];
  l1!: Line; l2!: Line;
  tBar = 0; tAuto = 0; tAutoEnd = 0; tAc = 0; tAcEnd = 0;
  hits: [number, number, number] = [0, 0, 0];
  charW = 9;
  headSize = 88;
  /** The toml's type metrics (the upright cut sets them larger). */
  ty = { mono: MONO, lh: LH, pad: BLK_PAD, big: 30, small: 12, bigY: 44, smallY: 64, edge: 18 };
  /** The upright cut's layout and state (drop-upright.ts). */
  up: Upright | null = null;

  override async init() {
    if (VERTICAL) { await initUpright(this, this.ctx); return; }
    this.img = await loadImage(app('desktop', 'overview'));
    const ly = this.ctx.lyrics;
    this.l1 = ly.get('Il futuro è automatico', 0);
    this.l2 = ly.get('Pratico');
    this.tBar = this.ctx.audio.downbeats[17]!;
    this.tAuto = this.l1.words[3]!.start;
    this.tAutoEnd = this.l1.words[3]!.end;
    this.tAc = this.l1.words[4]!.start;
    this.tAcEnd = this.l1.words[4]!.end;
    this.hits = [this.l2.words[0]!.start, this.l2.words[1]!.start, this.l2.words[2]!.start];
    this.charW = measure('0', F.mono(400), MONO);
    const order = [0, 4, 1, 5, 2, 6, 3, 7];
    BLOCKS.forEach((b, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const chars = b.lines.reduce((n, l) => n + l.length + 1, 0);
      let dateAt = 0;
      for (const l of b.lines) { if (l.startsWith('date')) break; dateAt += l.length + 1; }
      this.blocks.push({
        ...b, x: COLS[col]!, y: ROWS[row]!, w: BLK_W, h: b.lines.length * LH + BLK_PAD * 2 - 6,
        t0: this.tBar + 0.03 + order.indexOf(i) * 0.055, chars, dateAt,
        status: b.days === null ? null : statusOf(b.days, b.severity),
      });
    });
    const full = this.l2.text;
    this.headSize = Math.min(104, (100 * BW) / measure(full, F.sans(900), 100, TRACK * 100));
  }

  // ------------------------------------------------------------------ camera and cards
  /** Zoom of the bento grid: a slow, settling pull back from the first hit to the cut. */
  cam(t: number) {
    return lerp(1.085, 1, ease.outCubic(clamp((t - (this.hits[0] - FLY)) / (this.ctx.end - this.hits[0] + FLY))));
  }
  /** A capture rect (capture px) on screen at zoom s, anchored at the top centre of the content. */
  scr(r: [number, number, number, number], s: number) {
    const [x, y, w, h] = r;
    const ax = W / 2, ay = CY;
    return { x: ax + (BX + x * CS - ax) * s, y: ay + (CY + y * CS - ay) * s, w: w * CS * s, h: h * CS * s };
  }
  hitOf(card: CardId) { return this.hits[CARDS[card].hit]!; }

  drawCard(c: CanvasRenderingContext2D, id: CardId, t: number, s: number) {
    const card = CARDS[id];
    const T = this.hitOf(id);
    const r = this.scr(card.rect, s);
    // landing: a small overshoot around the card's centre
    const k = t - T;
    const g = 1 + 0.035 * Math.exp(-k * 13) * Math.cos(k * 34);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const w = r.w * g, h = r.h * g, x = cx - w / 2, y = cy - h / 2;
    const rad = 18 * s * g;
    c.save();
    roundRect(c, x, y, w, h, rad);
    c.clip();
    const [sx, sy, sw, sh] = card.rect;
    c.drawImage(this.img, sx, sy, sw, sh, x, y, w, h);
    c.restore();
    if (card.dark) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.lineWidth = 1;
      roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, rad); c.stroke();
      c.restore();
    }
  }

  // ------------------------------------------------------------------ toml
  drawBlockBody(c: CanvasRenderingContext2D, b: Placed, x: number, y: number, t: number, alpha: number, bare = false) {
    const n = Math.floor((t - b.t0) * 290);
    const T = this.ty;
    if (n <= 0 || alpha <= 0) return;
    c.save();
    c.globalAlpha *= alpha;
    // the cell
    if (!bare) {
      c.fillStyle = HEX.ink2;
      roundRect(c, x, y, b.w, b.h, VERTICAL ? 16 : 12); c.fill();
    }
    c.fillStyle = b.status ? STATUS_COLOR[b.status] : HEX.graphite;
    if (VERTICAL) { roundRect(c, x, y + 14, 5, b.h - 28, 2.5); c.fill(); } else { roundRect(c, x, y + 10, 3, b.h - 20, 1.5); c.fill(); }
    c.font = font(F.mono(400), T.mono);
    c.textBaseline = 'alphabetic';
    let left = n, cxp = x + T.pad, cyp = y + T.pad + T.mono;
    for (let li = 0; li < b.lines.length && left > 0; li++) {
      const line = b.lines[li]!;
      const shown = Math.min(line.length, left);
      left -= line.length + 1;
      cyp = y + T.pad + T.mono + li * T.lh - 2;
      const eq = line.indexOf(' = ');
      const segs: [number, number, string][] = eq < 0
        ? [[0, line.length, HEX.faint]]
        : [[0, eq, HEX.muted], [eq, eq + 3, HEX.graphite], [eq + 3, line.length, HEX.sheet]];
      for (const [a, z, col] of segs) {
        if (shown <= a) break;
        const part = line.slice(a, Math.min(z, shown));
        if (line.startsWith('amount') && a === eq + 3) {
          // amounts are hidden, as in privacy mode
          drawBar(c, x + T.pad + a * this.charW, cyp - T.mono * 0.78, Math.min(z, shown) - a > 0 ? 6 * this.charW : 0, T.mono * 0.95, 1, rgba('sheet', 0.85));
          continue;
        }
        c.fillStyle = col;
        c.fillText(part, x + T.pad + a * this.charW, cyp);
      }
      cxp = x + T.pad + shown * this.charW;
    }
    // the cursor while typing
    if (n < b.chars) {
      c.fillStyle = HEX.sheet;
      c.fillRect(cxp + 1, cyp - T.mono * 0.8, this.charW * 0.9, T.mono * 1.05);
    }
    // days left, counted as soon as the date is typed
    if (n > b.dateAt + 6) {
      const a = clamp((n - b.dateAt - 6) / 20);
      c.globalAlpha *= a;
      c.font = font(F.mono(500), T.big);
      c.textAlign = 'right';
      c.fillStyle = b.status ? STATUS_COLOR[b.status] : HEX.graphite;
      c.fillText(b.days === null ? '—' : b.days < 0 ? `−${-b.days}` : String(b.days), x + b.w - T.edge, y + T.bigY);
      c.font = font(F.mono(400), T.small);
      c.fillStyle = HEX.muted;
      c.fillText(b.days === null ? 'senza data' : 'giorni', x + b.w - T.edge, y + T.smallY);
    }
    c.restore();
  }

  // ------------------------------------------------------------------ lyric type
  /** "Il futuro è automatico," set calm and centred; `upto` limits "automatico" to its sung part. */
  drawPickup(c: CanvasRenderingContext2D, t: number, col: string, autoFull: boolean) {
    const fam = F.sans(600), size = 112;
    const text = this.l1.words.slice(0, 4).map((w) => w.w).join(' ');
    const tw = measure(text, fam, size, TRACK * size);
    const x0 = W / 2 - tw / 2, y = 580;
    let ci = 0;
    this.l1.words.slice(0, 4).forEach((w, i) => {
      const k = t - w.start + 0.02;
      let s = w.w;
      if (i === 3 && !autoFull) s = 'auto';
      if (k >= 0) {
        c.save();
        c.globalAlpha *= clamp(k / 0.06);
        const dy = (1 - ease.outCubic(clamp(k / 0.12))) * 10;
        display(c, s, x0 + glyphX(text, ci, fam, size, TRACK * size), y + dy, size, { weight: 600, color: col });
        c.restore();
      }
      ci += Array.from(w.w).length + 1;
    });
  }

  drawHeadline(c: CanvasRenderingContext2D, t: number, col: string) {
    const fam = F.sans(900), size = this.headSize;
    const text = this.l2.text;
    let ci = 0;
    for (const w of this.l2.words) {
      const k = t - w.start + 0.03;
      if (k >= 0) {
        const u = clamp(k / 0.06);
        const s = u < 1 ? 1.14 - 0.14 * ease.inQuad(u) : 1;
        const x = BX + glyphX(text, ci, fam, size, TRACK * size), y = 148;
        c.save();
        c.translate(x, y - size * 0.35);
        c.scale(s, s);
        c.globalAlpha *= 0.25 + 0.75 * u;
        display(c, w.w, 0, size * 0.35, size, { weight: 900, color: col });
        c.restore();
      }
      ci += Array.from(w.w).length + 1;
    }
  }

  drawAutocratico(c: CanvasRenderingContext2D, t: number) {
    const k = t - this.tAc + 0.03;
    if (k < 0 || t >= this.hits[0]) return;
    const fam = F.sans(900);
    const text = 'AUTOCRATICO';
    const size = (100 * 1780) / measure(text, fam, 100, TRACK * 100);
    const u = clamp(k / 0.07);
    const s = u < 1 ? 1.1 - 0.1 * ease.inQuad(u) : 1 + 0.012 * (t - this.tAc);
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(s, s);
    c.globalAlpha = 0.3 + 0.7 * u;
    display(c, text, 0, size * 0.36, size, { weight: 900, color: HEX.sheet, align: 'center' });
    c.restore();
  }

  // ------------------------------------------------------------------ render
  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    if (this.up) return renderUpright(this, this.ctx, f, out);
    const t = f.t;
    const c = this.layer.ctx;
    const [h1, , h3] = this.hits;
    let post: PostOverrides;

    if (t < this.tBar) {
      // ---- the pickup over white, then the bar
      this.layer.clear(HEX.sheet);
      this.drawPickup(c, t, HEX.pen, false);
      // the redaction bar (drawWipe's cover half, eased in here so it slams onto the downbeat)
      const v = clamp((t - (this.tBar - 0.28)) / 0.28);
      if (v > 0) {
        c.fillStyle = HEX.ink;
        c.fillRect(0, 0, W * ease.inQuad(v), H);
      }
      post = { paper: 1, grain: 0.02, vignette: 0.1, ca: 0 };
    } else if (t < h3) {
      // ---- ink: the plain text under everything
      this.layer.clear(HEX.ink);
      const s = this.cam(t);
      // the line goes on, white, where the bar left it
      const la = 1 - clamp((t - (this.tAutoEnd + 0.06)) / 0.18);
      if (la > 0) {
        c.save(); c.globalAlpha = la;
        this.drawPickup(c, Math.max(t, this.tAuto + 0.2), HEX.sheet, true);
        c.restore();
      }
      // blocks still waiting for their card (dimmed once the grid starts to cover them)
      for (const b of this.blocks) {
        const T = this.hitOf(b.card);
        if (t >= T - FLY) continue;
        this.drawBlockBody(c, b, b.x, b.y, t, t >= h1 ? 0.32 : 1);
      }
      this.drawAutocratico(c, t);
      // cards that have landed
      for (const id of Object.keys(CARDS) as CardId[]) if (t >= this.hitOf(id)) this.drawCard(c, id, t, s);
      // blocks in flight: each cell grows into its card on the way and lands on the word. The card's
      // real content shows through the growing window (never stretched), the toml fades out of it.
      for (const b of this.blocks) {
        const T = this.hitOf(b.card);
        if (t < T - FLY || t >= T) continue;
        const v = clamp((t - (T - FLY)) / FLY);
        const u = ease.inCubic(v);
        const card = CARDS[b.card];
        const r = this.scr(card.rect, s);
        const x = lerp(b.x, r.x, u), y = lerp(b.y, r.y, u), w = lerp(b.w, r.w, u), h = lerp(b.h, r.h, u);
        const rad = lerp(12, 18 * s, u);
        const ca = ease.inOutQuad(clamp((v - 0.3) / 0.45));
        c.save();
        roundRect(c, x, y, w, h, rad);
        c.fillStyle = HEX.ink2;
        c.fill();
        c.clip();
        c.globalAlpha = ca;
        const [sx, sy, sw, sh] = card.rect;
        c.drawImage(this.img, sx, sy, sw, sh, x + w / 2 - r.w / 2, y + h / 2 - r.h / 2, r.w, r.h);
        c.restore();
        this.drawBlockBody(c, b, x, y, t, 1 - clamp(v / 0.5), true);
      }
      // the sidebar slides in with the first hit, so the grid is never lopsided
      const Ts = this.hitOf('sidebar'), ks = t - (Ts - FLY);
      if (ks >= 0 && t < Ts) {
        const r = this.scr(CARDS.sidebar.rect, s);
        const u = ease.inCubic(clamp(ks / FLY));
        c.save();
        c.translate(lerp(-r.x - r.w - 40, 0, u), 0);
        c.beginPath(); roundRect(c, r.x, r.y, r.w, r.h, 18 * s); c.clip();
        const [sx, sy, sw, sh] = CARDS.sidebar.rect;
        c.drawImage(this.img, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
        c.restore();
      }
      if (t >= h1 - 0.03) this.drawHeadline(c, t, HEX.sheet);
      // the file, named
      c.save();
      c.globalAlpha = clamp((t - this.tBar) / 0.2) * (1 - clamp((t - h1 + 0.1) / 0.1));
      c.font = font(F.mono(400), 14);
      c.fillStyle = HEX.muted;
      c.fillText('~/registro/deadlines.toml', COLS[0]!, 1040);
      c.restore();
      // the downbeat lands as a punch; the card hits as small ones
      const punch = 0.035 * Math.exp(-(t - this.tBar) * 9) + this.hits.reduce((m, T) => Math.max(m, t >= T ? 0.012 * Math.exp(-(t - T) * 12) : 0), 0);
      post = { paper: 0, grain: 0.045, vignette: 0.28, ca: 0.3, bloom: 0, halation: 0, zoom: 1 + punch };
    } else {
      // ---- the real thing, on the studio grey
      this.layer.clear(HEX.paper);
      drawStudio(c, { drift: t * 0.3 });
      const s = this.cam(t);
      const k = t - h3;
      const g = 1 + 0.012 * Math.exp(-k * 12) * Math.cos(k * 30);
      c.save();
      c.translate(W / 2, CY);
      c.scale(s * g, s * g);
      c.translate(-W / 2, -CY);
      const cr = drawBrowser(c, this.img, BX, BY, BW, { shadow: clamp(k / 0.3) });
      // the header settles in a beat after the cards
      const ha = 1 - ease.outCubic(clamp((k - 0.06) / 0.22));
      if (ha > 0) {
        c.fillStyle = rgba('paper', ha);
        c.fillRect(cr.x + 600 * CS, cr.y, (2880 - 600) * CS, 240 * CS);
      }
      c.restore();
      this.drawHeadline(c, t, HEX.pen);
      post = { paper: 1, grain: 0.03, vignette: 0.15, halation: 0, zoom: 1 + 0.01 * Math.exp(-k * 12) };
    }

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return post;
  }
}
