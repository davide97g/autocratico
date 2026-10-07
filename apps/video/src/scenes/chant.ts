// 10. `chant` — "futuro autocratico" ×2 (71.88 – 76.55). Tight crops of the real app slam onto the
// ink like stamps, one per beat (eighths at the end); the shouted words sit on redaction bars, white
// Geist Black, the second time bigger and cropped by the frame.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, VERTICAL } from '../engine/gl';
import { HEX } from '../engine/palette';
import { clamp, ease, frameIdx, hash } from '../engine/util';
import { app, loadImage, roundRect } from './_motifs';
import { chantWords, drawChantWord, type ChantWord } from './chant-type';

/** A crop of a capture: image key, centre and width in capture px (16:9; upright 4:5). */
type Crop = [view: string, cx: number, cy: number, w: number];
/** Upright: portrait crops, mostly of the phone (natively upright), tight enough to read. */
const CROPS_V: Crop[] = [
  ['phone-overview', 590, 1250, 900], // calendar chips
  ['desktop-overview', 2440, 1030, 640], // "6 ott · Bollo auto"
  ['desktop-inbox', 2150, 900, 760], // the phishing row
  ['phone-deadlines', 600, 1600, 1000], // October rows
  ['phone-cases', 590, 1350, 1000], // the checklist
  ['phone-activity', 590, 1700, 1000], // commits + Annulla
  ['desktop-overview', 1350, 640, 760], // desktop calendar
  ['phone-deadlines', 600, 1250, 900], // Multa ZTL
  ['desktop-deadlines', 2290, 760, 760], // November
  ['phone-overview', 590, 1900, 900], // further down the phone
];
const CROPS_W: Crop[] = [
  ['desktop-overview', 1350, 640, 1150], // calendar chips
  ['desktop-overview', 2440, 1030, 680], // "6 ott · Bollo auto"
  ['desktop-inbox', 2150, 830, 1150], // the phishing row
  ['desktop-deadlines', 1160, 850, 980], // October
  ['desktop-cases', 1450, 1080, 1300], // the checklist
  ['desktop-activity', 2280, 1160, 980], // commits + Annulla
  ['phone-overview', 760, 1300, 1000], // phone calendar
  ['desktop-deadlines', 2290, 760, 1000], // November
  ['phone-deadlines', 600, 1700, 1100], // phone rows
  ['desktop-overview', 970, 1600, 680], // "Da tenere d'occhio"
];
const CROPS = VERTICAL ? CROPS_V : CROPS_W;
/** Crop aspect (h / w). */
const ASPECT = VERTICAL ? 1.25 : 9 / 16;

export default class Chant extends Scene {
  layer = new Layer2D();
  imgs = new Map<string, ImageBitmap>();
  slots: number[] = [];
  words!: ChantWord[];

  override async init() {
    const views = [...new Set(CROPS.map((c) => c[0]))];
    await Promise.all(views.map(async (v) => this.imgs.set(v, await loadImage(`app/${v}.png`))));
    const au = this.ctx.audio;
    const { start, end } = this.ctx;
    // one card per beat, eighths in the last bar before the outro
    const beats = au.beats.filter((b) => b > start + 0.05 && b < end - 0.05);
    const s = [start, ...beats];
    const last = beats.slice(-2);
    for (const b of last) s.push(b + (au.beats[au.beats.indexOf(b) + 1]! - b) / 2);
    this.slots = s.sort((a, b) => a - b).slice(0, CROPS.length);
    this.words = chantWords(this.ctx.lyrics);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { t } = f;
    const c = this.layer.ctx;
    this.layer.clear(HEX.ink);
    let shake = 0;
    // the cards
    let cur = -1;
    this.slots.forEach((s, i) => { if (t >= s) cur = i; });
    for (let i = Math.max(0, cur - 5); i <= cur; i++) {
      const k = t - this.slots[i]!;
      shake = Math.max(shake, this.card(c, i, k, i >= cur - 1));
    }
    // the words (round 2 replaces round 1)
    const r2 = t >= this.words[2]!.from; // round 1 stays until "autocratico" ends
    for (const cw of this.words) {
      if ((cw.round === 2) !== r2) continue;
      const k = t - cw.start;
      const punch = k >= 0 ? 0.035 * Math.exp(-k * 14) : 0;
      drawChantWord(c, cw, t, 0, punch);
      if (k >= 0) shake = Math.max(shake, 18 * Math.exp(-k * 20));
    }
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    const a = hash(frameIdx(t), 3) * Math.PI * 2;
    return { grain: 0.05, vignette: 0.3, bloom: 0.2, shake: [Math.cos(a) * shake, Math.sin(a) * shake] };
  }

  /** Card i slams in (k = s since its beat). Returns the shake. */
  card(c: CanvasRenderingContext2D, i: number, k: number, shadow: boolean): number {
    const [view, cx, cy, cw] = CROPS[i]!;
    const img = this.imgs.get(view)!;
    const ch = cw * ASPECT;
    const sc = 1.0 + 0.2 * hash(i, 1);
    // upright: portrait cards in the safe box, between FUTURO and AUTOCRATICO
    const w = (VERTICAL ? 780 : 980) * sc, h = w * ASPECT;
    const x = VERTICAL ? 492 + (hash(i, 2) - 0.5) * 200 : W / 2 + (hash(i, 2) - 0.5) * 820;
    const y = VERTICAL ? 830 + (hash(i, 3) - 0.5) * 140 : H / 2 + 10 + (hash(i, 3) - 0.5) * 120;
    const ang = (hash(i, 4) - 0.5) * 0.12;
    const drop = clamp(k / 0.07);
    const s = drop < 1 ? 1.3 - 0.3 * ease.inQuad(drop) : 1 + 0.02 * Math.exp(-(k - 0.07) * 30) * Math.cos((k - 0.07) * 60);
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.scale(s, s);
    c.globalAlpha = drop < 1 ? 0.3 + 0.7 * drop : 1;
    // slow push inside the crop while it is on top
    const push = 1 + 0.03 * clamp(k / 0.6);
    const sw = cw / push, sh = ch / push;
    if (shadow) {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 50; c.shadowOffsetY = 20;
      c.fillStyle = '#000';
      roundRect(c, -w / 2, -h / 2, w, h, 16); c.fill();
      c.restore();
    }
    c.save();
    roundRect(c, -w / 2, -h / 2, w, h, 16); c.clip();
    c.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh, -w / 2, -h / 2, w, h);
    c.restore();
    c.restore();
    return drop < 1 ? 0 : 9 * Math.exp(-(k - 0.07) * 22);
  }
}
