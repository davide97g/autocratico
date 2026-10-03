// Animation test for Bollo, the mascot (not part of the film): ten seconds of the chorus hook,
// rendered with `--query bollotest=1 --only bollotest`. Everything is driven by the song: the mouth by
// the aligned words (Italian spelling -> mouth shapes), the head by the beats, the bounce by the kicks,
// the ears by the snares, gestures by the accented words, the shout pose by each "autocratico!".
//
//  41.30  the sticker slams in (centre, big)
//  41.7 → the hook, rapped: lip-sync, head bob, fist pumps, blinks, tail
//  each "autocratico!"  the shout: mouth wide, ears up, eyes open, free arm points at the viewer
//  47.57  (downbeat) he flies to the corner, a small cameo over a real plate of the film
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { clamp, ease, lerp, hash } from '../engine/util';
import { drawBollo, mixMouth, VISEME, type Mouth, type MouthShape } from './_bollo';
import { app, drawBrowser, drawStudio, loadImage } from './_motifs';

interface Key { t: number; m: Mouth; shout: boolean }

/** Italian letters -> mouth shapes, spread over the word's sung time. */
function wordKeys(w: Word): Key[] {
  const shout = /!$/.test(w.w);
  const txt = w.w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const units: { m: Mouth; wt: number }[] = [];
  for (const ch of txt) {
    if ('aeiou'.includes(ch)) units.push({ m: ch as Mouth, wt: 1 });
    else if ('mbp'.includes(ch)) units.push({ m: 'm', wt: 0.4 });
    else if ('fv'.includes(ch)) units.push({ m: 'f', wt: 0.4 });
  }
  if (!units.length) units.push({ m: 'e', wt: 1 });
  const total = units.reduce((s, u) => s + u.wt, 0);
  const dur = Math.max(0.06, w.end - w.start);
  let acc = 0;
  return units.map((u) => {
    const k = { t: w.start + (acc / total) * dur, m: u.m, shout };
    acc += u.wt;
    return k;
  });
}

export default class BolloTest extends Scene {
  layer = new Layer2D();
  keys: Key[] = [];
  words: Word[] = [];
  plate!: ImageBitmap;
  t0 = 41.3;
  corner = 47.57;
  shouts: Word[] = [];

  override async init() {
    const ly = this.ctx.lyrics;
    this.words = ly.words.filter((w) => w.end > 40 && w.start < 52.5);
    for (const w of this.words) this.keys.push(...wordKeys(w));
    this.shouts = this.words.filter((w) => /^autocratico!$/i.test(w.w));
    this.plate = await loadImage(app('desktop', 'overview'));
  }

  /** The mouth at t: blend between letter keys, close between words, open with the voice. */
  mouthAt(t: number): MouthShape {
    const au = this.ctx.audio;
    const w = this.words.find((x) => t >= x.start - 0.03 && t < x.end + 0.02);
    if (!w) {
      // between words: relax to closed, the smirk when the rest is long
      const prev = [...this.words].reverse().find((x) => x.end <= t);
      const gap = prev ? t - prev.end : 9;
      return mixMouth(VISEME.m, VISEME.smirk, clamp((gap - 0.25) / 0.3));
    }
    const ks = this.keys.filter((k) => k.t <= t + 0.03);
    const i = Math.max(0, ks.length - 1);
    const cur = ks[i] ?? this.keys[0]!;
    const next = this.keys[this.keys.indexOf(cur) + 1];
    let shape = VISEME[cur.m];
    if (next && next.t < w.end + 0.02) {
      const span = Math.max(0.04, next.t - cur.t);
      const k = ease.inOutQuad(clamp((t - (next.t - span * 0.45)) / (span * 0.45)));
      shape = mixMouth(shape, VISEME[next.m], k);
    }
    // the voice's loudness opens the jaw a little more or less
    const v = clamp(au.env('vocal', t) * 1.3);
    shape = { ...shape, d: shape.d * (0.62 + 0.45 * v) };
    // a shouted word is shouted with the whole jaw, whatever the letter
    // land the attack: open from closed over the first 40 ms of the word
    const a = clamp((t - w.start + 0.03) / 0.07);
    shape = mixMouth(VISEME.m, shape, ease.outQuad(a));
    if (cur.shout) shape = mixMouth(shape, VISEME.shout, 0.55 + 0.25 * v);
    return shape;
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t, c = this.layer.ctx, au = this.ctx.audio;
    this.layer.clear();
    const cornerK = ease.inOutCubic(clamp((t - this.corner) / 0.45));

    // stage: the studio, then (for the cameo) a real plate of the film fading in behind him
    drawStudio(c, { drift: t * 0.3 });
    if (cornerK > 0) {
      c.save();
      c.globalAlpha = cornerK;
      drawStudio(c);
      drawBrowser(c, this.plate, 160 - 20 * (1 - cornerK), 120, 1600);
      c.restore();
    }

    // shout envelope: 1 during an "autocratico!", with a short attack and release
    let shout = 0;
    for (const w of this.shouts) shout = Math.max(shout, clamp((t - w.start + 0.06) / 0.08) * clamp((w.end + 0.18 - t) / 0.18));

    // beats: a nod down on every beat, a tilt that alternates per bar
    const ph = f.beatPhase;
    const nod = 16 * Math.exp(-ph * 5) - 5 - shout * 10;
    const tilt = Math.sin(f.bar * Math.PI) * 0.07 * (1 - shout * 0.6);
    const bounce = 14 * f.a.kick;
    const squash = 0.045 * f.a.kick;
    // ears flick on the snare (one slightly later than the other), up when shouting
    const earL = Math.max(shout, clamp(f.a.snare * 1.2));
    const earR = Math.max(shout, clamp(au.hit('snare', t - 0.05, 0.14) * 1.2));
    // blinks: a seeded schedule, ~every 2.5 s, 130 ms each, never during a shout
    let blink = 0;
    for (let n = 0; n < 6; n++) {
      const bt = this.t0 + 0.9 + n * 2.3 + hash(n, 9) * 0.8;
      const x = (t - bt) / 0.13;
      if (x > 0 && x < 1) blink = Math.sin(x * Math.PI);
    }
    const lid = lerp(lerp(0.4, 1, blink), 0.12, shout);
    const brow = lerp(0.85, 1.1, shout);
    // the free arm: a fist pump on each downbeat and on accented word starts; points while shouting
    const db = au.downbeats;
    let pump = 0;
    for (const d of db) if (t >= d - 0.05 && t < d + 0.6) pump = Math.max(pump, Math.sin(clamp((t - d + 0.05) / 0.65) * Math.PI));
    const wordHit = au.hit('vocal', t, 0.12);
    const armUp = clamp(Math.max(0.42 + 0.48 * pump + 0.2 * wordHit, shout));
    const armPoint = 0;
    // the mic follows the head a bit, the tail swings
    const tail = Math.sin(t * 2.4) * 0.8;
    // the body leans side to side over two beats; the head follows a little late (overlap)
    const sway = Math.sin(f.beat * Math.PI) * 8;
    const lean = Math.sin(f.beat * Math.PI) * 0.045 + shout * -0.03;
    const headX = Math.sin((f.beat - 0.18) * Math.PI) * 10;

    // entrance: the sticker slams in like a stamp
    const ek = (t - this.t0) / 0.14;
    const slam = ek < 0 ? 0 : ek < 1 ? ease.inQuad(ek) : 1;
    const slamScale = ek < 1 ? lerp(1.7, 1, slam) : 1 + 0.03 * Math.exp(-(t - this.t0 - 0.14) * 18) * Math.cos((t - this.t0) * 50);
    if (slam > 0) {
      // big in the centre, then flying to the corner as a cameo
      const big = { x: W / 2 + sway, y: 400, s: 92 };
      const small = { x: W - 200, y: H - 236, s: 27 };
      const x = lerp(big.x, small.x, cornerK), y = lerp(big.y, small.y, cornerK) - Math.sin(cornerK * Math.PI) * 120;
      const s = lerp(big.s, small.s, cornerK) * slamScale;
      c.save();
      c.globalAlpha = ek < 1 ? 0.3 + 0.7 * slam : 1;
      // soft contact shadow on the studio floor
      c.fillStyle = 'rgba(0,0,0,0.16)';
      c.beginPath(); c.ellipse(x, y + 575 * (s / 100), 230 * (s / 100), 26 * (s / 100), 0, 0, Math.PI * 2); c.fill();
      drawBollo(c, x, y, s, {
        mouthShape: this.mouthAt(t), lid, brow, look: Math.sin(t * 0.9) * 0.3 * (1 - shout),
        tilt, nod, earL, earR, bounce, squash, armUp, armPoint, tail, lean, headX, mic: 0, border: 16,
      });
      c.restore();
    }

    // the line being sung, small, bottom left (karaoke): sung words ink, the rest faint
    const l = this.ctx.lyrics.lineAt(t) ?? this.ctx.lyrics.linesIn(t - 1.2, t)[0];
    if (l && cornerK < 1) {
      c.save();
      c.globalAlpha = 1 - cornerK;
      c.font = font(F.sans(700), 40);
      c.textBaseline = 'alphabetic';
      let x = 96;
      for (const w of l.words) {
        c.fillStyle = t >= w.start ? HEX.pen : 'rgba(15,15,15,0.25)';
        c.fillText(w.w, x, H - 96);
        x += c.measureText(w.w + ' ').width;
      }
      c.restore();
    }
    c.save();
    c.font = font(F.mono(400), 16); c.fillStyle = HEX.graphite;
    c.fillText(`BOLLO · test d’animazione · ${t.toFixed(2)} s`, 96, 72);
    c.restore();

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    const shake = ek > 1 ? 12 * Math.exp(-(t - this.t0 - 0.14) * 20) : 0;
    return { paper: 1, grain: 0.025, vignette: 0.12, shake: [shake, shake * 0.4] };
  }
}
