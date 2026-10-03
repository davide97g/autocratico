// "FUTURO AUTOCRATICO" ×2: white Geist Black on ink redaction bars. Shared by `chant` (which sets
// them) and `outro` (whose first beat wipes the last bar out of frame).
import { W } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { clamp, ease } from '../engine/util';
import type { Lyrics } from '../engine/lyrics';

export interface ChantWord {
  text: string; start: number; size: number; cy: number; x: number; w: number; tx: number; round: number;
  /** When its bar starts sweeping in: 0.04 s ahead of the word, but never before the previous word ends. */
  from: number;
}

const TR = -0.045;
/** The four shouted words with their layout: round 1 stacked at 230 px, round 2 bigger (cropped edge to edge). */
export function chantWords(ly: Lyrics): ChantWord[] {
  const a = ly.get('futuro autocratico', 0).words, b = ly.get('futuro autocratico', 1).words;
  const fam = F.sans(900);
  const mk = (text: string, start: number, size: number, cy: number, round: number, prevEnd = 0): ChantWord => {
    const tw = measure(text, fam, size, TR * size);
    const pad = size * 0.2;
    const w = Math.max(tw + pad * 2, round === 2 ? W + 80 : 0);
    return { text, start, size, cy, x: (W - w) / 2, w, tx: (W - tw) / 2, round, from: Math.max(start - 0.04, prevEnd) };
  };
  return [
    mk('FUTURO', a[0]!.start, 220, 214, 1),
    mk('AUTOCRATICO', a[1]!.start, 220, 870, 1),
    mk('FUTURO', b[0]!.start, 372, 196, 2, a[1]!.end),
    mk('AUTOCRATICO', b[1]!.start, 288, 900, 2),
  ];
}

/**
 * Draw a word on its bar. The bar sweeps in left to right from 0.04 s before the word (done in 0.1 s);
 * the letters are clipped to it. `dx` shifts everything (the outro's exit wipe).
 */
export function drawChantWord(c: CanvasRenderingContext2D, cw: ChantWord, t: number, dx = 0, punch = 0) {
  const k = t - cw.from;
  if (k < 0) return;
  const p = ease.outCubic(clamp(k / 0.1));
  const h = cw.size * 0.98, y = cw.cy - h / 2;
  c.save();
  c.translate(W / 2 + dx, cw.cy);
  const s = 1 + punch;
  c.scale(s, s);
  c.translate(-W / 2, -cw.cy);
  c.beginPath();
  c.rect(cw.x, y, cw.w * p, h);
  c.clip();
  c.fillStyle = HEX.ink;
  c.fillRect(cw.x, y, cw.w, h);
  c.fillStyle = HEX.sheet;
  c.font = font(F.sans(900), cw.size);
  c.letterSpacing = `${TR * cw.size}px`;
  c.textBaseline = 'alphabetic';
  c.fillText(cw.text, cw.tx, cw.cy + cw.size * 0.355);
  c.restore();
}
