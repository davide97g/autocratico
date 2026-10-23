// The music's grid (apps/video/docs/AGENDA.md): 128.2 BPM, a bar every 1.872 s from 0.047 s. Every shot,
// cut and sound sits on it. Times are seconds; `useT()` gives the current one.
import { useCurrentFrame } from "remotion";

export const FPS = 60;
export const LENGTH = 30;
export const BAR = 1.872;
export const BEAT = BAR / 4;
const T0 = 0.047;
/** Downbeat i (bar i). */
export const D = (i: number) => T0 + i * BAR;
/** Beat k. */
export const B = (k: number) => T0 + k * BEAT;
export const frameOf = (sec: number) => Math.max(0, Math.round(sec * FPS));

export const useT = () => useCurrentFrame() / FPS;

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  inCubic: (t: number) => t * t * t,
  inQuart: (t: number) => t * t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};
/** 0..1 from a to b, eased. */
export const prog = (t: number, a: number, b: number, fn: (x: number) => number = ease.linear) => fn(clamp((t - a) / (b - a)));
/** A damped spring from 0 to 1, `k` seconds after it starts. */
export const spring = (k: number, freq = 3.2, damping = 0.42) => {
  if (k <= 0) return 0;
  const w = freq * 2 * Math.PI;
  return 1 - Math.exp(-damping * w * k) * Math.cos(w * Math.sqrt(1 - damping * damping) * k);
};
/** A hit that decays by half every `hl` seconds after `at`. */
export const hit = (t: number, at: number, hl = 0.1) => (t >= at ? Math.pow(0.5, (t - at) / hl) : 0);
/** Deterministic pseudo-random in [0, 1). */
export const rand = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
