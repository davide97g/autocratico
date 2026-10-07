// Helpers for the upright (9:16) cut of the `pile` and `queue` plates.
import { SAFE } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { clamp, ease } from '../engine/util';
import type { Line } from '../engine/lyrics';
import { roundRect } from './_motifs';

/**
 * The edge lyric (open-paper's `lyricStrip`) broken into stacked labels for a narrow frame: `rows` are
 * word indices per label; the stack sits at SAFE.left, its last label just above SAFE.bottom. Each
 * label appears with its first word and grows with the sung words.
 */
export function lyricStack(c: CanvasRenderingContext2D, line: Line, t: number, rows: number[][],
  o: { size?: number; key?: string[]; dark?: boolean; x?: number; bottom?: number } = {}) {
  const size = o.size ?? 38;
  const fam = F.sans(500);
  const padX = 22, padY = 14, gap = 10;
  const bh = size * 1.35 + padY;
  const x = o.x ?? SAFE.left, bottom = o.bottom ?? SAFE.bottom - 10;
  rows.forEach((row, ri) => {
    const words = row.map((i) => line.words[i]!);
    const first = words[0]!;
    if (t < first.start) return;
    const y = bottom - (rows.length - 1 - ri) * (bh + gap);
    const text = words.map((w) => w.w).join(' ');
    const lay = layout(text, fam, size);
    const vis = clamp((t - first.start) / 0.08);
    let reached = 0, ci = 0;
    for (const w of words) {
      const n = Array.from(w.w).length;
      const g = lay.glyphs[Math.min(lay.glyphs.length - 1, ci + n - 1)]!;
      if (t >= w.start) reached = g.x + g.w;
      ci += n + 1;
    }
    const curW = Math.min(lay.width + padX * 2, reached + padX * 2);
    c.save();
    c.globalAlpha *= vis;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.fillStyle = o.dark ? HEX.ink2 : HEX.sheet;
    roundRect(c, x, y - bh, curW, bh, 10); c.fill();
    c.restore();
    c.font = font(fam, size);
    c.textBaseline = 'alphabetic';
    const a0 = c.globalAlpha;
    ci = 0;
    for (const w of words) {
      const n = Array.from(w.w).length;
      if (t >= w.start) {
        const k = clamp((t - w.start) / 0.07);
        const key = o.key?.some((s) => w.w.toLowerCase().startsWith(s));
        c.fillStyle = key ? HEX.overdue : o.dark ? '#f2f2f2' : HEX.pen;
        c.globalAlpha = a0 * k;
        c.fillText(w.w, x + padX + lay.glyphs[ci]!.x, y - padY - size * 0.32 + (1 - ease.outCubic(k)) * 10);
      }
      ci += n + 1;
    }
    c.restore();
  });
}
