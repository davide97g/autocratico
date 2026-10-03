// Shared bits for the phone / chant / outro plates: the karaoke caption stack, an offscreen phone
// screen (drawn in iPhone points), the touch indicator, small glyphs, and a few app-style widgets.
import { HEX, rgba } from '../engine/palette';
import { F, font, glyphX, measure } from '../engine/type';
import { clamp, ease, TAU } from '../engine/util';
import { SCALE, scaleContext2D } from '../engine/gl';
import type { Line, Word } from '../engine/lyrics';
import { roundRect } from './_motifs';

// ---------------------------------------------------------------- caption stack
/**
 * A row of sung words, set big in Geist Black. Each word rises into its line box from its start
 * (clip reveal, 0.16 s), so it is complete well before its end. `dim` 0..1 fades a row that has been
 * sung to the faint grey. Word x offsets come from one kerned run (glyphX).
 */
export interface Row { words: Word[]; text: string; }
export function rowsOf(line: Line, split: number[]): Row[] {
  // split = number of words per row, e.g. [1, 1, 2, 3, 2]
  const rows: Row[] = [];
  let i = 0;
  for (const n of split) {
    const words = line.words.slice(i, i + n);
    rows.push({ words, text: words.map((w) => w.w).join(' ') });
    i += n;
  }
  return rows;
}

export function drawRow(c: CanvasRenderingContext2D, row: Row, x: number, y: number, size: number, t: number,
  o: { weight?: number; color?: string; dim?: number; tracking?: number; lead?: number; dur?: number; colors?: (string | undefined)[] } = {}) {
  const fam = F.sans(o.weight ?? 900);
  const tr = (o.tracking ?? -0.04) * size;
  let ci = 0;
  c.save();
  c.font = font(fam, size);
  c.letterSpacing = `${tr}px`;
  c.textBaseline = 'alphabetic';
  row.words.forEach((w, wi) => {
    const k = t - (w.start - (o.lead ?? 0.02));
    const wx = x + glyphX(row.text, ci, fam, size, tr);
    ci += Array.from(w.w).length + 1;
    if (k < 0) return;
    const p = ease.outCubic(clamp(k / (o.dur ?? 0.16)));
    const col = o.colors?.[wi] ?? o.color ?? HEX.pen;
    c.save();
    c.beginPath();
    c.rect(wx - size * 0.2, y - size * 1.05, measure(w.w, fam, size, tr) + size * 0.5, size * 1.35);
    c.clip();
    c.globalAlpha = clamp(p * 1.6);
    c.fillStyle = mix(col, HEX.faint, o.dim ?? 0);
    c.fillText(w.w, wx, y + (1 - p) * size * 0.9);
    c.restore();
  });
  c.restore();
}

/** Mix two #rrggbb colours. */
export function mix(a: string, b: string, k: number) {
  if (k <= 0) return a;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// ---------------------------------------------------------------- the phone screen
/** An offscreen canvas in iPhone points (393×852), backed at 3× (× output scale) like the captures. */
export class PhoneScreen {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor(public w = 393, public h = 852, public s = 3 * SCALE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * s);
    this.canvas.height = Math.round(h * s);
    this.ctx = scaleContext2D(this.canvas.getContext('2d')!, s);
  }
  begin(bg: string = HEX.paper) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.shadowBlur = 0;
    c.shadowColor = 'transparent';
    c.fillStyle = bg;
    c.fillRect(0, 0, this.w, this.h);
    return c;
  }
}

/** iOS status bar (time left, signal/wifi/battery right). */
export function statusBar(c: CanvasRenderingContext2D, time: string, light = false) {
  const col = light ? '#fff' : '#000';
  c.save();
  c.fillStyle = col;
  c.font = font(F.sans(600), 17);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(time, 64, 31);
  // signal bars
  for (let i = 0; i < 4; i++) {
    const h = 4 + i * 2.6;
    roundRect(c, 292 + i * 5, 36 - h, 3.2, h, 1); c.fill();
  }
  // wifi
  c.strokeStyle = col; c.lineWidth = 2.1; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    c.beginPath(); c.arc(322, 37, 3 + i * 3.6, -Math.PI * 0.75, -Math.PI * 0.25); c.stroke();
  }
  // battery
  c.lineWidth = 1.2;
  c.globalAlpha = 0.45;
  roundRect(c, 336, 25.5, 25, 12, 3.5); c.stroke();
  c.fillRect(362.5, 29.5, 1.6, 4);
  c.globalAlpha = 1;
  roundRect(c, 338, 27.5, 18, 8, 2); c.fill();
  c.restore();
}

/** The touch indicator: a soft dark disc that lands (`k` = s since contact; negative = approaching). */
export function drawTouch(c: CanvasRenderingContext2D, x: number, y: number, k: number, r = 22) {
  if (k < -0.18 || k > 0.45) return;
  let a: number, rr: number;
  if (k < 0) { const p = 1 + k / 0.18; a = 0.22 * p; rr = r * (1.35 - 0.35 * p); }
  else { const p = clamp(k / 0.45); a = 0.3 * (1 - ease.inQuad(p)); rr = r * (0.82 + 0.5 * ease.outCubic(p)); }
  c.save();
  c.fillStyle = `rgba(20,20,20,${a})`;
  c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- glyphs (lucide-ish, 1.75 stroke)
export function glyph(c: CanvasRenderingContext2D, name: string, x: number, y: number, s: number, col: string = HEX.pen, lw = 1.75) {
  c.save();
  c.translate(x, y);
  c.scale(s / 24, s / 24);
  c.strokeStyle = col; c.fillStyle = col;
  c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
  const P = (d: string) => c.stroke(new Path2D(d));
  switch (name) {
    case 'mail': roundRect(c, 2, 4, 20, 16, 2); c.stroke(); P('M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'); break;
    case 'send': P('M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z'); P('M21.85 2.15 10.91 13.09'); break;
    case 'phone': roundRect(c, 5, 2, 14, 20, 2); c.stroke(); P('M12 18h.01'); break;
    case 'upload': P('M12 3v12'); P('m17 8-5-5-5 5'); P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'); break;
    case 'copy': roundRect(c, 8, 8, 14, 14, 2); c.stroke(); P('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'); break;
    case 'folder': P('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'); break;
    case 'printer': P('M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'); P('M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6'); roundRect(c, 6, 14, 12, 8, 1); c.stroke(); break;
    case 'bubble': P('M7.9 20A9 9 0 1 0 4 16.1L2 22Z'); break;
    case 'note': P('M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z'); P('M15 3v6h6'); break;
    case 'eye': P('M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0'); c.beginPath(); c.arc(12, 12, 3, 0, TAU); c.stroke(); break;
    case 'sparkles': P('M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z'); P('M20 3v4'); P('M22 5h-4'); break;
    case 'check': P('M20 6 9 17l-5-5'); break;
    case 'x': P('M18 6 6 18'); P('m6 6 12 12'); break;
    case 'mic': roundRect(c, 9, 2, 6, 13, 3); c.stroke(); P('M19 10v2a7 7 0 0 1-14 0v-2'); P('M12 19v3'); break;
    case 'clip': P('m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'); break;
    case 'chevron': P('m15 18-6-6 6-6'); break;
    case 'bolt': P('M13 2 3 14h9l-1 8 10-12h-9l1-8z'); break;
    case 'undo': P('M9 14 4 9l5-5'); P('M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'); break;
    case 'commit': c.beginPath(); c.arc(12, 12, 3, 0, TAU); c.stroke(); P('M3 12h6'); P('M15 12h6'); break;
    case 'search': c.beginPath(); c.arc(11, 11, 8, 0, TAU); c.stroke(); P('m21 21-4.3-4.3'); break;
    case 'bell': P('M10.27 21a2 2 0 0 0 3.46 0'); P('M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33'); break;
    case 'warn': {
      c.fillStyle = HEX.soon;
      c.fill(new Path2D('M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z'));
      c.strokeStyle = '#1a1a1a'; c.lineWidth = 2.4;
      P('M12 9v4.5'); P('M12 17.2h.01');
      break;
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- floating widgets (on the studio)
/** A white rounded "widget" card with a soft studio shadow. */
export function widget(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 28, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.shadowColor = 'rgba(0,0,0,0.16)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
  c.fillStyle = HEX.sheet;
  roundRect(c, x, y, w, h, r); c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = HEX.bezel; c.lineWidth = 1;
  roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
  c.restore();
}

/** The app's pill (status chip) in any size, with an optional label override; `col` a hex colour. */
export function pill(c: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, col: string, o: { dot?: boolean; bg?: number; weight?: number; align?: 'left' | 'right' | 'center' } = {}) {
  c.save();
  c.font = font(F.sans(o.weight ?? 500), size);
  const tw = c.measureText(label).width;
  const h = size * 1.6, pad = size * 0.62, dot = (o.dot ?? true) ? size * 0.2 : 0;
  const w = tw + pad * 2 + (dot ? dot * 2 + size * 0.4 : 0);
  const x0 = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  c.fillStyle = rgba(col, o.bg ?? 0.13);
  roundRect(c, x0, y, w, h, h / 2); c.fill();
  c.fillStyle = col;
  if (dot) { c.beginPath(); c.arc(x0 + pad + dot, y + h / 2, dot, 0, TAU); c.fill(); }
  c.textBaseline = 'middle';
  c.fillText(label, x0 + pad + (dot ? dot * 2 + size * 0.4 : 0), y + h / 2 + size * 0.04);
  c.restore();
  return w;
}

/** Wrap text to lines of max width (current font). */
export function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (c.measureText(next).width > maxW && cur) { out.push(cur); cur = word; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}
