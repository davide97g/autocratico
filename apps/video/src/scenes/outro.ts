// 11. `outro` — the close (76.55 – 83.6). The chant's bars leave through the right edge onto the
// studio: Scadenze in the browser and on the phone, calm. The P key (the app's privacy shortcut) is
// pressed on the downbeat and every amount, the name and the eye become bars (the -privacy captures,
// revealed left to right). The devices sink; "Il futuro è automatico." word by word. On the last hit:
// hard black, the icon slams in; when the music stops "automatico." is redacted into the wordmark
// "Autocratico", then the line and the mono footnote. The last frame holds.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font, glyphX, measure } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp } from '../engine/util';
import type { Line } from '../engine/lyrics';
import { app, drawBrowser, drawIcon, drawPhone, drawStudio, loadImage, roundRect } from './_motifs';
import { chantWords, drawChantWord, type ChantWord } from './chant-type';

/** Regions that differ between a capture and its -privacy twin (capture px; tools: pixel diff). */
const DESK_BARS: [number, number, number, number][] = [
  [968, 664, 1055, 695], [2050, 810, 2155, 841], [968, 846, 1071, 877], [952, 992, 1051, 1023], [2048, 1724, 2147, 1755],
  [130, 1606, 400, 1712], // avatar, name, the Omissis toggle
];
const DESK_EYE: [number, number, number, number] = [2572, 92, 2683, 203];
const PHONE_BARS: [number, number, number, number][] = [[300, 1422, 431, 1469], [300, 1761, 455, 1808], [300, 2040, 449, 2087]];
const PHONE_EYE: [number, number, number, number] = [826, 76, 967, 217];

const LINE_Y = 622, LINE_SIZE = 108;
/** The closing card: icon centre and size, wordmark baseline and size. */
const ICON_Y = 318, ICON_S = 292, MARK_Y = 690, MARK_SIZE = 152;

export default class Outro extends Scene {
  layer = new Layer2D();
  desk!: ImageBitmap; deskP!: ImageBitmap; ph!: ImageBitmap; phP!: ImageBitmap;
  /** Device screens with the redaction applied so far (redrawn only while it changes). */
  deskCv = document.createElement('canvas');
  phCv = document.createElement('canvas');
  words!: ChantWord[];
  L!: Line;
  tPress = 0; tBlack = 0; tCut = 0;

  override async init() {
    [this.desk, this.deskP, this.ph, this.phP] = await Promise.all([
      loadImage(app('desktop', 'deadlines')), loadImage(app('desktop', 'deadlines-privacy')),
      loadImage(app('phone', 'deadlines')), loadImage(app('phone', 'deadlines-privacy')),
    ]);
    this.deskCv.width = this.desk.width; this.deskCv.height = this.desk.height;
    this.phCv.width = this.ph.width; this.phCv.height = this.ph.height;
    this.words = chantWords(this.ctx.lyrics);
    this.L = this.ctx.lyrics.get('Il futuro è automatico', 2);
    const au = this.ctx.audio;
    this.tPress = au.downbeats[32]!; // 78.944
    // the last drum hit: the strongest kick between the line's last word and the end
    const kicks = au.events('kick', this.L.words[3]!.start + 0.4, this.L.words[3]!.start + 0.8);
    this.tBlack = kicks.length ? kicks[kicks.length - 1]![0] : 81.66;
    this.tCut = this.tBlack + 0.33; // the bass stops: the music is over
  }

  /** The screens with every redaction drawn up to its progress (bars grow left to right). */
  screens(t: number) {
    const reveal = (cv: HTMLCanvasElement, img: ImageBitmap, priv: ImageBitmap, bars: number[][], eye: number[], t0: number) => {
      const c = cv.getContext('2d')!;
      c.drawImage(img, 0, 0);
      bars.forEach(([x0, y0, x1, y1], i) => {
        const p = ease.outCubic(clamp((t - t0 - 0.04 - i * 0.05) / 0.16));
        if (p <= 0) return;
        const w = (x1! - x0! + 12) * p;
        c.drawImage(priv, x0! - 6, y0! - 6, w, y1! - y0! + 12, x0! - 6, y0! - 6, w, y1! - y0! + 12);
      });
      if (t >= t0) {
        const [x0, y0, x1, y1] = eye as [number, number, number, number];
        c.drawImage(priv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      }
    };
    reveal(this.deskCv, this.desk, this.deskP, DESK_BARS, DESK_EYE, this.tPress);
    reveal(this.phCv, this.ph, this.phP, PHONE_BARS, PHONE_EYE, this.tPress + 0.02);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { t } = f;
    const c = this.layer.ctx;
    this.layer.clear();
    let post: PostOverrides;
    if (t < this.tBlack) {
      this.studio(c, t);
      post = { paper: 1, grain: 0.03, vignette: 0.15 };
    } else {
      post = this.end(c, t);
    }
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return post;
  }

  studio(c: CanvasRenderingContext2D, t: number) {
    const t0 = this.ctx.start;
    drawStudio(c, { drift: t * 0.12 });
    this.screens(t);
    // the camera: wide and calm, a slow push to the amounts for the press, back out as the devices sink
    const settle = ease.outCubic(clamp((t - t0) / 0.9));
    const push = ease.inOutCubic(clamp((t - (this.tPress - 1.5)) / 1.4)) * (1 - ease.inOutCubic(clamp((t - (this.tPress + 0.62)) / 0.75)));
    const sink = ease.inOutCubic(clamp((t - (this.L.start - 0.6)) / 0.62));
    const z = lerp(1.03, 1, settle) * lerp(1, 0.94, sink) * (1 + 0.012 * clamp((t - t0) / 3.5)) * lerp(1, 1.62, push);
    const fx = lerp(W / 2, 800, push), fy = lerp(H / 2, 540, push);
    const dy = (1 - settle) * 24 + sink * 590;
    c.save();
    c.translate(W / 2, H / 2 + dy);
    c.scale(z, z);
    c.translate(-fx, -fy);
    drawBrowser(c, this.deskCv, 104, 150, 1210, {});
    drawPhone(c, this.phCv, 1528 + 10 * Math.sin(t * 0.4), 572 - 8 * settle, 860, {});
    c.restore();
    c.save();
    c.translate(0, sink * 590);
    this.keycap(c, t);
    c.restore();

    // the line, word by word, centred
    this.line(c, t, HEX.pen);

    // the chant's bars leave through the right edge
    const out = ease.inCubic(clamp((t - t0) / 0.24));
    if (out < 1) for (const cw of this.words.slice(2)) drawChantWord(c, cw, t, out * (W + 120) * (cw.text === 'FUTURO' ? 1.12 : 1));
  }

  /** The P keycap and the tooltip "Nascondi i dati personali" (topbar.hideData). */
  keycap(c: CanvasRenderingContext2D, t: number) {
    const tin = this.ctx.audio.beats.find((b) => b > this.tPress - 1.3)!; // a beat before the press
    const a = ease.outCubic(clamp((t - tin) / 0.35));
    if (a <= 0) return;
    const press = t < this.tPress - 0.06 ? 0 : t < this.tPress ? (t - this.tPress + 0.06) / 0.06 : 1 - ease.outCubic(clamp((t - this.tPress - 0.12) / 0.25));
    const s = 132, x = 1680, y = 820 + (1 - a) * 40, d = 10 * press;
    c.save();
    c.globalAlpha = a;
    // shadow + the key's skirt
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.22)'; c.shadowBlur = 30 - 14 * press; c.shadowOffsetY = 18 - 10 * press;
    c.fillStyle = '#cfcfcf';
    roundRect(c, x, y + 10, s, s, 26); c.fill();
    c.restore();
    // the cap
    const g = c.createLinearGradient(0, y + d, 0, y + d + s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ececec');
    c.fillStyle = g;
    roundRect(c, x, y + d, s, s - 4, 24); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.06)'; c.lineWidth = 1;
    roundRect(c, x + 0.5, y + d + 0.5, s - 1, s - 5, 24); c.stroke();
    c.fillStyle = HEX.pen;
    c.font = font(F.sans(500), 54);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('P', x + s / 2, y + d + s / 2 - 2);
    c.restore();
    // tooltip after the press
    const tip = ease.outCubic(clamp((t - this.tPress - 0.05) / 0.25));
    if (tip > 0) {
      c.save();
      c.globalAlpha = tip;
      c.font = font(F.sans(500), 22);
      const label = 'Nascondi i dati personali';
      const tw = c.measureText(label).width;
      const bx = x + s - tw - 36, by = y - 64 - (1 - tip) * 8;
      c.fillStyle = HEX.pen;
      roundRect(c, bx, by, tw + 36, 46, 12); c.fill();
      c.fillStyle = HEX.sheet; c.textBaseline = 'middle';
      c.fillText(label, bx + 18, by + 24);
      c.restore();
    }
  }

  /** "Il futuro è automatico." centred; words rise in from their start. `hide` 0..1 fades all but the last word. */
  line(c: CanvasRenderingContext2D, t: number, col: string, hide = 0, lastAlpha = 1) {
    const fam = F.sans(600), size = LINE_SIZE, tr = -0.04 * size;
    const text = this.L.text;
    const x0 = (W - measure(text, fam, size, tr)) / 2;
    let ci = 0;
    c.save();
    c.font = font(fam, size);
    c.letterSpacing = `${tr}px`;
    this.L.words.forEach((w, i) => {
      const wx = x0 + glyphX(text, ci, fam, size, tr);
      ci += Array.from(w.w).length + 1;
      const k = t - (w.start - 0.02);
      if (k < 0) return;
      const p = ease.outCubic(clamp(k / 0.18));
      const last = i === this.L.words.length - 1;
      const al = last ? lastAlpha : 1 - hide;
      if (al <= 0) return;
      c.save();
      c.beginPath();
      c.rect(wx - 20, LINE_Y - size * 1.05, measure(w.w, fam, size, tr) + 60, size * 1.4);
      c.clip();
      c.globalAlpha = clamp(p * 1.6) * al;
      c.fillStyle = col;
      c.fillText(w.w, wx, LINE_Y + (1 - p) * size * 0.9);
      c.restore();
    });
    c.restore();
  }
  /** Where the last word of the line sits (x0, width). */
  lastWord() {
    const fam = F.sans(600), size = LINE_SIZE, tr = -0.04 * size;
    const text = this.L.text, w = this.L.words[this.L.words.length - 1]!.w;
    const x0 = (W - measure(text, fam, size, tr)) / 2 + glyphX(text, text.length - w.length, fam, size, tr);
    return { x: x0, w: measure(w, fam, size, tr) };
  }

  /** Hard black, the icon, the wordmark: the closing card. */
  end(c: CanvasRenderingContext2D, t: number): PostOverrides {
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    // the icon slams in on the hit
    const k = t - this.tBlack;
    const drop = clamp(k / 0.075);
    const s = drop < 1 ? 1.4 - 0.4 * ease.inQuad(drop) : 1 + 0.025 * Math.exp(-(k - 0.075) * 18) * Math.cos((k - 0.075) * 40);
    c.save();
    c.globalAlpha = 0.35 + 0.65 * drop;
    c.translate(W / 2, ICON_Y); c.scale(s, s);
    drawIcon(c, 0, 0, ICON_S);
    c.restore();
    const shake = drop < 1 ? 0 : 18 * Math.exp(-(k - 0.075) * 20);

    // the line stays, white; when the music stops the rest fades, "automatico." glides into the
    // wordmark's place and a bar redacts it into "Autocratico" (Geist Black)
    const kc = t - this.tCut;
    const lw = this.lastWord();
    const mfam = F.sans(900), mtr = -0.045 * MARK_SIZE;
    const mark = 'Autocratico';
    const mw = measure(mark, mfam, MARK_SIZE, mtr), mx = (W - mw) / 2;
    const glide = ease.inOutCubic(clamp(kc / 0.24));
    const sc = lerp(1, MARK_SIZE / LINE_SIZE, glide);
    const cx = lerp(lw.x + lw.w / 2, W / 2, glide), by = lerp(LINE_Y, MARK_Y, glide);
    const cover = ease.inOutCubic(clamp((kc - 0.22) / 0.12)), leave = ease.inOutCubic(clamp((kc - 0.36) / 0.14));
    this.line(c, t, HEX.sheet, ease.outCubic(clamp(kc / 0.16)), kc < 0 ? 1 : 0);
    if (kc >= 0 && kc < 0.34) {
      c.save();
      c.translate(cx, by); c.scale(sc, sc);
      c.font = font(F.sans(600), LINE_SIZE); c.letterSpacing = `${-0.04 * LINE_SIZE}px`;
      c.fillStyle = HEX.sheet;
      c.fillText(this.L.words[this.L.words.length - 1]!.w, -lw.w / 2, 0);
      c.restore();
    }
    if (kc >= 0.34) {
      c.save();
      c.font = font(mfam, MARK_SIZE); c.letterSpacing = `${mtr}px`;
      c.fillStyle = HEX.sheet;
      c.fillText(mark, mx, MARK_Y);
      c.restore();
    }
    if (cover > 0.02 && leave < 0.98) {
      const bw = Math.max(lw.w * MARK_SIZE / LINE_SIZE, mw) + 56, bx0 = W / 2 - bw / 2;
      const xa = bx0 + bw * leave, xb = bx0 + bw * cover;
      c.fillStyle = HEX.sheet;
      roundRect(c, xa, MARK_Y - MARK_SIZE * 0.86, Math.max(0, xb - xa), MARK_SIZE * 1.06, 12); c.fill();
    }
    // the line, the footnote, the credits
    const fade = (d: number, dur: number) => ease.outCubic(clamp((t - this.tCut - d) / dur));
    const k1 = fade(0.5, 0.4);
    if (k1 > 0) {
      c.save();
      c.globalAlpha = k1;
      c.font = font(F.sans(400), 42); c.letterSpacing = '-0.6px';
      c.fillStyle = '#c8c8c8'; c.textAlign = 'center';
      c.fillText('Il registro personale della burocrazia italiana', W / 2, 778 + (1 - k1) * 14);
      c.restore();
    }
    const k2 = fade(0.72, 0.4);
    if (k2 > 0) {
      c.save();
      c.globalAlpha = k2;
      c.font = font(F.mono(400), 21);
      c.fillStyle = '#8a8a8a'; c.textAlign = 'center';
      c.fillText('open source · i tuoi dati restano a casa', W / 2, 846 + (1 - k2) * 10);
      c.restore();
    }
    const k3 = fade(0.86, 0.35);
    if (k3 > 0) {
      c.save();
      c.globalAlpha = k3;
      c.font = font(F.mono(400), 15);
      c.fillStyle = '#5e5e5e'; c.textAlign = 'center';
      c.fillText('Immagini: Sentinel-2 cloudless 2016 di EOX (dati Copernicus modificati) · NASA · ISTAT · Wikimedia Commons — crediti in apps/video/public/ref/CREDITS.md', W / 2, 1028);
      c.restore();
    }
    const a = hash(frameIdx(t), 5) * Math.PI * 2;
    return { grain: 0.035, vignette: 0.2, bloom: 0.2, shake: [Math.cos(a) * shake, Math.sin(a) * shake] };
  }
}
