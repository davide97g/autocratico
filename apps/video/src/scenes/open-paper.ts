// The paperwork kit shared by the first-half plates (open, pile, queue): paper objects drawn with
// care (real form structures, believable Italian print), baked once into sprites with soft studio
// shadows, plus small motion and karaoke helpers. Greys only, red for stamps and errors, and the one
// desaturated green of the registered-mail envelope. Made-up figures are always redaction bars.
import { HEX, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { SCALE, W, H } from '../engine/gl';
import { clamp, ease, hash, mulberry32, TAU } from '../engine/util';
import { roundRect } from './_motifs';
import { strokeText, drawStrokeText, type StrokeFontName } from '../engine/stroke';
import type { Line, Word } from '../engine/lyrics';

/** Backing px per logical px of the baked sprites (headroom for push-ins). */
export const RES = Math.min(2.6, SCALE * 1.35);

/** The registered-mail green ("busta verde"), desaturated. */
export const GREEN = '#7d9a6a';
export const GREEN_DARK = '#5f7a50';
/** Printing ink on paper: a warm-less near black, and its greys. */
const INK = '#1b1b1b';
const RULE = '#8a8a8a';

// ---------------------------------------------------------------- sprites
export interface Sprite { cv: HTMLCanvasElement; tight: HTMLCanvasElement; soft: HTMLCanvasElement; w: number; h: number }
const PAD = 80, SR = 0.25;

function canvas(w: number, h: number, res: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * res));
  cv.height = Math.max(1, Math.ceil(h * res));
  const c = cv.getContext('2d')!;
  c.scale(res, res);
  return { cv, c };
}

/** Bake a paper object of w×h logical px. `draw` paints it at (0,0)-(w,h). Shadows come from its alpha. */
export function makeSprite(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, res = RES): Sprite {
  const { cv, c } = canvas(w, h, res);
  draw(c);
  const shadow = (blur: number) => {
    const { cv: s, c: sc } = canvas(w + PAD * 2, h + PAD * 2, SR);
    sc.filter = `blur(${blur * SR}px)`;
    sc.drawImage(silhouette(cv), PAD, PAD, w, h);
    return s;
  };
  return { cv, tight: shadow(3), soft: shadow(26), w, h };
}
function silhouette(cv: HTMLCanvasElement) {
  const s = document.createElement('canvas');
  s.width = cv.width; s.height = cv.height;
  const c = s.getContext('2d')!;
  c.drawImage(cv, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = '#000';
  c.fillRect(0, 0, s.width, s.height);
  return s;
}

export interface Place { x: number; y: number; rot?: number; scale?: number; lift?: number; alpha?: number; shadow?: number }
/**
 * Draw a sprite centred at (x, y). `lift` 0..1: how far above the desk it is (shadow drifts and
 * softens). Shadows fall down-right in world space, whatever the rotation.
 */
export function drawSprite(c: CanvasRenderingContext2D, s: Sprite, p: Place) {
  const sc = p.scale ?? 1, lift = clamp(p.lift ?? 0, 0, 2), rot = p.rot ?? 0, sh = (p.shadow ?? 1) * (p.alpha ?? 1);
  c.save();
  if (sh > 0) {
    const sw = s.w + PAD * 2, shh = s.h + PAD * 2;
    // soft ambient shadow
    c.save();
    c.translate(p.x + (6 + lift * 40) * sc, p.y + (14 + lift * 70) * sc);
    c.rotate(rot);
    const k = sc * (1 + lift * 0.06);
    c.scale(k, k);
    c.globalAlpha = 0.24 * sh * (1 - 0.45 * clamp(lift));
    c.drawImage(s.soft, -sw / 2, -shh / 2, sw, shh);
    c.restore();
    // contact shadow
    const ca = 0.3 * sh * (1 - clamp(lift * 3));
    if (ca > 0.01) {
      c.save();
      c.translate(p.x + 1 * sc, p.y + 2.5 * sc);
      c.rotate(rot);
      c.scale(sc, sc);
      c.globalAlpha = ca;
      c.drawImage(s.tight, -sw / 2, -shh / 2, sw, shh);
      c.restore();
    }
  }
  c.translate(p.x, p.y);
  c.rotate(rot);
  c.scale(sc, sc);
  c.globalAlpha = p.alpha ?? 1;
  c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
  c.restore();
}

/**
 * A paper landing on the desk at `tHit`: it falls from lifted (bigger, shadow far) in `dur` s with an
 * ease-in, then settles with a tiny bounce. Returns null before it appears.
 */
export function landing(t: number, tHit: number, dur = 0.12, o: { dx?: number; dy?: number; drot?: number; from?: number } = {}) {
  const t0 = tHit - dur;
  if (t < t0) return null;
  const p = clamp((t - t0) / dur);
  const e = ease.inQuad(p);
  const k = t - tHit;
  const bounce = k > 0 ? Math.exp(-k * 18) * Math.sin(k * 40) * 0.012 : 0;
  return {
    lift: (1 - e) * 1.0,
    scale: 1 + (1 - e) * (o.from ?? 0.22) + bounce,
    dx: (1 - e) * (o.dx ?? 0),
    dy: (1 - e) * (o.dy ?? 0),
    drot: (1 - e) * (o.drot ?? 0),
    alpha: clamp(p * 4),
    k,
  };
}

// ---------------------------------------------------------------- textures
let GRAIN: HTMLCanvasElement | null = null;
/** A tile of paper fibre and speckle (alpha only, dark). */
export function grainTile() {
  if (GRAIN) return GRAIN;
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  const c = cv.getContext('2d')!;
  const r = mulberry32(91);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`;
    c.fillRect(r() * n, r() * n, 1, 1);
  }
  c.lineWidth = 0.5;
  for (let i = 0; i < 70; i++) {
    const x = r() * n, y = r() * n, a = r() * TAU, l = 3 + r() * 9;
    c.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  GRAIN = cv;
  return cv;
}
/** Fill (0,0,w,h) of a path with paper grain. Call inside a clip. */
export function paperGrain(c: CanvasRenderingContext2D, w: number, h: number, a = 1) {
  c.save();
  c.globalAlpha *= a;
  const p = c.createPattern(grainTile(), 'repeat')!;
  c.fillStyle = p;
  c.fillRect(0, 0, w, h);
  c.restore();
}

// ---------------------------------------------------------------- print helpers
type Fam = 'sans' | 'mono';
export interface TxtOpts { w?: number; fam?: Fam; color?: string; align?: CanvasTextAlign; ls?: number; base?: CanvasTextBaseline; maxW?: number; alpha?: number }
export function txt(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, o: TxtOpts = {}) {
  c.save();
  c.font = font(o.fam === 'mono' ? F.mono(o.w ?? 400) : F.sans(o.w ?? 400), size);
  c.fillStyle = o.color ?? INK;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.base ?? 'alphabetic';
  c.letterSpacing = `${(o.ls ?? 0) * size}px`;
  if (o.alpha !== undefined) c.globalAlpha *= o.alpha;
  if (o.maxW) c.fillText(s, x, y, o.maxW); else c.fillText(s, x, y);
  const w = c.measureText(s).width;
  c.restore();
  return w;
}
export function hline(c: CanvasRenderingContext2D, x0: number, x1: number, y: number, lw = 1, col = RULE) {
  c.fillStyle = col; c.fillRect(x0, y - lw / 2, x1 - x0, lw);
}
export function vline(c: CanvasRenderingContext2D, x: number, y0: number, y1: number, lw = 1, col = RULE) {
  c.fillStyle = col; c.fillRect(x - lw / 2, y0, lw, y1 - y0);
}
export function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lw = 1, col = RULE) {
  c.strokeStyle = col; c.lineWidth = lw; c.strokeRect(x, y, w, h);
}
/** A row of character cells (codice fiscale, dates). */
export function cells(c: CanvasRenderingContext2D, x: number, y: number, n: number, cw: number, h: number, lw = 0.8, col = RULE) {
  c.strokeStyle = col; c.lineWidth = lw;
  c.strokeRect(x, y, n * cw, h);
  for (let i = 1; i < n; i++) { c.beginPath(); c.moveTo(x + i * cw, y + h * 0.45); c.lineTo(x + i * cw, y + h); c.stroke(); }
}
/** Grey text lines standing for body copy. */
export function bodyLines(c: CanvasRenderingContext2D, x: number, y: number, w: number, n: number, gap: number, seed: number, th = 3, col = 'rgba(0,0,0,0.16)') {
  const r = mulberry32(seed);
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const lw = last ? w * (0.3 + r() * 0.4) : w * (0.86 + r() * 0.14);
    // words: break the line into short runs
    let xx = x;
    while (xx < x + lw) {
      const ww = 10 + r() * 46;
      c.fillRect(xx, y + i * gap, Math.min(ww, x + lw - xx), th);
      xx += ww + 5;
    }
  }
}
/** A redaction bar (privacy mode) drawn into a sprite. */
export function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string = HEX.pen) {
  c.fillStyle = col;
  roundRect(c, x, y, w, h, Math.min(h * 0.22, 6)); c.fill();
}
export function barcode(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number, col = INK) {
  const r = mulberry32(seed);
  c.fillStyle = col;
  let xx = x;
  while (xx < x + w) {
    const bw = [1, 1, 2, 3][Math.floor(r() * 4)]! * (w / 160);
    if (r() > 0.42) c.fillRect(xx, y, bw, h);
    xx += bw + (w / 160) * (1 + Math.floor(r() * 2));
  }
}
export function qr(c: CanvasRenderingContext2D, x: number, y: number, s: number, seed: number, col = INK) {
  const n = 29, m = s / n, r = mulberry32(seed);
  c.fillStyle = col;
  const finder = (fx: number, fy: number) => {
    c.fillRect(x + fx * m, y + fy * m, 7 * m, 7 * m);
    c.clearRect(x + (fx + 1) * m, y + (fy + 1) * m, 5 * m, 5 * m);
    c.fillStyle = '#fdfdfd'; c.fillRect(x + (fx + 1) * m, y + (fy + 1) * m, 5 * m, 5 * m); c.fillStyle = col;
    c.fillRect(x + (fx + 2) * m, y + (fy + 2) * m, 3 * m, 3 * m);
  };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inF = (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9);
    if (!inF && r() > 0.52) c.fillRect(x + i * m, y + j * m, m + 0.2, m + 0.2);
  }
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
}
/** Handwriting with a single-stroke script font, in pen ink. */
export function hand(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, o: { font?: StrokeFontName; color?: string; lw?: number; rot?: number; len?: number } = {}) {
  const st = strokeText(s, o.font ?? 'hscript', size);
  c.save();
  c.translate(x, y);
  if (o.rot) c.rotate(o.rot);
  c.strokeStyle = o.color ?? 'rgba(22,24,30,0.9)';
  c.lineWidth = o.lw ?? Math.max(1, size * 0.055);
  c.lineCap = 'round'; c.lineJoin = 'round';
  drawStrokeText(c, st, o.len ?? st.total);
  c.restore();
  return st.width;
}
/** A hand-drawn loop around a spot (a circled date), seeded. */
export function circleMark(c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number, col: string = HEX.overdue, lw = 4, p = 1) {
  const r = mulberry32(seed);
  c.save();
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath();
  const a0 = -2.2 + r() * 0.4, n = 48, turns = 1.12 * p;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = a0 + u * TAU * turns;
    const k = 1 + (r() - 0.5) * 0.03 + u * 0.06;
    const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  c.restore();
}

/** A sheet: white paper with grain, very slightly uneven edge light. */
function sheetBase(c: CanvasRenderingContext2D, w: number, h: number, col: string = HEX.sheet, r = 2) {
  c.fillStyle = col;
  roundRect(c, 0, 0, w, h, r); c.fill();
  c.save();
  roundRect(c, 0, 0, w, h, r); c.clip();
  paperGrain(c, w, h, 0.8);
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(0,0,0,0.035)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.restore();
}

// ---------------------------------------------------------------- the objects
/** The green registered envelope: "Atti giudiziari", raccomandata A.R., address window. 1100×640. */
export function envelopeGreen(seed = 3): Sprite {
  const w = 1100, h = 640;
  return makeSprite(w, h, (c) => {
    c.fillStyle = GREEN;
    roundRect(c, 0, 0, w, h, 6); c.fill();
    c.save();
    roundRect(c, 0, 0, w, h, 6); c.clip();
    const g = c.createLinearGradient(0, 0, w * 0.6, h * 1.2);
    g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    paperGrain(c, w, h, 1.4);
    const ink = 'rgba(16,26,12,0.82)';
    // header
    txt(c, 'ATTI GIUDIZIARI', 56, 108, 64, { w: 900, color: ink, ls: -0.02 });
    txt(c, 'Notificazione a mezzo del servizio postale', 58, 146, 20, { w: 500, color: ink });
    txt(c, 'Legge 20 novembre 1982, n. 890', 58, 172, 18, { w: 400, color: ink });
    // postage box
    c.strokeStyle = ink; c.lineWidth = 2.5;
    c.strokeRect(w - 330, 44, 274, 150);
    c.lineWidth = 1.2; c.strokeRect(w - 322, 52, 258, 134);
    txt(c, 'RACCOMANDATA', w - 193, 96, 26, { w: 900, color: ink, align: 'center' });
    txt(c, 'A.R.', w - 193, 138, 40, { w: 900, color: ink, align: 'center' });
    txt(c, 'TASSA RISCOSSA', w - 193, 172, 16, { w: 600, color: ink, align: 'center', ls: 0.12 });
    // address window
    const wx = 520, wy = 300, ww = 500, wh = 190;
    c.fillStyle = 'rgba(248,250,246,0.94)';
    roundRect(c, wx, wy, ww, wh, 10); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1.5;
    roundRect(c, wx, wy, ww, wh, 10); c.stroke();
    // glassine sheen
    const gg = c.createLinearGradient(wx, wy, wx + ww, wy + wh);
    gg.addColorStop(0, 'rgba(255,255,255,0.0)'); gg.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gg.addColorStop(0.55, 'rgba(255,255,255,0.0)');
    c.fillStyle = gg; roundRect(c, wx, wy, ww, wh, 10); c.fill();
    txt(c, 'Gent.ma Sig.ra', wx + 34, wy + 52, 22, { w: 400, fam: 'mono', color: '#222' });
    txt(c, 'MARIA ROSSI', wx + 34, wy + 88, 26, { w: 700, fam: 'mono', color: '#111' });
    bar(c, wx + 34, wy + 108, 300, 20, '#1a1a1a');
    bar(c, wx + 34, wy + 140, 220, 20, '#1a1a1a');
    // tracking number and barcode
    barcode(c, 58, 300, 380, 86, seed, ink);
    txt(c, 'RR 6142 7739 0IT', 58, 420, 24, { w: 500, fam: 'mono', color: ink, ls: 0.06 });
    // A.R. section
    c.strokeStyle = ink; c.lineWidth = 1.5;
    c.strokeRect(58, 470, 380, 110);
    txt(c, 'AVVISO DI RICEVIMENTO', 74, 500, 17, { w: 700, color: ink, ls: 0.06 });
    for (let i = 0; i < 3; i++) {
      c.strokeRect(74, 516 + i * 20, 12, 12);
      txt(c, ['Consegnato al destinatario', 'Persona di famiglia', 'Depositato in Comune'][i]!, 96, 527 + i * 20, 14, { w: 400, color: ink });
    }
    txt(c, 'Mod. 23L', w - 56, h - 34, 16, { w: 500, color: ink, align: 'right' });
    // fold crease
    c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, h * 0.52, w, 2);
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, h * 0.52 + 2, w, 2);
    c.restore();
  });
}

/** A PEC notification: a mail client row. 1360×236. */
export function pecRow(): Sprite {
  const w = 1360, h = 236;
  return makeSprite(w, h, (c) => {
    c.fillStyle = HEX.sheet;
    roundRect(c, 0, 0, w, h, 26); c.fill();
    c.strokeStyle = HEX.bezel; c.lineWidth = 1.5;
    roundRect(c, 0.75, 0.75, w - 1.5, h - 1.5, 26); c.stroke();
    // icon tile
    c.fillStyle = '#f1f1f1';
    roundRect(c, 40, 46, 96, 96, 22); c.fill();
    c.strokeStyle = HEX.pen; c.lineWidth = 4; c.lineJoin = 'round';
    roundRect(c, 62, 74, 52, 40, 6); c.stroke();
    c.beginPath(); c.moveTo(64, 78); c.lineTo(88, 98); c.lineTo(112, 78); c.stroke();
    // unread dot
    c.fillStyle = HEX.pen; c.beginPath(); c.arc(170, 76, 8, 0, TAU); c.fill();
    txt(c, 'protocollo@pec.comune.esempio.it', 194, 86, 30, { fam: 'mono', w: 500, color: HEX.pen });
    txt(c, '08:14', w - 48, 86, 28, { w: 500, color: HEX.muted, align: 'right' });
    txt(c, 'POSTA CERTIFICATA: Avviso di accertamento IMU 2022', 194, 138, 38, { w: 600, color: HEX.pen, ls: -0.01 });
    txt(c, 'Messaggio di posta elettronica certificata · postacert.eml · daticert.xml · smime.p7s', 194, 186, 23, { w: 400, color: HEX.muted });
    // attachment pill
    c.fillStyle = '#f1f1f1'; roundRect(c, w - 210, 156, 162, 44, 22); c.fill();
    txt(c, '3 allegati', w - 129, 186, 21, { w: 500, color: HEX.graphite, align: 'center' });
  });
}

/** The F24 form, plainly: header, contribuente, sezioni Erario / INPS / Regioni / IMU, saldo. 900×1270. */
export function f24(): Sprite {
  const w = 900, h = 1270;
  return makeSprite(w, h, (c) => {
    sheetBase(c, w, h);
    const L = 34, R = w - 34, ink = '#222', rule = '#777';
    // header
    txt(c, 'MODELLO DI PAGAMENTO UNIFICATO', L, 66, 23, { w: 900, color: ink, ls: -0.01 });
    txt(c, 'PER L’ACCREDITO ALLA TESORERIA COMPETENTE', L, 92, 12, { w: 500, color: ink, ls: 0.04 });
    c.strokeStyle = ink; c.lineWidth = 3; c.strokeRect(R - 150, 28, 150, 82);
    txt(c, 'F24', R - 75, 92, 66, { w: 900, color: ink, align: 'center', ls: -0.04 });
    txt(c, 'DELEGA IRREVOCABILE A:', L, 130, 13, { w: 700, color: ink });
    hline(c, L + 180, R - 170, 130, 1, rule);
    txt(c, 'AGENZIA', L, 152, 12, { w: 500, color: ink }); hline(c, L + 70, L + 420, 152, 1, rule);
    txt(c, 'PROV.', L + 440, 152, 12, { w: 500, color: ink }); hline(c, L + 486, L + 560, 152, 1, rule);
    // a section frame with a vertical side label
    const section = (y: number, hh: number, label: string) => {
      c.fillStyle = '#ececec'; c.fillRect(L, y, 26, hh);
      c.strokeStyle = rule; c.lineWidth = 1.2; c.strokeRect(L, y, R - L, hh);
      c.save(); c.translate(L + 17, y + hh / 2); c.rotate(-Math.PI / 2);
      txt(c, label, 0, 0, 11, { w: 700, color: ink, align: 'center', ls: 0.08 }); c.restore();
    };
    // contribuente
    let y = 172;
    section(y, 190, 'CONTRIBUENTE');
    const X = L + 40;
    txt(c, 'CODICE FISCALE', X, y + 22, 11, { w: 700, color: ink });
    cells(c, X + 120, y + 8, 16, 22, 22, 0.9, rule);
    const cf = 'RSSMRA80A41H501U';
    for (let i = 0; i < 16; i++) txt(c, cf[i]!, X + 120 + i * 22 + 11, y + 26, 15, { fam: 'mono', w: 500, color: '#2a2a2a', align: 'center' });
    txt(c, 'DATI ANAGRAFICI', X, y + 58, 11, { w: 700, color: ink });
    const fld = (fx: number, fy: number, fw: number, label: string, val?: string) => {
      txt(c, label, fx, fy, 9.5, { w: 400, color: '#555' });
      c.strokeStyle = rule; c.lineWidth = 0.9; c.strokeRect(fx, fy + 4, fw, 24);
      if (val) txt(c, val, fx + 8, fy + 22, 14, { fam: 'mono', w: 500, color: '#2a2a2a' });
    };
    fld(X, y + 76, 400, 'cognome, denominazione o ragione sociale', 'ROSSI');
    fld(X + 410, y + 76, 400, 'nome', 'MARIA');
    fld(X, y + 122, 170, 'data di nascita', '');
    bar(c, X + 8, y + 132, 120, 12, '#1a1a1a');
    fld(X + 180, y + 122, 60, 'sesso (M o F)', 'F');
    fld(X + 250, y + 122, 460, 'comune (o Stato estero) di nascita', '');
    bar(c, X + 258, y + 132, 150, 12, '#1a1a1a');
    fld(X + 720, y + 122, 90, 'prov.', '');
    txt(c, 'DOMICILIO FISCALE', X, y + 176, 11, { w: 700, color: ink });
    bar(c, X + 140, y + 167, 260, 12, '#1a1a1a');
    // a tax table section
    const table = (y0: number, label: string, cols: [string, number][], rows: string[][], hh: number) => {
      section(y0, hh, label);
      let x = X; const top = y0 + 8;
      const rowH = 22, head = 34;
      cols.forEach(([name, cw], i) => {
        const lines = name.split('\n');
        lines.forEach((ln, j) => txt(c, ln, x + cw / 2, top + 11 + j * 10, 8.5, { w: 500, color: '#444', align: 'center' }));
        for (let r = 0; r < 4; r++) {
          c.strokeStyle = rule; c.lineWidth = 0.8; c.strokeRect(x + 2, top + head + r * rowH, cw - 4, rowH - 4);
          const v = rows[r]?.[i];
          if (v === '#') bar(c, x + 10, top + head + r * rowH + 5, cw - 30, 9, '#1a1a1a');
          else if (v) txt(c, v, x + cw / 2, top + head + r * rowH + 14, 13, { fam: 'mono', w: 500, color: '#2a2a2a', align: 'center' });
        }
        x += cw;
        void i;
      });
      // totals
      const ty = top + head + 4 * rowH + 6;
      txt(c, 'TOTALE', X + 330, ty + 12, 10, { w: 700, color: ink });
      txt(c, 'A', X + 400, ty + 12, 10, { w: 700, color: ink });
      c.strokeStyle = rule; c.strokeRect(X + 420, ty, 150, 18);
      txt(c, 'B', X + 588, ty + 12, 10, { w: 700, color: ink });
      c.strokeRect(X + 604, ty, 130, 18);
      txt(c, '+/–', X + 742, ty + 12, 10, { w: 700, color: ink });
      if (rows.some((r) => r.includes('#'))) bar(c, X + 430, ty + 4, 110, 10, '#1a1a1a');
    };
    y = 376;
    table(y, 'ERARIO', [['codice\ntributo', 110], ['rateazione/regione/\nprov./mese rif.', 160], ['anno di\nriferimento', 110], ['importi a debito\nversati', 220], ['importi a credito\ncompensati', 210]], [], 172);
    y += 182;
    table(y, 'INPS', [['codice\nsede', 90], ['causale\ncontributo', 90], ['matricola INPS/codice\nINPS/filiale azienda', 170], ['periodo di riferimento\nda mm/aaaa  a mm/aaaa', 180], ['importi a debito\nversati', 140], ['importi a credito\ncompensati', 140]], [], 172);
    y += 182;
    table(y, 'REGIONI', [['codice\nregione', 100], ['codice\ntributo', 110], ['rateazione/\nmese rif.', 130], ['anno di\nriferimento', 110], ['importi a debito\nversati', 190], ['importi a credito\ncompensati', 170]], [['', '', '', '', '', '']], 172);
    y += 182;
    table(y, 'IMU E ALTRI TRIBUTI LOCALI', [['codice ente/\ncodice comune', 120], ['Ravv. Immob.\nvariati Acc. Saldo', 130], ['numero\nimmobili', 80], ['codice\ntributo', 100], ['rateazione/\nmese rif.', 100], ['anno di\nriferimento', 100], ['importi a debito\nversati', 180]],
      [['H501', 'X', '1', '3918', '0101', '2026', '#'], ['H501', 'X', '1', '3916', '0101', '2026', '#']], 172);
    y += 190;
    // saldo finale
    txt(c, 'SALDO FINALE', L + 470, y + 22, 15, { w: 900, color: ink });
    txt(c, 'EURO', L + 600, y + 22, 13, { w: 700, color: ink });
    txt(c, '+', L + 646, y + 23, 18, { w: 700, color: ink });
    cells(c, L + 664, y + 4, 8, 24, 26, 0.9, rule);
    bar(c, L + 672, y + 10, 170, 14, '#1a1a1a');
    // estremi del versamento
    y += 52;
    c.strokeStyle = rule; c.lineWidth = 1.2; c.strokeRect(L, y, R - L, 82);
    txt(c, 'ESTREMI DEL VERSAMENTO (DA COMPILARE A CURA DI BANCA/POSTE/AGENTE DELLA RISCOSSIONE)', L + 10, y + 18, 9.5, { w: 700, color: ink });
    txt(c, 'DATA', L + 10, y + 44, 9.5, { w: 500, color: '#555' }); cells(c, L + 50, y + 30, 8, 20, 22, 0.8, rule);
    txt(c, 'CODICE BANCA/POSTE/AGENTE DELLA RISCOSSIONE', L + 240, y + 44, 9.5, { w: 500, color: '#555' });
    txt(c, 'Firma', L + 600, y + 44, 9.5, { w: 500, color: '#555' });
    hline(c, L + 600, R - 16, y + 70, 0.9, rule);
  });
}

/** A notice letter on A4: letterhead, object line, body, a table of rows, signature. 840×1180. */
export function letter(seed: number, o: { head?: string; sub?: string; title?: string; qr?: boolean; amounts?: number } = {}): Sprite {
  const w = 840, h = 1180;
  return makeSprite(w, h, (c) => {
    sheetBase(c, w, h);
    const r = mulberry32(seed);
    const L = 70, R = w - 70;
    // letterhead: a plain seal (circle with rules) and the office
    c.strokeStyle = '#444'; c.lineWidth = 2;
    c.beginPath(); c.arc(L + 34, 92, 30, 0, TAU); c.stroke();
    c.beginPath(); c.arc(L + 34, 92, 22, 0, TAU); c.stroke();
    txt(c, o.head ?? 'COMUNE DI ESEMPIO', L + 84, 86, 26, { w: 700, color: '#1a1a1a', ls: 0.02 });
    txt(c, o.sub ?? 'Settore Entrate — Ufficio Tributi', L + 84, 114, 18, { w: 400, color: '#444' });
    hline(c, L, R, 150, 1.2, '#999');
    txt(c, `Prot. n. ${String(Math.floor(r() * 90000 + 10000))}/2026`, L, 190, 17, { fam: 'mono', w: 500, color: '#333' });
    bar(c, R - 260, 210, 260, 16, '#1a1a1a');
    bar(c, R - 200, 236, 200, 16, '#1a1a1a');
    txt(c, 'OGGETTO:', L, 300, 18, { w: 700, color: '#1a1a1a' });
    txt(c, o.title ?? 'Avviso di pagamento', L + 100, 300, 18, { w: 600, color: '#1a1a1a' });
    bodyLines(c, L, 340, R - L, 7, 26, seed + 1);
    // table
    const ty = 560;
    hline(c, L, R, ty, 1.5, '#555');
    ['Tributo', 'Anno', 'Scadenza', 'Importo'].forEach((s, i) => txt(c, s, L + [0, 260, 380, 560][i]!, ty + 28, 15, { w: 700, color: '#333' }));
    hline(c, L, R, ty + 42, 1, '#999');
    const tr = [['TARI', '2026', '16/10'], ['TARI', '2026', '02/12'], ['Sanzione', '2025', '—']];
    const n = o.amounts ?? 3;
    for (let i = 0; i < n; i++) {
      const yy = ty + 76 + i * 38;
      const row = tr[i % tr.length]!;
      txt(c, row[0]!, L, yy, 16, { w: 400, color: '#333' });
      txt(c, row[1]!, L + 260, yy, 16, { fam: 'mono', w: 400, color: '#333' });
      txt(c, row[2]!, L + 380, yy, 16, { fam: 'mono', w: 400, color: '#333' });
      bar(c, L + 560, yy - 14, 110 + r() * 40, 16, '#1a1a1a');
      hline(c, L, R, yy + 14, 0.6, '#ccc');
    }
    bodyLines(c, L, 800, R - L, 4, 26, seed + 2);
    if (o.qr) {
      qr(c, R - 170, h - 250, 170, seed);
      txt(c, 'Codice avviso', L, h - 200, 15, { w: 600, color: '#333' });
      txt(c, '3020 0004 1277 3016 21', L, h - 172, 20, { fam: 'mono', w: 500, color: '#1a1a1a' });
    } else {
      txt(c, 'Il Funzionario responsabile', R - 300, h - 210, 16, { w: 400, color: '#444' });
      hand(c, 'Bianchi', R - 290, h - 140, 46, { font: 'script', color: 'rgba(25,25,35,0.85)', lw: 2 });
    }
  });
}

/** A plain white window envelope (DL), grey print. 880×440. */
export function envelopeWhite(seed: number, sender = 'Agente della Riscossione'): Sprite {
  const w = 880, h = 440;
  return makeSprite(w, h, (c) => {
    sheetBase(c, w, h, '#f6f6f4', 4);
    txt(c, sender, 40, 64, 22, { w: 700, color: '#2a2a2a' });
    txt(c, 'Ufficio Territoriale — Notifiche', 40, 92, 15, { w: 400, color: '#555' });
    // postage frame
    c.strokeStyle = '#555'; c.lineWidth = 1.5; c.strokeRect(w - 190, 34, 150, 92);
    txt(c, 'POSTA', w - 115, 72, 16, { w: 700, color: '#444', align: 'center', ls: 0.1 });
    txt(c, 'PRIORITARIA', w - 115, 96, 13, { w: 500, color: '#444', align: 'center', ls: 0.08 });
    // window
    c.fillStyle = 'rgba(255,255,255,0.9)'; roundRect(c, 400, 210, 420, 150, 8); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.12)'; roundRect(c, 400, 210, 420, 150, 8); c.stroke();
    txt(c, 'ROSSI MARIA', 430, 262, 20, { fam: 'mono', w: 700, color: '#111' });
    bar(c, 430, 280, 240, 16, '#1a1a1a'); bar(c, 430, 306, 180, 16, '#1a1a1a');
    barcode(c, 40, 330, 260, 46, seed, '#333');
  });
}

/** A paper slip: a handwritten note (white, grey or ruled), square. */
export function note(text: string, seed: number, o: { size?: number; tone?: string; circled?: boolean; sub?: string; w?: number; h?: number } = {}): Sprite {
  const w = o.w ?? 340, h = o.h ?? 320;
  const r = mulberry32(seed);
  return makeSprite(w, h, (c) => {
    sheetBase(c, w, h, o.tone ?? '#f4f4f2', 3);
    // adhesive strip shade at the top
    c.fillStyle = 'rgba(0,0,0,0.035)'; c.fillRect(0, 0, w, 56);
    let sz = o.size ?? 70;
    const mw = strokeText(text, 'hscript', sz).width;
    if (mw > w - 60) sz *= (w - 60) / mw;
    const tw = hand(c, text, 30, h * 0.5 + sz * 0.25, sz, { rot: (r() - 0.5) * 0.08, lw: Math.max(2.2, sz * 0.06) });
    if (o.sub) hand(c, o.sub, 32, h * 0.5 + sz * 0.25 + sz * 0.9, sz * 0.55, { lw: 2 });
    if (o.circled) circleMark(c, 30 + tw / 2, h * 0.5, tw / 2 + 26, sz * 0.62, seed, HEX.overdue, 5);
  });
}

/** A tear-off calendar page: black month band, big day, weekday. 320×400. */
export function calendarPage(day: number, month: string, weekday: string, seed: number, circled = false): Sprite {
  const w = 320, h = 400;
  return makeSprite(w, h, (c) => {
    sheetBase(c, w, h, '#fafafa', 4);
    c.fillStyle = '#161616'; c.fillRect(0, 0, w, 86);
    // binding holes
    c.fillStyle = HEX.paper;
    for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(w * (0.32 + i * 0.36), 22, 8, 0, TAU); c.fill(); }
    txt(c, month.toUpperCase(), w / 2, 70, 30, { w: 900, color: '#f2f2f2', align: 'center', ls: 0.06 });
    txt(c, String(day), w / 2, 280, 190, { w: 900, color: '#141414', align: 'center', ls: -0.05 });
    txt(c, weekday, w / 2, 350, 26, { w: 500, color: '#555', align: 'center' });
    // torn bottom perforation
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 6; x < w; x += 12) c.fillRect(x, h - 8, 5, 2);
    if (circled) circleMark(c, w / 2, 214, 120, 96, seed, HEX.overdue, 6);
  });
}

// ---------------------------------------------------------------- karaoke
/**
 * The lyric line along an edge, Geist 500 on a white label: each word appears on its start (a quick
 * rise) and is never ahead of the voice. Returns the label rect.
 */
export function lyricStrip(c: CanvasRenderingContext2D, line: Line, t: number, x: number, y: number, o: { size?: number; key?: string[]; align?: 'left' | 'right'; dark?: boolean } = {}) {
  const size = o.size ?? 34;
  const fam = F.sans(500);
  const text = line.words.map((w) => w.w).join(' ');
  const lay = layout(text, fam, size);
  const padX = 22, padY = 14;
  const bw = lay.width + padX * 2, bh = size * 1.35 + padY;
  const bx = o.align === 'right' ? x - bw : x;
  const first = line.words[0]!;
  if (t < first.start) return null;
  const vis = clamp((t - first.start) / 0.08);
  c.save();
  c.globalAlpha *= vis;
  // label grows with the sung words
  let reached = 0;
  let ci = 0;
  for (const w of line.words) {
    if (t >= w.start) reached = lay.glyphs[Math.min(lay.glyphs.length - 1, ci + Array.from(w.w).length - 1)]!.x + lay.glyphs[Math.min(lay.glyphs.length - 1, ci + Array.from(w.w).length - 1)]!.w;
    ci += Array.from(w.w).length + 1;
  }
  const curW = Math.min(bw, reached + padX * 2);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
  c.fillStyle = o.dark ? HEX.ink2 : HEX.sheet;
  roundRect(c, bx, y - bh, curW, bh, 10); c.fill();
  c.restore();
  c.font = font(fam, size);
  c.textBaseline = 'alphabetic';
  ci = 0;
  for (const w of line.words) {
    const n = Array.from(w.w).length;
    if (t >= w.start) {
      const k = clamp((t - w.start) / 0.07);
      const key = o.key?.some((s) => w.w.toLowerCase().startsWith(s));
      c.fillStyle = key ? HEX.overdue : o.dark ? '#f2f2f2' : HEX.pen;
      c.globalAlpha = vis * k;
      c.fillText(w.w, bx + padX + lay.glyphs[ci]!.x, y - padY - size * 0.32 + (1 - ease.outCubic(k)) * 10);
    }
    ci += n + 1;
  }
  c.restore();
  return { x: bx, y: y - bh, w: bw, h: bh };
}

/** Words of a line, set one per hit in display type, wrapped into lines that are given. */
export function slamWords(c: CanvasRenderingContext2D, words: Word[], t: number, rows: number[][], x: number, y: number, size: number,
  o: { color?: string; lead?: number; upper?: boolean; weight?: number; colors?: Record<number, string> } = {}) {
  const fam = F.sans(o.weight ?? 900);
  c.save();
  c.font = font(fam, size);
  c.letterSpacing = `${-0.04 * size}px`;
  c.textBaseline = 'alphabetic';
  rows.forEach((row, ri) => {
    let xx = x;
    for (const wi of row) {
      const w = words[wi]!;
      const s = o.upper ? w.w.toUpperCase() : w.w;
      const ww = c.measureText(s).width;
      if (t >= w.start - 0.03) {
        const k = clamp((t - w.start + 0.03) / 0.08);
        const sc = 1 + (1 - ease.outCubic(k)) * 0.25;
        c.save();
        c.translate(xx, y + ri * size * (o.lead ?? 0.92));
        c.scale(sc, sc);
        c.globalAlpha = clamp(k * 3);
        c.fillStyle = o.colors?.[wi] ?? o.color ?? HEX.pen;
        c.fillText(s, 0, 0);
        c.restore();
      }
      xx += ww + size * 0.22;
    }
  });
  c.restore();
}

// ---------------------------------------------------------------- camera and motion
/** Apply a camera: the world point (cx, cy) at the frame centre, zoomed and rolled, plus a screen offset. */
export function camera(c: CanvasRenderingContext2D, cx: number, cy: number, zoom: number, roll = 0, ox = 0, oy = 0) {
  c.translate(W / 2 + ox, H / 2 + oy);
  c.rotate(roll);
  c.scale(zoom, zoom);
  c.translate(-cx, -cy);
}
/** Seeded shake offset (decaying from amp at t0), per output frame. */
export function shakeAt(t: number, t0: number, amp: number, decay = 18, seed = 1): [number, number] {
  if (t < t0) return [0, 0];
  const k = t - t0, a = amp * Math.exp(-k * decay);
  const f = Math.round(t * 60);
  return [(hash(f, seed) - 0.5) * 2 * a, (hash(f, seed + 9) - 0.5) * 2 * a];
}
/** Dust motes kicked up at t0 around (x, y): deterministic ballistic specks. */
export function dust(c: CanvasRenderingContext2D, t: number, t0: number, x: number, y: number, spread: number, n: number, seed: number, col = 'rgba(70,70,70,') {
  const k = t - t0;
  if (k < 0 || k > 1.6) return;
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, v = 80 + r() * 380, s = 1 + r() * 3.2;
    const px = x + (r() - 0.5) * spread + Math.cos(a) * v * k * (1 - k * 0.3);
    const py = y + (r() - 0.5) * spread * 0.5 + Math.sin(a) * v * 0.5 * k - 140 * k + 120 * k * k;
    const al = (1 - k / 1.6) * (0.25 + r() * 0.45);
    c.fillStyle = `${col}${al.toFixed(3)})`;
    c.beginPath(); c.arc(px, py, s, 0, TAU); c.fill();
  }
}
export const HW = W, HH = H;
export { INK as PRINT_INK, rgba };

/** Run `fn` in a sprite's local frame (origin at its top-left), as placed by drawSprite. */
export function inSprite(c: CanvasRenderingContext2D, s: { w: number; h: number }, p: Place, fn: () => void) {
  c.save();
  c.translate(p.x, p.y);
  c.rotate(p.rot ?? 0);
  c.scale(p.scale ?? 1, p.scale ?? 1);
  c.translate(-s.w / 2, -s.h / 2);
  c.globalAlpha *= p.alpha ?? 1;
  fn();
  c.restore();
}
/** A small warning triangle (the app's "⚠"), drawn. */
export function warnIcon(c: CanvasRenderingContext2D, x: number, y: number, s: number, col: string = HEX.overdue) {
  c.save();
  c.fillStyle = col;
  c.beginPath(); c.moveTo(x + s / 2, y); c.lineTo(x + s, y + s * 0.9); c.lineTo(x, y + s * 0.9); c.closePath(); c.fill();
  c.fillStyle = '#fff';
  c.fillRect(x + s / 2 - s * 0.05, y + s * 0.3, s * 0.1, s * 0.32);
  c.fillRect(x + s / 2 - s * 0.05, y + s * 0.7, s * 0.1, s * 0.1);
  c.restore();
}

/** A photo cut-out (public/ref/*-cut-grey.png) as a sprite `w` px wide, with shadows from its alpha. */
export function photoSprite(img: ImageBitmap, w: number, o: { contrast?: number; bright?: number } = {}): Sprite {
  const h = Math.round((img.height / img.width) * w);
  return makeSprite(w, h, (c) => {
    if (o.contrast || o.bright) c.filter = `contrast(${o.contrast ?? 1}) brightness(${o.bright ?? 1})`;
    c.drawImage(img, 0, 0, w, h);
    c.filter = 'none';
  }, Math.min(RES, img.width / w));
}
