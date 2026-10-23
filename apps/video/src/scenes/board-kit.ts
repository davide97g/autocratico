// The Board promo's pieces (?film=board): the two widgets redrawn as vectors in the app's own style (so
// they can be animated and shot big), a card in perspective, the captions, the pointer and the sandbox.
// Numbers are the demo register's (made up), as the captures in public/board/ show them.
import * as THREE from 'three';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, TAU } from '../engine/util';
import { roundRect } from './_motifs';

// ---------------------------------------------------------------- the app's tokens (apps/web/src/index.css)
export const T = {
  ink: '#0A0A0A',
  pen: '#171717',
  fg: '#0F0F0F',
  muted: '#737373',
  border: '#E5E5E5',
  card: '#FDFDFD',
  well: '#F5F5F5',
  studio: '#E6E6E6',
  chart: ['#D4D4D4', '#737373', '#525252', '#404040', '#262626'],
  moneyOut: '#CF6963',
  moneyOutMuted: '#E2AFAA',
  soon: '#EFA810',
  urgent: '#E95C12',
  overdue: '#DC2627',
} as const;

export const eur = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
export const eurShort = (n: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function setFont(c: CanvasRenderingContext2D, weight: number, size: number, tracking = 0) {
  c.font = font(F.sans(weight), size);
  c.letterSpacing = `${tracking * size}px`;
}
export function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, o: { weight?: number; color?: string; align?: CanvasTextAlign; tracking?: number; alpha?: number; mono?: boolean } = {}) {
  c.save();
  if (o.mono) {
    c.font = font(F.mono(o.weight ?? 400), size);
    c.letterSpacing = '0px';
  } else setFont(c, o.weight ?? 400, size, o.tracking ?? 0);
  c.fillStyle = o.color ?? T.fg;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'alphabetic';
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  c.fillText(s, x, y);
  const w = c.measureText(s).width;
  c.restore();
  return w;
}

// ---------------------------------------------------------------- a card in perspective
export interface Pose {
  x: number; y: number;
  s?: number;
  rx?: number; ry?: number; rz?: number;
  z?: number;
}

/**
 * A Canvas2D surface (`w`×`h` logical px, `res` backing px per logical px) on a plane seen through a long
 * lens: 1 layer px = 1 screen px at z = 0 and s = 1. Mipmapped, so a big capture shown small stays clean.
 * Draw into `ctx`, call `touch()` when it changed, then `render()`.
 */
export class Card3D {
  layer: Layer2D;
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  private dirty = true;
  key = '';
  constructor(public w: number, public h: number, res?: number, fov = 24) {
    this.layer = new Layer2D(w, h, res);
    const tex = this.layer.texture;
    tex.premultiplyAlpha = true;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 8;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
    this.scene.add(this.mesh);
    this.cam = new THREE.PerspectiveCamera(fov, W / H, 10, 200000);
    const dist = (H / 2) / Math.tan((fov / 2) * Math.PI / 180);
    this.cam.position.set(0, 0, dist);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateMatrixWorld();
  }
  get ctx() { return this.layer.ctx; }
  /** Redraw only when `key` changes (the output stays a function of time: the key is derived from it). */
  draw(key: string, fn: (c: CanvasRenderingContext2D) => void) {
    if (key === this.key) return;
    this.key = key;
    this.layer.clear();
    fn(this.layer.ctx);
    this.dirty = true;
  }
  /** Upload the layer if it changed since the last upload. */
  sync() {
    if (this.dirty) { this.layer.upload(); this.dirty = false; }
  }
  private place(p: Pose) {
    const m = this.mesh;
    m.position.set(p.x - W / 2, H / 2 - p.y, p.z ?? 0);
    m.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'YXZ');
    m.scale.setScalar(p.s ?? 1);
    m.updateMatrixWorld();
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, p: Pose, opacity = 1) {
    if (opacity <= 0.001) return;
    this.place(p);
    this.sync();
    this.mat.opacity = opacity;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(out);
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
  }
  /** Screen position of layer point (u, v) for pose `p`. */
  project(u: number, v: number, p: Pose) {
    this.place(p);
    const q = new THREE.Vector3(u - this.w / 2, this.h / 2 - v, 0).applyMatrix4(this.mesh.matrixWorld).project(this.cam);
    return { x: (q.x * 0.5 + 0.5) * W, y: (0.5 - q.y * 0.5) * H };
  }
  corners(p: Pose) {
    return [this.project(0, 0, p), this.project(this.w, 0, p), this.project(this.w, this.h, p), this.project(0, this.h, p)];
  }
}

/** A soft shadow under a quad of screen corners. */
export function shadowUnder(c: CanvasRenderingContext2D, q: { x: number; y: number }[], o: { blur?: number; dy?: number; alpha?: number; inset?: number } = {}) {
  const blur = o.blur ?? 70, dy = o.dy ?? 40, a = o.alpha ?? 0.22, ins = o.inset ?? 0.04;
  const cx = q.reduce((s, p) => s + p.x, 0) / q.length, cy = q.reduce((s, p) => s + p.y, 0) / q.length;
  c.save();
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowBlur = blur;
  c.shadowOffsetY = dy + 6000;
  c.fillStyle = '#000';
  c.beginPath();
  q.forEach((p, i) => {
    const x = p.x + (cx - p.x) * ins, y = p.y + (cy - p.y) * ins - 6000;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  });
  c.closePath();
  c.fill();
  c.restore();
}

// ---------------------------------------------------------------- the Board card around a widget
/** The Board's card (rounded-xl, white, title). Returns the content box. */
export function boardCard(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, k: number, o: { code?: boolean } = {}) {
  c.save();
  c.fillStyle = T.card;
  roundRect(c, x, y, w, h, 14 * k); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.07)';
  c.lineWidth = 1 * k;
  roundRect(c, x + 0.5 * k, y + 0.5 * k, w - k, h - k, 14 * k); c.stroke();
  const tw = text(c, title, x + 24 * k, y + 44 * k, 17 * k, { weight: 500, tracking: -0.02 });
  if (o.code) codeGlyph(c, x + 24 * k + tw + 16 * k, y + 39 * k, 7 * k, T.muted);
  c.restore();
  return { x: x + 24 * k, y: y + 74 * k, w: w - 48 * k, h: h - 98 * k };
}
/** The lucide "code" icon: < >. */
export function codeGlyph(c: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  c.save();
  c.strokeStyle = color; c.lineWidth = s * 0.28; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(cx - s * 0.25, cy - s * 0.75); c.lineTo(cx - s, cy); c.lineTo(cx - s * 0.25, cy + s * 0.75);
  c.moveTo(cx + s * 0.25, cy - s * 0.75); c.lineTo(cx + s, cy); c.lineTo(cx + s * 0.25, cy + s * 0.75);
  c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- widget 1: payments by area (catalog)
export const AREAS = [
  { name: 'Casa', value: 2482.5, color: T.chart[0] },
  { name: 'Veicoli', value: 598.72, color: T.chart[2] },
  { name: 'Fisco', value: 320.0, color: T.chart[3] },
];
export const AREAS_TOTAL = AREAS.reduce((s, a) => s + a.value, 0);

/**
 * "Pagamenti per area, 6 mesi": a Metric, a donut, the legend and a muted note, as the catalog renders them.
 * `p`: 0..1 reveal phases { number, donut, legend (0..3 rows), note }.
 */
export function donutWidget(c: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, p: { number: number; donut: number; legend: number; note: number }) {
  text(c, 'Totale da pagare', x, y + 14 * k, 13 * k, { color: T.muted });
  const shown = AREAS_TOTAL * ease.outQuart(clamp(p.number));
  text(c, eur(Math.round(shown * 100) / 100), x, y + 52 * k, 32 * k, { weight: 500, tracking: -0.03, alpha: clamp(p.number * 4) });
  // donut
  const cx = x + w / 2, cy = y + 160 * k, R = 82 * k, r = 50 * k;
  let a0 = -Math.PI / 2;
  const sweep = ease.inOutCubic(clamp(p.donut));
  for (const [i, a] of AREAS.entries()) {
    const span = (a.value / AREAS_TOTAL) * TAU;
    const a1 = a0 + span;
    const end = Math.min(a1, -Math.PI / 2 + sweep * TAU);
    if (end > a0) {
      c.beginPath();
      c.arc(cx, cy, R, a0, end);
      c.arc(cx, cy, r, end, a0, true);
      c.closePath();
      c.fillStyle = a.color;
      c.fill();
      // the 2 px card-coloured stroke between slices
      c.strokeStyle = T.card; c.lineWidth = 2 * k; c.stroke();
    }
    a0 = a1;
    void i;
  }
  // legend
  for (const [i, a] of AREAS.entries()) {
    const q = clamp(p.legend - i);
    if (q <= 0) continue;
    const e = ease.outCubic(q);
    const ly = y + 282 * k + i * 26 * k + (1 - e) * 10 * k;
    c.save();
    c.globalAlpha *= e;
    c.fillStyle = a.color;
    roundRect(c, x, ly - 10 * k, 10 * k, 10 * k, 2 * k); c.fill();
    text(c, a.name, x + 18 * k, ly, 14 * k);
    text(c, eur(a.value), x + w, ly, 14 * k, { color: T.muted, align: 'right' });
    c.restore();
  }
  if (p.note > 0) text(c, 'Le stime vengono dagli importi degli anni scorsi.', x, y + 372 * k, 13 * k, { color: T.muted, alpha: ease.outCubic(clamp(p.note)) });
  return 390 * k;
}

// ---------------------------------------------------------------- widget 2: the payments heatmap (custom code)
export const MONTHS = ['ott', 'nov', 'dic', 'gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set'];
export const MONTH_SUM = [180, 1128.92, 590.5, 312, 1012.3, 96.5, 142, 431.8, 386.2, 302, 198, 256];
export const HEAT_TOTAL = MONTH_SUM.reduce((s, v) => s + v, 0);
export const MONTH_ROWS: Record<number, [string, string, number][]> = {
  0: [['Rata condominio', '23 ott', 180]],
  1: [['Affitto box auto', '5 nov', 90], ['Manutenzione caldaia', '8 nov', 112.5], ['Facciata, rata straordinaria 1/3', '23 nov', 420], ['Bollo auto', '30 nov', 186.42], ['Secondo acconto IRPEF', '30 nov', 320]],
  4: [['Rinnovo RC auto', '18 feb', 412.3], ['Facciata, rata straordinaria 2/3', '23 feb', 420], ['Rata condominio', '23 feb', 180]],
};
const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / Math.max(...MONTH_SUM)) * 4)));
const LEVEL_FILL = ['#F5F5F5', 'mix30', 'mix55', 'mix80', T.moneyOut];
function levelColor(l: number) {
  if (l === 0) return T.well;
  if (l === 4) return T.moneyOut;
  const m = [0, 0.3, 0.55, 0.8][l]!;
  // color-mix(in oklab, money-out m, muted): close enough in sRGB for these light tints
  const a = [0xcf, 0x69, 0x63], b = [0xf5, 0xf5, 0xf5];
  return `rgb(${a.map((v, i) => Math.round(lerp(b[i]!, v, m))).join(',')})`;
}
void LEVEL_FILL;

/**
 * The custom widget: a total, twelve month cells (tint = how much is due), the selected month's payments.
 * `cells(i)` 0..1: each cell's arrival; `sel`: selected month index (fractional = the outline sliding);
 * `rows` 0..n: rows revealed; `number` 0..1.
 */
export function heatmapWidget(c: CanvasRenderingContext2D, x: number, y: number, w: number, k: number,
  p: { number: number; cells: (i: number) => number; glow?: (i: number) => number; sel: number; selOn: number; rows: number; month: number }) {
  const shown = HEAT_TOTAL * ease.outQuart(clamp(p.number));
  text(c, eur(Math.round(shown * 100) / 100), x, y + 30 * k, 30 * k, { weight: 500, tracking: -0.02, alpha: clamp(p.number * 4) });
  text(c, 'prossimi 12 mesi', x + w, y + 26 * k, 13 * k, { color: T.muted, align: 'right', alpha: clamp(p.number * 3) });
  const gap = 7 * k, cw = (w - gap * 11) / 12, cy = y + 58 * k;
  for (let i = 0; i < 12; i++) {
    const q = clamp(p.cells(i));
    if (q <= 0) continue;
    const cx = x + i * (cw + gap);
    const e = ease.outBack(q, 2.2);
    c.save();
    c.translate(cx + cw / 2, cy + cw / 2);
    c.scale(e, e);
    c.globalAlpha *= clamp(q * 3);
    const g = p.glow?.(i) ?? 0;
    c.fillStyle = levelColor(level(MONTH_SUM[i]!));
    if (g > 0.01) {
      // the light it lands with: a halo behind, the cell itself stays sharp
      c.save();
      c.shadowColor = `rgba(207,105,99,${0.9 * g})`; c.shadowBlur = 30 * k * g;
      roundRect(c, -cw / 2, -cw / 2, cw, cw, 6 * k); c.fill();
      c.restore();
    }
    roundRect(c, -cw / 2, -cw / 2, cw, cw, 6 * k); c.fill();
    c.restore();
    text(c, MONTHS[i]!.replace(/^./, (m) => m.toUpperCase()), cx + cw / 2, cy + cw + 16 * k, 11 * k, { color: T.muted, align: 'center', alpha: clamp(q * 2 - 0.5) });
  }
  // the selection outline slides between cells
  if (p.selOn > 0) {
    const sx = x + p.sel * (cw + gap);
    c.save();
    c.globalAlpha *= clamp(p.selOn);
    c.strokeStyle = T.fg; c.lineWidth = 2.2 * k;
    roundRect(c, sx - 2.5 * k, cy - 2.5 * k, cw + 5 * k, cw + 5 * k, 8 * k); c.stroke();
    c.restore();
  }
  const rows = MONTH_ROWS[p.month] ?? [];
  for (const [i, [title, date, amount]] of rows.entries()) {
    const q = clamp(p.rows - i);
    if (q <= 0) continue;
    const e = ease.outCubic(q);
    const ry = cy + cw + 52 * k + i * 30 * k;
    c.save();
    c.globalAlpha *= e;
    c.translate((1 - e) * 16 * k, 0);
    text(c, title, x + 6 * k, ry, 13 * k);
    text(c, `${date} · ${eur(amount)}`, x + w - 6 * k, ry, 13 * k, { color: T.muted, align: 'right' });
    c.restore();
  }
}

// ---------------------------------------------------------------- the chat's pieces
export function primaryButton(c: CanvasRenderingContext2D, label: string, x: number, y: number, k: number, o: { icon?: 'plus' | 'play'; press?: number } = {}) {
  setFont(c, 500, 13 * k);
  const tw = c.measureText(label).width;
  const w = tw + (o.icon ? 46 : 26) * k, h = 32 * k;
  const press = o.press ?? 0;
  c.save();
  c.translate(x + w / 2, y + h / 2);
  c.scale(1 - 0.06 * press, 1 - 0.06 * press);
  c.fillStyle = T.pen;
  roundRect(c, -w / 2, -h / 2, w, h, 8 * k); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 1.6 * k; c.lineCap = 'round'; c.lineJoin = 'round';
  const ix = -w / 2 + 18 * k;
  if (o.icon === 'plus') { c.beginPath(); c.moveTo(ix - 5 * k, 0); c.lineTo(ix + 5 * k, 0); c.moveTo(ix, -5 * k); c.lineTo(ix, 5 * k); c.stroke(); }
  if (o.icon === 'play') { c.beginPath(); c.moveTo(ix - 4 * k, -5.5 * k); c.lineTo(ix + 5 * k, 0); c.lineTo(ix - 4 * k, 5.5 * k); c.closePath(); c.stroke(); }
  text(c, label, -w / 2 + (o.icon ? 32 : 13) * k, 4.5 * k, 13 * k, { weight: 500, color: '#FAFAFA' });
  c.restore();
  return { x, y, w, h };
}

/** The macOS pointer at (x, y) (its tip), `press` 0..1 squeezes it. */
export function pointer(c: CanvasRenderingContext2D, x: number, y: number, s = 1, press = 0) {
  c.save();
  c.translate(x, y);
  c.scale(s * (1 - 0.12 * press), s * (1 - 0.12 * press));
  c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 10; c.shadowOffsetY = 3;
  const path = new Path2D('M0 0 L0 23 L5.6 17.6 L9.4 26.4 L13.4 24.7 L9.7 16.2 L17.2 16.2 Z');
  c.fillStyle = '#000'; c.fill(path);
  c.shadowColor = 'transparent';
  c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke(path);
  c.restore();
}
/** A click: a ring that grows and fades from (x, y), `k` seconds after the click. */
export function clickRing(c: CanvasRenderingContext2D, x: number, y: number, k: number, color = 'rgba(15,15,15,') {
  if (k < 0 || k > 0.7) return;
  const e = ease.outCubic(k / 0.7);
  c.save();
  c.strokeStyle = `${color}${0.45 * (1 - e)})`;
  c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, 8 + 46 * e, 0, TAU); c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- captions
export interface CaptionSpec {
  at: number;
  out: number;
  lines: { text: string; size: number; weight?: number; color?: string }[];
  x: number;
  y: number;
  align?: CanvasTextAlign;
  gap?: number;
  /** Seconds to leave (default 0.45). */
  exit?: number;
}
/**
 * Keynote captions: each word rises out of a mask, a word after the other; on the way out the block
 * lifts and fades with a touch of blur.
 */
export function caption(c: CanvasRenderingContext2D, t: number, s: CaptionSpec) {
  const exit = s.exit ?? 0.45;
  if (t < s.at - 0.05 || t > s.out + exit + 0.05) return;
  const outP = ease.inCubic(clamp((t - s.out) / exit));
  let y = s.y;
  let wi = 0;
  c.save();
  if (outP > 0) {
    c.globalAlpha *= 1 - outP;
    c.filter = `blur(${(outP * 10).toFixed(2)}px)`;
    c.translate(0, -outP * 26);
  }
  for (const [li, line] of s.lines.entries()) {
    const size = line.size, weight = line.weight ?? 700;
    setFont(c, weight, size, -0.04);
    const words = line.text.split(' ');
    const widths = words.map((w) => c.measureText(w).width);
    const space = c.measureText(' ').width;
    const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    let x = s.align === 'center' ? s.x - total / 2 : s.align === 'right' ? s.x - total : s.x;
    for (const [i, w] of words.entries()) {
      const p = clamp((t - (s.at + wi * 0.07 + li * 0.12)) / 0.55);
      wi++;
      if (p > 0) {
        const e = ease.outQuart(p);
        c.save();
        c.beginPath();
        c.rect(x - size * 0.2, y - size * 1.05, widths[i]! + size * 0.4, size * 1.4);
        c.clip();
        c.globalAlpha *= clamp(e * 1.4);
        c.fillStyle = line.color ?? T.fg;
        c.textBaseline = 'alphabetic';
        c.fillText(w, x, y + (1 - e) * size * 0.95);
        c.restore();
      }
      x += widths[i]! + space;
    }
    y += size * (s.gap ?? 1.18) + (s.lines[li + 1] ? (s.lines[li + 1]!.size < size ? size * 0.12 : 0) : 0);
  }
  c.restore();
}

// ---------------------------------------------------------------- the sandbox: a glass box in lines
/** A cube of edges around (cx, cy) of half-size `r`, turned by `a`, drawn up to `p` (0..1) of its edges. */
export function sandboxBox(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, a: number, p: number, glow: number, color = '255,255,255') {
  const V: [number, number, number][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y * 0.72, z * 0.55]);
  const E: [number, number][] = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const tilt = -0.42;
  const P = V.map(([x, y, z]) => {
    const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
    const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt), z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
    const f = 3.2 / (3.2 + z2);
    return { x: cx + x1 * r * f, y: cy + y2 * r * f };
  });
  c.save();
  c.lineCap = 'round';
  c.strokeStyle = `rgba(${color},${0.85})`;
  c.lineWidth = 2;
  c.shadowColor = `rgba(${color},${0.9 * glow})`;
  c.shadowBlur = 24 * glow;
  const n = p * E.length;
  E.forEach(([i, j], k) => {
    const q = clamp(n - k);
    if (q <= 0) return;
    const A = P[i]!, B = P[j]!;
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(lerp(A.x, B.x, q), lerp(A.y, B.y, q)); c.stroke();
  });
  // corner nodes
  if (p > 0.6) for (const q of P) { c.fillStyle = `rgba(${color},${clamp((p - 0.6) * 2.5)})`; c.beginPath(); c.arc(q.x, q.y, 3.2, 0, TAU); c.fill(); }
  c.restore();
  return P;
}
