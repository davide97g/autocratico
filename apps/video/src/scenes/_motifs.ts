// Shared motifs, so the things that recur look the same in every plate. Read-only for scene authors;
// ask the lead for changes. See docs/TREATMENT.md.
//
//  - the STUDIO: the app's background (grey with blurred white shapes), and the dark plates
//  - the STAMP: a rubber stamp that slams onto the frame on a beat (SCADUTA, FOLLIA!)
//  - the REDACTION BAR: privacy mode's solid bar, also the transition wipe
//  - the DEVICES: an iPhone and a browser window showing the real app (public/app/*.png)
//  - STATUS: the four status colours, chips, and the days-left rule from packages/core/src/status.ts
//  - the ICON: the app's "A" on a near-black rounded square
//  - the ORB: the liquid chrome orb of the "Prossimo adempimento" card
import { HEX, rgba, type PaletteKey } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, mulberry32, noise2, TAU } from '../engine/util';
import { W, H, SCALE, scaleContext2D } from '../engine/gl';

// ---------------------------------------------------------------- images (the real app)
const IMG = new Map<string, Promise<ImageBitmap>>();
/** Load a picture from public/ (e.g. 'app/phone-inbox.png') once; await it in init(). */
export function loadImage(path: string): Promise<ImageBitmap> {
  let p = IMG.get(path);
  if (!p) {
    p = fetch(path).then((r) => {
      if (!r.ok) throw new Error(`missing public/${path}`);
      return r.blob();
    }).then((b) => createImageBitmap(b));
    IMG.set(path, p);
  }
  return p;
}

/**
 * The captures of the real web app, Italian locale, on the made-up demo register (tools/capture.ts,
 * tools/italian_demo.py). desktop-*: 2880×1800 (1440×900 @2x); phone-*: 1179×2556 (393×852 @3x).
 * Views: overview, deadlines, cases, inbox, activity, profile, settings, timeline, catalog;
 * `-privacy` variants of overview and deadlines; `-full` (whole page) of overview, deadlines, inbox and activity.
 */
export const app = (device: 'desktop' | 'phone', view: string) => `app/${device}-${view}.png`;

// ---------------------------------------------------------------- the studio
/** The app's light background: studio grey with three blurred white shapes (apps/web index.css). */
export function drawStudio(c: CanvasRenderingContext2D, o: { dark?: boolean; drift?: number } = {}) {
  const d = o.drift ?? 0;
  c.save();
  c.fillStyle = o.dark ? HEX.ink : HEX.paper;
  c.fillRect(0, 0, W, H);
  const blobs: [number, number, number, number, number][] = o.dark
    ? [[0.18, 0.08, 520, 400, 0.10], [0.72, 0.96, 560, 470, 0.08]]
    : [[0.18, 0.08, 520, 400, 0.85], [0.72, 0.96, 560, 470, 0.75], [0.96, 0.30, 400, 330, 0.6]];
  for (const [fx, fy, rx, ry, a] of blobs) {
    const x = fx * W + Math.sin(d * 0.7 + fx * 9) * 30, y = fy * H + Math.cos(d * 0.5 + fy * 7) * 20;
    c.save();
    c.translate(x, y);
    c.scale(1, ry / rx);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-rx, -rx, rx * 2, rx * 2);
    c.restore();
  }
  c.restore();
}

// ---------------------------------------------------------------- type
/** Display type the way the app sets it: Geist, tight tracking (-0.04 em). Returns the width. */
export function display(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number,
  o: { weight?: number; color?: string; align?: CanvasTextAlign; tracking?: number; baseline?: CanvasTextBaseline } = {}) {
  c.save();
  c.font = font(F.sans(o.weight ?? 900), size);
  c.letterSpacing = `${(o.tracking ?? -0.04) * size}px`;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.baseline ?? 'alphabetic';
  c.fillStyle = o.color ?? HEX.pen;
  c.fillText(text, x, y);
  const w = c.measureText(text).width;
  c.restore();
  return w;
}

// ---------------------------------------------------------------- the stamp
export interface StampOpts {
  /** Ink colour (palette key or hex). Default: overdue red. */
  color?: PaletteKey | string;
  /** Rotation in radians. Default: a seeded angle within ±7°. */
  angle?: number;
  /** Seed for the ink texture and the default angle. */
  seed?: number;
  /** Draw the double border (a real stamp); false = letters only. Default true. */
  border?: boolean;
  weight?: number;
}
const STAMPS = new Map<string, HTMLCanvasElement>();
/** The stamp's ink as an image (cached): letters + border, with the uneven coverage of a rubber stamp. */
function stampImage(text: string, size: number, o: StampOpts): HTMLCanvasElement {
  const key = `${text}|${size}|${o.seed ?? 0}|${o.border ?? true}|${o.weight ?? 900}`;
  const hit = STAMPS.get(key);
  if (hit) return hit;
  const f = font(F.sans(o.weight ?? 900), size);
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = f;
  m.letterSpacing = `${-0.02 * size}px`;
  const tw = m.measureText(text).width;
  const padX = size * 0.42, padY = size * 0.3, lw = Math.max(3, size * 0.07);
  const w = Math.ceil(tw + padX * 2), h = Math.ceil(size * 0.98 + padY * 2);
  const cv = document.createElement('canvas');
  cv.width = w * SCALE; cv.height = h * SCALE;
  const c = scaleContext2D(cv.getContext('2d')!, SCALE);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  if (o.border ?? true) {
    c.lineWidth = lw;
    roundRect(c, lw, lw, w - 2 * lw, h - 2 * lw, size * 0.16); c.stroke();
    c.lineWidth = lw * 0.45;
    roundRect(c, lw * 2.6, lw * 2.6, w - 5.2 * lw, h - 5.2 * lw, size * 0.11); c.stroke();
  }
  c.font = f;
  c.letterSpacing = `${-0.02 * size}px`;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillText(text, w / 2, h / 2 + size * 0.04);
  // rubber texture: knock out speckles and a few dry streaks
  const rnd = mulberry32(o.seed ?? 7);
  c.globalCompositeOperation = 'destination-out';
  const n = Math.round((w * h) / 90);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const v = noise2(x / (size * 0.35), y / (size * 0.35), o.seed ?? 7);
    if (v < 0.42) continue;
    c.globalAlpha = 0.35 + 0.65 * rnd();
    c.beginPath(); c.arc(x, y, 0.6 + rnd() * size * 0.025 * v, 0, TAU); c.fill();
  }
  c.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) {
    const y = rnd() * h;
    c.fillRect(0, y, w, 1 + rnd() * size * 0.03);
  }
  STAMPS.set(key, cv);
  return cv;
}

/** Size of a stamp (px) before rotation. */
export function stampSize(text: string, size: number, o: StampOpts = {}) {
  const im = stampImage(text, size, o);
  return { w: im.width / SCALE, h: im.height / SCALE };
}

/**
 * Slam a stamp centred at (x, y). `k` = time since the hit (s; negative = not yet). It drops from 1.5×
 * to 1× in 70 ms (ease-in: it *hits*), overshoots a hair, and the ink lands at full strength with a
 * faint spread. Returns the shake (px) to feed `post.shake` for the hit: big at contact, gone in 150 ms.
 */
export function drawStamp(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, k: number, o: StampOpts = {}): number {
  if (k < 0) return 0;
  const im = stampImage(text, size, o);
  const w = im.width / SCALE, h = im.height / SCALE;
  const drop = clamp(k / 0.07);
  const s = drop < 1 ? 1.5 - 0.5 * ease.inQuad(drop) : 1 + 0.025 * Math.exp(-(k - 0.07) * 30) * Math.cos((k - 0.07) * 60);
  const ang = o.angle ?? (hash(o.seed ?? 7, 3) - 0.5) * 0.24;
  const col = (HEX as Record<string, string>)[o.color ?? 'overdue'] ?? o.color ?? HEX.overdue;
  // tint the white mask: draw it into a scratch canvas with source-in
  const tint = tinted(im, col);
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.scale(s, s);
  c.globalAlpha *= drop < 1 ? 0.25 + 0.75 * drop : 1;
  // the ink spreads a little at contact
  if (drop >= 1) {
    c.save();
    c.globalAlpha *= 0.18 * Math.exp(-(k - 0.07) * 6);
    c.filter = `blur(${size * 0.04}px)`;
    c.drawImage(tint, -w / 2, -h / 2, w, h);
    c.restore();
  }
  c.drawImage(tint, -w / 2, -h / 2, w, h);
  c.restore();
  return drop < 1 ? 0 : 14 * Math.exp(-(k - 0.07) * 22);
}
const TINTS = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
function tinted(im: HTMLCanvasElement, col: string) {
  let m = TINTS.get(im);
  if (!m) TINTS.set(im, (m = new Map()));
  const hit = m.get(col);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const c = cv.getContext('2d')!;
  c.drawImage(im, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = col;
  c.fillRect(0, 0, cv.width, cv.height);
  m.set(col, cv);
  return cv;
}

// ---------------------------------------------------------------- the redaction bar
/** Privacy mode's bar: a solid rounded bar in the text colour, over (x, y, w, h). `p` 0..1 = how much of it is drawn, left to right. */
export function drawBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p = 1, color: string = HEX.pen) {
  if (p <= 0) return;
  c.save();
  c.fillStyle = color;
  roundRect(c, x, y, Math.max(h * 0.5, w * clamp(p)), h, Math.min(h * 0.22, 8));
  c.fill();
  c.restore();
}

/**
 * The transition wipe: a black bar sweeps across the frame and redacts it. `p` 0..1: 0..0.5 the bar
 * grows from the left edge until it covers the frame, 0.5..1 it leaves through the right edge. Call it
 * last; draw the outgoing plate while p < 0.5 and the incoming one after. `dir` -1 sweeps right to left.
 */
export function drawWipe(c: CanvasRenderingContext2D, p: number, color: string = HEX.ink, dir = 1) {
  if (p <= 0 || p >= 1) return;
  const a = p < 0.5 ? 0 : ease.inOutCubic((p - 0.5) * 2), b = p < 0.5 ? ease.inOutCubic(p * 2) : 1;
  const x0 = a * W, x1 = b * W;
  c.save();
  c.fillStyle = color;
  if (dir > 0) c.fillRect(x0, 0, x1 - x0, H);
  else c.fillRect(W - x1, 0, x1 - x0, H);
  c.restore();
}

// ---------------------------------------------------------------- status
export type Status = 'overdue' | 'urgent' | 'soon' | 'planned' | 'done';
/** packages/core/src/status.ts: days left + severity -> status. */
export function statusOf(days: number, severity: 'high' | 'medium' | 'low' = 'high'): Status {
  const [u, s] = severity === 'high' ? [30, 90] : severity === 'medium' ? [14, 45] : [7, 21];
  return days < 0 ? 'overdue' : days <= u ? 'urgent' : days <= s ? 'soon' : 'planned';
}
export const STATUS_COLOR: Record<Status, string> = {
  overdue: HEX.overdue, urgent: HEX.urgent, soon: HEX.soon, planned: HEX.muted, done: HEX.done,
};
/** Italian labels, as in apps/web/src/i18n/it.ts. */
export const STATUS_LABEL: Record<Status, string> = {
  overdue: 'Scaduta', urgent: 'Urgente', soon: 'In arrivo', planned: 'Pianificata', done: 'Fatta',
};

/** The app's status chip: a tinted pill with a dot and a label ("● tra 3 gg"). Returns its width. */
export function drawChip(c: CanvasRenderingContext2D, label: string, x: number, y: number, status: Status, size = 22, alpha = 1) {
  const col = STATUS_COLOR[status];
  c.save();
  c.globalAlpha *= alpha;
  c.font = font(F.sans(500), size);
  const tw = c.measureText(label).width;
  const h = size * 1.55, pad = size * 0.6, dot = size * 0.2;
  const w = tw + pad * 2 + dot * 2 + size * 0.4;
  c.fillStyle = rgba(col, 0.13);
  roundRect(c, x, y, w, h, h / 2); c.fill();
  c.fillStyle = col;
  c.beginPath(); c.arc(x + pad + dot, y + h / 2, dot, 0, TAU); c.fill();
  c.textBaseline = 'middle';
  c.fillText(label, x + pad + dot * 2 + size * 0.4, y + h / 2 + size * 0.03);
  c.restore();
  return w;
}

// ---------------------------------------------------------------- devices
/**
 * An iPhone (393×852 pt screen, 1179×2556 captures) showing `img`, centred at (cx, cy), `h` px tall
 * (the body). Black titanium body, the Dynamic Island, a soft contact shadow on light plates.
 * `scroll`: px of the capture (screen pt) scrolled, for the `-full` captures. Returns the screen rect.
 */
export function drawPhone(c: CanvasRenderingContext2D, img: CanvasImageSource | null, cx: number, cy: number, h: number,
  o: { rot?: number; shadow?: number; scroll?: number; island?: boolean; dark?: boolean } = {}) {
  const k = h / 900; // body 432 × 900 units around a 393 × 852 screen
  const bw = 432 * k, bh = 900 * k, sw = 393 * k, sh = 852 * k;
  c.save();
  c.translate(cx, cy);
  if (o.rot) c.rotate(o.rot);
  if ((o.shadow ?? 1) > 0) {
    c.save();
    c.shadowColor = `rgba(0,0,0,${0.35 * (o.shadow ?? 1)})`;
    c.shadowBlur = 60 * k;
    c.shadowOffsetY = 30 * k;
    c.fillStyle = '#111';
    roundRect(c, -bw / 2, -bh / 2, bw, bh, 70 * k); c.fill();
    c.restore();
  }
  // body: a dark rim with a thin highlight edge
  const g = c.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
  g.addColorStop(0, '#3a3a3c'); g.addColorStop(0.5, '#0f0f10'); g.addColorStop(1, '#2a2a2c');
  c.fillStyle = g;
  roundRect(c, -bw / 2, -bh / 2, bw, bh, 70 * k); c.fill();
  c.fillStyle = '#050505';
  roundRect(c, -bw / 2 + 5 * k, -bh / 2 + 5 * k, bw - 10 * k, bh - 10 * k, 66 * k); c.fill();
  // screen
  const sx = -sw / 2, sy = -sh / 2;
  c.save();
  roundRect(c, sx, sy, sw, sh, 52 * k); c.clip();
  c.fillStyle = HEX.paper;
  c.fillRect(sx, sy, sw, sh);
  if (img) {
    const iw = (img as ImageBitmap).width, ih = (img as ImageBitmap).height;
    const scale = sw / iw;
    c.drawImage(img, sx, sy - (o.scroll ?? 0) * k * (393 / 393), sw, ih * scale);
  }
  c.restore();
  if (o.island ?? true) {
    c.fillStyle = '#000';
    roundRect(c, -62 * k, sy + 11 * k, 124 * k, 36 * k, 18 * k); c.fill();
  }
  c.restore();
  return { x: cx + sx, y: cy + sy, w: sw, h: sh, k };
}

/**
 * A browser window (macOS, light) showing a desktop capture at `w` px wide, top-left (x, y). The
 * address bar reads `autocratico.casa` — a made-up host, the app runs on your own machine.
 * Returns the content rect.
 */
export function drawBrowser(c: CanvasRenderingContext2D, img: CanvasImageSource | null, x: number, y: number, w: number,
  o: { shadow?: number; url?: string; scroll?: number } = {}) {
  const k = w / 1440, bar = 52 * k, h = 900 * k + bar;
  c.save();
  if ((o.shadow ?? 1) > 0) {
    c.save();
    c.shadowColor = `rgba(0,0,0,${0.28 * (o.shadow ?? 1)})`;
    c.shadowBlur = 80 * k; c.shadowOffsetY = 36 * k;
    c.fillStyle = '#fff';
    roundRect(c, x, y, w, h, 18 * k); c.fill();
    c.restore();
  }
  c.save();
  roundRect(c, x, y, w, h, 18 * k); c.clip();
  c.fillStyle = '#f6f6f6';
  c.fillRect(x, y, w, bar);
  c.fillStyle = HEX.bezel;
  c.fillRect(x, y + bar - 1, w, 1);
  [['#ff5f57'], ['#febc2e'], ['#28c840']].forEach(([col], i) => {
    c.fillStyle = col!;
    c.beginPath(); c.arc(x + (26 + i * 22) * k, y + bar / 2, 7 * k, 0, TAU); c.fill();
  });
  c.fillStyle = '#ebebeb';
  roundRect(c, x + w / 2 - 260 * k, y + 12 * k, 520 * k, bar - 24 * k, 8 * k); c.fill();
  c.fillStyle = HEX.graphite;
  c.font = font(F.sans(500), 15 * k);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(o.url ?? 'autocratico.casa', x + w / 2, y + bar / 2 + 1);
  c.fillStyle = HEX.paper;
  c.fillRect(x, y + bar, w, h - bar);
  if (img) {
    const iw = (img as ImageBitmap).width, ih = (img as ImageBitmap).height;
    c.drawImage(img, x, y + bar - (o.scroll ?? 0) * k, w, (ih * w) / iw);
  }
  c.restore();
  c.restore();
  return { x, y: y + bar, w, h: h - bar, k };
}

// ---------------------------------------------------------------- the icon
/** The app icon (apps/web/public/icons/icon.svg): a light "A" on a #1a1a1a rounded square, `s` px. */
export function drawIcon(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, o: { shadow?: number } = {}) {
  const k = s / 100;
  c.save();
  c.translate(cx - s / 2, cy - s / 2);
  if (o.shadow) {
    c.shadowColor = `rgba(0,0,0,${0.4 * o.shadow})`; c.shadowBlur = 0.3 * s; c.shadowOffsetY = 0.12 * s;
  }
  c.fillStyle = '#1a1a1a';
  roundRect(c, 0, 0, s, s, 22 * k); c.fill();
  c.shadowColor = 'transparent';
  c.scale(k, k);
  c.fillStyle = '#ececec';
  c.fill(new Path2D('M44 20h12l21 60H64l-4.5-15h-19L36 80H23zm-6 36h24l-12-34z'), 'evenodd');
  c.restore();
}

// ---------------------------------------------------------------- the orb
/** The liquid chrome orb (apps/web .chrome-orb) of radius r at (cx, cy); `t` drives its 9 s float. */
export function drawOrb(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, t = 0) {
  const fy = -Math.sin((t / 9) * TAU) * r * 0.06, rot = Math.sin((t / 9) * TAU) * 0.07;
  c.save();
  c.translate(cx, cy + fy);
  c.rotate(rot);
  // drop shadow
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = r * 0.5; c.shadowOffsetY = r * 0.5;
  c.fillStyle = '#1f1f1f';
  c.beginPath(); c.arc(0, 0, r * 0.98, 0, TAU); c.fill();
  c.restore();
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip();
  let g = c.createRadialGradient(-0.2 * r, -0.3 * r, 0, -0.2 * r, -0.3 * r, 1.45 * r);
  g.addColorStop(0, '#f4f4f4'); g.addColorStop(0.27, '#a9a9a9'); g.addColorStop(0.5, '#3b3b3b'); g.addColorStop(0.72, '#111');
  c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
  g = c.createRadialGradient(0.4 * r, 0.56 * r, 0, 0.4 * r, 0.56 * r, 0.52 * r);
  g.addColorStop(0, 'rgba(210,210,210,0.8)'); g.addColorStop(1, 'rgba(210,210,210,0)');
  c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
  g = c.createRadialGradient(-0.36 * r, -0.48 * r, 0, -0.36 * r, -0.48 * r, 0.28 * r);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
  // inner shading of the rim
  g = c.createRadialGradient(-0.15 * r, -0.2 * r, r * 0.6, 0, 0, r * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
  c.restore();
}

// ---------------------------------------------------------------- helpers
export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Time since the k-th hit of a list of times (the last one at or before t), or -1. */
export function since(t: number, times: number[]): { i: number; k: number } {
  let i = -1;
  for (let j = 0; j < times.length; j++) if (times[j]! <= t) i = j;
  return { i, k: i < 0 ? -1 : t - times[i]! };
}
