// follia — the manifesto (pre-chorus). Questions pasted as posters (manifesti) on a wall of paper,
// each answered by a full-frame red FOLLIA! stamp on the crowd's shout. "Le scadenze devono essere
// visibili!": the camera pulls back on the whole wall, and on "visibili!" everything freezes while every
// deadline printed on the paper gets boxed. "Centralizzate!": every piece is pulled into one point, in
// perspective and accelerating, and the frame goes white and silent (~41.3 s) for the drop.
import type * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, glyphX, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, mulberry32, noise1, TAU } from '../engine/util';
import { display, drawStamp, loadImage, roundRect, stampSize } from './_motifs';
import * as P from './follia-paper';

interface Item {
  s: P.Sprite; x: number; y: number; rot: number; scale: number;
  /** "Carte perse": this one falls off the wall at `fall` (s, or -1). */
  fall: number;
  /** "Centralizzate": pulled in from `suck` over `dur`. */
  suck: number; dur: number; spin: number;
  /** "visibili": its deadlines get boxed at `mark`. */
  mark: number;
}

interface Poster {
  s: P.Sprite; cx: number; cy: number; rot: number;
  line: Line; rows: number[][]; size: number; top: number;
  suck: number; dur: number;
}

const WEIGHT_Q = 700;
const TRACK = -0.04;
/** The point everything is centralised into (screen px). */
const PX = W / 2, PY = 470;

export default class Follia extends Scene {
  layer = new Layer2D();
  items: Item[] = [];
  posters: Poster[] = [];
  banner!: P.Sprite;
  /** The deep background: a real archive of bound registers (public/ref, graded). */
  archive!: ImageBitmap;
  // lyric times
  l4!: Line;
  tF1 = 0; tF2 = 0; tScad = 0; tVis = 0; tCen = 0; tCenEnd = 0; tWhite = 0;
  tCasino = 0; tCasinoEnd = 0; tPerse = 0;
  stamp1 = 300; stamp2 = 300; visSize = 380;

  override async init() {
    const ly = this.ctx.lyrics;
    const l1 = ly.get('La multa'), l2 = ly.get('Credere'), l3 = ly.get('Carte perse');
    this.l4 = ly.get('Le scadenze devono');
    this.tF1 = ly.get('Follia!', 0).words[0]!.start;
    this.tF2 = ly.get('Follia!', 1).words[0]!.start;
    this.tScad = this.l4.words[0]!.start;
    this.tVis = this.l4.words[4]!.start;
    this.tCen = this.l4.words[5]!.start;
    this.tCenEnd = this.l4.words[5]!.end;
    this.tWhite = this.tCenEnd + 0.04;
    this.tCasino = l2.words[3]!.start;
    this.tCasinoEnd = l2.words[3]!.end;
    this.tPerse = l3.words[1]!.start;

    // ---- real objects (public/ref/, see CREDITS.md): graded cut-outs, and the archive behind the wall
    const ref = (n: string) => loadImage(`ref/${n}`);
    const [pila, mastro, bollo, bolloB, numer, olivetti, olivettiB, coda, codaB, archive] = await Promise.all([
      'pila-pratiche-b-cut-grey.png', 'libro-mastro-cut-grey.png', 'marca-da-bollo-cut-grey.png',
      'marca-da-bollo-blocco-cut-grey.png', 'timbro-numeratore-cut-grey.png',
      'macchina-da-scrivere-cut-grey.png', 'macchina-da-scrivere-b-cut-grey.png', 'eliminacode-cut-grey.png',
      'eliminacode-m90-cut-grey.png', 'archivio-palermo-registri-grey.jpg',
    ].map(ref));
    this.archive = archive!;
    const REAL = [
      P.cutout(pila!, 560), P.cutout(mastro!, 470), P.cutout(bollo!, 190), P.cutout(bolloB!, 300),
      P.cutout(numer!, 380), P.cutout(olivetti!, 470), P.cutout(olivettiB!, 400),
      P.cutout(coda!, 400), P.cutout(codaB!, 330), P.cutout(bollo!, 160),
    ];

    // ---- the paperwork
    const S = [
      P.letter(1, 'UFFICIO TRIBUTI', 'AVVISO DI PAGAMENTO', '16/12/2026'),
      P.letter(2, 'POLIZIA LOCALE', 'VERBALE DI CONTESTAZIONE', '01/10/2026'),
      P.letter(3, 'SERVIZI DEMOGRAFICI', 'CONVOCAZIONE', '20/10/2026'),
      P.letter(4, 'AMMINISTRAZIONE CONDOMINIO', 'RIPARTO SPESE', '15/10/2026'),
      P.f24(5, '30/11/2026'),
      P.f24(6, '16/12/2026'),
      P.envelope(7, '01/10/2026'),
      P.envelope(8, '24/09/2026'),
      P.ticket(9, 'A 247', 86, '03/10/2026 08:47'),
      P.ticket(10, 'C 112', 41, '29/09/2026 10:02'),
      P.note(11, ['bollo', 'entro il 6/10!!'], 1),
      P.note(12, ['chiamare CAF', 'IMU 16/12', '(seconda casa)'], 1),
      P.note(13, ['caldaia', 'entro 31/10'], 1),
      P.calendarPage(14, 'OTTOBRE', '6', 'martedì'),
      P.calendarPage(15, 'NOVEMBRE', '30', 'lunedì'),
      P.calendarPage(16, 'OTTOBRE', '15', 'giovedì'),
      P.bollettino(17, '15/10/2026'),
      P.bollettino(18, '31/10/2026'),
      P.receipt(19, '02/10/2026'),
      P.receipt(20, '28/09/2026'),
      P.letter(21, 'UFFICIO ANAGRAFE', 'RICHIESTA DOCUMENTI', '20/10/2026'),
      P.letter(22, 'UFFICIO TRIBUTI', 'SOLLECITO DI PAGAMENTO', '06/10/2026'),
      P.letter(23, 'MOTORIZZAZIONE', 'REVISIONE PERIODICA', '31/03/2027'),
      P.f24(24, '16/06/2026'),
      P.ticket(25, 'B 031', 112, '02/10/2026 11:20'),
      P.calendarPage(26, 'DICEMBRE', '16', 'mercoledì'),
      P.note(27, ['RC auto', '10/02 !!'], 1),
      P.bollettino(28, '06/10/2026'),
    ];
    const rnd = mulberry32(4242);
    const X0 = -820, X1 = W + 820, Y0 = -520, Y1 = H + 520;
    const cw = 330, ch = 270;
    const pts: { x: number; y: number }[] = [];
    for (let y = Y0; y < Y1; y += ch) for (let x = X0; x < X1; x += cw) pts.push({ x: x + (rnd() - 0.5) * 180, y: y + (rnd() - 0.5) * 150 });
    for (let i = 0; i < 18; i++) pts.push({ x: lerp(X0, X1, rnd()), y: lerp(Y0, Y1, rnd()) });
    // shuffle the paint order
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pts[i], pts[j]] = [pts[j]!, pts[i]!]; }
    const n = pts.length;
    // deal from a shuffled deck (paper and real objects mixed) so neighbours differ
    const deck: P.Sprite[] = [...S, ...REAL];
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
    pts.forEach((p, i) => {
      const s = deck[i % deck.length]!;
      const it: Item = {
        s, x: p.x, y: p.y, rot: (rnd() - 0.5) * 0.55, scale: 0.92 + rnd() * 0.42,
        fall: -1, suck: 0, dur: 0, spin: (rnd() - 0.5) * 1.2, mark: this.tVis + 0.03 + rnd() * 0.22,
      };
      // the further from the point, the later and the longer it travels
      const d = Math.hypot(p.x - PX, p.y - PY) / 1900;
      it.suck = this.tCen + 0.08 + clamp(d * 0.45 + rnd() * 0.18, 0, 0.62);
      // the sheets behind CENTRALIZZATE! clear first, so the word reads
      const sy = H / 2 + (p.y - H / 2) * 0.615;
      if (sy > 720) it.suck = Math.max(this.tCen - 0.04, it.suck - 0.28 * clamp((sy - 720) / 200));
      it.dur = 0.58 + rnd() * 0.16;
      // carte perse: a few top sheets around the posters fall off the wall
      const out = Math.abs(p.x - W / 2) > 790 || Math.abs(p.y - H / 2) > 445;
      const onScreen = p.x > -60 && p.x < W + 60 && p.y > -40 && p.y < H + 40;
      if (i > n * 0.62 && out && onScreen && rnd() < 0.75) it.fall = this.tPerse + rnd() * 0.32;
      this.items.push(it);
    });

    // ---- the posters (one per question)
    const mk = (seed: number, w: number, h: number, head: string, prot: string, foot: string, line: Line,
      rows: number[][], cx: number, cy: number, rot: number, maxSize: number, k: number): Poster => {
      const s = P.poster(seed, w, h, head, prot, foot);
      const fam = F.sans(WEIGHT_Q);
      let wMax = 0;
      for (const r of rows) wMax = Math.max(wMax, measure(r.map((i) => line.words[i]!.w).join(' '), fam, 100, TRACK * 100));
      const size = Math.min(maxSize, (100 * (w - 150)) / wMax, (h - 250) / (rows.length * 1.02));
      const top = 100 + (h - 190 - rows.length * size * 1.02) / 2;
      return { s, cx, cy, rot, line, rows, size, top, suck: this.tCen - 0.12 + 0 * k, dur: 0.34 };
    };
    this.posters = [
      mk(31, 1560, 860, 'AVVISO AL CITTADINO', 'Prot. n. 2026/0247', 'Ufficio relazioni con il pubblico · Sportello 3 · lun–ven 9:00–11:30',
        l1, [[0, 1, 2], [3], [4, 5]], 960, 548, -0.012, 230, 0),
      mk(32, 1500, 840, 'COMUNICAZIONE', 'Prot. n. 2026/0248', 'Munirsi di marca da bollo da € 16,00 e di fotocopia del documento',
        l2, [[0, 1, 2], [3, 4, 5], [6, 7]], 942, 534, 0.017, 230, 1),
      mk(33, 1540, 820, 'AVVISO', 'Prot. n. 2026/0249', 'Lo sportello resterà chiuso per inventario',
        l3, [[0, 1], [2, 3]], 974, 546, -0.007, 250, 2),
    ];
    this.banner = P.poster(34, 1720, 680, 'MANIFESTO', 'Art. 1', 'Affisso il 03/10/2026 · Si prega di non rimuovere');

    this.visSize = Math.min(420, (100 * (1720 - 128)) / measure('VISIBILI!', F.sans(900), 100, TRACK * 100));
    // FOLLIA!: the first one spans the poster, the second is cropped by the frame
    const w100 = stampSize('FOLLIA!', 100, { seed: 51 }).w;
    this.stamp1 = Math.round((100 * 1640) / w100);
    this.stamp2 = Math.round((100 * 2060) / w100);
  }

  // ------------------------------------------------------------------ timing helpers
  /** Camera zoom on the wall (frozen from "visibili!"). */
  cam(t: number) {
    const tf = Math.min(t, this.tVis);
    if (tf < this.tScad) return 1 + 0.035 * clamp((tf - this.ctx.start) / (this.tScad - this.ctx.start));
    const k = clamp((tf - this.tScad) / 0.32);
    return lerp(1.035, 0.635, ease.outCubic(k)) - 0.02 * clamp((tf - this.tScad - 0.32) / 1.2);
  }

  /** Suck transform (perspective dolly into the point): returns the 1/(1+z) factor, the swirl and 0..1. */
  suck(t: number, t0: number, dur: number) {
    const u = clamp((t - t0) / dur);
    const z = 46 * u * u * u;
    return { k: 1 / (1 + z), u };
  }

  /** Apply the suck to the context (in screen space, around the point). */
  applySuck(c: CanvasRenderingContext2D, k: number, swirl: number) {
    c.translate(PX, PY);
    if (swirl) c.rotate(swirl);
    c.scale(k, k);
    c.translate(-PX, -PY);
  }

  applyCam(c: CanvasRenderingContext2D, z: number) {
    c.translate(W / 2, H / 2);
    c.scale(z, z);
    c.translate(-W / 2, -H / 2);
  }

  /** Slap-on of a pasted sheet that touches the wall at t0: scale and alpha. */
  slap(t: number, t0: number) {
    const k = t - t0 + 0.06;
    if (k < 0) return null;
    const u = clamp(k / 0.06);
    const s = u < 1 ? 1.06 - 0.06 * ease.inQuad(u) : 1 + 0.006 * Math.exp(-(k - 0.06) * 18) * Math.cos((k - 0.06) * 50);
    return { s, a: u < 1 ? 0.3 + 0.7 * u : 1 };
  }

  // ------------------------------------------------------------------ drawing
  /** The archive photo, deep behind the wall (half the camera's zoom), lightened into the paper register. Last into the point. */
  drawArchive(c: CanvasRenderingContext2D, t: number, z: number) {
    const sk = this.suck(t, this.tCen + 0.6, 0.62);
    if (sk.u >= 1) return;
    const zb = 1 + (z - 1) * 0.45;
    const im = this.archive;
    const cover = Math.max(W / im.width, H / im.height) * 1.24 * zb;
    const w = im.width * cover, h = im.height * cover;
    c.save();
    if (sk.u > 0) this.applySuck(c, sk.k, 0.3 * sk.u * sk.u);
    c.drawImage(im, W / 2 - w / 2, H / 2 - h / 2, w, h);
    c.fillStyle = 'rgba(236,236,236,0.5)';
    c.fillRect(W / 2 - w / 2, H / 2 - h / 2, w, h);
    c.restore();
  }

  drawWall(c: CanvasRenderingContext2D, t: number, z: number) {
    const au = this.ctx.audio;
    const tf = Math.min(t, this.tVis);
    // the wall trembles with the kit (and goes wild on "casino"); it holds still from "visibili!"
    const casino = clamp((tf - this.tCasino) / 0.06) * (1 - clamp((tf - this.tCasinoEnd) / 0.35));
    const A = 2.2 + 7 * au.hit('snare', tf, 0.1) + 4 * au.hit('kick', tf, 0.08) + 9 * casino;
    const scr = (x: number, y: number) => ({ x: W / 2 + (x - W / 2) * z, y: H / 2 + (y - H / 2) * z });
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      let x = it.x, y = it.y, rot = it.rot;
      if (it.fall >= 0 && t > it.fall) {
        const d = t - it.fall;
        y += 0.5 * 5200 * d * d;
        x += (hash(i, 9) - 0.5) * 500 * d;
        rot += it.spin * 2.4 * d;
        if (y - 400 > H / 2 + (H / 2) / z) continue;
      }
      x += A * noise1(tf * 9 + i * 3.7, 11);
      y += A * noise1(tf * 9 + i * 5.3, 12);
      rot += A * 0.0028 * noise1(tf * 7 + i * 2.1, 13);
      const sk = this.suck(t, it.suck, it.dur);
      if (sk.u >= 1) continue;
      const r = Math.max(it.s.w, it.s.h) * it.scale * 0.75;
      const p = scr(x, y);
      if (sk.u <= 0 && (p.x + r * z < 0 || p.x - r * z > W || p.y + r * z < 0 || p.y - r * z > H)) continue;
      c.save();
      if (sk.u > 0) this.applySuck(c, sk.k, it.spin * 0.6 * sk.u * sk.u);
      this.applyCam(c, z);
      c.translate(x, y);
      c.rotate(rot);
      c.scale(it.scale, it.scale);
      const s = it.s;
      c.drawImage(s.cv, -s.w / 2 - s.pad, -s.h / 2 - s.pad, s.w + s.pad * 2, s.h + s.pad * 2);
      // visibili!: every deadline on the wall gets boxed in red
      const km = t - it.mark;
      if (km >= 0 && s.dates.length) {
        const g = 1 + 0.35 * Math.exp(-km * 40);
        c.strokeStyle = HEX.overdue;
        c.lineWidth = 3.2 / (z * it.scale);
        for (const d of s.dates) {
          const cx = -s.w / 2 + d.x + d.w / 2, cy = -s.h / 2 + d.y + d.h / 2;
          const w = d.w * g + 10, h = d.h * g + 8;
          roundRect(c, cx - w / 2, cy - h / 2, w, h, 5); c.stroke();
        }
      }
      c.restore();
    }
  }

  drawPoster(c: CanvasRenderingContext2D, t: number, z: number, p: Poster, t0: number) {
    const sl = this.slap(t, t0);
    if (!sl) return;
    const sk = this.suck(t, p.suck, p.dur);
    if (sk.u >= 1) return;
    c.save();
    if (sk.u > 0) this.applySuck(c, sk.k, -0.4 * sk.u * sk.u);
    this.applyCam(c, z);
    c.translate(p.cx, p.cy);
    c.rotate(p.rot);
    c.scale(sl.s, sl.s);
    c.globalAlpha = sl.a;
    const s = p.s;
    c.translate(-s.w / 2, -s.h / 2);
    c.drawImage(s.cv, -s.pad, -s.pad, s.w + s.pad * 2, s.h + s.pad * 2);
    this.drawRows(c, t, p.line, p.rows, 72, p.top, p.size, HEX.pen);
    c.restore();
  }

  /** A question set word by word: each word appears on its start (a short rise), never ahead of the voice. */
  drawRows(c: CanvasRenderingContext2D, t: number, line: Line, rows: number[][], x0: number, top: number, size: number, col: string, weight = WEIGHT_Q) {
    const fam = F.sans(weight);
    rows.forEach((r, ri) => {
      const text = r.map((i) => line.words[i]!.w.replace(/^‘/, '’')).join(' ');
      const y = top + size * (0.8 + ri * 1.02);
      let ci = 0;
      for (const wi of r) {
        const w: Word = line.words[wi]!;
        const k = t - w.start + 0.02;
        if (k >= 0) {
          const a = clamp(k / 0.05);
          const dy = (1 - ease.outCubic(clamp(k / 0.1))) * size * 0.08;
          c.save();
          c.globalAlpha *= a;
          display(c, w.w.replace(/^‘/, '’'), x0 + glyphX(text, ci, fam, size, TRACK * size), y + dy, size, { weight, color: col });
          c.restore();
        }
        ci += Array.from(w.w).length + 1;
      }
    });
  }

  drawBanner(c: CanvasRenderingContext2D, t: number) {
    const sl = this.slap(t, this.tScad);
    if (!sl) return;
    const sk = this.suck(t, this.tCen - 0.12, 0.34);
    if (sk.u >= 1) return;
    const b = this.banner;
    c.save();
    if (sk.u > 0) this.applySuck(c, sk.k, -0.4 * sk.u * sk.u);
    c.translate(W / 2, H / 2 + 6);
    c.rotate(-0.006);
    c.scale(sl.s, sl.s);
    c.globalAlpha = sl.a;
    c.translate(-b.w / 2, -b.h / 2);
    c.drawImage(b.cv, -b.pad, -b.pad, b.w + b.pad * 2, b.h + b.pad * 2);
    this.drawRows(c, t, this.l4, [[0, 1, 2, 3]], 64, 122, 104, HEX.pen);
    // VISIBILI!: the big word, slammed on its start
    const v = this.l4.words[4]!;
    const k = t - v.start + 0.03;
    if (k >= 0) {
      const u = clamp(k / 0.06);
      const s = u < 1 ? 1.1 - 0.1 * ease.inQuad(u) : 1;
      const size = this.visSize;
      c.save();
      c.translate(58, 565);
      c.scale(s, s);
      c.globalAlpha *= 0.3 + 0.7 * u;
      display(c, 'VISIBILI!', 0, 0, size, { weight: 900, color: HEX.pen });
      c.restore();
    }
    c.restore();
  }

  drawCentral(c: CanvasRenderingContext2D, t: number) {
    const w = this.l4.words[5]!;
    const k = t - w.start + 0.03;
    if (k < 0 || t >= this.tWhite) return;
    const text = 'CENTRALIZZATE!';
    const size = 176;
    const fam = F.sans(900);
    const tw = measure(text, fam, size, TRACK * size);
    const x0 = W / 2 - tw / 2, y0 = 950;
    const u = clamp(k / 0.06);
    const s = u < 1 ? 1.12 - 0.12 * ease.inQuad(u) : 1;
    // at the end, the word too goes into the point, letter by letter from the outside in
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
      const order = Math.abs(i - (chars.length - 1) / 2) / ((chars.length - 1) / 2);
      const sk = this.suck(t, this.tCenEnd - 0.12 + (1 - order) * 0.05, 0.16);
      if (sk.u >= 1) continue;
      const gx = x0 + glyphX(text, i, fam, size, TRACK * size);
      c.save();
      if (sk.u > 0) this.applySuck(c, sk.k, 0);
      c.translate(W / 2, y0 - size * 0.36);
      c.scale(s, s);
      c.translate(-W / 2, -(y0 - size * 0.36));
      c.globalAlpha = 0.3 + 0.7 * u;
      display(c, chars[i]!, gx, y0, size, { weight: 900, color: HEX.pen, tracking: 0 });
      c.restore();
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear(HEX.sheet);
    if (t >= this.tWhite) {
      this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
      return { paper: 1, grain: 0.02, vignette: 0.1, ca: 0 };
    }
    const z = this.cam(t);

    this.drawArchive(c, t, z);
    this.drawWall(c, t, z);

    // posters, each pasted over the last; the stamps answer in between
    const [p1, p2, p3] = this.posters as [Poster, Poster, Poster];
    this.drawPoster(c, t, z, p1, this.ctx.start);
    let shake = 0;
    const stamp = (size: number, t0: number, seed: number, angle: number, suck: number) => {
      const sk = this.suck(t, suck, 0.34);
      if (sk.u >= 1) return 0;
      c.save();
      if (sk.u > 0) this.applySuck(c, sk.k, -0.4 * sk.u * sk.u);
      this.applyCam(c, z);
      const sh = drawStamp(c, 'FOLLIA!', W / 2, H / 2 + 10, size, t - t0 + 0.07, { seed, angle });
      c.restore();
      return sh;
    };
    shake = Math.max(shake, stamp(this.stamp1, this.tF1, 51, -0.105, this.tCen - 0.12));
    this.drawPoster(c, t, z, p2, p2.line.words[0]!.start);
    this.drawPoster(c, t, z, p3, p3.line.words[0]!.start);
    shake = Math.max(shake, stamp(this.stamp2, this.tF2, 52, 0.085, this.tCen - 0.12) * 1.4);

    this.drawBanner(c, t);
    this.drawCentral(c, t);

    // the point: what's been centralised so far
    if (t > this.tCen + 0.2) {
      let done = 0;
      for (const it of this.items) if (t >= it.suck + it.dur * 0.8) done++;
      const m = done / this.items.length;
      const r = 2 + 9 * Math.sqrt(m) + 4 * clamp((t - this.tCenEnd + 0.06) / 0.06);
      c.fillStyle = HEX.pen;
      c.beginPath(); c.arc(PX, PY, r, 0, TAU); c.fill();
    }

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    const a = hash(frameIdx(t), 3) * TAU;
    return { paper: 1, grain: 0.03, vignette: 0.15, shake: [Math.cos(a) * shake, Math.sin(a) * shake] };
  }
}
