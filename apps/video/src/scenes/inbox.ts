// 6. inbox — "Mandagli tutto, lui legge e archivia" / "rosso se scade, ti avvisa, e via" (chorus b).
// A: an iPhone with the real Inbox; four items arrive from four sources (Caricamento, Email,
//    Telegram, Comando rapido) on "Mandagli tutto", the agent picks them up ("In lavorazione") and
//    files them on "archivia": each badge flips to "Archiviato" in a cascade that lands on the beat.
//    The headline sits on the left, word by word.
// B: the Scadenze page in a browser, in greys; the status colours light up row by row on
//    "rosso" (red) and "se scade" (orange, then amber); on "ti avvisa" the camera finds the bell and
//    its badge counts up to 4 with the app's tooltip; on "e via" the window whips away.
// No green: "Archiviato" uses the Badge's default (ink) variant here, and captures are degreened.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, prog, springStep, TAU } from '../engine/util';
import { app, drawBrowser, drawPhone, drawStudio, roundRect } from './_motifs';
import { Plane3D, quadShadow, capture, greyCapture, badge, icon, riseWord, textW, truncate, wrap, rgba, type Pose } from './inbox-kit';
import type { Word } from '../engine/lyrics';

type Src = 'upload' | 'mail' | 'send' | 'phone';
interface Item { title: string; source: string; icon: Src; from?: string; date: string; outcome: string; arrive: number; flip: number }

const PHONE_H = 960;
const PAD = 8;
const BROWSER_W = 1500;

export default class Inbox extends Scene {
  bg = new Layer2D();
  fg = new Layer2D();
  phone!: Plane3D;
  browser!: Plane3D;
  inboxCap!: ImageBitmap;
  dlCap!: ImageBitmap;
  dlGrey!: ImageBitmap;
  items: Item[] = [];
  w!: Record<string, Word>;
  wb!: Record<string, Word>;
  cutB = 0;

  override async init() {
    const k = PHONE_H / 900;
    this.phone = new Plane3D(Math.ceil(432 * k) + PAD * 2, Math.ceil(PHONE_H) + PAD * 2);
    const bk = BROWSER_W / 1440;
    this.browser = new Plane3D(BROWSER_W + PAD * 2, Math.ceil(952 * bk) + PAD * 2);
    [this.inboxCap, this.dlCap, this.dlGrey] = await Promise.all([
      capture(app('phone', 'inbox')), capture(app('desktop', 'deadlines')), greyCapture(app('desktop', 'deadlines')),
    ]);
    const ly = this.ctx.lyrics;
    const a = ly.get('Mandagli'), b = ly.get('rosso se scade');
    const key = (w: Word) => w.w.replace(/[^\p{L}]/gu, '').toLowerCase();
    const W_: Record<string, Word> = {};
    for (const w of a.words) W_[key(w)] = w;
    this.w = W_;
    this.wb = {};
    for (const w of b.words) this.wb[key(w)] = w;
    this.cutB = b.words[0]!.start;
    // arrivals on "Man-da-gli tut-to, lui, leg-ge"; flips cascade on "archivia" and land on the beat
    const au = this.ctx.audio;
    const arch = W_.archivia!;
    const land = au.timeOfBeat(Math.round(au.beatAt(arch.start + 0.45)));
    const arr = [a.words[0]!.start + 0.2, W_.tutto!.start, W_.lui!.start, W_.legge!.start];
    const flips = [arch.start, lerp(arch.start, land, 0.36), lerp(arch.start, land, 0.68), land];
    const defs: Omit<Item, 'arrive' | 'flip'>[] = [
      { title: 'Ricevuta manutenzione caldaia', source: 'Caricamento', icon: 'upload', date: '28/09/26', outcome: 'Ricevuta archiviata, prossima manutenzione caldaia in deadlines.toml.' },
      { title: 'PEC: avviso di pagamento TARI 2026', source: 'Email', icon: 'mail', from: 'protocollo@pec.comune.esempio.it', date: '01/10/26', outcome: 'Avviso archiviato; date TARI da confermare in deadlines.toml.' },
      { title: 'Nota vocale: bollo auto', source: 'Telegram', icon: 'send', date: '02/10/26', outcome: 'Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni.' },
      { title: 'Verbale multa ZTL', source: 'Comando rapido', icon: 'phone', date: '03/10/26', outcome: 'Multa registrata: pagamento ridotto entro il 1 ott, già scaduto.' },
    ];
    this.items = defs.map((d, i) => ({ ...d, arrive: arr[i]!, flip: flips[i]! }));
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const bg = this.bg.ctx, fg = this.fg.ctx;
    this.bg.clear(); this.fg.clear();
    drawStudio(bg, { drift: t * 0.25 });
    let shake: [number, number] = [0, 0];
    if (t < this.cutB) {
      this.partA(t, bg, fg, (pose) => {
        comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
        this.phone.render(renderer, out, pose);
      });
    } else {
      shake = this.partB(t, bg, fg, (pose) => {
        comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
        if (pose) this.browser.render(renderer, out, pose);
      });
    }
    comp.draw(renderer, this.fg.upload(), out);
    return { paper: 1, grain: 0.03, vignette: 0.15, halation: 0, shake };
  }

  // ------------------------------------------------------------------ A: the phone
  private phonePose(t: number): Pose {
    const t0 = this.ctx.start;
    const db = this.ctx.audio.downbeats.find((d) => d > t0 + 0.3)!; // 47.57: the tilt settles
    const s1 = springStep(t - t0 + 0.05, 1.1, 0.55);
    const s2 = springStep(t - db, 1.6, 0.6);
    return {
      x: 1335 - (t - t0) * 14,
      y: 548 + (1 - s1) * 40,
      s: 0.98 + (t - t0) * 0.012,
      ry: -0.46 + 0.2 * s1 + 0.12 * s2 + Math.sin((t - t0) * 0.9) * 0.01,
      rx: 0.1 - 0.05 * s1 - 0.03 * s2,
      rz: -0.035 + 0.02 * s1 + 0.015 * s2,
      z: -60 + 60 * s1,
    };
  }

  private partA(t: number, bg: CanvasRenderingContext2D, fg: CanvasRenderingContext2D, draw: (p: Pose) => void) {
    const pose = this.phonePose(t);
    const P = this.phone;
    // shadow on the studio
    quadShadow(bg, P.corners(pose), { blur: 70, dy: 40, alpha: 0.32, inset: 0.06 });
    // the phone itself
    const pc = P.ctx;
    P.layer.clear();
    const k = PHONE_H / 900;
    const scr = drawPhone(pc, null, P.w / 2, P.h / 2, PHONE_H, { shadow: 0, island: false });
    const u = scr.w / 393;
    pc.save();
    roundRect(pc, scr.x, scr.y, scr.w, scr.h, 52 * k); pc.clip();
    pc.translate(scr.x, scr.y);
    pc.scale(u, u);
    const geo = this.screenA(pc, t);
    pc.restore();
    pc.fillStyle = '#000';
    roundRect(pc, P.w / 2 - 62 * k, scr.y + 11 * k, 124 * k, 36 * k, 18 * k); pc.fill();
    draw(pose);

    // sources flying in (screen space), then the headline
    this.sources(fg, t, pose, scr, u, geo);
    this.headlineA(fg, t);
  }

  /** The Inbox screen in pt (393 × 852): the capture's top, the rebuilt "Arrivati" list, the tab bar. Returns row y's (pt, screen). */
  private screenA(c: CanvasRenderingContext2D, t: number) {
    const t0 = this.ctx.start;
    const scroll = lerp(330, 520, prog(t, t0, this.items[1]!.arrive + 0.1, ease.inOutCubic));
    c.fillStyle = HEX.paper;
    c.fillRect(0, 0, 393, 852);
    c.drawImage(this.inboxCap, 0, 0, 1179, 1898, 0, -scroll, 393, 1898 / 3);
    // the card
    const cy = 633.5 - scroll;
    const rowsTop = 734 - scroll;
    const rowW = 313, rowX = 40;
    // layout rows: newest first
    const live = this.items.map((it, i) => ({ it, i, a: clamp((t - it.arrive) / 0.22) })).filter((r) => r.a > 0).reverse();
    let y = rowsTop;
    const geo: Record<number, number> = {};
    const heights: number[] = [];
    for (const r of live) {
      const h = this.rowHeight(c, r.it, t, rowW);
      heights.push(h);
      geo[r.i] = y;
      y += (h + 8) * ease.outCubic(r.a);
    }
    const empty = live.length === 0 ? 1 : 1 - clamp(live[live.length - 1]!.a * 3);
    const listH = Math.max(y - rowsTop - 8, empty > 0 ? 96 * empty : 0);
    const cardH = 734 - 633.5 + listH + 24;
    c.save();
    c.fillStyle = HEX.sheet;
    roundRect(c, 16, cy, 361, cardH + 400, 14); c.fill();
    c.strokeStyle = '#d0d0d0'; c.lineWidth = 0.4;
    roundRect(c, 16, cy, 361, cardH + 400, 14); c.stroke();
    c.fillStyle = '#0a0a0a';
    c.font = font(F.sans(500), 18);
    c.letterSpacing = '-0.2px';
    c.fillText('Arrivati', 40.5, 677.7 - scroll);
    c.letterSpacing = '0px';
    c.fillStyle = HEX.muted;
    c.font = font(F.sans(400), 14);
    c.fillText('Da email, Telegram, comandi rapidi e caricamenti', 40.5, 705 - scroll);
    if (empty > 0) {
      c.globalAlpha = empty;
      c.textAlign = 'center';
      c.fillStyle = HEX.pen; c.font = font(F.sans(500), 14);
      c.fillText('Ancora niente', 196.5, rowsTop + 30);
      c.fillStyle = HEX.muted; c.font = font(F.sans(400), 12);
      c.fillText('I documenti che mandi da qualsiasi dispositivo compaiono qui.', 196.5, rowsTop + 50);
      c.globalAlpha = 1; c.textAlign = 'left';
    }
    live.forEach((r, j) => {
      c.save();
      c.globalAlpha = ease.outCubic(r.a);
      c.translate(0, -(1 - ease.outCubic(r.a)) * 18);
      this.row(c, r.it, rowX, geo[r.i]!, rowW, heights[j]!, t);
      c.restore();
    });
    c.restore();
    // the status bar area: the page scrolls under a soft fade
    const gt = c.createLinearGradient(0, 0, 0, 74);
    gt.addColorStop(0, 'rgba(230,230,230,1)'); gt.addColorStop(0.6, 'rgba(230,230,230,0.92)'); gt.addColorStop(1, 'rgba(230,230,230,0)');
    c.fillStyle = gt; c.fillRect(0, 0, 393, 74);
    c.fillStyle = HEX.pen;
    c.font = font(F.sans(600), 16);
    c.fillText('9:41', 52, 34);
    // tab bar fade and the tab bar itself (from the capture)
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
    c.drawImage(this.inboxCap, 47, 2336, 1086, 198, 15.7, 778.7, 362, 66);
    c.restore();
    return geo;
  }

  private status(it: Item, t: number) { return t >= it.flip ? 'done' : 'work'; }

  private rowHeight(c: CanvasRenderingContext2D, it: Item, t: number, w: number) {
    const done = clamp((t - it.flip) / 0.3);
    c.font = font(F.sans(400), 12);
    const lines = wrap(c, it.outcome, w - 60 - 12).length;
    const meta = this.metaLines(c, it, w - 60 - 12).length;
    const base = 12 + 20 + 4 + meta * 16 + 12 + 24 + 12;
    return base + ease.outCubic(done) * (4 + lines * 16);
  }

  private metaLines(c: CanvasRenderingContext2D, it: Item, max: number) {
    c.font = font(F.sans(400), 12);
    const parts = [it.source, ...(it.from ? [`· ${it.from}`] : []), `· ${it.date}`];
    const lines: string[] = [];
    let line = '';
    for (const p of parts) {
      const tt = line ? `${line}  ${p}` : p;
      if (line && c.measureText(tt).width > max) { lines.push(line); line = truncate(c, p, max); } else line = truncate(c, tt, max);
    }
    lines.push(line);
    return lines;
  }

  /** One inbox item, like apps/web/src/views/inbox.tsx (rounded-lg bg-muted/50 p-3). */
  private row(c: CanvasRenderingContext2D, it: Item, x: number, y: number, w: number, h: number, t: number) {
    c.fillStyle = '#f6f6f6';
    roundRect(c, x, y, w, h, 10); c.fill();
    // the agent reading: a faint sweep across the row while it is "In lavorazione"
    if (t < it.flip && t > it.arrive) {
      const ph = ((t - it.arrive) / 0.55) % 1;
      const sx = x + ph * (w + 120) - 60;
      c.save();
      roundRect(c, x, y, w, h, 10); c.clip();
      const g = c.createLinearGradient(sx - 60, 0, sx + 60, 0);
      g.addColorStop(0, 'rgba(239,168,16,0)'); g.addColorStop(0.5, 'rgba(239,168,16,0.10)'); g.addColorStop(1, 'rgba(239,168,16,0)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      c.restore();
    }
    // icon square
    c.fillStyle = HEX.sheet;
    roundRect(c, x + 12, y + 12, 36, 36, 8); c.fill();
    icon(c, it.icon, x + 22, y + 22, 16, HEX.pen, 2);
    // badge: In lavorazione -> Archiviato (flips on its hit)
    const fk = t - it.flip;
    const flipS = fk < 0 ? 1 : fk < 0.07 ? 1 - fk / 0.07 : fk < 0.14 ? (fk - 0.07) / 0.07 : 1 + 0.12 * Math.exp(-(fk - 0.14) * 18) * Math.sin((fk - 0.14) * 40);
    const done = fk >= 0.07;
    c.save();
    c.translate(x + w - 12, y + 22);
    c.scale(fk >= 0 && fk < 0.14 ? 1 : flipS, fk >= 0 && fk < 0.14 ? Math.max(0.05, flipS) : 1);
    if (done) badge(c, 'Archiviato', 0, -10, 1, { bg: HEX.pen, fg: '#fafafa', align: 'right' });
    else badge(c, 'In lavorazione', 0, -10, 1, { bg: '#f5e6c8', fg: HEX.pen, align: 'right' });
    c.restore();
    // title + meta
    const tx = x + 60;
    c.font = font(F.sans(500), 14);
    const bw = done ? 78 : 96;
    c.fillStyle = HEX.pen;
    c.fillText(truncate(c, it.title, w - 60 - 12 - bw - 8), tx, y + 12 + 15);
    c.fillStyle = HEX.muted;
    c.font = font(F.sans(400), 12);
    const meta = this.metaLines(c, it, w - 60 - 12);
    meta.forEach((m, i) => c.fillText(m, tx, y + 12 + 20 + 4 + 12 + i * 16));
    let yy = y + 12 + 20 + 4 + meta.length * 16;
    // the outcome the agent writes
    const dp = clamp((t - it.flip) / 0.3);
    if (dp > 0) {
      c.fillStyle = HEX.pen;
      const ls = wrap(c, it.outcome, w - 72);
      const chars = Math.floor(it.outcome.length * ease.outQuad(clamp((t - it.flip - 0.05) / 0.35)));
      let n = 0;
      c.globalAlpha = ease.outCubic(dp);
      ls.forEach((l, i) => {
        const vis = l.slice(0, Math.max(0, chars - n));
        n += l.length + 1;
        c.fillText(vis, tx, yy + 4 + 12 + i * 16);
      });
      c.globalAlpha = 1;
      yy += ease.outCubic(dp) * (4 + ls.length * 16);
    }
    // buttons: Mostra (+ Rielabora once filed)
    const by = yy + 12 + 16;
    c.fillStyle = HEX.pen;
    c.font = font(F.sans(500), 12);
    c.fillText('Mostra', x + 12 + 48 + 8, by);
    if (dp > 0) {
      c.globalAlpha = dp;
      icon(c, 'rotate', x + 12 + 48 + 64, by - 9.5, 11, HEX.pen, 2.2);
      c.fillText('Rielabora', x + 12 + 48 + 80, by);
      c.globalAlpha = 1;
    }
  }

  /** Source pills: each one pops near the phone and dives into its row as the item arrives. */
  private sources(c: CanvasRenderingContext2D, t: number, pose: Pose, scr: { x: number; y: number; w: number; h: number }, u: number, geo: Record<number, number>) {
    const P = this.phone;
    const scroll = 520;
    const anchors = [[1700, 300], [1735, 470], [1690, 640], [1725, 810]];
    this.items.forEach((it, i) => {
      const t0 = it.arrive - 0.42, tDive = it.arrive - 0.16;
      if (t < t0 || t > it.arrive + 0.02) return;
      const pop = prog(t, t0, t0 + 0.16, ease.outBack);
      const dive = prog(t, tDive, it.arrive, ease.inCubic);
      const tgtY = (geo[i] ?? 734 - scroll) + 30;
      const tgt = P.project(scr.x + (40 + 30) * u, scr.y + tgtY * u, pose);
      const [ax, ay] = anchors[i]!;
      const x = lerp(ax!, tgt.x, dive), y = lerp(ay! - (1 - pop) * 20, tgt.y, dive) - Math.sin(dive * Math.PI) * 60;
      const s = lerp(0.9 + 0.1 * pop, 0.35, dive);
      c.save();
      c.globalAlpha = clamp(pop * 2) * (1 - clamp((dive - 0.75) / 0.25));
      c.translate(x, y);
      c.scale(s, s);
      this.pill(c, it.icon, it.source);
      c.restore();
    });
  }

  private pill(c: CanvasRenderingContext2D, ic: Src, label: string) {
    c.font = font(F.sans(500), 30);
    const tw = c.measureText(label).width;
    const h = 72, w = 16 + 48 + 16 + tw + 26;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.16)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
    c.fillStyle = HEX.sheet;
    roundRect(c, -w / 2, -h / 2, w, h, 18); c.fill();
    c.restore();
    c.fillStyle = '#f1f1f1';
    roundRect(c, -w / 2 + 12, -24, 48, 48, 11); c.fill();
    icon(c, ic, -w / 2 + 12 + 12, -12, 24, HEX.pen, 2);
    c.fillStyle = HEX.pen;
    c.textBaseline = 'middle';
    c.fillText(label, -w / 2 + 12 + 48 + 16, 1);
    c.textBaseline = 'alphabetic';
  }

  private headlineA(c: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    const X = 150;
    const rp = (wd: Word) => prog(t, wd.start - 0.05, wd.start + 0.2);
    riseWord(c, 'Mandagli', X, 372, 150, rp(w.mandagli!));
    riseWord(c, 'tutto,', X, 520, 150, rp(w.tutto!));
    let x = X + 4;
    const S = 60, sp = textW(c, ' ', S, 500, -0.02);
    for (const [k, s] of [['lui', 'lui'], ['legge', 'legge'], ['e', 'e']] as const) {
      const wd = w[k]!;
      x += riseWord(c, s, x, 628, S, rp(wd), { weight: 500, color: HEX.graphite, tracking: -0.02 }) + sp;
    }
    const ar = w.archivia!;
    riseWord(c, 'archivia.', X, 772, 150, rp(ar));
  }

  // ------------------------------------------------------------------ B: the deadlines
  private partB(t: number, bg: CanvasRenderingContext2D, fg: CanvasRenderingContext2D, draw: (p: Pose | null) => void): [number, number] {
    const w = this.wb;
    const B = this.browser;
    const bk = BROWSER_W / 1440;
    // capture px (2880 wide) -> layer px
    const cx = (x: number) => PAD + x / 2 * bk, cy = (y: number) => PAD + 52 * bk + y / 2 * bk;
    const t0 = this.cutB;
    const lit = (a: number) => clamp((t - a) / 0.12);
    const rows = [
      { y0: 612, y1: 748, at: w.rosso!.start },
      { y0: 770, y1: 908, at: w.se!.start },
      { y0: 918, y1: 1052, at: w.scade!.start },
      { y0: 1064, y1: 1198, at: lerp(w.scade!.start, w.ti!.start, 0.5) },
      { y0: 1210, y1: 1346, at: w.ti!.start - 0.02 },
    ];
    const tiles = [[688, 631], [688, 793], [688, 939], [688, 1086], [688, 1232]];
    const chipsX = [[1300, 1444], [1296, 1444], [1286, 1446], [1288, 1446], [1278, 1446]];
    const chipsY = [658, 820, 966, 1112, 1258];

    // ---- the browser layer
    const c = B.ctx;
    B.layer.clear();
    const content = drawBrowser(c, this.dlGrey, PAD, PAD, BROWSER_W, { shadow: 0 });
    const sx = content.w / 2880;
    const blit = (x: number, y: number, ww: number, hh: number, pop = 0, a = 1) => {
      if (a <= 0) return;
      c.save();
      c.globalAlpha = a;
      const dx = cx(x), dy = cy(y), dw = ww * sx, dh = hh * sx;
      c.translate(dx + dw / 2, dy + dh / 2);
      c.scale(1 + pop, 1 + pop);
      c.drawImage(this.dlCap, x, y, ww, hh, -dw / 2, -dh / 2, dw, dh);
      c.restore();
    };
    const popOf = (a: number) => { const k = t - a; return k < 0 ? 0 : 0.22 * Math.exp(-k * 9) * Math.cos(k * 22); };
    rows.forEach((r, i) => {
      const a = lit(r.at);
      blit(640, r.y0, 1050, r.y1 - r.y0, 0, a);
      const [tx, ty] = tiles[i]!;
      blit(tx! - 4, ty! - 4, 106, 104, popOf(r.at), a);
      const [x0, x1] = chipsX[i]!;
      blit(x0!, chipsY[i]!, x1! - x0!, 44, popOf(r.at) * 1.2, a);
    });
    // the other months follow the last row, the legend and the sidebar badge with their colours
    const late = rows[4]!.at;
    blit(1736, 776, 1050, 118, 0, lit(late + 0.05));
    blit(640, 1668, 1050, 104, 0, lit(late + 0.1));
    blit(1810, 286, 140, 30, 0, lit(rows[0]!.at));
    blit(1960, 286, 120, 30, 0, lit(rows[1]!.at));
    blit(2110, 286, 140, 30, 0, lit(late));
    blit(462, 412, 58, 48, popOf(late), lit(late));
    // the bell in the window: its badge counts with the callout
    const av = w.avvisa!;
    const step = (av.end - av.start - 0.08) / 4;
    const n = t < av.start ? 4 : Math.min(4, 1 + Math.floor((t - av.start) / step));
    const bx = cx(2534), by = cy(117);
    if (t >= av.start) {
      c.fillStyle = '#efefef';
      c.beginPath(); c.arc(bx, by, 11 * sx * 2, 0, TAU); c.fill();
      c.fillStyle = HEX.pen;
      c.font = font(F.sans(500), 24 * sx);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(n), bx, by + 1);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }

    // ---- camera: a slow push on the rows; on "e via" the window whips off to the right
    const away = prog(t, w.via!.start - 0.15, w.via!.end, ease.inCubic);
    const settle = springStep(t - t0 + 0.04, 1.1, 0.62);
    const db = this.ctx.audio.downbeats.find((d) => d > t0)!;
    const s2 = springStep(t - db, 1.5, 0.6);
    const pose: Pose = {
      x: 0, y: 0,
      s: lerp(1.22, 1.13, settle) + (t - t0) * 0.03,
      ry: -0.42 + 0.08 * settle + 0.05 * s2 - away * 0.35,
      rx: 0.07 - 0.03 * settle - 0.015 * s2,
      rz: -0.025 + 0.02 * settle,
      z: -away * 200,
    };
    const target = { x: 1420 + (1 - settle) * 60 + away * 2600, y: 640 + away * 260 };
    const fu = cx(1150), fv = cy(980);
    pose.x = target.x; pose.y = target.y;
    for (let i = 0; i < 3; i++) {
      const p = B.project(fu, fv, pose);
      pose.x += target.x - p.x; pose.y += target.y - p.y;
    }
    quadShadow(bg, B.corners(pose), { blur: 90, dy: 44, alpha: 0.26, inset: 0.02 });
    draw(pose);

    // ---- the callout: the bell button lifts out of the window on "ti avvisa"
    const fc = fg;
    const ti = w.ti!;
    const lift = prog(t, ti.start - 0.06, ti.start + 0.22, ease.outCubic);
    if (lift > 0) {
      const from = B.project(bx - 30 * sx, by + 30 * sx, pose);
      const to = { x: 1700, y: 165 };
      const x = lerp(Math.min(from.x, 1880), to.x, lift) + away * 2400, y = lerp(from.y, to.y, lift) + away * 200;
      const s = lerp(0.25, 1, lift);
      fc.save();
      fc.translate(x, y);
      fc.scale(s, s);
      this.bell(fc, t, t < av.start ? 0 : n, av.start, step, prog(t, av.start + 0.28, av.start + 0.42, ease.outCubic));
      fc.restore();
    }

    // ---- the line, on the left
    const X = 130;
    const rp = (wd: Word) => prog(t, wd.start - 0.04, wd.start + 0.18);
    const S = 124;
    riseWord(fc, 'rosso', X, 340, S, rp(w.rosso!), { color: HEX.overdue });
    let x = X;
    x += riseWord(fc, 'se', x, 474, S, rp(w.se!)) + textW(fc, ' ', S);
    riseWord(fc, 'scade,', x, 474, S, rp(w.scade!));
    x = X;
    x += riseWord(fc, 'ti', x, 608, S, rp(w.ti!)) + textW(fc, ' ', S);
    riseWord(fc, 'avvisa,', x, 608, S, rp(w.avvisa!));
    x = X;
    x += riseWord(fc, 'e', x, 742, S, rp(w.e!)) + textW(fc, ' ', S);
    riseWord(fc, 'via.', x, 742, S, rp(w.via!));
    return [0, 0];
  }

  /** The topbar's bell (Button icon-lg, rounded-lg, a secondary Badge at -top-1 -right-1) blown up 3×, with its tooltip. */
  private bell(c: CanvasRenderingContext2D, t: number, n: number, t0: number, step: number, tip: number) {
    const u = 3.1, sz = 44 * u;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowBlur = 50; c.shadowOffsetY = 22;
    c.fillStyle = '#0f0f0f';
    roundRect(c, -sz / 2, -sz / 2, sz, sz, 10 * u); c.fill();
    c.restore();
    icon(c, 'bell', -8 * u, -8 * u, 16 * u, '#fafafa', 2);
    // badge (appears with the first count)
    if (n <= 0) return;
    const k = t - (t0 + (n - 1) * step);
    const pop = 1 + 0.3 * Math.exp(-k * 16);
    c.save();
    c.translate(sz / 2 - 2 * u, -sz / 2 + 2 * u);
    c.scale(pop, pop);
    c.fillStyle = '#efefef';
    roundRect(c, -11 * u, -10 * u, 22 * u, 20 * u, 8 * u); c.fill();
    c.fillStyle = HEX.pen;
    c.font = font(F.sans(500), 12 * u);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(n), 0, 0.5 * u);
    c.restore();
    if (tip > 0) {
      const label = `Entro 30 giorni: ${n}`;
      c.save();
      c.globalAlpha = tip;
      c.font = font(F.sans(500), 12 * u);
      const tw = c.measureText(label).width;
      const ww = tw + 24 * u, hh = 26 * u, top = sz / 2 + 8 * u + (1 - tip) * 4 * u;
      c.fillStyle = HEX.pen;
      roundRect(c, -ww / 2, top, ww, hh, 6 * u); c.fill();
      c.save(); c.translate(0, top); c.rotate(Math.PI / 4); c.fillRect(-3.5 * u, -3.5 * u, 7 * u, 7 * u); c.restore();
      c.fillStyle = '#fafafa';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, 0, top + hh / 2 + 0.5 * u);
      c.restore();
    }
  }
}

void W; void rgba;
