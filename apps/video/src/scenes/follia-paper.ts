// follia: the paperwork the wall is made of, drawn once into sprites (paper + baked soft shadow).
// Every piece is built from the greys (the busta verde is the one exception), with made-up dates
// from the demo register. `dates` records where the deadline is printed on each piece, so the
// "visibili!" beat can mark it.
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { SCALE, scaleContext2D } from '../engine/gl';
import { mulberry32 } from '../engine/util';
import { roundRect } from './_motifs';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Sprite {
  cv: HTMLCanvasElement;
  /** Paper size (px) and the shadow padding around it in the canvas. */
  w: number; h: number; pad: number;
  /** Where the deadline is printed, relative to the paper's top-left. */
  dates: Rect[];
}

const PAD = 44;
type Paint = (c: CanvasRenderingContext2D, mark: (r: Rect) => void, rnd: () => number) => void;

function sprite(w: number, h: number, seed: number, paint: Paint, shadow = 1): Sprite {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((w + PAD * 2) * SCALE);
  cv.height = Math.ceil((h + PAD * 2) * SCALE);
  const c = scaleContext2D(cv.getContext('2d')!, SCALE);
  c.translate(PAD, PAD);
  const dates: Rect[] = [];
  const rnd = mulberry32(seed);
  // the contact shadow of a sheet lying on other sheets
  c.save();
  c.shadowColor = `rgba(0,0,0,${0.2 * shadow})`;
  c.shadowBlur = 22;
  c.shadowOffsetY = 7;
  c.fillStyle = '#fff';
  c.fillRect(1, 1, w - 2, h - 2);
  c.restore();
  paint(c, (r) => dates.push(r), rnd);
  return { cv, w, h, pad: PAD, dates };
}

/** Paper fill with a faint fibre speckle and an uneven edge tone. */
function paperBase(c: CanvasRenderingContext2D, w: number, h: number, col: string, rnd: () => number) {
  c.fillStyle = col;
  c.fillRect(0, 0, w, h);
  const g = c.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0.05)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,0.035)';
  for (let i = 0; i < (w * h) / 900; i++) c.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1);
}

/** Greeked text: thin grey bars of ragged length. */
function greek(c: CanvasRenderingContext2D, x: number, y: number, w: number, n: number, lh: number, rnd: () => number, col = '#C9C9C9', th = 4) {
  c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const lw = i === n - 1 ? w * (0.3 + rnd() * 0.3) : w * (0.78 + rnd() * 0.22);
    roundRect(c, x, y + i * lh, lw, th, th / 2); c.fill();
  }
}

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, fam: string, size: number, col: string, o: { align?: CanvasTextAlign; track?: number } = {}) {
  c.font = font(fam, size);
  c.fillStyle = col;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'alphabetic';
  c.letterSpacing = `${(o.track ?? 0) * size}px`;
  c.fillText(s, x, y);
  const w = c.measureText(s).width;
  c.letterSpacing = '0px';
  return w;
}

function barcode(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rnd: () => number, col: string = HEX.pen) {
  c.fillStyle = col;
  let px = x;
  while (px < x + w) {
    const bw = 1 + Math.floor(rnd() * 3);
    if (rnd() > 0.4) c.fillRect(px, y, bw, h);
    px += bw + 1 + Math.floor(rnd() * 2);
  }
}

// ---------------------------------------------------------------- the pieces
export function letter(seed: number, office: string, title: string, date: string): Sprite {
  const w = 330, h = 466;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#F6F6F6', rnd);
    text(c, office, 28, 44, F.mono(500), 12, HEX.pen, { track: 0.06 });
    text(c, `Prot. n. 2026/0${200 + (seed % 97)}`, w - 28, 44, F.mono(400), 11, HEX.graphite, { align: 'right' });
    c.fillStyle = '#D4D4D4'; c.fillRect(28, 56, w - 56, 1);
    greek(c, 28, 76, 120, 3, 12, rnd, '#D2D2D2', 3);
    text(c, title, 28, 140, F.sans(700), 19, HEX.pen, { track: -0.01 });
    greek(c, 28, 162, w - 56, 6, 15, rnd);
    const dw = text(c, `Scadenza: ${date}`, 28, 278, F.mono(500), 14, HEX.pen);
    mark({ x: 22, y: 260, w: dw + 12, h: 26 });
    greek(c, 28, 304, w - 56, 5, 15, rnd);
    c.strokeStyle = '#9A9A9A'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(w - 150, h - 54); c.bezierCurveTo(w - 120, h - 80, w - 100, h - 40, w - 60, h - 66); c.stroke();
    text(c, 'Il responsabile del procedimento', w - 28, h - 30, F.sans(400), 10, HEX.muted, { align: 'right' });
  });
}

export function f24(seed: number, date: string): Sprite {
  const w = 480, h = 300;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#F3F3F3', rnd);
    text(c, 'MODELLO F24', 22, 38, F.sans(900), 22, HEX.pen, { track: -0.02 });
    text(c, 'DELEGA IRREVOCABILE A:', w - 22, 30, F.mono(400), 9, HEX.graphite, { align: 'right' });
    text(c, 'SEZIONE ERARIO', 22, 66, F.mono(500), 10, HEX.graphite, { track: 0.08 });
    c.strokeStyle = '#B5B5B5'; c.lineWidth = 1;
    const cols = [22, 92, 172, 232, 312, 392, w - 22];
    for (let r = 0; r < 6; r++) {
      const y = 76 + r * 24;
      for (let k = 0; k < cols.length - 1; k++) c.strokeRect(cols[k]! + 0.5, y + 0.5, cols[k + 1]! - cols[k]! - 4, 20);
      if (r < 3) {
        text(c, ['1712', '3918', '4001'][r]!, cols[0]! + 6, y + 15, F.mono(400), 11, HEX.pen);
        text(c, '2026', cols[2]! + 6, y + 15, F.mono(400), 11, HEX.pen);
        c.fillStyle = '#CFCFCF'; c.fillRect(cols[4]! + 8, y + 8, 50 + rnd() * 20, 5);
      }
    }
    text(c, 'Data di pagamento', 22, 254, F.mono(400), 10, HEX.graphite);
    const dw = text(c, date, 22, 278, F.mono(700), 16, HEX.pen);
    mark({ x: 16, y: 260, w: dw + 12, h: 26 });
    text(c, 'SALDO FINALE  €', w - 140, 276, F.mono(500), 10, HEX.graphite, { align: 'right' });
    c.fillStyle = '#C4C4C4'; c.fillRect(w - 128, 266, 106, 12);
  });
}

export function envelope(seed: number, date: string): Sprite {
  const w = 430, h = 250;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#86957D', rnd);
    // the window with the address (greeked)
    c.fillStyle = 'rgba(255,255,255,0.32)';
    roundRect(c, 34, 112, 196, 82, 6); c.fill();
    greek(c, 48, 130, 150, 3, 16, rnd, 'rgba(15,15,15,0.45)', 4);
    // the printed header
    text(c, 'ATTI GIUDIZIARI', 34, 50, F.sans(900), 22, '#1E2A1A', { track: -0.01 });
    text(c, 'Raccomandata A/R', 34, 74, F.mono(500), 12, '#24301F');
    c.strokeStyle = '#24301F'; c.lineWidth = 2;
    c.strokeRect(w - 128, 26, 96, 60);
    text(c, 'POSTE', w - 80, 52, F.mono(700), 13, '#24301F', { align: 'center' });
    text(c, 'TASSA PAGATA', w - 80, 72, F.mono(400), 9, '#24301F', { align: 'center' });
    barcode(c, w - 170, h - 62, 140, 30, rnd, '#1E2A1A');
    const dw = text(c, `notificato il ${date}`, w - 30, h - 16, F.mono(400), 11, '#1E2A1A', { align: 'right' });
    mark({ x: w - 36 - dw, y: h - 32, w: dw + 12, h: 22 });
  });
}

export function ticket(seed: number, num: string, wait: number, date: string): Sprite {
  const w = 196, h = 320;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#FAFAFA', rnd);
    text(c, 'ELIMINACODE', w / 2, 34, F.mono(500), 11, HEX.graphite, { align: 'center', track: 0.12 });
    c.fillStyle = '#DADADA'; c.fillRect(20, 46, w - 40, 1);
    text(c, 'IL SUO NUMERO', w / 2, 82, F.mono(400), 11, HEX.pen, { align: 'center', track: 0.08 });
    text(c, num, w / 2, 150, F.sans(900), 62, HEX.pen, { align: 'center', track: -0.04 });
    text(c, `In attesa: ${wait}`, w / 2, 190, F.mono(500), 14, HEX.pen, { align: 'center' });
    text(c, 'Servizi anagrafici', w / 2, 214, F.sans(400), 12, HEX.muted, { align: 'center' });
    const dw = text(c, date, w / 2, 262, F.mono(400), 12, HEX.pen, { align: 'center' });
    mark({ x: w / 2 - dw / 2 - 6, y: 247, w: dw + 12, h: 21 });
    // torn edge
    c.fillStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x < w; x += 6) c.fillRect(x, h - 3 - rnd() * 3, 4, 6);
  });
}

export function note(seed: number, lines: string[], dateLine: number): Sprite {
  const w = 236, h = 228;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#E9E9E9', rnd);
    c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, 0, w, 26);
    lines.forEach((s, i) => {
      const y = 76 + i * 44;
      const lw = text(c, s, 24, y, F.sans(400, true), 25, '#2B2B2B');
      if (i === dateLine) mark({ x: 16, y: y - 28, w: lw + 16, h: 38 });
    });
  }, 0.8);
}

export function calendarPage(seed: number, month: string, day: string, weekday: string): Sprite {
  const w = 250, h = 300;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#F8F8F8', rnd);
    c.fillStyle = HEX.pen; c.fillRect(0, 0, w, 62);
    text(c, month, w / 2, 42, F.sans(700), 24, '#F2F2F2', { align: 'center', track: 0.14 });
    const dw = text(c, day, w / 2, 210, F.sans(900), 150, HEX.pen, { align: 'center', track: -0.05 });
    mark({ x: w / 2 - dw / 2 - 12, y: 92, w: dw + 24, h: 132 });
    text(c, weekday, w / 2, 262, F.mono(400), 15, HEX.graphite, { align: 'center', track: 0.1 });
    c.fillStyle = '#CFCFCF';
    for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(30 + i * 24, 8, 4, 0, Math.PI * 2); c.fill(); }
  });
}

export function bollettino(seed: number, date: string): Sprite {
  const w = 540, h = 210;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#F1F1F1', rnd);
    c.fillStyle = '#DCDCDC'; c.fillRect(0, 0, w, 34);
    text(c, 'BOLLETTINO DI PAGAMENTO', 20, 23, F.mono(700), 12, HEX.pen, { track: 0.06 });
    text(c, 'sul C/C n.', 20, 66, F.mono(400), 11, HEX.graphite);
    c.strokeStyle = '#ACACAC'; c.lineWidth = 1;
    for (let i = 0; i < 12; i++) c.strokeRect(96 + i * 20.5, 50, 18, 22);
    text(c, 'di Euro', 360, 66, F.mono(400), 11, HEX.graphite);
    for (let i = 0; i < 6; i++) c.strokeRect(416 + i * 18.5, 50, 16, 22);
    text(c, 'INTESTATO A', 20, 104, F.mono(400), 10, HEX.graphite);
    greek(c, 20, 114, 300, 2, 14, rnd);
    text(c, 'CAUSALE', 20, 160, F.mono(400), 10, HEX.graphite);
    greek(c, 90, 154, 220, 1, 14, rnd);
    const dw = text(c, `scad. ${date}`, w - 24, 186, F.mono(500), 14, HEX.pen, { align: 'right' });
    mark({ x: w - 30 - dw, y: 169, w: dw + 12, h: 24 });
    barcode(c, 330, 104, 180, 40, rnd);
  });
}

export function receipt(seed: number, date: string): Sprite {
  const w = 168, h = 400;
  return sprite(w, h, seed, (c, mark, rnd) => {
    paperBase(c, w, h, '#FBFBFB', rnd);
    text(c, 'RICEVUTA', w / 2, 34, F.mono(700), 13, HEX.pen, { align: 'center', track: 0.1 });
    text(c, 'diritti di segreteria', w / 2, 52, F.mono(400), 9, HEX.graphite, { align: 'center' });
    for (let i = 0; i < 9; i++) {
      const y = 86 + i * 22;
      c.fillStyle = '#CDCDCD';
      c.fillRect(16, y, 60 + rnd() * 30, 4);
      c.fillRect(w - 52, y, 36, 4);
    }
    c.fillStyle = HEX.pen; c.fillRect(16, 300, w - 32, 1.5);
    text(c, 'TOTALE', 16, 324, F.mono(700), 12, HEX.pen);
    c.fillStyle = HEX.pen; c.fillRect(w - 62, 314, 46, 11);
    const dw = text(c, date, w / 2, 360, F.mono(400), 11, HEX.pen, { align: 'center' });
    mark({ x: w / 2 - dw / 2 - 6, y: 346, w: dw + 12, h: 20 });
  });
}

/** A poster for the manifesto (affissione): white, mono header and footer, room for the question. */
/** A pasted poster (manifesto). `k` scales its chrome (header, rule, footer) for the upright cut. */
export function poster(seed: number, w: number, h: number, head: string, prot: string, foot: string, k = 1): Sprite {
  return sprite(w, h, seed, (c, _mark, rnd) => {
    paperBase(c, w, h, '#FAFAFA', rnd);
    // glue wrinkles: a few faint diagonal tones
    for (let i = 0; i < 4; i++) {
      const x = rnd() * w;
      const g = c.createLinearGradient(x - 60, 0, x + 60, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.012)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - 60, 0, 120, h);
    }
    const m = k === 1 ? 64 : 54;
    text(c, head, m, 70 * k, F.mono(500), 17 * k, HEX.pen, { track: 0.14 });
    text(c, prot, w - m, 70 * k, F.mono(400), 17 * k, HEX.graphite, { align: 'right' });
    c.fillStyle = HEX.pen; c.fillRect(m, 90 * k, w - 2 * m, 2 * k);
    c.fillStyle = '#CFCFCF'; c.fillRect(m, h - 82 * k, w - 2 * m, k);
    text(c, foot, m, h - 48 * k, F.mono(400), 15 * k, HEX.graphite);
  }, 1.3);
}

/**
 * A real object (a graded, background-removed photo from public/ref/) as a wall piece: scaled so its
 * longest side is `side` px, with the same baked contact shadow as the paper (following its alpha).
 */
export function cutout(img: ImageBitmap, side: number, shadow = 1): Sprite {
  const k = side / Math.max(img.width, img.height);
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((w + PAD * 2) * SCALE);
  cv.height = Math.ceil((h + PAD * 2) * SCALE);
  const c = scaleContext2D(cv.getContext('2d')!, SCALE);
  c.translate(PAD, PAD);
  c.save();
  c.shadowColor = `rgba(0,0,0,${0.32 * shadow})`;
  c.shadowBlur = 26;
  c.shadowOffsetY = 10;
  c.drawImage(img, 0, 0, w, h);
  c.restore();
  return { cv, w, h, pad: PAD, dates: [] };
}
