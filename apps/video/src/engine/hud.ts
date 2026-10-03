// Global overlay: the crop-mark frame (`post.frame`) and a corner meter (`post.pause`), both off
// unless a scene asks for them. Inherited from riddle's video: the meter fills from the end of the last
// sung word and resets at the next, so it only completes in a real rest.
import { Layer2D, W, H } from './gl';
import { rgba } from './palette';
import { F, font } from './type';
import type { Lyrics } from './lyrics';
import { clamp, ease, lerp, TAU } from './util';

/** Seconds of rest that fill the corner meter. */
export const PAUSE_S = 3;

export class Pause {
  /** Pen lifts: [lift, next pen-down] for every rest between sung words (and after the last). */
  gaps: [number, number][] = [];
  /** Moments a pause completed: lift + PAUSE_S, for every rest at least that long. */
  turns: number[] = [];
  constructor(lyrics: Lyrics) {
    const ws = lyrics.words;
    for (let i = 0; i < ws.length; i++) {
      const next = ws[i + 1]?.start ?? Infinity;
      if (next - ws[i]!.end > 0.05) this.gaps.push([ws[i]!.end, next]);
    }
    this.turns = this.gaps.filter(([a, b]) => b - a >= PAUSE_S).map(([a]) => a + PAUSE_S);
  }
  /** Seconds since the last pen lift (0 while a word is being sung). */
  since(t: number): number {
    for (const [a, b] of this.gaps) if (t >= a && t < b) return t - a;
    return 0;
  }
  /** 0..1 fill of the meter. */
  fill(t: number): number { return clamp(this.since(t) / PAUSE_S); }
  /** The last completed turn at or before t, or null. */
  lastTurn(t: number): number | null {
    let r: number | null = null;
    for (const x of this.turns) if (x <= t) r = x;
    return r;
  }
}

/**
 * Draw the pause meter anywhere, at any scale: a hairline ring that fills clockwise from twelve
 * o'clock, the seconds in mono beside it. (x, y) = the ring's centre. `ink` = drawing on paper.
 */
export function drawPause(c: CanvasRenderingContext2D, x: number, y: number, fill: number, o: { scale?: number; ink?: boolean; label?: boolean; r?: number } = {}) {
  const k = o.scale ?? 1, r = (o.r ?? 18) * k;
  const base = o.ink ? rgba('pen', 0.22) : rgba('sheet', 0.22);
  c.save();
  c.lineCap = 'round';
  c.lineWidth = Math.max(1, 1.25 * k);
  c.strokeStyle = base;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  if (fill > 0.001) {
    c.lineWidth = 2.5 * k;
    c.strokeStyle = rgba(o.ink ? 'live' : 'liveHot', 1);
    c.beginPath(); c.arc(x, y, r, -TAU / 4, -TAU / 4 + TAU * clamp(fill)); c.stroke();
  }
  if (o.label !== false) {
    c.textBaseline = 'middle';
    c.font = font(F.mono(400), 15 * k);
    c.fillStyle = o.ink ? rgba('pen', 0.7) : rgba('sheet', 0.75);
    c.fillText(`${(clamp(fill) * PAUSE_S).toFixed(1)} s`, x + r + 12 * k, y + 1 * k);
  }
  c.restore();
}

export interface HudState {
  /** Overrides from the active scene (via post.hud etc.). */
  opacity: number;
  /** 0..1 the crop-mark frame: 1 in place, 0 flown out past the edges (see PostParams.frame). */
  frame: number;
  /** Opacity of the corner pause meter (off by default: the pause lives inside the plates). */
  readout: number;
  /** 0..1: the plate is light (paper) — draw the HUD in ink. */
  paper: number;
}

export class Hud {
  layer = new Layer2D();
  private ink = false;
  constructor(public pause: Pause) {}

  draw(t: number, st: HudState) {
    const L = this.layer;
    L.clear();
    const c = L.ctx;
    if (st.opacity <= 0.001) return L.upload();
    c.globalAlpha = st.opacity;
    this.ink = st.paper > 0.5;
    if (st.frame > 0.001) this.cropMarks(c, st.frame);
    if (st.readout > 0.001) {
      c.save();
      c.globalAlpha *= st.readout;
      drawPause(c, 84, H - 84, this.pause.fill(t), { ink: this.ink });
      c.restore();
    }
    return L.upload();
  }

  /** Corner marks; as `k` drops they fly out along the diagonals and past the edges. */
  private cropMarks(c: CanvasRenderingContext2D, k: number) {
    const e = ease.inOutCubic(clamp(k));
    c.save();
    c.globalAlpha *= clamp(k * 3);
    c.strokeStyle = this.ink ? rgba('pen', 0.45) : rgba('sheet', 0.34);
    c.lineWidth = 1.25;
    const m = lerp(-40, 36, e), l = 22;
    c.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
      c.moveTo(x + sx * l, y + 0.5 * sy); c.lineTo(x, y + 0.5 * sy); c.lineTo(x, y + sy * l);
    }
    c.stroke();
    c.restore();
  }
}
