// The machinery of Bollo's choreography: cues anchored to the lyric or the bar grid, each moving him
// somewhere (and how), pointing his gaze at something, or starting an act (scream, bite…). The cues
// themselves live in bollo-choreo.ts; bollo.ts draws the result over the film.
//
// Everything here is a pure function of time: the cue list is resolved once (each cue's start place
// is where the previous move has him at that moment), then `at(t)` evaluates the running move, the
// gaze (blended between the last two targets) and the acts' envelopes.
import type { AudioData } from '../engine/audio';
import type { Lyrics } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp } from '../engine/util';
import { mixMouth, VISEME, type MouthShape } from './_bollo';
import type { HeadPose } from './_bollo-head';
import { spring } from './_bollo-rig';

/** A time: seconds, a lyric word, or a bar of the grid. */
export type Anchor =
  | number
  /** `line`: text the lyric line contains (lyrics.get), `nth` occurrence; `word` index in it; start or end; plus `dt`. */
  | { line: string; nth?: number; word?: number; end?: boolean; dt?: number }
  /** Bar k's downbeat (+ beats, + dt). */
  | { bar: number; beat?: number; dt?: number };

/**
 * How he gets to the cue's place:
 * - cut: there at once; smooth: ease in-out; spring: overshoot and settle (`zeta` tunes it);
 * - hop / fly: an arc (`arc` px), stretched in the air and squashed on landing;
 * - slam: there at once, from 1.75× the size down onto the frame;
 * - zoom: a fast start that settles (out-expo), for pushes into the lens;
 * - suck: accelerating into the place (in-cubic), for being pulled into a point;
 * - drift: linear, for slow floats.
 */
export type Move = 'cut' | 'smooth' | 'spring' | 'hop' | 'slam' | 'fly' | 'zoom' | 'suck' | 'drift';
export type Act =
  | 'scream' | 'bite' | 'wink' | 'gasp' | 'glare' | 'chomp'
  | 'nod' | 'shake' | 'shiver' | 'yawn' | 'sleep' | 'smug' | 'awe' | 'startle' | 'laugh' | 'bored'
  /** a freeze-frame: his life (lip-sync, springs, blinks) stops where it was when the act began */
  | 'hold';

export interface Cue {
  at: Anchor;
  /** Where he is after this cue: head centre in frame px, size (px per 100 head units, the head is
   *  ≈ 420 units wide and 520 tall with the ears), rotation (rad). Omitted values are kept (the
   *  previous cue's target). A cue with no place fields (only look / act) does not interrupt a move. */
  x?: number;
  y?: number;
  s?: number;
  rot?: number;
  /** Where the move starts instead of where he is (e.g. `{ s: 0 }` to pop in, an off-frame x to
   *  enter from an edge). Makes him visible at once if `show` is set. */
  from?: { x?: number; y?: number; s?: number; rot?: number };
  /** How he gets there (default 'spring') and in how long (s, default 0.35). */
  move?: Move;
  dur?: number;
  /** Damping of 'spring' (default 0.42; lower = more wobble). */
  zeta?: number;
  /** Arc height (px) for 'hop' / 'fly'. */
  arc?: number;
  /** What he looks at from now on: a frame point, the viewer, or nothing in particular (his own saccades). */
  look?: [number, number] | 'camera' | 'free';
  /** An act starting at this cue, lasting `actDur` s. */
  act?: Act;
  actDur?: number;
  /** Visible from this cue on (default: unchanged; he starts hidden). Hiding waits for the move's end. */
  show?: boolean;
  /** From this cue on, draw him only inside this rect (x0, y0, x1, y1), e.g. to rise from behind a
   *  card's edge; null clears it. */
  clip?: [number, number, number, number] | null;
  /** Free note for the author. */
  note?: string;
}

interface Place { x: number; y: number; s: number; rot: number; a: number; sx: number; sy: number }
interface Resolved extends Cue { t: number; from: Place; to: Place; fromSet: boolean }

export interface Staging {
  x: number; y: number; s: number; rot: number; alpha: number;
  /** Squash and stretch from the move (multiplies the rig's). */
  sx: number; sy: number;
  clip: [number, number, number, number] | null;
  /** The time his life (the rig) is evaluated at: t, or the start of a 'hold'. */
  lifeT: number;
  /** Pose overrides from the acts and the gaze, merged over the rig's life. */
  apply(pose: HeadPose, life: { shout: number; singing: number }): HeadPose;
}

function stepSpring(k: number, zeta = 0.42) {
  // normalised step response over k = 0 … 1 (≈ settled at 1), with overshoot
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  const w = 7.5, wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * k) * (Math.cos(wd * k) + ((zeta * w) / wd) * Math.sin(wd * k));
}

/** The scream's face over a pose (k = 0 … 1). It keeps a little of the syllables (lm, the lip-sync
 *  mouth), so a long shout still talks. */
export function screamPose(out: HeadPose, lm: MouthShape, k: number, fi: number) {
  const big: MouthShape = { ...VISEME.shout, hw: 132, d: 98 };
  const talk = mixMouth(big, { ...lm, hw: Math.max(lm.hw, 96) * 1.2, d: Math.max(lm.d, 40) * 1.25 }, 0.3);
  out.mouth = mixMouth(lm, talk, k);
  out.jaw = lerp(out.jaw ?? 0, 0.85 + 0.15 * clamp(lm.d / 80), k);
  out.sy = (out.sy ?? 1) + 0.14 * k; out.sx = (out.sx ?? 1) - 0.04 * k;
  out.lidL = lerp(out.lidL ?? 0.35, 0, k); out.lidR = lerp(out.lidR ?? 0.35, 0, k);
  out.squint = lerp(out.squint ?? 0, 0, k); out.pupil = lerp(out.pupil ?? 1, 0.42, k);
  out.browUpL = (out.browUpL ?? 0) + 24 * k; out.browUpR = (out.browUpR ?? 0) + 24 * k;
  out.earL = (out.earL ?? 0) - 0.35 * k; out.earR = (out.earR ?? 0) - 0.35 * k;
  out.whisk = (out.whisk ?? 0) + (hash(fi, 4) - 0.5) * 0.2 * k;
  return out;
}

/** A crowd of Bollos: copies popping in at `spots` (x, y, s, rot), screaming with him, then gone. */
export interface Crowd { at: Anchor; dur: number; spots: [number, number, number, number][]; note?: string }
export interface Clone { x: number; y: number; s: number; rot: number; k: number; i: number }

const HIDDEN: Place = { x: 960, y: 540, s: 60, rot: 0, a: 0, sx: 1, sy: 1 };
const PLACE_KEYS = ['x', 'y', 's', 'rot', 'show', 'from'] as const;
type Gaze = { turn: number; lookX: number; lookY: number } | null;

export class Choreo {
  cues: Resolved[] = [];
  looks: { t: number; look: Cue['look'] }[] = [];
  acts: { t: number; act: Act; dur: number }[] = [];
  clips: { t: number; clip: Cue['clip'] }[] = [];
  crowds: { t: number; dur: number; spots: Crowd['spots'] }[] = [];

  constructor(cues: Cue[], public lyrics: Lyrics, public audio: AudioData, crowds: Crowd[] = []) {
    const time = (a: Anchor): number => {
      if (typeof a === 'number') return a;
      if ('bar' in a) return audio.timeOfBeat(Math.round(audio.beatAt(audio.downbeats[a.bar]!)) + (a.beat ?? 0)) + (a.dt ?? 0);
      const l = lyrics.get(a.line, a.nth ?? 0);
      const w = l.words[a.word ?? 0];
      if (!w) throw new Error(`bollo cue: no word ${a.word} in "${l.text}"`);
      return (a.end ? w.end : w.start) + (a.dt ?? 0);
    };
    this.crowds = crowds.map((c) => ({ t: time(c.at), dur: c.dur, spots: c.spots }));
    const list = cues.map((c, i) => ({ ...c, t: time(c.at), i })).sort((a, b) => a.t - b.t || a.i - b.i);
    let prev: Resolved | null = null;
    for (const c of list) {
      if (c.look !== undefined) this.looks.push({ t: c.t, look: c.look });
      if (c.act) this.acts.push({ t: c.t, act: c.act, dur: c.actDur ?? 0.6 });
      if (c.clip !== undefined) this.clips.push({ t: c.t, clip: c.clip });
      if (!PLACE_KEYS.some((k) => c[k] !== undefined)) continue; // look / act only: the move runs on
      // where he actually is when this cue starts (the previous move may still be running)
      const now = prev ? this.placeIn(prev, c.t) : HIDDEN;
      const from: Place = { ...now, ...(c.from ?? {}), sx: 1, sy: 1 };
      const base = prev ? prev.to : HIDDEN;
      const to: Place = {
        x: c.x ?? base.x, y: c.y ?? base.y, s: c.s ?? base.s, rot: c.rot ?? base.rot,
        a: c.show === undefined ? base.a : c.show ? 1 : 0, sx: 1, sy: 1,
      };
      if (c.from && c.show) from.a = 1;
      const r: Resolved = { ...c, t: c.t, from, to, fromSet: !!c.from };
      this.cues.push(r);
      prev = r;
    }
  }

  private placeIn(c: Resolved, t: number): Place {
    const dur = c.dur ?? 0.35, mv = c.move ?? 'spring';
    const k = clamp((t - c.t) / Math.max(1e-3, dur));
    const { from: a, to: b } = c;
    let e = k, es = k, arc = 0, sk = 1, sx = 1, sy = 1;
    switch (mv) {
      case 'cut': e = es = t >= c.t ? 1 : 0; break;
      case 'smooth': e = es = ease.inOutCubic(k); break;
      case 'drift': e = es = k; break;
      case 'spring': e = es = stepSpring(k, c.zeta); break;
      case 'zoom': e = es = ease.outExpo(k); break;
      case 'suck': e = ease.inCubic(k); es = ease.inQuad(k); break;
      case 'hop': case 'fly': {
        e = es = ease.inOutQuad(k);
        arc = -Math.sin(Math.PI * k) * (c.arc ?? (mv === 'hop' ? 140 : 220));
        // stretched in the air, squashed on landing
        const air = Math.sin(Math.PI * k);
        const land = 0.16 * spring(t - c.t - dur, 3.4, 0.32);
        sy = 1 + 0.1 * air - land; sx = 1 - 0.06 * air + land * 0.8;
        break;
      }
      case 'slam': {
        e = es = 1;
        const x = (t - c.t) / 0.13;
        sk = x < 1 ? lerp(1.75, 1, ease.inQuad(clamp(x))) : 1 + 0.05 * spring(t - c.t - 0.13, 3, 0.3);
        if (x >= 1) { const q = 0.1 * spring(t - c.t - 0.13, 4, 0.3); sy = 1 - q; sx = 1 + q * 0.8; }
        break;
      }
    }
    let alphaK: number;
    if (mv === 'cut' || mv === 'slam' || c.fromSet) alphaK = t >= c.t ? 1 : 0;
    else if (b.a < a.a) alphaK = clamp((t - (c.t + dur - 0.1)) / 0.1); // hiding: at the end of the move
    else alphaK = ease.inOutQuad(clamp((t - c.t) / Math.min(0.2, dur)));
    return {
      x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) + arc, s: lerp(a.s, b.s, es) * sk, rot: lerp(a.rot, b.rot, e),
      a: lerp(a.a, b.a, alphaK), sx, sy,
    };
  }

  /** The crowd's copies at t: each pops in (staggered), screams, and pops out at the end. */
  crowdAt(t: number): Clone[] {
    const out: Clone[] = [];
    for (const c of this.crowds) {
      if (t < c.t || t > c.t + c.dur + 0.4) continue;
      c.spots.forEach(([x, y, s, rot], i) => {
        const d = hash(i, 41) * 0.12;
        const inK = stepSpring((t - c.t - d) / 0.42, 0.38);
        const outK = 1 - ease.inBack(clamp((t - (c.t + c.dur - 0.05 + d * 0.5)) / 0.2), 2.2);
        const sc = s * inK * Math.max(0, outK);
        if (sc > 0.5) out.push({ x, y, s: sc, rot: rot + 0.06 * Math.sin((t - c.t) * 9 + i), k: clamp((t - c.t - d) / 0.08), i });
      });
    }
    return out;
  }

  private gaze(look: Cue['look'], x: number, y: number, rot: number): Gaze {
    if (look === 'camera') return { turn: 0, lookX: 0, lookY: 0 };
    if (Array.isArray(look)) {
      // the target in the head's own frame (he may be tilted or upside down)
      const fx = look[0] - x, fy = look[1] - y, c = Math.cos(rot), sn = Math.sin(rot);
      const dx = fx * c + fy * sn, dy = -fx * sn + fy * c;
      return { turn: clamp(dx / 900, -0.75, 0.75), lookX: clamp(dx / 420, -1, 1), lookY: clamp(dy / 420, -1, 1) };
    }
    return null;
  }

  at(t: number): Staging {
    let cur: Resolved | null = null;
    for (const c of this.cues) { if (c.t <= t) cur = c; else break; }
    const p = cur ? this.placeIn(cur, t) : HIDDEN;
    // gaze: the current target, blended from the previous one over 0.22 s
    let li = -1;
    for (let i = 0; i < this.looks.length; i++) { if (this.looks[i]!.t <= t) li = i; else break; }
    const look = li >= 0 ? this.looks[li]!.look : 'free';
    const lookPrev = li >= 1 ? this.looks[li - 1]!.look : 'free';
    const lookK = li >= 0 ? ease.outCubic(clamp((t - this.looks[li]!.t) / 0.22)) : 1;
    let clip: Staging['clip'] = null;
    for (const c of this.clips) { if (c.t <= t) clip = c.clip ?? null; else break; }
    // acts: envelopes
    type Env = { k: number; u: number; dt: number; dur: number };
    const env: Partial<Record<Act, Env>> = {};
    for (const a of this.acts) {
      if (t < a.t || t > a.t + a.dur + 0.25) continue;
      const u = clamp((t - a.t) / a.dur);
      const k = clamp((t - a.t) / 0.08) * clamp((a.t + a.dur + 0.2 - t) / 0.2);
      env[a.act] = { k: Math.max(env[a.act]?.k ?? 0, k), u, dt: t - a.t, dur: a.dur };
    }
    const fi = frameIdx(t);
    let jx = 0, jy = 0, punch = 1, rot = p.rot, sx = p.sx, sy = p.sy;
    const S = p.s;
    if (env.scream && !(env.hold && env.hold.dt <= env.hold.dur)) {
      const amp = Math.min(30, 0.11 * S) * env.scream.k;
      jx += (hash(fi, 1) - 0.5) * amp; jy += (hash(fi, 2) - 0.5) * amp;
    }
    if (env.bite) {
      // anticipation (pull back, mouth wide), lunge and snap shut toward what he looks at, then the
      // clench: a punch, held, and a shake as he worries it
      const { u, dt, k, dur } = env.bite;
      let dx = 0, dy = 1;
      if (Array.isArray(look)) { dx = look[0] - p.x; dy = look[1] - p.y; }
      const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      let reach: number;
      if (u < 0.35) { reach = -0.07 * ease.outQuad(u / 0.35); punch += 0.12 * ease.outQuad(u / 0.35) * k; }
      else {
        const since = dt - 0.35 * dur;
        reach = 0.22 * clamp(since / 0.06) - 0.12 * clamp((since - 0.06) / 0.4) + 0.05 * spring(since, 4, 0.35);
        punch += (0.06 + 0.14 * Math.max(0, spring(since, 4, 0.35))) * k;
        const sh = clamp(1 - (u - 0.35) / 0.65);
        jx += (hash(fi, 3) - 0.5) * 0.09 * S * k * sh;
        rot += Math.sin(dt * Math.PI * 2 * 7) * 0.07 * k * sh;
      }
      jx += dx * reach * 3.4 * S * k; jy += dy * reach * 3.4 * S * k;
    }
    if (env.chomp) { const { dt, k } = env.chomp; punch *= 1 + 0.08 * Math.abs(Math.sin(dt * Math.PI * 7)) * k; }
    if (env.nod) { const { dt, k, u } = env.nod; jy += Math.sin(dt * Math.PI * 2 * 3.1) * 0.1 * S * k * (1 - 0.5 * u); }
    if (env.shake) { const { dt, k, u } = env.shake; rot += Math.sin(dt * Math.PI * 2 * 3.4) * 0.13 * k * (1 - 0.6 * u); }
    if (env.shiver) { const k = env.shiver.k; jx += (hash(fi, 5) - 0.5) * 0.045 * S * k; jy += (hash(fi, 6) - 0.5) * 0.03 * S * k; }
    if (env.laugh) { const { dt, k } = env.laugh; rot += Math.sin(dt * Math.PI * 2 * 4.5) * 0.06 * k; jy += Math.abs(Math.sin(dt * Math.PI * 4.5)) * -0.05 * S * k; }
    if (env.sleep) {
      const { dt, k } = env.sleep;
      rot += 0.2 * k; jy += 0.06 * S * k;
      const br = Math.sin(dt * Math.PI * 2 / 1.7);
      sy *= 1 + 0.03 * br * k; sx *= 1 - 0.015 * br * k;
    }
    if (env.startle) {
      const { dt, k } = env.startle;
      jy -= 0.45 * S * Math.sin(Math.PI * clamp(dt / 0.42)) * k;
      const land = 0.18 * spring(dt - 0.42, 3.6, 0.3) * k;
      sy *= 1 + 0.12 * Math.sin(Math.PI * clamp(dt / 0.42)) * k - land; sx *= 1 + land * 0.8;
    }
    if (env.yawn) { const k = env.yawn.k; rot += -0.08 * k; }
    const x = p.x + jx, y = p.y + jy, s = S * punch;
    const lifeT = env.hold && env.hold.dt <= env.hold.dur ? t - env.hold.dt : t;
    return {
      x, y, s, rot, alpha: p.a, sx, sy, clip, lifeT,
      apply: (pose, life) => {
        const out: HeadPose = { ...pose };
        // gaze: a point in the frame turns the head toward it and moves the pupils
        const freeG = { turn: 0, lookX: pose.lookX ?? 0, lookY: pose.lookY ?? 0 };
        const g0 = this.gaze(lookPrev, x, y, rot) ?? freeG, g1 = this.gaze(look, x, y, rot) ?? freeG;
        out.turn = lerp(g0.turn, g1.turn, lookK);
        out.lookX = lerp(g0.lookX, g1.lookX, lookK);
        out.lookY = lerp(g0.lookY, g1.lookY, lookK);
        out.tilt = (out.tilt ?? 0) + out.turn * 0.06;
        const lm = out.mouth ?? VISEME.smirk;
        if (env.scream) screamPose(out, lm, env.scream.k, fi);
        if (env.bite) {
          const { u, k } = env.bite;
          const open = u < 0.35 ? ease.outQuad(u / 0.35) : 0;
          const shut = u >= 0.35 ? 1 : 0;
          out.mouth = u < 0.35 ? mixMouth(out.mouth ?? VISEME.smirk, { ...VISEME.shout, hw: 128, d: 104 }, open * k) : mixMouth(out.mouth ?? VISEME.m, VISEME.m, k);
          out.jaw = u < 0.35 ? lerp(out.jaw ?? 0, 1, open * k) : (out.jaw ?? 0) * (1 - k);
          out.teeth = shut * k;
          out.brow = lerp(out.brow ?? 0.85, 1.25, k);
          out.lidL = lerp(out.lidL ?? 0.35, 0.5, k * shut); out.lidR = lerp(out.lidR ?? 0.35, 0.5, k * shut);
          out.squint = lerp(out.squint ?? 0, 0.35, k * shut);
          out.earL = (out.earL ?? 0) - 0.3 * k; out.earR = (out.earR ?? 0) - 0.3 * k;
          out.sx = (out.sx ?? 1) * (1 + 0.06 * shut * k); out.sy = (out.sy ?? 1) * (1 - 0.05 * shut * k + 0.08 * open * k);
        }
        if (env.chomp) {
          const { dt, k } = env.chomp;
          const c = 0.5 + 0.5 * Math.cos(dt * Math.PI * 7);
          out.mouth = mixMouth(out.mouth ?? VISEME.m, mixMouth(VISEME.m, VISEME.a, c), k);
          out.jaw = lerp(out.jaw ?? 0, c, k);
          out.teeth = (1 - c) * k;
        }
        if (env.wink) {
          const { u, k } = env.wink;
          const w = u < 0.2 ? ease.outQuad(u / 0.2) : u > 0.75 ? 1 - ease.inOutQuad((u - 0.75) / 0.25) : 1;
          out.lidR = Math.max(out.lidR ?? 0, lerp(out.lidR ?? 0, 1, w * k));
          out.lidL = lerp(out.lidL ?? 0.35, 0.3, w * k);
          out.squint = lerp(out.squint ?? 0, 0.5, w * k);
          out.brow = lerp(out.brow ?? 0.85, 1.1, w * k);
          out.browUpL = (out.browUpL ?? 0) + 14 * w * k;
          out.tilt = (out.tilt ?? 0) + 0.08 * w * k;
          if (life.shout < 0.2) out.mouth = mixMouth(out.mouth ?? VISEME.smirk, VISEME.smirk, w * k * (life.singing ? 0.4 : 1));
        }
        if (env.gasp) {
          const k = env.gasp.k;
          out.lidL = lerp(out.lidL ?? 0.35, 0, k); out.lidR = lerp(out.lidR ?? 0.35, 0, k);
          out.squint = lerp(out.squint ?? 0, 0, k);
          out.pupil = lerp(out.pupil ?? 1, 0.5, k);
          out.mouth = mixMouth(out.mouth ?? VISEME.m, VISEME.o, k * (life.singing ? 0.55 : 0.9));
          out.browUpL = (out.browUpL ?? 0) + 22 * k; out.browUpR = (out.browUpR ?? 0) + 22 * k;
          out.brow = lerp(out.brow ?? 0.85, 0.2, k);
          out.earL = (out.earL ?? 0) - 0.25 * k; out.earR = (out.earR ?? 0) - 0.25 * k;
          out.sy = (out.sy ?? 1) + 0.06 * k;
        }
        if (env.glare) {
          const k = env.glare.k;
          out.lidL = lerp(out.lidL ?? 0.35, 0.58, k); out.lidR = lerp(out.lidR ?? 0.35, 0.58, k);
          out.brow = lerp(out.brow ?? 0.85, 1.35, k); out.squint = lerp(out.squint ?? 0, 0.45, k);
          out.pupil = lerp(out.pupil ?? 1, 0.6, k);
          out.browUpL = (out.browUpL ?? 0) * (1 - k); out.browUpR = (out.browUpR ?? 0) * (1 - k);
          out.earL = (out.earL ?? 0) - 0.2 * k; out.earR = (out.earR ?? 0) - 0.2 * k;
        }
        if (env.smug) {
          const k = env.smug.k;
          out.lidL = lerp(out.lidL ?? 0.35, 0.46, k); out.lidR = lerp(out.lidR ?? 0.35, 0.5, k);
          out.squint = lerp(out.squint ?? 0, 0.55, k); out.brow = lerp(out.brow ?? 0.85, 1.15, k);
          out.browUpL = (out.browUpL ?? 0) + 10 * k;
          out.tilt = (out.tilt ?? 0) + 0.07 * k;
          if (!life.singing) out.mouth = mixMouth(out.mouth ?? VISEME.smirk, VISEME.smirk, k);
        }
        if (env.awe) {
          const k = env.awe.k;
          out.pupil = lerp(out.pupil ?? 1, 2.6, k);
          out.lidL = lerp(out.lidL ?? 0.35, 0.02, k); out.lidR = lerp(out.lidR ?? 0.35, 0.02, k);
          out.squint = lerp(out.squint ?? 0, 0, k); out.brow = lerp(out.brow ?? 0.85, 0.1, k);
          out.browUpL = (out.browUpL ?? 0) + 18 * k; out.browUpR = (out.browUpR ?? 0) + 18 * k;
          out.earL = (out.earL ?? 0) + 0.12 * k; out.earR = (out.earR ?? 0) + 0.12 * k;
          if (!life.singing) out.mouth = mixMouth(out.mouth ?? VISEME.m, { ...VISEME.o, d: 40, hw: 40 }, k);
        }
        if (env.bored) {
          const k = env.bored.k;
          out.lidL = lerp(out.lidL ?? 0.35, 0.62, k); out.lidR = lerp(out.lidR ?? 0.35, 0.66, k);
          out.squint = lerp(out.squint ?? 0, 0.25, k); out.brow = lerp(out.brow ?? 0.85, -0.25, k);
          out.browUpL = (out.browUpL ?? 0) * (1 - 0.7 * k); out.browUpR = (out.browUpR ?? 0) * (1 - 0.7 * k);
          out.pupil = lerp(out.pupil ?? 1, 1.3, k);
          out.earL = (out.earL ?? 0) + 0.15 * k; out.earR = (out.earR ?? 0) + 0.2 * k;
          out.tilt = (out.tilt ?? 0) + 0.1 * k;
          if (out.mouth) out.mouth = { ...out.mouth, d: out.mouth.d * (1 - 0.4 * k), smirk: out.mouth.smirk * (1 - k) };
        }
        if (env.nod) { const { dt, k } = env.nod; out.lookY = lerp(out.lookY ?? 0, 0.4 * Math.sin(dt * Math.PI * 2 * 3.1), k * 0.6); }
        if (env.shake) {
          const { dt, k, u } = env.shake;
          out.turn = (out.turn ?? 0) + Math.sin(dt * Math.PI * 2 * 3.4 + 0.6) * 0.5 * k * (1 - 0.6 * u);
          out.lidL = lerp(out.lidL ?? 0.35, 0.5, k); out.lidR = lerp(out.lidR ?? 0.35, 0.5, k);
          out.brow = lerp(out.brow ?? 0.85, 1.2, k);
        }
        if (env.shiver) {
          const k = env.shiver.k;
          out.pupil = lerp(out.pupil ?? 1, 0.4, k); out.lidL = lerp(out.lidL ?? 0.35, 0, k); out.lidR = lerp(out.lidR ?? 0.35, 0, k);
          out.squint = lerp(out.squint ?? 0, 0, k); out.brow = lerp(out.brow ?? 0.85, 0.1, k);
          out.browUpL = (out.browUpL ?? 0) + 16 * k; out.browUpR = (out.browUpR ?? 0) + 16 * k;
          out.earL = (out.earL ?? 0) - 0.5 * k; out.earR = (out.earR ?? 0) - 0.5 * k;
          out.whisk = (out.whisk ?? 0) + (hash(fi, 7) - 0.5) * 0.3 * k;
          if (!life.singing) { out.mouth = mixMouth(out.mouth ?? VISEME.m, { ...VISEME.m, hw: 82 }, k); out.teeth = k; }
        }
        if (env.laugh) {
          const { dt, k } = env.laugh;
          const c = 0.5 + 0.5 * Math.sin(dt * Math.PI * 2 * 4.5);
          out.mouth = mixMouth(out.mouth ?? VISEME.m, mixMouth(VISEME.e, VISEME.a, c), k);
          out.jaw = lerp(out.jaw ?? 0, 0.4 + 0.5 * c, k);
          out.lidL = lerp(out.lidL ?? 0.35, 0.55, k); out.lidR = lerp(out.lidR ?? 0.35, 0.55, k);
          out.squint = lerp(out.squint ?? 0, 0.75, k); out.brow = lerp(out.brow ?? 0.85, 0.3, k);
        }
        if (env.yawn) {
          const { u, k } = env.yawn;
          const w = (u < 0.3 ? ease.inOutQuad(u / 0.3) : u > 0.8 ? 1 - ease.inOutQuad((u - 0.8) / 0.2) : 1) * k;
          out.mouth = mixMouth(out.mouth ?? VISEME.m, { hw: 96, d: 112, round: 0.55, smirk: 0 }, w);
          out.jaw = lerp(out.jaw ?? 0, 1, w);
          out.lidL = lerp(out.lidL ?? 0.35, 0.9, w); out.lidR = lerp(out.lidR ?? 0.35, 0.92, w);
          out.squint = lerp(out.squint ?? 0, 0.6, w); out.brow = lerp(out.brow ?? 0.85, -0.2, w);
          out.browUpL = (out.browUpL ?? 0) + 12 * w; out.browUpR = (out.browUpR ?? 0) + 12 * w;
          out.earL = (out.earL ?? 0) - 0.3 * w; out.earR = (out.earR ?? 0) - 0.3 * w;
          out.sy = (out.sy ?? 1) + 0.08 * w;
        }
        if (env.sleep) {
          const k = env.sleep.k;
          out.lidL = lerp(out.lidL ?? 0.35, 0.97, k); out.lidR = lerp(out.lidR ?? 0.35, 0.97, k);
          out.squint = lerp(out.squint ?? 0, 0.35, k); out.brow = lerp(out.brow ?? 0.85, -0.3, k);
          out.browUpL = (out.browUpL ?? 0) * (1 - k); out.browUpR = (out.browUpR ?? 0) * (1 - k);
          out.earL = (out.earL ?? 0) + 0.22 * k; out.earR = (out.earR ?? 0) + 0.3 * k;
          if (!env.yawn) { out.mouth = mixMouth(out.mouth ?? VISEME.m, VISEME.m, k); out.jaw = lerp(out.jaw ?? 0, 0, k); }
          out.whisk = (out.whisk ?? 0) + 0.12 * k;
        }
        if (env.startle) {
          const k = env.startle.k * clamp(1 - (env.startle.u - 0.6) / 0.4);
          out.lidL = lerp(out.lidL ?? 0.35, 0, k); out.lidR = lerp(out.lidR ?? 0.35, 0, k);
          out.squint = lerp(out.squint ?? 0, 0, k); out.pupil = lerp(out.pupil ?? 1, 0.35, k);
          out.brow = lerp(out.brow ?? 0.85, 0, k);
          out.browUpL = (out.browUpL ?? 0) + 30 * k; out.browUpR = (out.browUpR ?? 0) + 30 * k;
          out.earL = (out.earL ?? 0) - 0.45 * k; out.earR = (out.earR ?? 0) - 0.45 * k;
          out.whisk = (out.whisk ?? 0) - 0.25 * k;
          if (!life.singing) out.mouth = mixMouth(out.mouth ?? VISEME.m, VISEME.o, k);
        }
        out.sx = (out.sx ?? 1) * sx;
        out.sy = (out.sy ?? 1) * sy;
        return out;
      },
    };
  }
}
