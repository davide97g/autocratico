// Animation test for Bollo's talking head (not part of the film): ten seconds of the chorus hook,
// rendered with `--query bollohead=1 --only bollohead`.
//
// Organic motion without state: every hit (beat, kick, snare, syllable) plucks a damped spring, and
// the spring's response is summed analytically, so the head overshoots and settles yet stays a pure
// function of time (the motion-blur sampler renders sub-frames in any order). The mouth's target
// (Italian letters -> mouth shapes) is smoothed over ±60 ms so the shapes melt into each other.
// The eyes run on seeded schedules: blinks that close fast and open slow (the two eyes 12 ms apart,
// sometimes twice), saccades that dart and hold, slits that narrow when he shouts.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import type { Word } from '../engine/lyrics';
import { clamp, ease, lerp, hash, noise1 } from '../engine/util';
import { mixMouth, VISEME, type Mouth, type MouthShape } from './_bollo';
import { drawBolloHead } from './_bollo-head';
import { app, drawBrowser, drawStudio, loadImage } from './_motifs';

interface Key { t: number; m: Mouth; shout: boolean }

function wordKeys(w: Word): Key[] {
  const shout = /!$/.test(w.w);
  const txt = w.w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  const units: { m: Mouth; wt: number }[] = [];
  for (const ch of txt) {
    if ('aeiou'.includes(ch)) units.push({ m: ch as Mouth, wt: 1 });
    else if ('mbp'.includes(ch)) units.push({ m: 'm', wt: 0.45 });
    else if ('fv'.includes(ch)) units.push({ m: 'f', wt: 0.45 });
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

/** Impulse response of a damped spring (0 before the hit, peak ≈ 1). */
function spring(tau: number, freq: number, zeta: number): number {
  if (tau < 0) return 0;
  const w = 2 * Math.PI * freq, wd = w * Math.sqrt(1 - zeta * zeta);
  return Math.exp(-zeta * w * tau) * Math.sin(wd * tau) * 1.25;
}
/** Sum of spring responses to a list of [time, strength] hits within the last few seconds. */
function plucked(t: number, hits: [number, number][], freq: number, zeta: number, horizon = 2.5): number {
  let s = 0;
  for (const [ht, a] of hits) if (ht <= t && ht > t - horizon) s += a * spring(t - ht, freq, zeta);
  return s;
}

export default class BolloHeadTest extends Scene {
  layer = new Layer2D();
  keys: Key[] = [];
  words: Word[] = [];
  shouts: Word[] = [];
  beats: [number, number][] = [];
  downs: [number, number][] = [];
  kicks: [number, number][] = [];
  snares: [number, number][] = [];
  sylls: [number, number][] = [];
  blinks: number[] = [];
  looks: { t: number; x: number; y: number }[] = [];
  plate!: ImageBitmap;
  t0 = 41.3;
  corner = 47.57;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.words = ly.words.filter((w) => w.end > 40 && w.start < 52.5);
    for (const w of this.words) this.keys.push(...wordKeys(w));
    this.shouts = this.words.filter((w) => /^autocratico!$/i.test(w.w));
    this.beats = au.beats.map((b) => [b, 1] as [number, number]);
    this.downs = au.downbeats.map((b, i) => [b, i % 2 ? -1 : 1] as [number, number]);
    const on = (k: string) => (au as any).onsets[k] as [number, number][];
    this.kicks = on('kick');
    this.snares = on('snare');
    this.sylls = on('vocal');
    // blinks: every 1.6–3.6 s, sometimes a double blink
    for (let t = this.t0 + 0.7, n = 0; t < 53; n++) {
      this.blinks.push(t);
      if (hash(n, 31) < 0.28) this.blinks.push(t + 0.24);
      t += 1.6 + hash(n, 17) * 2.0;
    }
    // saccades: a new target every 0.5–1.4 s
    for (let t = this.t0, n = 0; t < 53; n++) {
      this.looks.push({ t, x: (hash(n, 3) - 0.5) * 1.3, y: (hash(n, 5) - 0.6) * 0.7 });
      t += 0.5 + hash(n, 7) * 0.9;
    }
    this.plate = await loadImage(app('desktop', 'overview'));
  }

  shoutAt(t: number) {
    let s = 0;
    for (const w of this.shouts) s = Math.max(s, ease.inOutQuad(clamp((t - w.start + 0.07) / 0.09)) * ease.inOutQuad(clamp((w.end + 0.22 - t) / 0.22)));
    return s;
  }

  /** The raw mouth target at t (before smoothing). */
  target(t: number): MouthShape {
    const w = this.words.find((x) => t >= x.start - 0.02 && t < x.end + 0.03);
    if (!w) {
      const prev = [...this.words].reverse().find((x) => x.end <= t);
      const gap = prev ? t - prev.end : 9;
      return mixMouth(VISEME.m, VISEME.smirk, clamp((gap - 0.3) / 0.35));
    }
    let cur = this.keys[0]!;
    for (const k of this.keys) if (k.t <= t + 0.02) cur = k;
    let shape = VISEME[cur.m];
    const v = clamp(this.ctx.audio.env('vocal', t) * 1.3);
    shape = { ...shape, d: shape.d * (0.6 + 0.48 * v) };
    if (cur.shout) shape = mixMouth(shape, VISEME.shout, 0.6 + 0.25 * v);
    return shape;
  }

  /** The mouth, smoothed over ±60 ms (a gaussian of nine samples). */
  mouthAt(t: number): MouthShape {
    let acc: MouthShape = { hw: 0, d: 0, round: 0, smirk: 0 }, wsum = 0;
    for (let i = -4; i <= 4; i++) {
      const o = i * 0.015, wgt = Math.exp(-((o / 0.035) ** 2));
      const s = this.target(t + o);
      acc = { hw: acc.hw + s.hw * wgt, d: acc.d + s.d * wgt, round: acc.round + s.round * wgt, smirk: acc.smirk + s.smirk * wgt };
      wsum += wgt;
    }
    return { hw: acc.hw / wsum, d: acc.d / wsum, round: acc.round / wsum, smirk: acc.smirk / wsum };
  }

  /** Lid closure of a blink at t: close in 70 ms, hold 30 ms, open in 160 ms. */
  blinkAt(t: number) {
    let b = 0;
    for (const bt of this.blinks) {
      const x = t - bt;
      if (x < 0 || x > 0.26) continue;
      b = Math.max(b, x < 0.07 ? ease.inQuad(x / 0.07) : x < 0.1 ? 1 : 1 - ease.outCubic((x - 0.1) / 0.16));
    }
    return b;
  }

  /** Gaze at t: dart to each new target in 60 ms with a little overshoot, then hold (plus drift). */
  lookAt(t: number) {
    let i = 0;
    for (let j = 0; j < this.looks.length; j++) if (this.looks[j]!.t <= t) i = j;
    const a = this.looks[Math.max(0, i - 1)]!, b = this.looks[i]!;
    const k = ease.outBack(clamp((t - b.t) / 0.07), 2.2);
    return { x: lerp(a.x, b.x, k) + noise1(t * 0.8, 3) * 0.06, y: lerp(a.y, b.y, k) + noise1(t * 0.7, 9) * 0.05 };
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t, c = this.layer.ctx;
    this.layer.clear();
    const cornerK = ease.inOutCubic(clamp((t - this.corner) / 0.5));

    drawStudio(c, { drift: t * 0.3 });
    if (cornerK > 0) {
      c.save(); c.globalAlpha = cornerK;
      drawStudio(c);
      drawBrowser(c, this.plate, 160, 120 - 20 * (1 - cornerK), 1600);
      c.restore();
    }

    const shout = this.shoutAt(t);
    const mouth = this.mouthAt(t);
    const jaw = clamp(mouth.d / 82);

    // the head's motion: springs plucked by the music
    const nodY = 16 * plucked(t, this.beats, 2.4, 0.42);
    const nodY2 = 16 * plucked(t - 0.02, this.beats, 2.4, 0.42);
    const kick = plucked(t, this.kicks, 3.2, 0.38);
    const tilt = 0.035 * Math.sin(f.bar * Math.PI) + 0.05 * plucked(t, this.downs, 1.6, 0.35, 4) - shout * 0.02;
    const sy = 1 - 0.045 * kick + shout * 0.05;
    const sx = 1 + 0.03 * kick - shout * 0.02;
    // ears: flicked by the snares, and dragged by the head's own motion (follow-through)
    const vel = (nodY - nodY2) / 0.02;
    const earL = 0.2 * plucked(t, this.snares, 4.5, 0.25) - 0.004 * vel - shout * 0.16;
    const earR = 0.2 * plucked(t - 0.04, this.snares, 4.5, 0.25) - 0.004 * vel - shout * 0.16;
    const whisk = 0.1 * plucked(t, this.kicks, 6, 0.22) + 0.06 * plucked(t, this.sylls, 5, 0.3);
    // eyes and brows
    const blink = this.blinkAt(t), blinkL = this.blinkAt(t - 0.012);
    const look = this.lookAt(t);
    const lookX = lerp(look.x, 0, shout), lookY = lerp(look.y, -0.15, shout);
    const rest = clamp(mouth.smirk);
    const baseLid = lerp(lerp(0.36, 0.42, rest), 0.08, shout);
    const brUp = 9 * plucked(t, this.sylls, 3.5, 0.45) + shout * 16;

    // the sticker slams on at t0, then flies to the corner as a cameo
    const ek = (t - this.t0) / 0.13;
    if (ek > 0) {
      const slam = ek < 1 ? ease.inQuad(ek) : 1;
      const settle = ek < 1 ? lerp(1.7, 1, slam) : 1 + 0.05 * spring(t - this.t0 - 0.13, 3, 0.3);
      const big = { x: W / 2, y: 585 + nodY, s: 138 };
      const small = { x: W - 250, y: H - 230 + nodY * 0.35, s: 42 };
      const x = lerp(big.x, small.x, cornerK), y = lerp(big.y, small.y, cornerK) - Math.sin(cornerK * Math.PI) * 140;
      const s = lerp(big.s, small.s, cornerK) * settle;
      c.save();
      c.globalAlpha = ek < 1 ? 0.35 + 0.65 * slam : 1;
      drawBolloHead(c, x, y, s, {
        mouth, jaw, lidL: Math.max(baseLid, blinkL), lidR: Math.max(baseLid, blink),
        squint: lerp(lerp(0.12, 0.3, rest), 0, shout), lookX, lookY, pupil: lerp(1.15, 0.72, shout) + 0.15 * blink,
        brow: lerp(0.85, 1.05, shout), browUpL: brUp, browUpR: brUp * 0.85 + 3,
        tilt, sx, sy, earL, earR, whisk, border: 18, shadow: 1,
      });
      c.restore();
    }

    // karaoke line, bottom left
    const l = this.ctx.lyrics.lineAt(t) ?? this.ctx.lyrics.linesIn(t - 1.2, t)[0];
    if (l && cornerK < 1) {
      c.save();
      c.globalAlpha = 1 - cornerK;
      c.font = font(F.sans(700), 40);
      let x = 96;
      for (const w of l.words) {
        c.fillStyle = t >= w.start ? HEX.pen : 'rgba(15,15,15,0.25)';
        c.fillText(w.w, x, H - 80);
        x += c.measureText(w.w + ' ').width;
      }
      c.restore();
    }
    c.save();
    c.font = font(F.mono(400), 16); c.fillStyle = HEX.graphite;
    c.fillText(`BOLLO · testa parlante · ${t.toFixed(2)} s`, 96, 72);
    c.restore();

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    const shake = ek > 1 ? 10 * Math.max(0, spring(t - this.t0 - 0.13, 6, 0.4)) : 0;
    return { paper: 1, grain: 0.025, vignette: 0.12, shake: [shake, shake * 0.5] };
  }
}
