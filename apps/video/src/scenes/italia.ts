// 8. italia — "In un attimo rivoluzioniamo" / "l'Italia lenta e pallosa" / "Autocratico!" (chorus d).
// 1. "In un attimo": the real captures full-bleed, one per beat, snapping in; the words on an ink label.
// 2. "rivoluzioniamo": one giant word on ink, letter by letter as sung; the app's pages cut inside its
//    letters (one per half beat).
// 3. "l'Italia lenta e pallosa": the paper wall of the first half comes back grey, in slow motion, with
//    dust; cut twice against the app, sharp and fast. The line is printed small and dull on a slip;
//    "pallosa" yawns (its tracking stretches as it is held).
// 4. "Autocratico!": the only black stamp of the film slams over the paper wall.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, SAFE, VERTICAL } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp, prog, TAU } from '../engine/util';
import { app, drawStamp, stampSize, roundRect } from './_motifs';
import { capture, offscreen, riseWord, textW } from './inbox-kit';
import { buildWall, looseSheet, type Wall } from './italia-paper';
import { loadMap, loadPhotos, renderMap, project, MAP_VB, type ItalyMap, type Photo } from './italia-ref';
import type { Word } from '../engine/lyrics';

// upright (VERTICAL): Italy stands under the words, filling the frame's lower two thirds
const MAP_SCALE = VERTICAL ? 0.91 : 0.76;
const MAP_X = VERTICAL ? 85 : 1080, MAP_Y = VERTICAL ? 730 : 44;
/** Upright: where the black stamp lands (across the frame, bottom left to top right) and its angle. */
const STAMP_V = { x: 490, y: 860, angle: -1.02, len: 1220 };
interface Shot { img: ImageBitmap; fx: number; fy: number; z: number; at: number; scroll?: number; dy?: number }

export default class Italia extends Scene {
  layer = new Layer2D();
  mont = offscreen(W, H);
  caps: Record<string, ImageBitmap> = {};
  wall!: Wall;
  loose: { cv: HTMLCanvasElement; w: number; h: number }[] = [];
  w: Record<string, Word> = {};
  stampAt = 0;
  photos: Record<string, Photo> = {};
  map!: ItalyMap;
  mapDim!: { cv: HTMLCanvasElement; w: number; h: number };
  mapLit!: { cv: HTMLCanvasElement; w: number; h: number };
  litAt!: Float32Array;
  stampPx = 200;

  override async init() {
    const names: [string, 'desktop' | 'phone', string][] = [
      ['deadlines', 'desktop', 'deadlines'], ['cases', 'desktop', 'cases'], ['inbox', 'desktop', 'inbox'],
      ['activity', 'desktop', 'activity'], ['profile', 'desktop', 'profile'], ['overview', 'desktop', 'overview'],
      ['dlfull', 'desktop', 'deadlines-full'], ['pdead', 'phone', 'deadlines'], ['pover', 'phone', 'overview'],
    ];
    // upright: the phone captures (natively upright) carry the montage and the inserts
    if (VERTICAL) names.push(['pinbox', 'phone', 'inbox'], ['pcases', 'phone', 'cases'], ['pactivity', 'phone', 'activity'],
      ['pprofile', 'phone', 'profile'], ['pdlfull', 'phone', 'deadlines-full']);
    const ims = await Promise.all(names.map(([, d, v]) => capture(app(d, v))));
    names.forEach(([k], i) => (this.caps[k] = ims[i]!));
    this.wall = buildWall(2300, 1400, 11);
    [this.photos, this.map] = await Promise.all([loadPhotos(), loadMap()]);
    this.mapDim = renderMap(this.map, MAP_SCALE, false);
    this.mapLit = renderMap(this.map, MAP_SCALE, true);
    this.loose = [looseSheet(5, 520, 7), looseSheet(9, 440, 4)];
    const ly = this.ctx.lyrics;
    const add = (l: { words: Word[] }, pre = '') => l.words.forEach((w) => (this.w[pre + w.w.replace(/[^\p{L}]/gu, '').toLowerCase()] = w));
    add(ly.get('In un attimo'));
    add(ly.get('lenta e pallosa'));
    add(ly.find('Autocratico!').find((l) => l.text.trim().toLowerCase().startsWith('autocratico'))!);
    this.stampAt = this.w.autocratico!.start;
    // the comuni light up from Rome outwards, "in un attimo": from "In" to the end of "attimo"
    const rome = project(12.4964, 41.9028);
    const m = this.map;
    let dmax = 0;
    const d = new Float32Array(m.n);
    for (let i = 0; i < m.n; i++) {
      d[i] = Math.hypot(m.pts[i * 2]! - rome.x, m.pts[i * 2 + 1]! - rome.y);
      dmax = Math.max(dmax, d[i]!);
    }
    const a = this.w.in!.start - 0.02, b = this.w.attimo!.end - 0.12;
    this.litAt = new Float32Array(m.n);
    for (let i = 0; i < m.n; i++) this.litAt[i] = a + (b - a - 0.1) * Math.pow(d[i]! / dmax, 0.85) + 0.1 * hash(i, 77);
    // the stamp spans ~1500 px
    const s0 = stampSize('AUTOCRATICO!', 100).w;
    this.stampPx = Math.round(100 * (VERTICAL ? STAMP_V.len : 1480) / s0);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear();
    const w = this.w;
    let shake: [number, number] = [0, 0];
    let paper = 1;
    if (t < w.rivoluzioniamo!.start) {
      this.montage(c, t);
    } else if (t < w.litalia!.start) {
      this.revolution(c, t);
      paper = 0;
    } else {
      shake = this.italy(c, t);
    }
    comp.draw(renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper, grain: paper ? 0.035 : 0.05, vignette: paper ? 0.18 : 0.3, halation: 0, shake };
  }

  /** A capture covering the frame, focus point (capture px) at the frame centre, `z` × cover scale. */
  private cover(c: CanvasRenderingContext2D, img: ImageBitmap, fx: number, fy: number, z: number, dx = 0, dy = 0) {
    const s = Math.max(W / img.width, H / img.height) * z;
    let x = W / 2 - fx * s + dx, y = H / 2 - fy * s + dy;
    x = Math.min(0, Math.max(W - img.width * s, x));
    y = Math.min(0, Math.max(H - img.height * s, y));
    c.drawImage(img, x, y, img.width * s, img.height * s);
  }

  private shot(c: CanvasRenderingContext2D, sh: Shot, t: number, kick = 1) {
    const k = Math.max(0, t - sh.at);
    const snap = Math.exp(-k * 10);
    const z = sh.z * (1 + 0.1 * snap * kick) * (1 + 0.02 * k);
    const fy = sh.scroll ? sh.fy + sh.scroll * ease.inOutCubic(clamp(k / 0.3)) : sh.fy;
    this.cover(c, sh.img, sh.fx - 40 * k, fy, z, 70 * snap * kick, sh.dy ?? 0);
  }

  // ------------------------------------------------------------------ 1. "In un attimo"
  /** Italy on ink: its 7,896 comuni (ISTAT) light up from Rome outwards, with a mono counter. */
  private montage(c: CanvasRenderingContext2D, t: number) {
    c.fillStyle = HEX.ink; c.fillRect(0, 0, W, H);
    const t0 = this.ctx.start;
    const z = 1 + 0.03 * clamp((t - t0) / 0.9);
    c.save();
    c.translate(MAP_X + (MAP_VB.w * MAP_SCALE) / 2, MAP_Y + (MAP_VB.h * MAP_SCALE) / 2);
    c.scale(z, z);
    c.translate(-(MAP_X + (MAP_VB.w * MAP_SCALE) / 2), -(MAP_Y + (MAP_VB.h * MAP_SCALE) / 2));
    c.drawImage(this.mapDim.cv, MAP_X, MAP_Y, this.mapDim.w, this.mapDim.h);
    // lit comuni: settled ones small, the ones just lit flare
    const m = this.map, L = this.litAt;
    let lit = 0;
    c.fillStyle = '#f2f2f2';
    c.beginPath();
    const flare: number[] = [];
    for (let i = 0; i < m.n; i++) {
      const k = t - L[i]!;
      if (k < 0) continue;
      lit++;
      const x = MAP_X + m.pts[i * 2]! * MAP_SCALE, y = MAP_Y + m.pts[i * 2 + 1]! * MAP_SCALE;
      if (k < 0.18) flare.push(x, y, k);
      else c.rect(x - 1.05, y - 1.05, 2.1, 2.1);
    }
    c.fill();
    c.fillStyle = '#ffffff';
    for (let j = 0; j < flare.length; j += 3) {
      const r = 1.05 + 1.9 * (1 - flare[j + 2]! / 0.18);
      c.globalAlpha = 0.55 + 0.45 * (flare[j + 2]! / 0.18);
      c.fillRect(flare[j]! - r, flare[j + 1]! - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.restore();
    // the words, white on ink, and the counter
    const w = this.w;
    if (VERTICAL) { this.montageWordsV(c, t, lit); return; }
    const S = 150, X = 120, Y = 560;
    let x = X;
    const sp = textW(c, ' ', S);
    for (const [s, wd] of [['In', w.in!], ['un', w.un!], ['attimo', w.attimo!]] as const)
      x += riseWord(c, s, x, Y, S, prog(t, wd.start - 0.04, wd.start + 0.16), { color: '#fafafa' }) + sp;
    const shown = Math.min(m.n, lit);
    const label = `${shown >= 1000 ? `${Math.floor(shown / 1000)}.${String(shown % 1000).padStart(3, '0')}` : shown} comuni`;
    c.save();
    c.font = font(F.mono(500), 40);
    c.fillStyle = shown >= m.n ? '#fafafa' : HEX.faint;
    c.globalAlpha = clamp((t - w.in!.start + 0.05) / 0.12);
    c.fillText(label, X + 6, Y + 96);
    c.restore();
  }

  /** Upright: "In un" / "attimo" stacked big above the map, the counter beside "In un" on its baseline. */
  private montageWordsV(c: CanvasRenderingContext2D, t: number, lit: number) {
    const w = this.w, m = this.map;
    const S = 250, X = SAFE.left - 4, Y1 = 455, Y2 = 680;
    const sp = textW(c, ' ', S);
    let x = X;
    x += riseWord(c, 'In', x, Y1, S, prog(t, w.in!.start - 0.04, w.in!.start + 0.16), { color: '#fafafa' }) + sp;
    x += riseWord(c, 'un', x, Y1, S, prog(t, w.un!.start - 0.04, w.un!.start + 0.16), { color: '#fafafa' });
    riseWord(c, 'attimo', X, Y2, S, prog(t, w.attimo!.start - 0.04, w.attimo!.start + 0.16), { color: '#fafafa' });
    const shown = Math.min(m.n, lit);
    const label = `${shown >= 1000 ? `${Math.floor(shown / 1000)}.${String(shown % 1000).padStart(3, '0')}` : shown}`;
    c.save();
    c.globalAlpha = clamp((t - w.in!.start + 0.05) / 0.12);
    c.fillStyle = shown >= m.n ? '#fafafa' : HEX.faint;
    c.font = font(F.mono(500), 46);
    const cx = Math.max(X + 560, x + 56);
    c.fillText(label, cx, Y1 - 52);
    c.font = font(F.mono(400), 34);
    c.fillStyle = HEX.faint;
    c.fillText('comuni', cx, Y1 - 4);
    c.restore();
  }

  // ------------------------------------------------------------------ 2. "rivoluzioniamo"
  private revolution(c: CanvasRenderingContext2D, t: number) {
    const au = this.ctx.audio;
    const wd = this.w.rivoluzioniamo!;
    const t0 = wd.start;
    // inner cuts: on the beats and the half beats
    const bi = Math.floor(au.beatAt(t0 + 0.01));
    const cuts = [t0];
    for (let i = 1; i < 8; i++) {
      const tb = au.timeOfBeat(bi + Math.ceil(i / 2)) - (i % 2 ? (au.timeOfBeat(bi + Math.ceil(i / 2)) - au.timeOfBeat(bi + Math.ceil(i / 2) - 1)) / 2 : 0);
      if (tb > cuts[cuts.length - 1]! + 0.12 && tb < wd.end) cuts.push(tb);
    }
    const seq: [string, number, number, number][] = VERTICAL ? [
      // upright: the phone, one page per cut, cropped tight on what is in the letters
      ['pdead', 520, 1330, 1.35], ['pinbox', 560, 760, 1.35], ['pcases', 560, 700, 1.35], ['pactivity', 600, 1900, 1.35],
      ['pdead', 520, 1620, 1.4], ['pprofile', 560, 820, 1.35], ['pcases', 560, 1720, 1.35], ['pinbox', 600, 1250, 1.35],
    ] : [
      ['deadlines', 1300, 950, 1.4], ['inbox', 2150, 800, 1.5], ['cases', 1400, 900, 1.35], ['activity', 2250, 1000, 1.45],
      ['profile', 1150, 700, 1.4], ['pdead', 590, 1600, 1.0], ['overview', 1400, 600, 1.35], ['pover', 590, 1200, 1.0],
    ];
    let ci = 0;
    for (let i = 0; i < cuts.length; i++) if (t >= cuts[i]!) ci = i;
    const [key, fx, fy, z] = seq[ci % seq.length]!;
    const sh: Shot = { img: this.caps[key]!, fx, fy, z, at: cuts[ci]! };

    c.fillStyle = HEX.ink; c.fillRect(0, 0, W, H);
    if (VERTICAL) {
      // upright: the whole phone page glows faintly through the ink around the letters
      c.save();
      c.globalAlpha = 0.075;
      this.shot(c, { ...sh, dy: 845 - H / 2 }, t);
      c.restore();
    }
    // the lit map stays behind the letters, dimmed
    c.save();
    c.globalAlpha = 0.3;
    const zz = 1.03 + 0.06 * prog(t, t0, wd.end);
    c.translate(MAP_X + (MAP_VB.w * MAP_SCALE) / 2, MAP_Y + (MAP_VB.h * MAP_SCALE) / 2);
    c.scale(zz, zz);
    c.drawImage(this.mapLit.cv, -(MAP_VB.w * MAP_SCALE) / 2, -(MAP_VB.h * MAP_SCALE) / 2, this.mapLit.w, this.mapLit.h);
    c.restore();

    // the page inside the letters
    const m = this.mont.c;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, W, H);
    // two lines, giant: RIVOLU- / ZIONIAMO, letter by letter as it is sung
    const lines = ['RIVOLU-', 'ZIONIAMO'];
    const fam = F.sans(900);
    const L0 = layout(lines[1]!, fam, 100, -4.5);
    const size = Math.floor(100 * 1800 / L0.width);
    // upright: each line set as wide as the frame allows (a justified stack), centred on the safe box
    const sizes = VERTICAL ? lines.map((s) => Math.floor(100 * 1010 / layout(s, fam, 100, -4.5).width)) : [size, size];
    const Ls = lines.map((s, i) => layout(s, fam, sizes[i]!, -0.045 * sizes[i]!));
    const lead = size * 0.9;
    const push = 1 + 0.04 * prog(t, t0, wd.end);
    const yMid = H / 2 + size * 0.36;
    const CY = 845; // upright: the block's centre
    const ys = VERTICAL
      ? (() => { const a = sizes[0]!, b = sizes[1]!, top = CY - (0.73 * a + 0.12 * a + 0.73 * b) / 2; return [top + 0.73 * a, top + 0.85 * a + 0.73 * b]; })()
      : [yMid - 0.5 * lead, yMid + 0.5 * lead];
    if (VERTICAL) sh.dy = CY - H / 2;
    const sung = clamp((t - t0 + 0.06) / Math.max(0.3, wd.end - t0 - 0.3));
    const n = 14; // letters (the hyphen comes with the U)
    m.font = font(fam, size);
    m.fillStyle = '#fff';
    m.save();
    const pcy = VERTICAL ? CY : H / 2;
    m.translate(W / 2, pcy);
    m.scale(push, push);
    m.translate(-W / 2, -pcy);
    let li = 0;
    Ls.forEach((L, row) => {
      const x0 = W / 2 - L.width / 2, y0 = ys[row]!;
      const size = sizes[row]!;
      if (VERTICAL) m.font = font(fam, size);
      L.glyphs.forEach((g) => {
        const idx = g.ch === '-' ? li - 1 : li++;
        const k = clamp((sung - idx / n) * n / 1.3);
        if (k <= 0) return;
        const e = ease.outCubic(k);
        m.save();
        m.globalAlpha = clamp(e * 2);
        m.translate(x0 + g.x + g.w / 2, y0 + (1 - e) * size * 0.2);
        m.scale(lerp(1.2, 1, e), lerp(1.2, 1, e));
        m.fillText(g.ch, -g.w / 2, 0);
        m.restore();
      });
    });
    m.restore();
    // the page, only where the letters are
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = HEX.paper; m.fillRect(0, 0, W, H);
    m.globalCompositeOperation = 'source-atop';
    this.shot(m, sh, t);
    m.globalCompositeOperation = 'source-over';
    c.drawImage(this.mont.cv, 0, 0, W, H);
  }

  // ------------------------------------------------------------------ 3-4. the photos, the app, the stamp
  /** A graded photo covering the frame: focus (fractions of its crop) at the centre, `z` × cover scale. */
  private photo(c: CanvasRenderingContext2D, ph: Photo, fx: number, fy: number, z: number, alpha = 1) {
    const [cx, cy, cw, ch] = ph.crop;
    const iw = ph.img.width, ih = ph.img.height;
    const sw = cw * iw, sh = ch * ih;
    const s = Math.max(W / sw, H / sh) * z;
    let x = W / 2 - fx * sw * s, y = H / 2 - fy * sh * s;
    x = Math.min(0, Math.max(W - sw * s, x));
    y = Math.min(0, Math.max(H - sh * s, y));
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(ph.img, cx * iw, cy * ih, sw, sh, x, y, sw * s, sh * s);
    c.restore();
  }

  /** Print-like grade over a photo: lifted blacks, a dull grey wash, a slow light shaft. */
  private grade(c: CanvasRenderingContext2D, p: number, wash = 0.1) {
    c.save();
    c.globalCompositeOperation = 'screen';
    c.fillStyle = 'rgb(30,30,30)'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = `rgba(128,128,128,${wash})`; c.fillRect(0, 0, W, H);
    c.translate(W * (0.25 + 0.1 * p), 0);
    c.rotate(0.35);
    const g = c.createLinearGradient(-260, 0, 260, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(-260, -400, 520, H * 2);
    c.restore();
  }

  private italy(c: CanvasRenderingContext2D, t: number): [number, number] {
    const w = this.w;
    const t0 = w.litalia!.start;
    const au = this.ctx.audio;
    // inserts: the app, sharp and fast, on three beats of "lenta e pallosa"
    const bA = au.timeOfBeat(Math.round(au.beatAt(w.lenta!.start + 0.5)));
    const bB = au.timeOfBeat(Math.round(au.beatAt(w.pallosa!.start + 0.95)));
    const bC = au.timeOfBeat(Math.round(au.beatAt(bB + 0.01)) + 1);
    const D = 0.3;
    const inserts = VERTICAL ? [
      // upright: the phone, full-bleed
      { at: bA, sh: { img: this.caps.pdlfull!, fx: 590, fy: 900, z: 1.0, at: bA, scroll: 1700 } as Shot },
      { at: bB, sh: { img: this.caps.pover!, fx: 590, fy: 1250, z: 1.3, at: bB } as Shot },
      { at: bC, sh: { img: this.caps.pinbox!, fx: 590, fy: 1000, z: 1.15, at: bC, scroll: 500 } as Shot },
    ] : [
      { at: bA, sh: { img: this.caps.dlfull!, fx: 1300, fy: 500, z: 1.15, at: bA, scroll: 1700 } as Shot },
      { at: bB, sh: { img: this.caps.overview!, fx: 2300, fy: 700, z: 1.7, at: bB } as Shot },
      { at: bC, sh: { img: this.caps.inbox!, fx: 2150, fy: 760, z: 1.45, at: bC, scroll: 500 } as Shot },
    ];
    const ins = inserts.find((i) => t >= i.at && t < i.at + D);
    const sk = t - this.stampAt;
    let shakeAmt = 0;
    const P = this.photos;
    const slow = (a: number, b: number) => clamp((t - a) / (b - a));
    if (ins) {
      c.fillStyle = HEX.paper; c.fillRect(0, 0, W, H);
      this.shot(c, ins.sh, t, 1.6);
    } else if (t < bA) {
      // the archive hall of Palermo, then the 1930s post office, dissolving: slow
      const p = slow(t0, bA);
      this.photo(c, P.sala!, 0.42, 0.55, 1.0 + 0.07 * p);
      const x = clamp((t - (bA - 0.5)) / 0.4);
      if (x > 0) this.photo(c, P.posta!, 0.5, 0.55, 1.04 + 0.04 * x, ease.inOutQuad(x));
      this.grade(c, p);
      this.dust(c, t, t0, -1);
    } else if (t < bB) {
      // Paolo Monti's offices, 1963: the binders, then the corridor
      const a = bA + D, p = slow(a, bB);
      this.photo(c, P.ufficio!, 0.55, 0.45, 1.02 + 0.06 * p);
      const x = clamp((t - lerp(a, bB, 0.45)) / 0.35);
      if (x > 0) this.photo(c, P.corridoio!, 0.5, 0.42, 1.05 + 0.05 * x, ease.inOutQuad(x));
      this.grade(c, p);
      this.dust(c, t, t0, -1);
    } else if (t < bC) {
      // the queue in Naples, 1973: a print lying on the paper
      const a = bB + D, p = slow(a, bC);
      this.wallBg(c, t, t0, 0);
      const ph = P.fila!;
      const h = VERTICAL ? 1120 : 900, wd = (h * ph.img.width) / ph.img.height;
      c.save();
      if (VERTICAL) c.translate(492, 830); else c.translate(980, 540);
      c.rotate(-0.045 + 0.02 * p);
      c.scale(1 + 0.03 * p, 1 + 0.03 * p);
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
      c.fillStyle = '#efefef';
      c.fillRect(-wd / 2 - 22, -h / 2 - 22, wd + 44, h + 70);
      c.shadowColor = 'transparent';
      c.drawImage(ph.img, -wd / 2, -h / 2, wd, h);
      c.restore();
      this.grade(c, p, 0.05);
      this.dust(c, t, t0, -1);
    } else {
      // the archive's registers, a wall of paper, faded like an old print; the black stamp lands on it
      const a = bC + D, p = slow(a, this.ctx.end);
      const jolt = sk > 0 ? Math.exp(-sk * 9) : 0;
      this.photo(c, P.registri!, 0.5, 0.5, 1.04 + 0.05 * p - 0.008 * jolt);
      this.grade(c, p, 0.0);
      c.fillStyle = 'rgba(232,232,232,0.42)'; c.fillRect(0, 0, W, H);
      this.dust(c, t, t0, sk);
      if (sk > -0.07) {
        shakeAmt = VERTICAL
          ? drawStamp(c, 'AUTOCRATICO!', STAMP_V.x, STAMP_V.y, this.stampPx, sk + 0.07, { color: 'pen', seed: 23, angle: STAMP_V.angle })
          : drawStamp(c, 'AUTOCRATICO!', 960, 470, this.stampPx, sk + 0.07, { color: 'pen', seed: 23, angle: -0.07 });
      }
      this.falling(c, t - t0, 0);
    }
    this.slip(c, t);
    const fi = frameIdx(t);
    return [shakeAmt * (hash(fi, 1) - 0.5) * 2, shakeAmt * (hash(fi, 2) - 0.5) * 2];
  }

  /** The drawn paper wall (behind the print), slow. */
  private wallBg(c: CanvasRenderingContext2D, t: number, t0: number, jolt: number) {
    const p = (t - t0) / (this.ctx.end - t0);
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-0.012 + 0.012 * p);
    const s = (VERTICAL ? 1.42 : 0.93) + 0.06 * p - 0.01 * jolt;
    c.scale(s, s);
    c.drawImage(this.wall.cv, -this.wall.w / 2 + (p - 0.5) * 40, -this.wall.h / 2, this.wall.w, this.wall.h);
    c.restore();
    c.fillStyle = 'rgba(90,90,90,0.25)'; c.fillRect(0, 0, W, H);
  }

  /** Loose sheets falling through the light in slow motion: 1 = the far one (behind the stamp), 0 = the near one, out of focus. */
  private falling(c: CanvasRenderingContext2D, tt: number, i: number) {
    const L = this.loose[i]!;
    // upright: the near sheet drifts through the bottom right corner, clear of the stamp's diagonal
    const x = i ? 1300 - tt * 22 : VERTICAL ? 1080 - tt * 20 : 1930 - tt * 20;
    const y = i ? -330 + tt * 100 : VERTICAL ? 1180 + tt * 110 : -520 + tt * 120;
    c.save();
    c.translate(x + Math.sin(tt * 0.8 + i) * 30, y);
    c.rotate((i ? 0.5 : -0.35) + Math.sin(tt * 0.5 + i * 2) * 0.12);
    c.drawImage(L.cv, -L.w / 2, -L.h / 2, L.w, L.h);
    c.restore();
  }

  /** Dust in the light: slow, deterministic; the stamp's hit blows it outwards. */
  private dust(c: CanvasRenderingContext2D, t: number, t0: number, sk: number) {
    const tau = t - t0;
    const burst = sk > 0 ? (1 - Math.exp(-sk * 3.5)) * 90 : 0;
    c.save();
    for (let i = 0; i < 170; i++) {
      const h1 = hash(i, 11), h2 = hash(i, 12), h3 = hash(i, 13), h4 = hash(i, 14), h5 = hash(i, 15);
      let x = h1 * W + (h3 - 0.5) * 16 * tau + Math.sin(tau * 0.6 + i) * 6;
      let y = h2 * H - (3 + h4 * 9) * tau;
      if (burst > 0) {
        const dx = x - (VERTICAL ? STAMP_V.x : 960), dy = y - (VERTICAL ? STAMP_V.y : 470), d = Math.hypot(dx, dy) + 60;
        x += (dx / d) * burst * (0.4 + h5); y += (dy / d) * burst * (0.4 + h5);
      }
      x = ((x % W) + W) % W; y = ((y % H) + H) % H;
      const big = h5 > 0.93;
      const r = big ? 7 + h4 * 9 : 0.8 + h4 * 2.2;
      c.fillStyle = big ? 'rgba(245,245,245,0.07)' : `rgba(245,245,245,${0.25 + h3 * 0.4})`;
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
    c.restore();
  }

  /** "l'Italia lenta e pallosa", small and dull, printed on a paper slip at the bottom left. */
  private slip(c: CanvasRenderingContext2D, t: number) {
    const w = this.w;
    if (t < w.litalia!.start - 0.05) return;
    const S = 54, X = 150, Y = 975;
    const pal = w.pallosa!;
    const yawn = prog(t, pal.start + 0.15, pal.end, ease.inOutQuad);
    const trk = lerp(-0.01, 0.2, yawn);
    const parts: [string, Word, number, string, number][] = [
      ['l’Italia', w.litalia!, 400, HEX.graphite, -0.02], ['lenta', w.lenta!, 300, HEX.muted, -0.01],
      ['e', w.e!, 300, HEX.muted, -0.01], ['pallosa', pal, 300, HEX.muted, trk],
    ];
    if (VERTICAL) { this.slipV(c, t, parts); return; }
    const sp = textW(c, ' ', S, 300, 0);
    const width = parts.reduce((a, [s, , wt, , tr]) => a + textW(c, s, S, wt, tr), 0) + sp * 3;
    const open = prog(t, w.litalia!.start - 0.05, w.litalia!.start + 0.15, ease.outCubic);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.22)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = '#ececec';
    c.translate(X - 36, Y - S * 1.05);
    c.rotate(-0.008);
    c.fillRect(0, 0, (width + 72) * open, S * 1.5);
    c.restore();
    let x = X;
    for (const [s, wd, wt, col, tr] of parts) {
      x += riseWord(c, s, x, Y, S, prog(t, wd.start - 0.04, wd.start + 0.2), { weight: wt, color: col, tracking: tr }) + sp;
    }
  }

  /** Upright: two slips stacked at the top left, "l’Italia" and then "lenta e pallosa" (clear of the stamp's diagonal). */
  private slipV(c: CanvasRenderingContext2D, t: number, parts: [string, Word, number, string, number][]) {
    const S = 62, X = SAFE.left + 34, Y0 = 330, LEAD = 96;
    const sp = textW(c, ' ', S, 300, 0);
    const rows = [parts.slice(0, 1), parts.slice(1)];
    rows.forEach((row, r) => {
      const Y = Y0 + r * LEAD;
      const at = row[0]![1].start;
      const width = row.reduce((a, [s, , wt, , tr]) => a + textW(c, s, S, wt, tr), 0) + sp * (row.length - 1);
      const open = prog(t, at - 0.05, at + 0.15, ease.outCubic);
      if (open <= 0) return;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.22)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
      c.fillStyle = '#ececec';
      c.translate(X - 30, Y - S * 1.02);
      c.rotate(r ? 0.006 : -0.01);
      c.fillRect(0, 0, (width + 60) * open, S * 1.42);
      c.restore();
      let x = X;
      for (const [s, wd, wt, col, tr] of row) {
        x += riseWord(c, s, x, Y, S, prog(t, wd.start - 0.04, wd.start + 0.2), { weight: wt, color: col, tracking: tr }) + sp;
      }
    });
  }
}
