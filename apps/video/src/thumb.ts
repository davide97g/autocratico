// The YouTube thumbnail (thumb.html, ?v=dark|light): "BUROCRAZIA" struck out, "AUTOCRATICO" huge,
// Bollo screaming at the words. Drawn with the film's own type, palette and mascot.
import { drawBolloHead } from './scenes/_bollo-head';
import { VISEME } from './scenes/_bollo';
import { loadFonts, F, font } from './engine/type';
import { HEX } from './engine/palette';

const light = new URLSearchParams(location.search).get('v') === 'light';
const cv = document.getElementById('c') as HTMLCanvasElement;
const S = 2;
cv.width = 1920 * S; cv.height = 1080 * S;
const c = cv.getContext('2d')!;
c.scale(S, S);
await loadFonts();

const BG = light ? HEX.paper : HEX.ink;
const FG = light ? HEX.pen : '#F4F4F1';
c.fillStyle = BG; c.fillRect(0, 0, 1920, 1080);
// one soft light behind the cat, nothing else
const g = c.createRadialGradient(1440, 520, 0, 1440, 520, 760);
g.addColorStop(0, light ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.10)');
g.addColorStop(1, 'rgba(255,255,255,0)');
c.fillStyle = g; c.fillRect(0, 0, 1920, 1080);

const set = (text: string, x: number, y: number, size: number, color: string, track = -0.045) => {
  c.font = font(F.sans(900), size);
  c.letterSpacing = `${track * size}px`;
  c.fillStyle = color;
  c.textBaseline = 'alphabetic';
  c.fillText(text, x, y);
  return c.measureText(text).width;
};

// the text block, justified: both words set to the same width
const BLOCK = 1060, x0 = 96;
const fit = (text: string) => {
  c.font = font(F.sans(900), 100);
  c.letterSpacing = `${-0.045 * 100}px`;
  return (BLOCK / c.measureText(text).width) * 100;
};
const s1 = fit('BUROCRAZIA'), s2 = fit('AUTOCRATICO');
const y1 = 392 + s1 * 0.72, y2 = y1 + s2 * 0.92;
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
drawBolloHead(c, 1585, 600, 142, {
  mouth: { ...VISEME.shout, hw: 130, d: 96 }, jaw: 1,
  lidL: 0, lidR: 0, squint: 0, pupil: 0.48, lookX: -0.7, lookY: 0.05,
  brow: 1.15, browUpL: 24, browUpR: 20,
  tilt: -0.12, turn: -0.38, sx: 0.98, sy: 1.06,
  earL: -0.26, earR: -0.3, whisk: 0.05, border: 18, shadow: 1,
});

// one quiet line: what it is
c.font = font(F.mono(500), 38);
c.letterSpacing = '0px';
c.fillStyle = light ? HEX.graphite : 'rgba(244,244,241,0.62)';
c.fillText('il registro della burocrazia italiana', x0, y2 + 104);
(window as any).__ready = true;
