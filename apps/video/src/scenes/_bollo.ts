// Bollo, the mascot: a Roman black street cat in streetwear-sticker style. Flat fills, no shading,
// a thick white sticker border around the silhouette and thin white gaps between overlapping parts.
// Black body, amber eyes (the app's "In arrivo" colour), red mouth (its "Scaduta" red), a white
// tee with the app's "A", white sneakers, and a red rubber stamp held as a microphone.
//
// Drawn in units around the head's centre (head ≈ 420 wide); `drawBollo(c, x, y, size, pose)` puts
// that origin at (x, y) with `size` = px per 100 units. Every part is driven by the pose, so the same
// drawing is the rig: mouth shapes for lip-sync, lids, brows, ears, arms, tail.
import { HEX } from '../engine/palette';

export type Mouth = 'smirk' | 'm' | 'a' | 'e' | 'i' | 'o' | 'u' | 'f' | 'shout';
export interface BolloPose {
  mouth?: Mouth;
  /** Continuous mouth (overrides `mouth`), e.g. a blend of two visemes. */
  mouthShape?: MouthShape;
  /** Lids, 0 = wide open, 1 = shut. Default 0.42: the half-lidded cocky look. */
  lid?: number;
  /** Brow slant, -1 sad … 0 flat … 1 cocky/angry. */
  brow?: number;
  /** Pupils' horizontal look, -1 … 1. */
  look?: number;
  /** Head tilt (rad) and nod offset (units, + = down). */
  tilt?: number;
  nod?: number;
  /** Ear flicks, 0 … 1 each. */
  earL?: number;
  earR?: number;
  /** Mic arm: 0 = stamp at the mouth, 1 = arm lowered. */
  mic?: number;
  /** Free arm: 'point' (index at the viewer), 'up' (hand raised), 'down'. */
  arm?: 'point' | 'up' | 'down';
  /** Continuous free arm (overrides `arm`): raise 0 … 1 and point 0 … 1 (blended on top). */
  armUp?: number;
  armPoint?: number;
  /** Tail swing, -1 … 1. */
  tail?: number;
  /** Whole-body lean (rad, about the feet) and the head's lag (units, sideways). */
  lean?: number;
  headX?: number;
  /** Whole-body bounce (units, + = down) and squash (0 … 0.15). */
  bounce?: number;
  squash?: number;
  /** Head only (the sticker/logo). */
  headOnly?: boolean;
  /** Sticker border width (units). Default 16. */
  border?: number;
}

const INK = '#0B0B0C';
const WHITE = '#FAFAF7';
const AMBER = HEX.soon;
const RED = HEX.overdue;
const RED_DEEP = '#8E1213';
const GAP = 7; // white gap between overlapping black parts

// ---------------------------------------------------------------- shapes (unit space)
function headPath(p: BolloPose): Path2D {
  const eL = (p.earL ?? 0) * 0.35, eR = (p.earR ?? 0) * 0.35;
  const h = new Path2D();
  h.moveTo(-205, 30);
  // left cheek tufts
  h.lineTo(-232, 52); h.lineTo(-206, 66); h.lineTo(-226, 92); h.lineTo(-190, 100);
  // jaw and chin
  h.bezierCurveTo(-150, 168, -60, 186, 0, 186);
  h.bezierCurveTo(60, 186, 150, 168, 190, 100);
  // right cheek tufts
  h.lineTo(226, 92); h.lineTo(206, 66); h.lineTo(232, 52); h.lineTo(205, 30);
  // right side up to the ear (the right ear has a nick: a street cat)
  h.bezierCurveTo(212, -20, 205, -70, 190, -110);
  const rx = 205 + 30 * eR, ry = -300 + 40 * eR;
  h.lineTo(rx, ry);
  h.lineTo(150, -215); h.lineTo(138, -232); h.lineTo(122, -202);
  h.lineTo(80, -178);
  // crown
  h.bezierCurveTo(30, -192, -30, -192, -80, -178);
  // left ear
  const lx = -200 - 30 * eL, ly = -305 + 40 * eL;
  h.lineTo(lx, ly);
  h.lineTo(-190, -110);
  h.bezierCurveTo(-205, -70, -212, -20, -205, 30);
  h.closePath();
  return h;
}

/** Inner ear marks (thin white lines). */
function earMarks(c: CanvasRenderingContext2D, p: BolloPose) {
  const eL = (p.earL ?? 0) * 0.35, eR = (p.earR ?? 0) * 0.35;
  c.beginPath();
  c.moveTo(-160, -150); c.lineTo(-188 - 22 * eL, -262 + 30 * eL); c.lineTo(-115, -178);
  c.moveTo(160, -150); c.lineTo(190 + 22 * eR, -258 + 30 * eR); c.lineTo(150, -200);
  c.stroke();
}

function eye(c: CanvasRenderingContext2D, cx: number, side: -1 | 1, p: BolloPose) {
  const lid = Math.min(1, Math.max(0, p.lid ?? 0.4));
  const brow = p.brow ?? 0.8;
  const w = 150, h = 112, top = -62, cy = 6;
  c.save();
  c.translate(cx, cy);
  // amber almond: round below, the lid cuts it above
  const shape = new Path2D();
  shape.moveTo(-w / 2, top + 26);
  shape.bezierCurveTo(-w / 2 + 4, top + h + 18, w / 2 - 4, top + h + 18, w / 2, top + 26);
  shape.bezierCurveTo(w / 2, top - 14, -w / 2, top - 14, -w / 2, top + 26);
  c.save();
  c.clip(shape);
  c.fillStyle = AMBER;
  c.fillRect(-w, -h * 2, w * 2, h * 4);
  // pupil: a tall slit toward the nose, the reference's side-eye
  const px = side * -22 + (p.look ?? 0) * 30;
  c.fillStyle = INK;
  c.beginPath();
  c.ellipse(px, top + h * 0.64, 15, 46, 0, 0, Math.PI * 2);
  c.fill();
  // the lid: lower edge slants down toward the nose (cocky / angry) by `brow`
  const lidY = top - 16 + lid * (h + 18);
  const slant = -brow * 30 * side;
  c.beginPath();
  c.moveTo(-w, -h * 2);
  c.lineTo(w, -h * 2);
  c.lineTo(w, lidY + slant);
  c.lineTo(-w, lidY - slant);
  c.closePath();
  c.fill();
  c.restore();
  // brow: a white stroke above, following the lid's slant
  const by = lidY - 30;
  c.strokeStyle = WHITE;
  c.lineWidth = 9;
  c.lineCap = 'round';
  // outer end higher, inner end lower when cocky (brow > 0); the reverse when sad
  c.beginPath();
  c.moveTo(side * w * 0.48, by - brow * 22);
  c.lineTo(-side * w * 0.42, by + brow * 20);
  c.stroke();
  c.restore();
}

/** A mouth as continuous parameters, so shapes can blend: half width, depth, roundness (o/u),
 * and for a closed mouth (depth ≈ 0) how much it is the lopsided smirk rather than a flat line. */
export interface MouthShape { hw: number; d: number; round: number; smirk: number }
export const VISEME: Record<Mouth, MouthShape> = {
  smirk: { hw: 92, d: 0, round: 0, smirk: 1 },
  m: { hw: 62, d: 0, round: 0, smirk: 0 },
  f: { hw: 80, d: 16, round: 0, smirk: 0 },
  i: { hw: 104, d: 26, round: 0, smirk: 0 },
  e: { hw: 100, d: 48, round: 0, smirk: 0 },
  a: { hw: 94, d: 76, round: 0, smirk: 0 },
  o: { hw: 60, d: 72, round: 1, smirk: 0 },
  u: { hw: 42, d: 50, round: 1, smirk: 0 },
  shout: { hw: 124, d: 86, round: 0, smirk: 0 },
};
export function mixMouth(a: MouthShape, b: MouthShape, k: number): MouthShape {
  return { hw: a.hw + (b.hw - a.hw) * k, d: a.d + (b.d - a.d) * k, round: a.round + (b.round - a.round) * k, smirk: a.smirk + (b.smirk - a.smirk) * k };
}

function mouth(c: CanvasRenderingContext2D, ms: MouthShape) {
  c.save();
  c.translate(0, 100);
  const { hw, round } = ms;
  const d = Math.max(0, ms.d);
  // closed (or nearly): a white line, from flat to the lopsided smirk with its fang
  const closed = 1 - Math.min(1, d / 10);
  if (closed > 0) {
    c.globalAlpha *= closed;
    const sm = ms.smirk;
    c.strokeStyle = WHITE;
    c.lineWidth = GAP;
    c.lineCap = 'round';
    c.beginPath();
    const w = hw;
    c.moveTo(-w, -10 * sm + 2 * (1 - sm));
    c.bezierCurveTo(-w * 0.43, 22 * sm + 12 * (1 - sm), w * 0.43, 20 * sm + 12 * (1 - sm), w * (1 + 0.06 * sm), -30 * sm + 2 * (1 - sm));
    c.stroke();
    if (sm > 0.05) {
      c.globalAlpha *= sm;
      c.fillStyle = WHITE;
      c.beginPath(); c.moveTo(40, 9); c.lineTo(62, 2); c.lineTo(53, 38); c.closePath(); c.fill();
    }
    c.restore();
    if (closed >= 1) return;
    c.save();
    c.translate(0, 100);
  }
  const k = (x: number, y: number) => x + (y - x) * round;
  const mp = new Path2D();
  const ty = k(6, -d * 0.32);
  mp.moveTo(-hw, k(-8, d * 0.18));
  mp.bezierCurveTo(-hw * 0.45, ty, hw * 0.45, ty, hw, k(-12, d * 0.18));
  mp.bezierCurveTo(hw * k(0.9, 1.1), d * 0.8, hw * k(0.3, 0.6), d * 1.05, 0, d);
  mp.bezierCurveTo(-hw * k(0.45, 0.6), d * 1.02, -hw * k(0.95, 1.1), d * 0.7, -hw, k(-8, d * 0.18));
  mp.closePath();
  c.globalAlpha *= 1 - closed;
  c.fillStyle = RED;
  c.fill(mp);
  // tongue: a darker red lobe as the mouth opens
  if (d > 30) {
    c.save();
    c.clip(mp);
    c.globalAlpha *= Math.min(1, (d - 30) / 20);
    c.fillStyle = RED_DEEP;
    c.beginPath();
    c.ellipse(hw * 0.15, d * 1.02, hw * 0.55, d * 0.36, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  // fangs at the top corners, shrinking away as the mouth rounds
  const fang = 1 - round;
  if (fang > 0.05) {
    c.fillStyle = WHITE;
    const fy = -6;
    for (const sx of [-1, 1]) {
      const x = sx * hw * 0.62;
      const len = Math.min(36, d * 0.5 + 10) * fang;
      c.beginPath(); c.moveTo(x - 14 * fang, fy + 1); c.lineTo(x + 14 * fang, fy - 1); c.lineTo(x + sx * 3, fy + len); c.closePath(); c.fill();
    }
  }
  c.restore();
}

function whiskers(c: CanvasRenderingContext2D) {
  c.beginPath();
  for (const s of [-1, 1]) {
    c.moveTo(s * 218, 22); c.lineTo(s * 268, 4);
    c.moveTo(s * 230, 64); c.lineTo(s * 284, 62);
    c.moveTo(s * 220, 104); c.lineTo(s * 266, 122);
  }
  c.stroke();
}

// ---------------------------------------------------------------- the body (unit space, head origin)
function rr(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
}

function tailPath(sw: number): Path2D {
  const t = new Path2D();
  const k = sw * 40;
  t.moveTo(95, 440);
  t.bezierCurveTo(230, 470, 300 + k, 380, 270 + k, 300);
  t.bezierCurveTo(250 + k, 250, 290 + k * 1.4, 215, 318 + k * 1.6, 238);
  t.bezierCurveTo(300 + k * 1.5, 250, 288 + k, 280, 306 + k, 312);
  t.bezierCurveTo(330 + k, 410, 240, 505, 100, 478);
  t.closePath();
  return t;
}

function torso(): Path2D {
  // an oversized streetwear tee: wide shoulders, dropped hem with a slight curve
  const t = new Path2D();
  t.moveTo(-122, 186);
  t.bezierCurveTo(-60, 200, 60, 200, 122, 186);
  t.bezierCurveTo(150, 260, 160, 380, 156, 452);
  t.bezierCurveTo(60, 466, -60, 466, -156, 452);
  t.bezierCurveTo(-160, 380, -150, 260, -122, 186);
  t.closePath();
  return t;
}

/** Sleeves of the tee (dropped, wide), as one path per side. */
function sleeve(side: -1 | 1): Path2D {
  const s = new Path2D();
  s.moveTo(side * 112, 190);
  s.bezierCurveTo(side * 180, 200, side * 226, 238, side * 238, 300);
  s.lineTo(side * 176, 336);
  s.bezierCurveTo(side * 160, 300, side * 150, 280, side * 140, 262);
  s.closePath();
  return s;
}

function legs(): Path2D {
  const l = new Path2D();
  rr(l, -112, 430, 86, 92, 30);
  rr(l, 26, 430, 86, 92, 30);
  return l;
}

function sneakers(): Path2D {
  const s = new Path2D();
  // chunky white sneakers, toes pointing slightly out
  s.moveTo(-150, 560); s.bezierCurveTo(-160, 512, -120, 498, -80, 504); s.bezierCurveTo(-36, 508, -18, 530, -16, 560); s.closePath();
  s.moveTo(150, 560); s.bezierCurveTo(160, 512, 120, 498, 80, 504); s.bezierCurveTo(36, 508, 18, 530, 16, 560); s.closePath();
  return s;
}

/** An arm from the shoulder (sx, sy) through the elbow to the paw, as a thick capsule chain. */
function armStroke(c: CanvasRenderingContext2D, pts: [number, number][], w: number) {
  c.beginPath();
  c.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
  c.lineWidth = w;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.stroke();
}

/**
 * The red rubber stamp held as a microphone, origin at the paw's grip: the round red knob up at the
 * mouth (the mic's head), the black wooden neck through the paw, the base with its red rubber below.
 */
function stampParts() {
  const knob = new Path2D(); knob.arc(0, -84, 40, 0, Math.PI * 2);
  const neck = new Path2D(); rr(neck, -15, -52, 30, 104, 9);
  const base = new Path2D(); rr(base, -62, 48, 124, 36, 7);
  const rubber = new Path2D(); rr(rubber, -56, 84, 112, 12, 3);
  return { knob, neck, base, rubber };
}
function stampMic(c: CanvasRenderingContext2D, x: number, y: number, ang: number, border: number) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const { knob, neck, base, rubber } = stampParts();
  if (border > 0) {
    c.strokeStyle = WHITE; c.fillStyle = WHITE; c.lineWidth = border * 2; c.lineJoin = 'round';
    for (const p of [knob, neck, base, rubber]) { c.stroke(p); c.fill(p); }
  }
  c.fillStyle = INK; c.fill(neck);
  c.fillStyle = INK; c.fill(base);
  c.fillStyle = RED; c.fill(rubber);
  c.fillStyle = RED; c.fill(knob);
  // the knob's highlight and the base's bevel: thin white lines, sticker-style
  c.strokeStyle = WHITE; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.arc(0, -84, 26, Math.PI * 1.08, Math.PI * 1.5); c.stroke();
  c.lineWidth = 4;
  c.beginPath(); c.moveTo(-50, 58); c.lineTo(50, 58); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- the whole cat
export function drawBollo(c: CanvasRenderingContext2D, x: number, y: number, size: number, pose: BolloPose = {}) {
  const k = size / 100;
  const border = pose.border ?? 16;
  const tilt = pose.tilt ?? 0, nod = pose.nod ?? 0;
  const sq = pose.squash ?? 0;
  c.save();
  c.translate(x, y + (pose.bounce ?? 0) * k);
  c.scale(k * (1 + sq * 0.5), k * (1 - sq));
  if (pose.lean) { c.translate(0, 560); c.rotate(pose.lean); c.translate(0, -560); }

  // ---- head geometry in its own frame (tilt + nod)
  const head = headPath(pose);
  const withHead = (fn: () => void) => { c.save(); c.translate(pose.headX ?? 0, nod); c.rotate(tilt); fn(); c.restore(); };

  // ---- arm poses (unit space, in body frame)
  const mic = pose.mic ?? 0;
  const micPaw: [number, number] = [-122 - 50 * mic, 214 + 140 * mic];
  const micArm: [number, number][] = [[-168, 296], [-226 + 16 * mic, 300 + 40 * mic], micPaw];
  const free = pose.arm ?? 'up';
  const up = pose.armUp ?? (free === 'up' ? 1 : 0);
  const pt = pose.armPoint ?? (free === 'point' ? 1 : 0);
  const DOWN: [number, number][] = [[168, 296], [214, 376], [214, 446]];
  const UP: [number, number][] = [[168, 296], [250, 236], [262, 130]];
  const POINT: [number, number][] = [[168, 296], [252, 300], [318, 262]];
  const freeArm = DOWN.map(([x, y], i) => {
    const ux = x + (UP[i]![0] - x) * up, uy = y + (UP[i]![1] - y) * up;
    return [ux + (POINT[i]![0] - ux) * pt, uy + (POINT[i]![1] - uy) * pt] as [number, number];
  });
  const stampAt = (): [number, number, number] => [micPaw[0] + 4, micPaw[1] - 6, 0.36 - mic * 0.9];
  const freePaw = freeArm[2]!;

  // ---- 1. sticker border: the union of everything, stroked fat in white
  c.save();
  c.fillStyle = WHITE; c.strokeStyle = WHITE; c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = border * 2;
  if (!pose.headOnly) {
    const tp = tailPath(pose.tail ?? 0);
    c.stroke(tp); c.fill(tp);
    for (const p of [torso(), sleeve(-1), sleeve(1), legs(), sneakers()]) { c.stroke(p); c.fill(p); }
    armStroke(c, micArm, 62 + border * 2);
    armStroke(c, freeArm, 62 + border * 2);
    c.beginPath(); c.arc(micPaw[0], micPaw[1], 40 + border, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(freePaw[0], freePaw[1], 40 + border, 0, Math.PI * 2); c.fill();
  }
  withHead(() => {
    c.lineWidth = border * 2; c.stroke(head); c.fill(head);
    c.lineWidth = 6 + border * 2; whiskers(c);
  });
  if (!pose.headOnly) { const [sx, sy, sa] = stampAt(); stampMic(c, sx, sy, sa, border); }
  c.restore();

  // ---- 2. fills, back to front, with white gaps where parts overlap
  if (!pose.headOnly) {
    const tp = tailPath(pose.tail ?? 0);
    c.fillStyle = INK; c.fill(tp);
    c.fillStyle = INK; c.fill(legs());
    c.fillStyle = WHITE; c.fill(sneakers());
    c.strokeStyle = INK; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-140, 542); c.lineTo(-30, 542); c.moveTo(140, 542); c.lineTo(30, 542); c.stroke();
    // the tee
    const tee = new Path2D(); tee.addPath(torso()); tee.addPath(sleeve(-1)); tee.addPath(sleeve(1));
    c.fillStyle = WHITE; c.fill(tee);
    c.strokeStyle = INK; c.lineWidth = 7; c.lineJoin = 'round';
    c.stroke(torso()); c.stroke(sleeve(-1)); c.stroke(sleeve(1));
    // the app's "A" on the chest
    c.save();
    c.translate(-38, 300); c.scale(0.78, 0.78);
    c.fillStyle = '#1a1a1a';
    const sq2 = new Path2D(); rr(sq2, 0, 0, 100, 100, 22); c.fill(sq2);
    c.fillStyle = '#ececec';
    c.fill(new Path2D('M44 20h12l21 60H64l-4.5-15h-19L36 80H23zm-6 36h24l-12-34z'), 'evenodd');
    c.restore();
    // arms (black), with a white gap where they cross the tee
    for (const [arm, paw] of [[freeArm, freePaw]] as const) {
      c.save();
      c.strokeStyle = WHITE; armStroke(c, arm as [number, number][], 62 + GAP * 2);
      c.beginPath(); c.fillStyle = WHITE; c.arc(paw[0], paw[1], 40 + GAP, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; armStroke(c, arm as [number, number][], 62);
      c.fillStyle = INK; c.beginPath(); c.arc(paw[0], paw[1], 40, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // paw finger marks
    c.strokeStyle = WHITE; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath();
    for (const [px, py] of [freePaw]) { c.moveTo(px - 14, py - 30); c.lineTo(px - 10, py - 12); c.moveTo(px + 6, py - 32); c.lineTo(px + 8, py - 14); }
    c.stroke();
    if (pt > 0.5) {
      // index finger pointing out at the viewer: a short white-bordered capsule
      c.save();
      c.translate(freePaw[0] + 20, freePaw[1] - 28); c.rotate(-0.75);
      c.strokeStyle = WHITE; c.lineWidth = 26 + GAP * 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -46); c.stroke();
      c.strokeStyle = INK; c.lineWidth = 26;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -46); c.stroke();
      c.restore();
    }
  }

  withHead(() => {
    c.fillStyle = INK; c.fill(head);
    c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round'; whiskers(c);
    c.strokeStyle = WHITE; c.lineWidth = 5; c.lineJoin = 'round'; earMarks(c, pose);
    eye(c, -88, -1, pose);
    eye(c, 88, 1, pose);
    mouth(c, pose.mouthShape ?? VISEME[pose.mouth ?? 'smirk']);
  });

  // ---- 3. the mic arm and the stamp, in front of the face
  if (!pose.headOnly) {
    c.save();
    c.strokeStyle = WHITE; armStroke(c, micArm, 62 + GAP * 2);
    c.fillStyle = WHITE; c.beginPath(); c.arc(micPaw[0], micPaw[1], 40 + GAP, 0, Math.PI * 2); c.fill();
    const [sx, sy, sa] = stampAt();
    stampMic(c, sx, sy, sa, GAP);
    c.strokeStyle = INK; armStroke(c, micArm, 62);
    c.fillStyle = INK; c.beginPath(); c.arc(micPaw[0], micPaw[1], 40, 0, Math.PI * 2); c.fill();
    // the paw wraps the stamp's neck: two white finger lines across it
    c.strokeStyle = WHITE; c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(micPaw[0] - 6, micPaw[1] - 34); c.lineTo(micPaw[0] + 30, micPaw[1] - 18);
    c.moveTo(micPaw[0] - 14, micPaw[1] - 14); c.lineTo(micPaw[0] + 24, micPaw[1] + 2); c.stroke();
    c.restore();
  }
  c.restore();
}
