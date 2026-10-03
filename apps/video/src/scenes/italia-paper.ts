// The paper wall of "l'Italia lenta e pallosa": the first half's paperwork, come back grey and
// desaturated. Built once (seeded) into a large canvas: forms, envelopes, post-its, queue tickets,
// calendar pages, faded rubber stamps. Only greys: the colour belongs to the app.
import { F, font } from '../engine/type';
import { mulberry32, TAU } from '../engine/util';
import { strokeText, drawStrokeText } from '../engine/stroke';
import { roundRect } from './_motifs';
import { offscreen } from './inbox-kit';

type R = () => number;
const grey = (v: number, a = 1) => `rgba(${v},${v},${v},${a})`;

function lines(c: CanvasRenderingContext2D, r: R, x: number, y: number, w: number, n: number, gap = 11, tone = 160) {
  for (let i = 0; i < n; i++) {
    const lw = w * (i === n - 1 ? 0.3 + r() * 0.4 : 0.75 + r() * 0.25);
    c.fillStyle = grey(tone + r() * 25);
    c.fillRect(x, y + i * gap, lw, Math.max(3, gap * 0.38));
  }
}

function label(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight = 700, tone = 70, mono = false) {
  c.font = font(mono ? F.mono(weight) : F.sans(weight), size);
  c.fillStyle = grey(tone);
  c.fillText(s, x, y);
}

/** A faded rubber stamp in grey ink. */
function oldStamp(c: CanvasRenderingContext2D, r: R, text: string, x: number, y: number, size: number) {
  c.save();
  c.translate(x, y);
  c.rotate((r() - 0.5) * 0.5);
  c.globalAlpha = 0.28 + r() * 0.18;
  c.strokeStyle = grey(70);
  c.fillStyle = grey(70);
  c.font = font(F.sans(900), size);
  const w = c.measureText(text).width;
  c.lineWidth = size * 0.08;
  roundRect(c, -w / 2 - size * 0.35, -size * 0.75, w + size * 0.7, size * 1.4, size * 0.15); c.stroke();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 0, size * 0.04);
  c.restore();
}

const HEADS = ['AVVISO DI PAGAMENTO', 'MODELLO F24', 'CARTELLA DI PAGAMENTO', 'COMUNICAZIONE', 'VERBALE DI ACCERTAMENTO', 'DICHIARAZIONE', 'RICEVUTA', 'INVITO AL PAGAMENTO', 'ISTANZA'];
const OFFICES = ['Comune di Esempio — Ufficio Tributi', 'Ufficio Protocollo', 'Servizio Riscossione', 'Polizia Locale', 'Sportello Unico', 'Ufficio Anagrafe'];
const NOTES = ['IMU!!', 'TARI?', 'bollo', 'PEC', '730', 'chiamare', 'scade 16/12', 'SPID??', 'F24', 'ricevuta?', 'martedì 15:00'];
const STAMPS = ['PROTOCOLLO', 'SCADUTA', 'RICEVUTO', 'ARRIVO', 'ANNULLATO', 'COPIA'];

function a4(c: CanvasRenderingContext2D, r: R, w: number) {
  const h = w * 1.414;
  c.fillStyle = grey(232 + r() * 14);
  c.fillRect(0, 0, w, h);
  const m = w * 0.08;
  label(c, OFFICES[Math.floor(r() * OFFICES.length)]!, m, m + 10, w * 0.035, 500, 110);
  label(c, HEADS[Math.floor(r() * HEADS.length)]!, m, m + w * 0.12, w * 0.055, 900, 60);
  label(c, `Prot. n. ${String(Math.floor(r() * 9e5)).padStart(7, '0')}/2026`, m, m + w * 0.17, w * 0.03, 400, 110, true);
  let y = m + w * 0.24;
  if (r() < 0.45) {
    // a form grid
    c.strokeStyle = grey(150); c.lineWidth = 1;
    const cols = 5 + Math.floor(r() * 4), rows = 5 + Math.floor(r() * 5), cw = (w - 2 * m) / cols, ch = w * 0.05;
    for (let i = 0; i <= rows; i++) { c.beginPath(); c.moveTo(m, y + i * ch); c.lineTo(w - m, y + i * ch); c.stroke(); }
    for (let j = 0; j <= cols; j++) { c.beginPath(); c.moveTo(m + j * cw, y); c.lineTo(m + j * cw, y + rows * ch); c.stroke(); }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (r() < 0.4) { c.fillStyle = grey(175); c.fillRect(m + j * cw + 4, y + i * ch + ch * 0.35, cw * (0.3 + r() * 0.5), ch * 0.3); }
    y += rows * ch + w * 0.06;
  }
  lines(c, r, m, y, w - 2 * m, 6 + Math.floor(r() * 8), w * 0.035);
  // signature
  c.strokeStyle = grey(90, 0.7); c.lineWidth = 1.4;
  c.beginPath();
  const sx = w * 0.55, sy = h - m * 2;
  c.moveTo(sx, sy);
  for (let i = 0; i < 9; i++) c.quadraticCurveTo(sx + i * w * 0.035 + w * 0.02, sy - 12 - r() * 16, sx + (i + 1) * w * 0.035, sy + (r() - 0.5) * 8);
  c.stroke();
  if (r() < 0.6) oldStamp(c, r, STAMPS[Math.floor(r() * STAMPS.length)]!, w * (0.35 + r() * 0.3), h * (0.3 + r() * 0.4), w * 0.075);
  return h;
}

function envelope(c: CanvasRenderingContext2D, r: R, w: number) {
  const h = w * 0.5;
  c.fillStyle = grey(214 + r() * 16);
  c.fillRect(0, 0, w, h);
  // flap shadow lines
  c.strokeStyle = grey(190); c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(w * 0.5, h * 0.45); c.lineTo(w, 0); c.stroke();
  // window with an address
  c.fillStyle = grey(236);
  c.fillRect(w * 0.45, h * 0.52, w * 0.45, h * 0.3);
  lines(c, r, w * 0.48, h * 0.58, w * 0.36, 3, h * 0.07, 130);
  // the postage and the registered-mail sticker
  c.fillStyle = grey(180);
  c.fillRect(w * 0.82, h * 0.08, w * 0.12, h * 0.26);
  if (r() < 0.7) {
    c.fillStyle = grey(245);
    c.fillRect(w * 0.06, h * 0.1, w * 0.36, h * 0.24);
    label(c, 'RACCOMANDATA A/R', w * 0.08, h * 0.18, w * 0.03, 900, 60);
    for (let i = 0; i < 34; i++) { c.fillStyle = grey(50); c.fillRect(w * 0.08 + i * w * 0.0085, h * 0.22, r() < 0.5 ? 1.2 : 2.4, h * 0.08); }
  }
  return h;
}

function postit(c: CanvasRenderingContext2D, r: R, w: number) {
  c.fillStyle = grey(206 + r() * 12);
  c.fillRect(0, 0, w, w);
  c.fillStyle = grey(190);
  c.fillRect(0, 0, w, w * 0.12);
  const st = strokeText(NOTES[Math.floor(r() * NOTES.length)]!, 'hscript', w * 0.28);
  c.save();
  c.translate(w * 0.1, w * 0.55);
  const k = Math.min(1, (w * 0.8) / Math.max(1, st.width));
  c.scale(k, k);
  c.strokeStyle = grey(55, 0.85); c.lineWidth = 2.2 / k; c.lineCap = 'round'; c.lineJoin = 'round';
  drawStrokeText(c, st, st.total);
  c.restore();
  return w;
}

function ticket(c: CanvasRenderingContext2D, r: R, w: number) {
  const h = w * 1.7;
  c.fillStyle = grey(240);
  c.fillRect(0, 0, w, h);
  c.textAlign = 'center';
  label(c, 'Il suo numero', w / 2, h * 0.18, w * 0.09, 500, 110);
  label(c, `${'ABCDE'[Math.floor(r() * 5)]} ${100 + Math.floor(r() * 899)}`, w / 2, h * 0.42, w * 0.3, 700, 30, true);
  label(c, `In attesa: ${10 + Math.floor(r() * 90)}`, w / 2, h * 0.58, w * 0.09, 400, 110, true);
  label(c, 'Torni martedì alle tre', w / 2, h * 0.75, w * 0.07, 500, 130);
  c.textAlign = 'left';
  // tear edge
  c.fillStyle = grey(200);
  for (let i = 0; i < 12; i++) c.fillRect(i * w / 12, h - 3, w / 24, 3);
  return h;
}

function calendar(c: CanvasRenderingContext2D, r: R, w: number) {
  const h = w * 1.15;
  c.fillStyle = grey(238);
  c.fillRect(0, 0, w, h);
  c.fillStyle = grey(120);
  c.fillRect(0, 0, w, h * 0.2);
  c.textAlign = 'center';
  const months = ['GENNAIO', 'MARZO', 'GIUGNO', 'SETTEMBRE', 'OTTOBRE', 'DICEMBRE'];
  label(c, months[Math.floor(r() * months.length)]!, w / 2, h * 0.14, w * 0.11, 900, 235);
  label(c, String(1 + Math.floor(r() * 30)), w / 2, h * 0.7, w * 0.48, 900, 60);
  c.textAlign = 'left';
  return h;
}

export interface Wall { cv: HTMLCanvasElement; w: number; h: number }

/** Build the wall (logical w × h px), seeded. */
export function buildWall(w: number, h: number, seed = 11): Wall {
  const { cv, c } = offscreen(w, h);
  const r = mulberry32(seed);
  c.fillStyle = grey(196);
  c.fillRect(0, 0, w, h);
  const kinds = [a4, a4, a4, envelope, envelope, postit, ticket, calendar, a4];
  const n = Math.round((w * h) / 26000);
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(r() * kinds.length)]!;
    const base = kind === postit ? 150 + r() * 60 : kind === ticket ? 110 + r() * 40 : kind === calendar ? 170 + r() * 60 : kind === envelope ? 360 + r() * 140 : 280 + r() * 160;
    // late items land more towards the middle: a pile, not a grid
    const x = r() * (w + 200) - 100, y = r() * (h + 200) - 100;
    c.save();
    c.translate(x, y);
    c.rotate((r() - 0.5) * 0.7);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowBlur = 10 + r() * 14; c.shadowOffsetY = 4 + r() * 6;
    c.fillStyle = '#ddd';
    const hh = kind === a4 ? base * 1.414 : kind === envelope ? base * 0.5 : kind === ticket ? base * 1.7 : kind === calendar ? base * 1.15 : base;
    c.fillRect(-base / 2, -hh / 2, base, hh);
    c.restore();
    c.translate(-base / 2, -hh / 2);
    kind(c, r, base);
    c.restore();
  }
  // uneven light, a little grime
  const g = c.createRadialGradient(w * 0.45, h * 0.35, 0, w * 0.5, h * 0.5, w * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(40,40,40,0.28)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const rr = mulberry32(seed + 1);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(60,60,60,${0.03 + rr() * 0.06})`;
    c.beginPath(); c.arc(rr() * w, rr() * h, 0.5 + rr() * 1.6, 0, TAU); c.fill();
  }
  return { cv, w, h };
}

/** One loose form (for the foreground, falling in slow motion), optionally out of focus. */
export function looseSheet(seed: number, w: number, blurPx = 0): { cv: HTMLCanvasElement; w: number; h: number } {
  const h = Math.ceil(w * 1.414);
  const pad = 40 + blurPx * 3;
  const sheet = offscreen(w, h);
  a4(sheet.c, mulberry32(seed), w);
  const out = offscreen(w + pad * 2, h + pad * 2);
  out.c.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  out.c.shadowColor = 'rgba(0,0,0,0.25)'; out.c.shadowBlur = 24; out.c.shadowOffsetY = 14;
  out.c.drawImage(sheet.cv, pad, pad, w, h);
  return { cv: out.cv, w: w + pad * 2, h: h + pad * 2 };
}
