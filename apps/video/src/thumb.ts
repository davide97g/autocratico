// The YouTube thumbnail (thumb.html, ?v=dark|light): "BUROCRAZIA" struck out, "AUTOCRATICO" huge,
// Bollo screaming at the words. Drawn with the film's own type, palette and mascot.
// `&aspect=9x16`: the cover of the Reel / Short (1080x1920). Everything sits in the centred 3:4 band
// (y 240–1680) that the Instagram profile grid shows.
import { drawBolloHead } from './scenes/_bollo-head';
import { VISEME } from './scenes/_bollo';
import { loadFonts, F, font } from './engine/type';
import { HEX } from './engine/palette';

const q = new URLSearchParams(location.search);
const light = q.get('v') === 'light';
const UP = q.get('aspect') === '9x16';
const CW = UP ? 1080 : 1920, CH = UP ? 1920 : 1080;
const cv = document.getElementById('c') as HTMLCanvasElement;
const S = 2;
cv.width = CW * S; cv.height = CH * S;
cv.style.width = `${CW}px`; cv.style.height = `${CH}px`;
const c = cv.getContext('2d')!;
c.scale(S, S);
await loadFonts();

const BG = light ? HEX.paper : HEX.ink;
const FG = light ? HEX.pen : '#F4F4F1';
c.fillStyle = BG; c.fillRect(0, 0, CW, CH);
// one soft light behind the cat, nothing else
const [gx, gy] = UP ? [540, 640] : [1440, 520];
const g = c.createRadialGradient(gx, gy, 0, gx, gy, 760);
g.addColorStop(0, light ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.10)');
g.addColorStop(1, 'rgba(255,255,255,0)');
c.fillStyle = g; c.fillRect(0, 0, CW, CH);

const set = (text: string, x: number, y: number, size: number, color: string, track = -0.045) => {
  c.font = font(F.sans(900), size);
  c.letterSpacing = `${track * size}px`;
  c.fillStyle = color;
  c.textBaseline = 'alphabetic';
  c.fillText(text, x, y);
  return c.measureText(text).width;
};

// the text block, justified: both words set to the same width
const BLOCK = UP ? 920 : 1060, x0 = UP ? 80 : 96;
const fit = (text: string) => {
  c.font = font(F.sans(900), 100);
  c.letterSpacing = `${-0.045 * 100}px`;
  return (BLOCK / c.measureText(text).width) * 100;
};
const s1 = fit('BUROCRAZIA'), s2 = fit('AUTOCRATICO');
const y1 = (UP ? 1200 : 392) + s1 * 0.72, y2 = y1 + s2 * 0.92;
// BUROCRAZIA, faded and struck out with a red bar, slightly off-level like a marker stroke
const w1 = set('BUROCRAZIA', x0, y1, s1, light ? 'rgba(15,15,15,0.38)' : 'rgba(244,244,241,0.40)');
c.save();
c.translate(x0 - 16, y1 - s1 * 0.36);
c.rotate(-0.03);
c.fillStyle = HEX.overdue;
c.beginPath(); c.roundRect(0, -s1 * 0.09, w1 + 32, s1 * 0.18, 6); c.fill();
c.restore();
// AUTOCRATICO, the answer
set('AUTOCRATICO', x0 - 4, y2, s2, FG);

// Bollo, screaming at the words: big, tilted toward them, cropped by the frame
drawBolloHead(c, UP ? 560 : 1585, UP ? 745 : 600, UP ? 150 : 142, {
  mouth: { ...VISEME.shout, hw: 130, d: 96 }, jaw: 1,
  lidL: 0, lidR: 0, squint: 0, pupil: 0.48, lookX: UP ? -0.1 : -0.7, lookY: UP ? 0.55 : 0.05,
  brow: 1.15, browUpL: 24, browUpR: 20,
  tilt: UP ? -0.06 : -0.12, turn: UP ? -0.08 : -0.38, sx: 0.98, sy: 1.06,
  earL: -0.26, earR: -0.3, whisk: 0.05, border: 18, shadow: 1,
});

// one quiet line: what it is
c.font = font(F.mono(500), UP ? 36 : 38);
c.letterSpacing = '0px';
c.fillStyle = light ? HEX.graphite : 'rgba(244,244,241,0.62)';
c.fillText('il registro della burocrazia italiana', x0, y2 + 104);
(window as any).__ready = true;
