// Bollo's head alone, as a sticker: the talking-head version of the mascot (see _bollo.ts for the
// full figure). Flat fills, a thick white sticker border, a soft shadow under the sticker.
//
// Everything that should feel alive is a continuous parameter here (jaw, both lids, the lower
// lid's squint, pupils, brows, ears, whiskers, squash and stretch), so a scene can drive it with
// springs and smoothed curves and the result stays a pure function of time.
//
// Units: the head's centre is the origin, the head is ≈ 420 units wide; `size` = px per 100 units.
import { HEX } from '../engine/palette';
import { VISEME, type MouthShape } from './_bollo';

export interface HeadPose {
  mouth?: MouthShape;
  /** Jaw drop 0 … 1: the chin moves down and the head stretches as the mouth opens. */
  jaw?: number;
  /** Upper lids, 0 = open … 1 = shut, per eye. */
  lidL?: number;
  lidR?: number;
  /** Lower lids rising (the squint of a smirk), 0 … 1. */
  squint?: number;
  /** Pupils: where they look (-1 … 1 each axis) and the slit's width (1 = normal). */
  lookX?: number;
  lookY?: number;
  pupil?: number;
  /** Brows: slant (cocky > 0) and raise (units, + = up), per side for asymmetry. */
  brow?: number;
  browUpL?: number;
  browUpR?: number;
  /** Head tilt (rad), squash/stretch (sx, sy ≈ 1), and ear/whisker angles (rad). */
  tilt?: number;
  sx?: number;
  sy?: number;
  earL?: number;
  earR?: number;
  whisk?: number;
  /** Head turn, -1 (to his right, our left) … 1: the features slide and the far eye shrinks. */
  turn?: number;
  /** Clenched teeth (the bite), 0 … 1: shows when the mouth is closed. */
  teeth?: number;
  /** Sticker border (units) and shadow strength (0 … 1). */
  border?: number;
  shadow?: number;
  /** A hard (unblurred) shadow: much cheaper, for crowds of copies. */
  hardShadow?: boolean;
}

const INK = '#0B0B0C';
const WHITE = '#FAFAF7';
const AMBER = HEX.soon;
const RED = HEX.overdue;
const RED_DEEP = '#8E1213';
const GAP = 7;

// ---------------------------------------------------------------- parts
function face(jaw: number): Path2D {
  const j = jaw * 46; // the chin drops this far with the mouth open
  const h = new Path2D();
  h.moveTo(-205, 30);
  h.lineTo(-232, 52); h.lineTo(-206, 66); h.lineTo(-226, 92); h.lineTo(-190, 100 + j * 0.3);
  h.bezierCurveTo(-150, 168 + j * 0.8, -60, 186 + j, 0, 186 + j);
  h.bezierCurveTo(60, 186 + j, 150, 168 + j * 0.8, 190, 100 + j * 0.3);
  h.lineTo(226, 92); h.lineTo(206, 66); h.lineTo(232, 52); h.lineTo(205, 30);
  h.bezierCurveTo(214, -40, 190, -150, 0, -182);
  h.bezierCurveTo(-190, -150, -214, -40, -205, 30);
  h.closePath();
  return h;
}

/** An ear, built around its base at the origin pointing up; `nick` cuts the street-cat notch. */
function ear(nick: boolean): Path2D {
  const e = new Path2D();
  e.moveTo(-70, 30);
  e.lineTo(-20, -150);
  e.quadraticCurveTo(-12, -168, -2, -150);
  if (nick) { e.lineTo(22, -96); e.lineTo(34, -110); e.lineTo(40, -78); }
  e.lineTo(70, 30);
  e.closePath();
  return e;
}
const EAR_L = { x: -138, y: -128, rot: -0.36 };
const EAR_R = { x: 138, y: -128, rot: 0.36 };

function earInner(c: CanvasRenderingContext2D) {
  c.beginPath(); c.moveTo(-34, 10); c.lineTo(-12, -112); c.lineTo(22, -10); c.stroke();
}

// the head turn, for the ears: they slide toward the turn, the far one a little narrower
let earTurn = 0;
function withEar(c: CanvasRenderingContext2D, side: -1 | 1, ang: number, fn: () => void) {
  const E = side < 0 ? EAR_L : EAR_R;
  const far = side * earTurn < 0 ? Math.abs(earTurn) : 0;
  c.save();
  c.translate(E.x + earTurn * 26 - side * far * 10, E.y + far * 6);
  c.rotate(E.rot + ang + earTurn * 0.08);
  c.scale(1 - 0.14 * far, 1);
  if (side > 0) c.scale(-1, 1);
  fn();
  c.restore();
}

function whiskers(c: CanvasRenderingContext2D, ang: number) {
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * 214, 64);
    c.rotate(s * ang);
    c.beginPath();
    c.moveTo(s * 2, -42); c.lineTo(s * 56, -62);
    c.moveTo(s * 14, 0); c.lineTo(s * 72, -2);
    c.moveTo(s * 4, 40); c.lineTo(s * 54, 60);
    c.stroke();
    c.restore();
  }
}

function eye(c: CanvasRenderingContext2D, cx: number, side: -1 | 1, p: HeadPose) {
  const lid = clamp01(side < 0 ? p.lidL ?? 0.35 : p.lidR ?? 0.35);
  const squint = clamp01(p.squint ?? 0);
  const brow = p.brow ?? 0.85;
  const w = 152, h = 116, top = -64, cy = 8;
  // the eye squashes a little as it closes (a sticker blink, not a shutter)
  const blinkSq = 1 - 0.12 * Math.max(0, lid - 0.5) * 2;
  c.save();
  c.translate(cx, cy + top + h / 2);
  c.scale(1 + 0.04 * (1 - blinkSq), blinkSq);
  c.translate(0, -(top + h / 2));
  const shape = new Path2D();
  shape.moveTo(-w / 2, top + 26);
  shape.bezierCurveTo(-w / 2 + 4, top + h + 18, w / 2 - 4, top + h + 18, w / 2, top + 26);
  shape.bezierCurveTo(w / 2, top - 14, -w / 2, top - 14, -w / 2, top + 26);
  c.save();
  c.clip(shape);
  c.fillStyle = AMBER;
  c.fillRect(-w, -h * 2, w * 2, h * 4);
  // pupil: a slit that drifts with the look; wider when relaxed, thin when fierce
  const px = side * -18 + (p.lookX ?? 0) * 34;
  const py = top + h * 0.62 + (p.lookY ?? 0) * 16;
  const pw = 15 * (p.pupil ?? 1);
  c.fillStyle = INK;
  c.beginPath(); c.ellipse(px, py, pw, 46, 0, 0, Math.PI * 2); c.fill();
  // catchlight: a glossy sticker highlight fixed on the eyeball (it does not follow the pupil)
  c.fillStyle = 'rgba(255,255,255,0.92)';
  // (the same light for both eyes: up and to the left)
  c.beginPath(); c.ellipse(-30, top + 38, 12, 8, -0.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(-10, top + 56, 4.5, 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = INK;
  // lower lid: rises with the squint, a soft curve
  if (squint > 0.001) {
    const ly = top + h + 20 - squint * 52;
    c.beginPath();
    c.moveTo(-w, h * 2); c.lineTo(-w, ly + 10); c.quadraticCurveTo(0, ly - 18 * squint, w, ly + 10); c.lineTo(w, h * 2);
    c.closePath(); c.fill();
  }
  // upper lid: slants down toward the nose (cocky) and comes down to blink
  const lidY = top - 18 + lid * (h + 24);
  const slant = -brow * 30 * side * (1 - lid * 0.6);
  c.beginPath();
  c.moveTo(-w, -h * 2); c.lineTo(w, -h * 2); c.lineTo(w, lidY + slant); c.lineTo(-w, lidY - slant);
  c.closePath(); c.fill();
  c.restore();
  c.restore();
  // brow
  const up = side < 0 ? p.browUpL ?? 0 : p.browUpR ?? 0;
  const by = cy + top - 34 + Math.min(lid, 0.6) * 30 - up;
  c.save();
  c.translate(cx, 0);
  c.strokeStyle = WHITE; c.lineWidth = 10; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(side * w * 0.48, by - brow * 22);
  c.quadraticCurveTo(0, by - brow * 6 - 6, -side * w * 0.42, by + brow * 20);
  c.stroke();
  c.restore();
}

function mouth(c: CanvasRenderingContext2D, ms: MouthShape, jaw: number, teeth = 0) {
  c.save();
  c.translate(0, 100 + jaw * 14);
  const { hw, round } = ms;
  const d = Math.max(0, ms.d);
  const closed = 1 - Math.min(1, d / 10);
  if (closed > 0) {
    c.save();
    c.globalAlpha *= closed;
    const sm = ms.smirk;
    if (teeth > 0.01) {
      // clenched: a white row of teeth with the fangs over it, the line of the bite across
      c.save();
      c.globalAlpha *= teeth;
      const tw = hw * 0.92, th = 34;
      c.fillStyle = WHITE;
      c.beginPath(); c.roundRect(-tw, -th / 2, tw * 2, th, 10); c.fill();
      c.strokeStyle = INK; c.lineWidth = 4;
      c.beginPath(); c.moveTo(-tw + 4, 0); c.lineTo(tw - 4, 0);
      for (let i = 1; i < 8; i++) { const x = -tw + (tw * 2 * i) / 8; c.moveTo(x, -th / 2 + 3); c.lineTo(x, th / 2 - 3); }
      c.stroke();
      c.fillStyle = WHITE;
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * tw * 0.66 - 12, th / 2 - 2); c.lineTo(sx * tw * 0.66 + 12, th / 2 - 2); c.lineTo(sx * tw * 0.66, th / 2 + 22); c.closePath(); c.fill(); }
      c.restore();
      c.globalAlpha *= 1 - teeth;
    }
    c.strokeStyle = WHITE; c.lineWidth = GAP; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-hw, -10 * sm + 2 * (1 - sm));
    c.bezierCurveTo(-hw * 0.43, 22 * sm + 12 * (1 - sm), hw * 0.43, 20 * sm + 12 * (1 - sm), hw * (1 + 0.06 * sm), -30 * sm + 2 * (1 - sm));
    c.stroke();
    if (sm > 0.05) {
      c.globalAlpha *= sm;
      c.fillStyle = WHITE;
      c.beginPath(); c.moveTo(40, 9); c.lineTo(62, 2); c.lineTo(53, 38); c.closePath(); c.fill();
    }
    c.restore();
  }
  if (closed < 1) {
    const k = (x: number, y: number) => x + (y - x) * round;
    const mp = new Path2D();
    const ty = k(6, -d * 0.32);
    mp.moveTo(-hw, k(-8, d * 0.18));
    mp.bezierCurveTo(-hw * 0.45, ty, hw * 0.45, ty, hw, k(-12, d * 0.18));
    mp.bezierCurveTo(hw * k(0.9, 1.1), d * 0.8, hw * k(0.3, 0.6), d * 1.05, 0, d);
    mp.bezierCurveTo(-hw * k(0.45, 0.6), d * 1.02, -hw * k(0.95, 1.1), d * 0.7, -hw, k(-8, d * 0.18));
    mp.closePath();
    c.save();
    c.globalAlpha *= 1 - closed;
    c.fillStyle = RED; c.fill(mp);
    if (d > 26) {
      c.save(); c.clip(mp);
      c.globalAlpha *= Math.min(1, (d - 26) / 22);
      c.fillStyle = RED_DEEP;
      c.beginPath(); c.ellipse(hw * 0.12, d * 1.04, hw * 0.56, d * 0.38, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    const fang = 1 - round;
    if (fang > 0.05) {
      c.fillStyle = WHITE;
      for (const sx of [-1, 1]) {
        const x = sx * hw * 0.62, len = Math.min(36, d * 0.5 + 10) * fang;
        c.beginPath(); c.moveTo(x - 14 * fang, -5); c.lineTo(x + 14 * fang, -7); c.lineTo(x + sx * 3, -6 + len); c.closePath(); c.fill();
      }
    }
    c.restore();
  }
  c.restore();
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------------------------------------------------------------- the head
export function drawBolloHead(c: CanvasRenderingContext2D, x: number, y: number, size: number, p: HeadPose = {}) {
  const k = size / 100;
  const jaw = clamp01(p.jaw ?? 0);
  const border = p.border ?? 18;
  const sx = p.sx ?? 1, sy = (p.sy ?? 1) * (1 + jaw * 0.03);
  const earL = p.earL ?? 0, earR = p.earR ?? 0, wk = p.whisk ?? 0;
  const fc = face(jaw);
  const earShape = ear(false), earNick = ear(true);
  earTurn = Math.max(-1, Math.min(1, p.turn ?? 0));

  c.save();
  c.translate(x, y);
  c.scale(k, k);
  // squash and stretch about the chin, so the head "sits" while it bounces
  c.translate(0, 186);
  c.rotate(p.tilt ?? 0);
  c.scale(sx, sy);
  c.translate(0, -186);

  // 1. the sticker's shadow: the border silhouette, soft, offset down
  const silhouette = (fill: string, grow: number) => {
    c.fillStyle = fill; c.strokeStyle = fill; c.lineJoin = 'round'; c.lineCap = 'round';
    c.lineWidth = grow * 2;
    withEar(c, -1, earL, () => { c.stroke(earShape); c.fill(earShape); });
    withEar(c, 1, earR, () => { c.stroke(earNick); c.fill(earNick); });
    c.stroke(fc); c.fill(fc);
    c.lineWidth = 6 + grow * 2; whiskers(c, wk);
  };
  if ((p.shadow ?? 1) > 0) {
    c.save();
    c.translate(10, 22);
    if (p.hardShadow) c.globalAlpha *= 0.16 * (p.shadow ?? 1);
    else { c.filter = `blur(${14 * k}px)`; c.globalAlpha *= 0.28 * (p.shadow ?? 1); }
    silhouette('#000', border);
    c.restore();
  }
  // 2. the white sticker border
  silhouette(WHITE, border);
  // 3. black fills: ears behind the face, then the face
  c.fillStyle = INK;
  withEar(c, -1, earL, () => c.fill(earShape));
  withEar(c, 1, earR, () => c.fill(earNick));
  c.strokeStyle = WHITE; c.lineWidth = 6; c.lineJoin = 'round';
  withEar(c, -1, earL, () => earInner(c));
  withEar(c, 1, earR, () => earInner(c));
  c.fillStyle = INK; c.fill(fc);
  // whiskers: ink lines over the white border
  c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round'; whiskers(c, wk);
  // 4. features, slid and foreshortened by the turn
  const turn = Math.max(-1, Math.min(1, p.turn ?? 0));
  const fx = turn * 50;
  for (const side of [-1, 1] as const) {
    const near = side * turn > 0 ? 1 : 0;
    const ks = 1 + (near ? 0.07 : -0.16) * Math.abs(turn);
    const ex = side * 90 * (1 - (near ? 0.02 : 0.14) * Math.abs(turn)) + fx;
    c.save();
    c.translate(ex, 0);
    c.scale(ks, 1);
    eye(c, 0, side, p);
    c.restore();
  }
  c.save();
  c.translate(fx * 1.1, 0);
  c.scale(1 - 0.12 * Math.abs(turn), 1);
  mouth(c, p.mouth ?? VISEME.smirk, jaw, p.teeth ?? 0);
  c.restore();
  c.restore();
}
