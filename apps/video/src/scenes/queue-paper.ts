// Objects for the `queue` plate: the landing floor with the doormat, the queue ticket, the round
// office stamp, the ticket machine.
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { SCALE, scaleContext2D } from '../engine/gl';
import { clamp, ease, mulberry32, noise2, TAU } from '../engine/util';
import { roundRect } from './_motifs';
import { type Sprite, barcode, hline, makeSprite, paperGrain, txt } from './open-paper';

/** The landing outside the flat, from above: graniglia floor, the door's foot, a coir doormat. 2400×1500 (or w×h). */
export function landingFloor(drawMat = true, w = 2400, h = 1500): HTMLCanvasElement {
  const res = Math.min(2, SCALE * 1.2);
  const cv = document.createElement('canvas');
  cv.width = w * res; cv.height = h * res;
  const c = cv.getContext('2d')!;
  c.scale(res, res);
  const r = mulberry32(5);
  // graniglia (terrazzo): grey cement with marble chips
  c.fillStyle = '#cfcfcd'; c.fillRect(0, 0, w, h);
  const chips = Math.round((26000 * (w * h)) / (2400 * 1500));
  for (let i = 0; i < chips; i++) {
    const x = r() * w, y = r() * h, s = 1.2 + Math.pow(r(), 3) * 11;
    const tone = r();
    c.fillStyle = tone < 0.3 ? `rgba(120,120,118,${0.35 + r() * 0.3})` : tone < 0.7 ? `rgba(240,240,238,${0.45 + r() * 0.35})` : `rgba(170,170,168,${0.5 + r() * 0.3})`;
    c.beginPath();
    const n = 5 + Math.floor(r() * 3), a0 = r() * TAU;
    for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU, rr = s * (0.6 + r() * 0.5); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8); }
    c.fill();
  }
  // tile joints
  c.fillStyle = 'rgba(0,0,0,0.10)';
  for (let x = 0; x < w; x += 400) c.fillRect(x, 0, 2, h);
  for (let y = 300; y < h; y += 400) c.fillRect(0, y, w, 2);
  // the door: dark panel at the top, aluminium threshold, the gap's shadow
  c.fillStyle = '#2a2a2a'; c.fillRect(0, 0, w, 250);
  const dg = c.createLinearGradient(0, 0, 0, 250);
  dg.addColorStop(0, 'rgba(255,255,255,0.05)'); dg.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = dg; c.fillRect(0, 0, w, 250);
  for (let x = 120; x < w; x += 360) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x, 0, 6, 240); }
  c.fillStyle = '#0c0c0c'; c.fillRect(0, 238, w, 14);
  const tg = c.createLinearGradient(0, 252, 0, 300);
  tg.addColorStop(0, '#b9b9b9'); tg.addColorStop(0.4, '#e4e4e4'); tg.addColorStop(1, '#8f8f8f');
  c.fillStyle = tg; c.fillRect(0, 252, w, 48);
  c.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 9) c.fillRect(x, 262, 2, 28);
  const sg = c.createLinearGradient(0, 300, 0, 360);
  sg.addColorStop(0, 'rgba(0,0,0,0.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg; c.fillRect(0, 300, w, 60);
  if (!drawMat) return cv;
  // the doormat
  const mx = 450, my = 400, mw = 1500, mh = 900;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 30; c.shadowOffsetY = 8;
  c.fillStyle = '#2e2e2e'; roundRect(c, mx, my, mw, mh, 18); c.fill();
  c.restore();
  c.save();
  roundRect(c, mx, my, mw, mh, 18); c.clip();
  c.fillStyle = '#4a4a49'; c.fillRect(mx, my, mw, mh);
  // coir fibres
  for (let i = 0; i < 60000; i++) {
    const x = mx + r() * mw, y = my + r() * mh;
    const n = noise2(x / 40, y / 40, 3);
    const l = 4 + r() * 9, a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI / 2);
    const g = 45 + Math.floor(r() * 70 + n * 20);
    c.strokeStyle = `rgba(${g},${g},${g - 2},${0.5 + r() * 0.5})`;
    c.lineWidth = 0.8 + r() * 1.2;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  // border band and lettering, darker fibre
  c.strokeStyle = 'rgba(15,15,15,0.55)'; c.lineWidth = 40;
  roundRect(c, mx + 48, my + 48, mw - 96, mh - 96, 10); c.stroke();
  c.font = font(F.sans(900), 170);
  c.letterSpacing = '24px';
  c.textAlign = 'center';
  c.fillStyle = 'rgba(12,12,12,0.55)';
  c.fillText('BENVENUTI', mx + mw / 2, my + mh / 2 + 280);
  // fibre over the lettering, so it reads woven
  for (let i = 0; i < 16000; i++) {
    const x = mx + r() * mw, y = my + mh / 2 + 80 + r() * 260;
    const g = 60 + Math.floor(r() * 50);
    c.strokeStyle = `rgba(${g},${g},${g},${0.25 + r() * 0.3})`;
    c.lineWidth = 1;
    const a = (r() - 0.5) * 1.4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); c.stroke();
  }
  c.restore();
  return cv;
}

export const TICKET = { w: 560, h: 1180, textY: 820 };
/** The queue ticket, thermal paper: office, «Il suo numero: A 247», «In attesa: 86». */
export function ticket(): Sprite {
  const { w, h } = TICKET;
  return makeSprite(w, h, (c) => {
    // serrated tear at top and bottom
    c.beginPath();
    const z = 14;
    c.moveTo(0, z);
    for (let x = 0; x <= w; x += z) c.lineTo(x, (x / z) % 2 ? 0 : z);
    c.lineTo(w, h - z);
    for (let x = w; x >= 0; x -= z) c.lineTo(x, (x / z) % 2 ? h : h - z);
    c.closePath();
    c.fillStyle = '#f7f7f5'; c.fill();
    c.save(); c.clip(); paperGrain(c, w, h, 0.7);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.05)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.restore();
    const ink = '#1d1d1d', cx = w / 2;
    txt(c, 'COMUNE DI ESEMPIO', cx, 92, 30, { w: 700, color: ink, align: 'center', ls: 0.04 });
    txt(c, 'Ufficio Tributi · Sportello al pubblico', cx, 128, 20, { w: 400, color: '#444', align: 'center' });
    hline(c, 50, w - 50, 160, 2, ink);
    txt(c, 'Il suo numero:', cx, 222, 30, { w: 500, color: ink, align: 'center' });
    txt(c, 'A 247', cx, 410, 190, { w: 900, color: ink, align: 'center', ls: -0.05 });
    txt(c, 'In attesa: 86', cx, 492, 40, { w: 600, color: ink, align: 'center' });
    txt(c, 'Tempo stimato: —', cx, 534, 22, { fam: 'mono', w: 400, color: '#444', align: 'center' });
    hline(c, 50, w - 50, 576, 1, '#777');
    txt(c, 'lun 19/10/2026', 50, 620, 22, { fam: 'mono', w: 500, color: '#333' });
    txt(c, '08:57:12', w - 50, 620, 22, { fam: 'mono', w: 500, color: '#333', align: 'right' });
    txt(c, 'Servizio: TRIBUTI LOCALI', 50, 656, 20, { fam: 'mono', w: 400, color: '#333' });
    hline(c, 50, w - 50, 700, 1, '#777');
    barcode(c, 90, h - 210, w - 180, 80, 247, '#222');
    txt(c, 'Conservi il biglietto. Grazie.', cx, h - 92, 20, { w: 400, color: '#444', align: 'center' });
  });
}

/** The round office stamp (timbro tondo), as a white mask with rubber texture; tint it when drawing. */
export function roundStamp(size: number, seed: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(size * SCALE);
  const c = scaleContext2D(cv.getContext('2d')!, SCALE);
  const R = size / 2;
  c.translate(R, R);
  c.strokeStyle = '#fff'; c.fillStyle = '#fff';
  c.lineWidth = size * 0.03; c.beginPath(); c.arc(0, 0, R * 0.95, 0, TAU); c.stroke();
  c.lineWidth = size * 0.012; c.beginPath(); c.arc(0, 0, R * 0.68, 0, TAU); c.stroke();
  // ring text
  const ring = 'COMUNE DI ESEMPIO · UFFICIO TRIBUTI · ';
  c.font = font(F.sans(700), size * 0.072);
  const chars = Array.from(ring);
  const total = chars.reduce((s, ch) => s + c.measureText(ch).width, 0);
  let a = -Math.PI / 2 - Math.PI * 0.95;
  const rr = R * 0.77;
  const k = (TAU * 0.98) / total;
  for (const ch of chars) {
    const cw = c.measureText(ch).width;
    a += (cw / 2) * k;
    c.save(); c.rotate(a + Math.PI / 2); c.translate(0, -rr); c.textAlign = 'center';
    c.fillText(ch, 0, size * 0.026); c.restore();
    a += (cw / 2) * k;
  }
  c.textAlign = 'center';
  c.font = font(F.sans(900), size * 0.072);
  c.fillText('PROTOCOLLO', 0, -size * 0.07);
  c.font = font(F.mono(700), size * 0.07);
  c.fillText('19 OTT 2026', 0, size * 0.04);
  c.font = font(F.sans(500), size * 0.052);
  c.fillText('n. 41277', 0, size * 0.14);
  // rubber texture
  const r = mulberry32(seed);
  c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    const x = (r() - 0.5) * size, y = (r() - 0.5) * size;
    const v = noise2(x / (size * 0.12), y / (size * 0.12), seed);
    if (v < 0.35) continue;
    c.globalAlpha = 0.4 + 0.6 * r();
    c.beginPath(); c.arc(x, y, 0.6 + r() * size * 0.012 * v, 0, TAU); c.fill();
  }
  c.globalAlpha = 0.5;
  c.fillRect(-R, (r() - 0.5) * size, size, 1 + r() * 3);
  // tint red
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = HEX.overdue;
  c.fillRect(-R, -R, size, size);
  return cv;
}
/** Slam a pre-tinted stamp image centred at (x, y), `k` s after the hit (like drawStamp). Returns shake px. */
export function slamImage(c: CanvasRenderingContext2D, im: HTMLCanvasElement, x: number, y: number, size: number, k: number, angle: number) {
  if (k < -0.07) return 0;
  const drop = clamp((k + 0.07) / 0.07);
  const s = drop < 1 ? 1.5 - 0.5 * ease.inQuad(drop) : 1 + 0.025 * Math.exp(-k * 30) * Math.cos(k * 60);
  c.save();
  c.translate(x, y); c.rotate(angle); c.scale(s, s);
  c.globalAlpha *= drop < 1 ? 0.25 + 0.75 * drop : 0.92;
  c.drawImage(im, -size / 2, -size / 2, size, size);
  c.restore();
  return drop < 1 ? 0 : 14 * Math.exp(-k * 22);
}

/** The queue display ("eliminacode"): dark panel, red LED number. Drawn live. */
export function queueDisplay(c: CanvasRenderingContext2D, cx: number, cy: number, num: string, glow: number) {
  const w = 540, h = 330;
  c.save();
  c.translate(cx - w / 2, cy - h / 2);
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.shadowOffsetY = 16;
  c.fillStyle = '#1b1b1b'; roundRect(c, 0, 0, w, h, 18); c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = '#060606'; roundRect(c, 22, 64, w - 44, 196, 8); c.fill();
  txt(c, 'STIAMO SERVENDO IL NUMERO', w / 2, 44, 18, { w: 700, color: '#9a9a9a', align: 'center', ls: 0.14 });
  // dot-matrix digits: draw text, then a dot grid mask look via the LED pitch
  c.save();
  c.beginPath(); c.rect(22, 64, w - 44, 196); c.clip();
  c.shadowColor = `rgba(220,38,39,${0.8 * glow})`; c.shadowBlur = 24;
  c.font = font(F.mono(700), 170); c.textAlign = 'center'; c.fillStyle = HEX.overdue;
  c.fillText(num, w / 2, 222);
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(6,6,6,0.75)';
  for (let x = 22; x < w - 22; x += 7) c.fillRect(x, 64, 2, 196);
  for (let y = 64; y < 260; y += 7) c.fillRect(22, y, w - 44, 2);
  c.restore();
  txt(c, 'SPORTELLO 3', w / 2, 302, 26, { w: 700, color: '#d8d8d8', align: 'center', ls: 0.1 });
  c.restore();
}

/** The ticket machine's face: a grey panel, a slot, the button. Drawn live; returns the slot's centre. */
export function machineFace(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.save();
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#d9d9d9'); g.addColorStop(1, '#bdbdbd');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  // the screen with the services
  c.fillStyle = '#151515'; roundRect(c, x + 70, y + 230, w - 140, 250, 14); c.fill();
  txt(c, 'Scegli il servizio', x + 100, y + 280, 22, { w: 600, color: '#cfcfcf' });
  ['A · Tributi locali', 'B · Anagrafe', 'C · Polizia locale'].forEach((s, i) => {
    c.fillStyle = i === 0 ? '#f1f1f1' : '#2a2a2a'; roundRect(c, x + 100, y + 300 + i * 56, w - 200, 44, 8); c.fill();
    txt(c, s, x + 120, y + 330 + i * 56, 20, { w: 600, color: i === 0 ? '#111' : '#bdbdbd' });
  });
  // the slot
  const sx = x + w / 2, sy = y + 630;
  c.fillStyle = '#1a1a1a'; roundRect(c, sx - 210, sy - 14, 420, 28, 14); c.fill();
  c.fillStyle = '#000'; c.fillRect(sx - 190, sy - 3, 380, 6);
  txt(c, 'Ritira il biglietto', sx, sy + 56, 20, { w: 500, color: '#444', align: 'center' });
  c.restore();
  return { x: sx, y: sy };
}
