// Shared helpers for the chorus plates (inbox, hero, italia): a Canvas2D surface mapped on a plane in
// perspective (devices that tilt like products), capture preprocessing (no green before "Fatto!"),
// the app's small UI pieces (shadcn Badge, lucide icons) and the calm word reveal.
import * as THREE from 'three';
import { Layer2D, W, H, SCALE, scaleContext2D } from '../engine/gl';
import { HEX, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, TAU } from '../engine/util';
import { roundRect, loadImage } from './_motifs';

// ---------------------------------------------------------------- devices in perspective
export interface Pose {
  /** Screen position (logical px) of the plane's centre. */
  x: number; y: number;
  /** Uniform scale (1 = the layer's logical px on screen at z = 0). */
  s?: number;
  /** Rotations (radians): rx tilts top away (+), ry turns the right side away (+), rz rolls. */
  rx?: number; ry?: number; rz?: number;
  /** Depth offset (px, + = towards the camera). */
  z?: number;
}

/**
 * A Canvas2D surface (`w`×`h` logical px) drawn on a plane with a long-lens perspective camera, so a
 * phone or a browser window can turn a few degrees like a product. 1 layer px = 1 screen px at z = 0.
 */
export class Plane3D {
  layer: Layer2D;
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  dist: number;
  constructor(public w: number, public h: number, fov = 22) {
    this.layer = new Layer2D(w, h);
    const tex = this.layer.texture;
    tex.premultiplyAlpha = true;
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.scene.add(this.mesh);
    this.cam = new THREE.PerspectiveCamera(fov, W / H, 10, 100000);
    this.dist = (H / 2) / Math.tan((fov / 2) * Math.PI / 180);
    this.cam.position.set(0, 0, this.dist);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateMatrixWorld();
  }
  get ctx() { return this.layer.ctx; }
  private place(p: Pose) {
    const m = this.mesh;
    m.position.set(p.x - W / 2, H / 2 - p.y, p.z ?? 0);
    m.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'YXZ');
    m.scale.setScalar(p.s ?? 1);
    m.updateMatrixWorld();
  }
  /** Draw the plane (after drawing into `ctx`) over `out`. */
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, p: Pose, opacity = 1) {
    this.place(p);
    this.layer.upload();
    this.mat.opacity = opacity;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
  }
  /** Where a point of the layer (logical px, origin top-left) lands on screen for pose `p`. */
  project(u: number, v: number, p: Pose) {
    this.place(p);
    const q = new THREE.Vector3(u - this.w / 2, this.h / 2 - v, 0).applyMatrix4(this.mesh.matrixWorld).project(this.cam);
    return { x: (q.x * 0.5 + 0.5) * W, y: (0.5 - q.y * 0.5) * H };
  }
  /** The plane's screen-space corners (for shadows). */
  corners(p: Pose) {
    return [this.project(0, 0, p), this.project(this.w, 0, p), this.project(this.w, this.h, p), this.project(0, this.h, p)];
  }
}

/** A soft contact shadow under a quad (screen corners), drawn on the background layer. */
export function quadShadow(c: CanvasRenderingContext2D, q: { x: number; y: number }[], o: { blur?: number; dy?: number; alpha?: number; r?: number; inset?: number } = {}) {
  const blur = o.blur ?? 60, dy = o.dy ?? 30, a = o.alpha ?? 0.3, ins = o.inset ?? 0;
  const cx = (q[0]!.x + q[1]!.x + q[2]!.x + q[3]!.x) / 4, cy = (q[0]!.y + q[1]!.y + q[2]!.y + q[3]!.y) / 4;
  c.save();
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowBlur = blur;
  c.shadowOffsetY = dy + 4000;
  c.fillStyle = '#000';
  c.beginPath();
  q.forEach((pt, i) => {
    const x = pt.x + (cx - pt.x) * ins, y = pt.y + (cy - pt.y) * ins - 4000;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  });
  c.closePath();
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------- captures
/** A canvas the size of `img` (at most `maxW` px wide) with `fn` applied to its pixels. */
function process(img: ImageBitmap, fn: ((d: Uint8ClampedArray) => void) | null, filter = 'none', maxW = 1e9): HTMLCanvasElement {
  const k = Math.min(1, maxW / img.width);
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  const c = cv.getContext('2d', { willReadFrequently: !!fn })!;
  c.filter = filter;
  c.drawImage(img, 0, 0, cv.width, cv.height);
  c.filter = 'none';
  if (fn) {
    const id = c.getImageData(0, 0, cv.width, cv.height);
    fn(id.data);
    c.putImageData(id, 0, 0);
  }
  return cv;
}
/** Green (done) is held back until the break: turn green-dominant pixels into their grey. */
function stripGreen(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    if (g > r + 8 && g > b + 4) {
      const y = 0.3 * r + 0.59 * g + 0.11 * b;
      d[i] = d[i + 1] = d[i + 2] = y;
    }
  }
}
function greyAll(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
}
const CAPS = new Map<string, Promise<ImageBitmap>>();
/** A capture from public/app/ with every green pixel turned grey (cached). */
export function capture(path: string): Promise<ImageBitmap> {
  let p = CAPS.get(path);
  if (!p) {
    p = loadImage(path).then((im) => createImageBitmap(process(im, stripGreen)));
    CAPS.set(path, p);
  }
  return p;
}
/** The capture in greys (for "the colour lights up"). */
export async function greyCapture(path: string): Promise<ImageBitmap> {
  const im = await loadImage(path);
  return createImageBitmap(process(im, greyAll));
}
/** A soft, smaller copy (depth of field behind a hero object). */
export async function blurredCapture(path: string, blurPx: number, maxW = 1440): Promise<ImageBitmap> {
  const im = await capture(path);
  return createImageBitmap(process(im, null, `blur(${blurPx}px)`, maxW));
}

/** An offscreen canvas in logical px (backing store SCALE×). */
export function offscreen(w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * SCALE); cv.height = Math.round(h * SCALE);
  const c = scaleContext2D(cv.getContext('2d')!, SCALE);
  return { cv, c, w, h };
}

// ---------------------------------------------------------------- app UI pieces
/** shadcn Badge: h-5, rounded-md, px-2, text-xs medium (in `u` px per CSS px). Returns its width. */
export function badge(c: CanvasRenderingContext2D, label: string, x: number, y: number, u: number,
  o: { bg: string; fg: string; dot?: string; align?: 'left' | 'right' } ) {
  c.save();
  c.font = font(F.sans(500), 12 * u);
  const tw = c.measureText(label).width;
  const dotW = o.dot ? 10 * u : 0;
  const w = tw + 16 * u + dotW, h = 20 * u;
  const x0 = o.align === 'right' ? x - w : x;
  c.fillStyle = o.bg;
  roundRect(c, x0, y, w, h, 8 * u); c.fill();
  if (o.dot) {
    c.fillStyle = o.dot;
    c.beginPath(); c.arc(x0 + 8 * u + 3 * u, y + h / 2, 3 * u, 0, TAU); c.fill();
  }
  c.fillStyle = o.fg;
  c.textBaseline = 'middle';
  c.fillText(label, x0 + 8 * u + dotW, y + h / 2 + 0.5 * u);
  c.restore();
  return w;
}

type IconName = 'mail' | 'send' | 'phone' | 'upload' | 'bell' | 'check' | 'arrow' | 'rotate';
/** A few lucide icons (24-unit paths, stroke 2), drawn `s` px at (x, y) top-left. */
export function icon(c: CanvasRenderingContext2D, name: IconName, x: number, y: number, s: number, color: string = HEX.pen, lw = 2) {
  const k = s / 24;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const P = (d: string) => c.stroke(new Path2D(d));
  switch (name) {
    case 'mail': P('M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'); P('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'); break;
    case 'send': P('M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z'); P('m21.854 2.147-10.94 10.939'); break;
    case 'phone': P('M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'); P('M12 18h.01'); break;
    case 'upload': P('M12 3v12'); P('m17 8-5-5-5 5'); P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'); break;
    case 'bell': P('M10.268 21a2 2 0 0 0 3.464 0'); P('M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'); break;
    case 'check': P('M20 6 9 17l-5-5'); break;
    case 'arrow': P('M7 7h10v10'); P('M7 17 17 7'); break;
    case 'rotate': P('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'); P('M3 3v5h5'); break;
  }
  c.restore();
}

/** The severity bars of the app (three ascending bars, `n` lit). */
export function bars(c: CanvasRenderingContext2D, x: number, y: number, u: number, n: number, on: string, off: string) {
  for (let i = 0; i < 4; i++) {
    const h = (3 + i * 3) * u;
    c.fillStyle = i < n ? on : off;
    roundRect(c, x + i * 3.6 * u, y - h, 1.8 * u, h, 0.9 * u); c.fill();
  }
}

/** Truncate `s` with an ellipsis to fit `max` px in the current font. */
export function truncate(c: CanvasRenderingContext2D, s: string, max: number) {
  if (c.measureText(s).width <= max) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (c.measureText(s.slice(0, m).trimEnd() + '…').width <= max) lo = m; else hi = m - 1;
  }
  return s.slice(0, lo).trimEnd() + '…';
}

/** Word-wrap `s` to `max` px in the current font. */
export function wrap(c: CanvasRenderingContext2D, s: string, max: number) {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

// ---------------------------------------------------------------- type
/**
 * A word set calmly: it rises into place through a mask as it is sung (`p` 0..1 over the word's first
 * part), Geist with the app's tight tracking. Returns the advance (px).
 */
export function riseWord(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, p: number,
  o: { weight?: number; color?: string; tracking?: number; align?: CanvasTextAlign } = {}) {
  c.save();
  c.font = font(F.sans(o.weight ?? 900), size);
  c.letterSpacing = `${(o.tracking ?? -0.04) * size}px`;
  c.textAlign = o.align ?? 'left';
  const w = c.measureText(text).width;
  if (p > 0) {
    const e = ease.outCubic(clamp(p));
    c.beginPath();
    const x0 = o.align === 'right' ? x - w - size : o.align === 'center' ? x - w / 2 - size : x - size * 0.2;
    c.rect(x0, y - size * 1.05, w + size * 1.4, size * 1.38);
    c.clip();
    c.globalAlpha *= clamp(e * 1.6);
    c.fillStyle = o.color ?? HEX.pen;
    c.fillText(text, x, y + (1 - e) * size * 0.9);
  }
  c.restore();
  return w;
}

/** Measure Geist text with the display tracking. */
export function textW(c: CanvasRenderingContext2D, text: string, size: number, weight = 900, tracking = -0.04) {
  c.save();
  c.font = font(F.sans(weight), size);
  c.letterSpacing = `${tracking * size}px`;
  const w = c.measureText(text).width;
  c.restore();
  return w;
}

export { rgba };
