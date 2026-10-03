// The mascot's model sheet (bollo.html): the full figure, the mouth shapes, expressions and the
// sticker. A design page, not part of the film.
import { drawBollo, type BolloPose } from './scenes/_bollo';
import { loadFonts, F, font } from './engine/type';
import { HEX } from './engine/palette';

const cv = document.getElementById('c') as HTMLCanvasElement;
const S = 2;
cv.width = 1920 * S; cv.height = 1080 * S;
const c = cv.getContext('2d')!;
c.scale(S, S);

await loadFonts();
c.fillStyle = HEX.paper; c.fillRect(0, 0, 1920, 1080);
const label = (t: string, x: number, y: number, size = 15, col: string = HEX.graphite) => {
  c.font = font(F.mono(400), size); c.fillStyle = col; c.textAlign = 'center'; c.fillText(t, x, y);
};
c.font = font(F.sans(900), 64); c.fillStyle = HEX.pen; c.textAlign = 'left';
c.letterSpacing = '-2.5px'; c.fillText('Bollo', 60, 100); c.letterSpacing = '0px';
c.font = font(F.sans(500), 22); c.fillStyle = HEX.graphite;
c.fillText('gatto nero romano · mascotte di autocratico · model sheet v1', 62, 136);

// hero
drawBollo(c, 330, 470, 62, { mouth: 'a', arm: 'up', brow: 0.9 });
label('posa: rap', 330, 1050);

// mouths
const mouths: BolloPose['mouth'][] = ['smirk', 'm', 'a', 'e', 'i', 'o', 'u', 'f', 'shout'];
mouths.forEach((m, i) => {
  const col = i % 5, row = Math.floor(i / 5);
  const x = 800 + col * 220, y = 300 + row * 300;
  drawBollo(c, x, y, 36, { headOnly: true, mouth: m });
  label(m!, x, y + 118);
});

// expressions
const ex: [string, BolloPose][] = [
  ['furbo', { headOnly: true, mouth: 'smirk', brow: 1, lid: 0.5, look: -0.6 }],
  ['urlo', { headOnly: true, mouth: 'shout', brow: 1, lid: 0.25, earL: 1, earR: 1 }],
  ['annoiato', { headOnly: true, mouth: 'm', brow: -0.3, lid: 0.68 }],
];
ex.forEach(([n, p], i) => {
  const x = 800 + i * 220, y = 900;
  drawBollo(c, x, y, 36, p);
  label(n, x, y + 118);
});

// sticker on ink
c.fillStyle = HEX.ink; c.fillRect(1480, 700, 400, 340);
drawBollo(c, 1680, 860, 48, { headOnly: true, mouth: 'smirk', brow: 1, border: 20 });
label('sticker', 1680, 1028, 15, HEX.faint);
(window as any).__ready = true;
