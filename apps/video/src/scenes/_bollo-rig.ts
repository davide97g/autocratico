// Bollo's life: the procedural motion of the talking head for the whole song, as a pure function of
// time. Springs plucked by the music (beats, kicks, snares, syllables), the mouth from the aligned
// Italian words (letters -> mouth shapes, smoothed over ±60 ms), blinks and saccades on seeded
// schedules. A choreography (see bollo-choreo.ts) decides where he is and what he does; this decides
// how he breathes, talks and reacts while doing it.
import type { AudioData } from '../engine/audio';
import type { Lyrics, Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, noise1 } from '../engine/util';
import { mixMouth, VISEME, type Mouth, type MouthShape } from './_bollo';
import type { HeadPose } from './_bollo-head';

interface Key { t: number; m: Mouth; shout: boolean }

/** Impulse response of a damped spring (0 before the hit, peak ≈ 1). */
export function spring(tau: number, freq: number, zeta: number): number {
  if (tau < 0) return 0;
  const w = 2 * Math.PI * freq, wd = w * Math.sqrt(1 - zeta * zeta);
  return Math.exp(-zeta * w * tau) * Math.sin(wd * tau) * 1.25;
}

/** Sum of spring responses to [time, strength] hits in the last `horizon` seconds (hits sorted by time). */
export function plucked(t: number, hits: [number, number][], freq: number, zeta: number, horizon = 2.5): number {
  let s = 0;
  let lo = 0, hi = hits.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (hits[m]![0] <= t - horizon) lo = m + 1; else hi = m; }
  for (let i = lo; i < hits.length && hits[i]![0] <= t; i++) s += hits[i]![1] * spring(t - hits[i]![0], freq, zeta);
  return s;
}

function wordKeys(w: Word): Key[] {
  const shout = /!$/.test(w.w);
  const txt = w.w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const units: { m: Mouth; wt: number }[] = [];
  for (const ch of txt) {
    if ('aeiou'.includes(ch)) units.push({ m: ch as Mouth, wt: 1 });
    else if ('mbp'.includes(ch)) units.push({ m: 'm', wt: 0.45 });
    else if ('fv'.includes(ch)) units.push({ m: 'f', wt: 0.45 });
    else if (/[0-9]/.test(ch)) units.push({ m: 'e', wt: 1 });
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

export interface Life {
  pose: HeadPose;
  /** Vertical nod (units of the head) and the 0 … 1 shout envelope (a word ending in "!"). */
  nodY: number;
  shout: number;
  /** Is a word being sung right now (with a little release)? */
  singing: number;
}

export class BolloRig {
  words: Word[];
  keys: Key[] = [];
  shouts: Word[];
  beats: [number, number][];
  downs: [number, number][];
  kicks: [number, number][];
  snares: [number, number][];
  sylls: [number, number][];
  blinks: number[] = [];
  looks: { t: number; x: number; y: number }[] = [];

  constructor(public lyrics: Lyrics, public audio: AudioData) {
    this.words = lyrics.words;
    for (const w of this.words) this.keys.push(...wordKeys(w));
    this.shouts = this.words.filter((w) => /!$/.test(w.w));
    this.beats = audio.beats.map((b) => [b, 1] as [number, number]);
    this.downs = audio.downbeats.map((b, i) => [b, i % 2 ? -1 : 1] as [number, number]);
    const on = (k: string) => [...(audio.onsets[k] ?? [])].sort((a, b) => a[0] - b[0]) as [number, number][];
    this.kicks = on('kick');
    this.snares = on('snare');
    this.sylls = on('vocal');
    for (let t = 0.6, n = 0; t < audio.duration; n++) {
      this.blinks.push(t);
      if (hash(n, 31) < 0.28) this.blinks.push(t + 0.24);
      t += 1.6 + hash(n, 17) * 2.0;
    }
    for (let t = 0, n = 0; t < audio.duration; n++) {
      this.looks.push({ t, x: (hash(n, 3) - 0.5) * 1.3, y: (hash(n, 5) - 0.6) * 0.7 });
      t += 0.5 + hash(n, 7) * 0.9;
    }
  }

  private wordAt(t: number, pre: number, post: number): Word | undefined {
    let lo = 0, hi = this.words.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.words[m]!.end + post <= t) lo = m + 1; else hi = m; }
    const w = this.words[lo];
    return w && t >= w.start - pre ? w : undefined;
  }

  shoutAt(t: number) {
    const w = this.wordAt(t, 0.07, 0.22);
    if (!w || !/!$/.test(w.w)) return 0;
    return ease.inOutQuad(clamp((t - w.start + 0.07) / 0.09)) * ease.inOutQuad(clamp((w.end + 0.22 - t) / 0.22));
  }

  target(t: number): MouthShape {
    const w = this.wordAt(t, 0.02, 0.03);
    if (!w) {
      let prevEnd = -9;
      for (const x of this.words) { if (x.end <= t) prevEnd = x.end; else break; }
      return mixMouth(VISEME.m, VISEME.smirk, clamp((t - prevEnd - 0.3) / 0.35));
    }
    let lo = 0, hi = this.keys.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.keys[m]!.t <= t + 0.02) lo = m + 1; else hi = m; }
    const cur = this.keys[Math.max(0, lo - 1)]!;
    let shape = VISEME[cur.m];
    const v = clamp(this.audio.env('vocal', t) * 1.3);
    shape = { ...shape, d: shape.d * (0.6 + 0.48 * v) };
    if (cur.shout) shape = mixMouth(shape, VISEME.shout, 0.6 + 0.25 * v);
    return shape;
  }

  mouthAt(t: number): MouthShape {
    let hw = 0, d = 0, round = 0, smirk = 0, ws = 0;
    for (let i = -4; i <= 4; i++) {
      const o = i * 0.015, wgt = Math.exp(-((o / 0.035) ** 2));
      const s = this.target(t + o);
      hw += s.hw * wgt; d += s.d * wgt; round += s.round * wgt; smirk += s.smirk * wgt; ws += wgt;
    }
    return { hw: hw / ws, d: d / ws, round: round / ws, smirk: smirk / ws };
  }

  blinkAt(t: number) {
    let b = 0;
    for (const bt of this.blinks) {
      const x = t - bt;
      if (x < 0) break;
      if (x > 0.26) continue;
      b = Math.max(b, x < 0.07 ? ease.inQuad(x / 0.07) : x < 0.1 ? 1 : 1 - ease.outCubic((x - 0.1) / 0.16));
    }
    return b;
  }

  lookAt(t: number) {
    let i = 0;
    for (let j = 0; j < this.looks.length; j++) { if (this.looks[j]!.t <= t) i = j; else break; }
    const a = this.looks[Math.max(0, i - 1)]!, b = this.looks[i]!;
    const k = ease.outBack(clamp((t - b.t) / 0.07), 2.2);
    return { x: lerp(a.x, b.x, k) + noise1(t * 0.8, 3) * 0.06, y: lerp(a.y, b.y, k) + noise1(t * 0.7, 9) * 0.05 };
  }

  /** Everything alive about the head at t, before the choreography's acts. */
  life(t: number, bar: number): Life {
    const shout = this.shoutAt(t);
    const mouth = this.mouthAt(t);
    const jaw = clamp(mouth.d / 82);
    const nodY = 16 * plucked(t, this.beats, 2.4, 0.42);
    const nodY2 = 16 * plucked(t - 0.02, this.beats, 2.4, 0.42);
    const kick = plucked(t, this.kicks, 3.2, 0.38);
    const vel = (nodY - nodY2) / 0.02;
    const blink = this.blinkAt(t), blinkL = this.blinkAt(t - 0.012);
    const look = this.lookAt(t);
    const rest = clamp(mouth.smirk);
    const baseLid = lerp(lerp(0.36, 0.42, rest), 0.08, shout);
    const brUp = 9 * plucked(t, this.sylls, 3.5, 0.45) + shout * 16;
    const singing = this.wordAt(t, 0.05, 0.25) ? 1 : 0;
    return {
      nodY, shout, singing,
      pose: {
        mouth, jaw,
        lidL: Math.max(baseLid, blinkL), lidR: Math.max(baseLid, blink),
        squint: lerp(lerp(0.12, 0.3, rest), 0, shout),
        lookX: lerp(look.x, 0, shout), lookY: lerp(look.y, -0.15, shout),
        pupil: lerp(1.15, 0.72, shout) + 0.15 * blink,
        brow: lerp(0.85, 1.05, shout), browUpL: brUp, browUpR: brUp * 0.85 + 3,
        tilt: 0.035 * Math.sin(bar * Math.PI) + 0.05 * plucked(t, this.downs, 1.6, 0.35, 4) - shout * 0.02,
        sx: 1 + 0.03 * kick - shout * 0.02,
        sy: 1 - 0.045 * kick + shout * 0.05,
        earL: 0.2 * plucked(t, this.snares, 4.5, 0.25) - 0.004 * vel - shout * 0.16,
        earR: 0.2 * plucked(t - 0.04, this.snares, 4.5, 0.25) - 0.004 * vel - shout * 0.16,
        whisk: 0.1 * plucked(t, this.kicks, 6, 0.22) + 0.06 * plucked(t, this.sylls, 5, 0.3),
      },
    };
  }
}
