// Plate 3 — `queue`, torni martedì alle tre (20.36 – 29.68, verse b).
//  «Busta verde sullo zerbino, già lo so com’è»  top shot of the landing: the green envelope slides in
//      under the door onto the doormat; the camera sinks onto it.
//  «fila, timbro, numerino:»  three panels slam in, one per word: the queue display, the round office
//      stamp, the ticket machine printing a ticket.
//  «Torni martedì alle tre»  (the drums drop out) the ticket, close: the line prints word by word,
//      circled in red on «tre».
//  «scadenze sparse in mille posti»  notes, calendar pages, envelopes with dates multiply until they
//      fill the frame.
//  «te le ricordano solo quando arrivano i costi»  reminders land on each word; on «arrivano i costi»
//      € amounts slam on top and get redacted to bars. The last frame is a wall of paper.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, VERTICAL } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp, mulberry32 } from '../engine/util';
import { drawBar, drawStudio, loadImage } from './_motifs';
import type { Line } from '../engine/lyrics';
import {
  type Sprite, calendarPage, camera, circleMark, drawSprite, envelopeGreen, envelopeWhite, inSprite, landing, letter,
  lyricStrip, makeSprite, note, photoSprite, shakeAt, txt,
} from './open-paper';
import { landingFloor, queueDisplay, roundStamp, slamImage, ticket, TICKET } from './queue-paper';
import { lyricStack } from './pile-upright';

/** Upright: a taller landing floor, and the three bands (fila, timbro, numerino) stacked top to bottom. */
const FLOOR_V = { w: 1800, h: 2600 };
const BANDS = [0, 640, 1100, 1920];

interface Piece { s: Sprite; x: number; y: number; rot: number; scale: number; t: number; dx: number; dy: number; drot: number }
interface Tag { s: Sprite; x: number; y: number; rot: number; t: number; tb: number }

export default class Queue extends Scene {
  layer = new Layer2D();
  floor!: HTMLCanvasElement;
  env!: Sprite; tick!: Sprite; stampIm!: HTMLCanvasElement; form!: Sprite;
  Q1!: Line; Q2!: Line; Q3!: Line; Q4!: Line;
  pieces: Piece[] = [];
  tags: Tag[] = [];

  mat!: Sprite; crowd!: ImageBitmap; numeratore!: Sprite; dispenser!: Sprite;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.Q1 = ly.get('Busta verde');
    this.Q2 = ly.get('fila, timbro');
    this.Q3 = ly.get('scadenze sparse');
    this.Q4 = ly.get('te le ricordano');
    this.floor = VERTICAL ? landingFloor(false, FLOOR_V.w, FLOOR_V.h) : landingFloor(false);
    const [mat, crowd, numeratore, dispenser] = await Promise.all([
      loadImage('ref/zerbino-cut-grey.png'),
      loadImage('ref/fila-napoli-1973-grey.jpg'),
      loadImage('ref/timbro-numeratore-cut-grey.png'),
      loadImage('ref/eliminacode-cut-grey.png'),
    ]);
    this.mat = photoSprite(mat, 1500, { contrast: 1.05, bright: 0.8 });
    this.crowd = crowd;
    this.numeratore = photoSprite(numeratore, 430);
    this.dispenser = photoSprite(dispenser, 560);
    this.env = envelopeGreen(9);
    this.tick = ticket();
    this.stampIm = roundStamp(420, 17);
    this.form = letter(41, { title: 'Istanza di rimborso', amounts: 2 });

    // «scadenze sparse in mille posti»: dates everywhere, faster and faster
    const dates: (() => Sprite)[] = [
      () => note('IMU 16/12', 1, { size: 62, circled: true }),
      () => calendarPage(16, 'ottobre', 'venerdì', 2, true),
      () => note('TARI 2/12', 3, { size: 62 }),
      () => envelopeWhite(4, 'Comune di Esempio'),
      () => note('bollo 31/10', 5, { size: 56, tone: '#ececea' }),
      () => calendarPage(30, 'novembre', 'lunedì', 6),
      () => note('revisione', 7, { size: 60, sub: 'maggio?' }),
      () => note('F24 16/11', 8, { size: 62, circled: true, tone: '#ececea' }),
      () => note('multa: 60 gg!', 9, { size: 48 }),
      () => calendarPage(2, 'dicembre', 'mercoledì', 10, true),
      () => note('passaporto', 11, { size: 54, sub: 'scade 03/27' }),
      () => note('730 entro 30/9', 12, { size: 44, tone: '#ececea' }),
      () => letter(13, { title: 'Avviso di scadenza', amounts: 2 }),
      () => note('assicuraz. 14/11', 14, { size: 44 }),
      () => calendarPage(31, 'ottobre', 'sabato', 15, true),
      () => note('canone 31/1', 16, { size: 56 }),
    ];
    const made = dates.map((d) => d());
    const ws = this.Q3.words;
    const times = [ws[0]!.start, ...au.events('kick', ws[0]!.start + 0.1, ws[3]!.start).map(([t]) => t), ws[1]!.start, ws[2]!.start, ws[3]!.start];
    times.sort((a, b) => a - b);
    const K = 46, t0 = ws[3]!.start + 0.06, t1 = this.Q4.start - 0.06;
    for (let k = 0; k < K; k++) times.push(t0 + (t1 - t0) * Math.pow(k / (K - 1), 0.7));
    // stratified spots: a shuffled grid with jitter, so the frame fills evenly
    const r = mulberry32(303);
    const cells: [number, number][] = [];
    const GX = VERTICAL ? 5 : 9, GY = VERTICAL ? 9 : 6;
    for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) cells.push([gx, gy]);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j]!, cells[i]!]; }
    // the first few land near the middle, readable
    const first: [number, number][] = VERTICAL
      ? [[470, 640], [700, 880], [330, 1060], [740, 440], [560, 1230], [300, 420]]
      : [[760, 470], [1240, 600], [520, 760], [1420, 300], [980, 820], [300, 330]];
    const padY = VERTICAL ? 200 : 160;
    times.forEach((t, i) => {
      const [x, y] = i < first.length ? first[i]! : [(cells[i % cells.length]![0] + 0.2 + r() * 0.6) * (W + 200) / GX - 100, (cells[i % cells.length]![1] + 0.2 + r() * 0.6) * (H + padY) / GY - padY / 2];
      const s = made[i % made.length]!;
      const base = (s.w > 700 ? 0.5 : 0.82) * (VERTICAL ? 1.08 : 1);
      const ang = Math.atan2(y - H / 2, x - W / 2) + (r() - 0.5);
      this.pieces.push({ s, t, x, y, rot: (r() - 0.5) * 0.6, scale: base * (0.85 + r() * 0.3), dx: Math.cos(ang) * (VERTICAL ? 180 : 220), dy: Math.sin(ang) * (VERTICAL ? 240 : 180), drot: (r() - 0.5) * 0.5 });
    });
    // «te le ricordano solo quando»: reminders, one per word
    const rem = [
      letter(51, { title: 'Sollecito di pagamento', amounts: 3 }),
      letter(52, { head: 'AGENTE DELLA RISCOSSIONE', sub: 'Ambito provinciale di Esempio', title: 'Intimazione di pagamento', amounts: 3 }),
      letter(53, { title: 'Avviso di mora', amounts: 2, qr: true }),
      letter(54, { head: 'REGIONE', sub: 'Tasse automobilistiche', title: 'Ultimo avviso — bollo 2024', amounts: 2 }),
      letter(55, { title: 'Sollecito — secondo avviso', amounts: 3 }),
    ];
    const remSpots: [number, number, number][] = VERTICAL
      ? [[360, 520, -0.12], [720, 640, 0.1], [500, 900, -0.04], [300, 1180, 0.08], [760, 1260, -0.09]]
      : [[420, 380, -0.12], [1500, 420, 0.1], [960, 620, -0.04], [300, 820, 0.08], [1620, 860, -0.09]];
    this.Q4.words.slice(0, 5).forEach((w, i) => {
      const [x, y, rot] = remSpots[i]!;
      this.pieces.push({ s: rem[i]!, t: w.start, x, y, rot, scale: 0.72, dx: (x - W / 2) * 0.5, dy: VERTICAL ? -420 : -320, drot: -rot * 2 });
    });
    // «arrivano i costi»: amounts, then the bars
    const amounts = ['€ 1.284,00', '€ 312,50', '+ € 96,00', '€ 48,30', '€ 7,45', '€ 2.031,18'];
    const aw = this.Q4.words;
    const tArr = aw[5]!.start, tCosti = aw[7]!.start, tEnd = this.ctx.end;
    const tagT = [tArr, ...au.events('kick', tArr + 0.1, tCosti).map(([t]) => t), tCosti, ...au.events('kick', tCosti + 0.05, tEnd - 0.2).map(([t]) => t)];
    while (tagT.length < amounts.length) tagT.push(Math.min(tEnd - 0.25, tagT[tagT.length - 1]! + 0.12));
    const tagSpots: [number, number, number][] = VERTICAL
      ? [[440, 420, -0.06], [600, 650, 0.05], [410, 880, 0.04], [580, 1100, -0.05], [600, 300, 0.03], [470, 1250, -0.03]]
      : [[620, 330, -0.06], [1330, 520, 0.05], [560, 760, 0.04], [1460, 870, -0.05], [1050, 230, 0.03], [960, 640, -0.03]];
    amounts.forEach((s, i) => {
      const [x, y, rot] = tagSpots[i]!;
      const t = tagT[i]!;
      this.tags.push({ s: amountTag(s), x, y, rot, t, tb: Math.min(t + 0.32, tEnd - 0.2 - (amounts.length - 1 - i) * 0.03) });
    });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    if (VERTICAL) return this.renderUpright(f, out);
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear();
    const { Q1, Q2, Q3, Q4 } = this;
    let shake: [number, number] = [0, 0];
    const add = (s: [number, number]) => { shake = [shake[0] + s[0], shake[1] + s[1]]; };
    const wFila = Q2.words[0]!, wTimbro = Q2.words[1]!, wNum = Q2.words[2]!, wTorni = Q2.words[3]!;

    if (t < wNum.start) {
      // ------------------------------------------------ the landing, top shot
      const au = this.ctx.audio;
      const db = au.downbeats.find((d) => d > Q1.start) ?? Q1.start + 0.6;
      const u = clamp((t - Q1.start) / (wFila.start - Q1.start));
      const bump = t >= db ? 0.025 * Math.exp(-(t - db) * 6) : 0;
      c.save();
      camera(c, lerp(1200, 1170, ease.inOutCubic(u)), lerp(720, 860, ease.inOutCubic(u)), lerp(0.86, 1.3, ease.inOutQuad(u)) + bump, lerp(0.0, 0.03, u));
      c.drawImage(this.floor, 0, 0, 2400, 1500);
      drawSprite(c, this.mat, { x: 1200, y: 860, rot: 0.01, shadow: 0.8 });
      // the envelope slides in under the door and comes to rest on the mat on «verde»
      const tIn = Q1.start - 0.08, tRest = Q1.words[1]!.start;
      const p = ease.outCubic(clamp((t - tIn) / (tRest - tIn)));
      const ex = lerp(1210, 1150, p), ey = lerp(140, 860, p), er = lerp(0.02, 0.13, p);
      c.save();
      c.beginPath(); c.rect(0, 252, 2400, 1500); c.clip();
      drawSprite(c, this.env, { x: ex, y: ey, rot: er, scale: 0.72, lift: 0.05 * (1 - p), shadow: 0.9 });
      c.restore();
      c.restore();
      // a light from the stairwell: soft falloff
      const g = c.createRadialGradient(900, 600, 300, 960, 540, 1300);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (t < wFila.start) lyricStrip(c, Q1, t, 80, H - 56, { key: ['verde'] });
    }

    if (t >= wFila.start - 0.08 && t < wTorni.start) {
      // ------------------------------------------------ fila, timbro, numerino
      const hits = [wFila.start, wTimbro.start, wNum.start];
      hits.forEach((th, i) => {
        const p = clamp((t - (th - 0.08)) / 0.08);
        if (p <= 0) return;
        const off = (1 - ease.inQuad(p)) * (i === 1 ? H : -H);
        c.save();
        c.translate(i * 640, off);
        c.beginPath(); c.rect(0, 0, 640, H); c.clip();
        this.panel(c, i, t, th);
        c.restore();
        if (t >= th && t - th < 0.25) add(shakeAt(t, th, 12, 18, 10 + i));
      });
      // gutters
      c.fillStyle = HEX.ink;
      if (t >= wTimbro.start - 0.08) c.fillRect(638, 0, 4, H);
      if (t >= wNum.start - 0.08) c.fillRect(1278, 0, 4, H);
    }

    if (t >= wTorni.start && t < Q3.start) {
      // ------------------------------------------------ «Torni martedì alle tre»
      drawStudio(c, { drift: t * 0.1 });
      const u = clamp((t - wTorni.start) / (Q3.start - wTorni.start));
      c.save();
      camera(c, 960, lerp(420, 840, ease.inOutCubic(u)), lerp(1.05, 1.45, ease.inOutCubic(u)), lerp(-0.035, -0.015, u));
      const place = { x: 960, y: 560, rot: 0.025, scale: 0.92 };
      drawSprite(c, this.tick, place);
      inSprite(c, this.tick, place, () => {
        const ws = Q2.words;
        const rows: [number[], number][] = [[[3, 4], TICKET.textY], [[5, 6], TICKET.textY + 84]];
        c.font = font(F.sans(900), 66);
        c.letterSpacing = '-2.6px';
        c.fillStyle = '#161616';
        for (const [idx, y] of rows) {
          const text = idx.map((i) => ws[i]!.w).join(' ');
          let x = TICKET.w / 2 - c.measureText(text).width / 2;
          for (const i of idx) {
            const w = ws[i]!;
            const pw = clamp((t - w.start) / 0.1);
            const ww = c.measureText(w.w).width;
            if (pw > 0) {
              // thermal print: the word appears row by row, top down
              c.save();
              c.beginPath(); c.rect(x - 4, y - 66, ww + 8, 66 * 1.25 * pw); c.clip();
              c.fillText(w.w, x, y);
              c.restore();
            }
            x += ww + c.measureText(' ').width;
          }
        }
        // circled in red on «tre»
        const wTre = ws[6]!;
        const pc = clamp((t - wTre.start) / Math.max(0.2, wTre.end - wTre.start));
        if (pc > 0) circleMark(c, TICKET.w / 2, TICKET.textY + 62, 175, 56, 33, HEX.overdue, 6, ease.outCubic(pc));
      });
      c.restore();
    }

    if (t >= Q3.start) {
      // ------------------------------------------------ scadenze sparse in mille posti … arrivano i costi
      drawStudio(c, { drift: t * 0.1 });
      const u = clamp((t - Q3.start) / (this.ctx.end - Q3.start));
      c.save();
      camera(c, 960, 540, lerp(1.06, 0.97, ease.outQuad(u)), lerp(0.012, -0.006, u));
      for (const p of this.pieces) {
        const l = landing(t, p.t, 0.09, { dx: p.dx, dy: p.dy, drot: p.drot, from: 0.2 });
        if (!l) continue;
        drawSprite(c, p.s, { x: p.x + l.dx, y: p.y + l.dy, rot: p.rot + l.drot, scale: p.scale * l.scale, lift: l.lift, alpha: l.alpha });
        if (l.k >= 0 && l.k < 0.15) add(shakeAt(t, p.t, 3.5, 22, Math.round(p.t * 1000)));
      }
      c.restore();
      for (const g of this.tags) {
        const l = landing(t, g.t, 0.06, { from: 0.5, drot: 0.1 });
        if (!l) continue;
        const place = { x: g.x, y: g.y, rot: g.rot + l.drot, scale: l.scale, lift: l.lift, alpha: l.alpha };
        drawSprite(c, g.s, place);
        inSprite(c, g.s, place, () => {
          // the amount is redacted, privacy-mode bar, left to right
          const pb = clamp((t - g.tb) / 0.1);
          if (pb > 0) drawBar(c, 16, 12, g.s.w - 32, g.s.h - 24, ease.outCubic(pb));
        });
        if (l.k >= 0 && l.k < 0.2) add(shakeAt(t, g.t, 9, 18, Math.round(g.t * 1000) + 3));
      }
      lyricStrip(c, t < Q4.start ? Q3 : Q4, t, 80, H - 56, { key: t < Q4.start ? ['mille'] : ['costi'] });
    }

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper: 1, grain: 0.035, vignette: 0.16, shake };
  }

  // ================================================================ the upright cut (9:16)
  renderUpright(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear();
    const { Q1, Q2, Q3, Q4 } = this;
    let shake: [number, number] = [0, 0];
    const add = (s: [number, number]) => { shake = [shake[0] + s[0], shake[1] + s[1]]; };
    const wFila = Q2.words[0]!, wTimbro = Q2.words[1]!, wNum = Q2.words[2]!, wTorni = Q2.words[3]!;

    if (t < wNum.start) {
      // ------------------------------------------------ the landing, top shot: the door at the top of the phone
      const au = this.ctx.audio;
      const db = au.downbeats.find((d) => d > Q1.start) ?? Q1.start + 0.6;
      const u = clamp((t - Q1.start) / (wFila.start - Q1.start));
      const bump = t >= db ? 0.025 * Math.exp(-(t - db) * 6) : 0;
      const e = ease.inOutCubic(u);
      c.save();
      camera(c, lerp(900, 896, e), lerp(1171, 980, e), lerp(0.82, 1.12, ease.inOutQuad(u)) + bump, lerp(0.0, 0.03, u));
      c.drawImage(this.floor, 0, 0, FLOOR_V.w, FLOOR_V.h);
      drawSprite(c, this.mat, { x: 900, y: 1000, rot: 0.01, shadow: 0.8 });
      const tIn = Q1.start - 0.08, tRest = Q1.words[1]!.start;
      const p = ease.outCubic(clamp((t - tIn) / (tRest - tIn)));
      const ex = lerp(910, 875, p), ey = lerp(140, 950, p), er = lerp(0.02, 0.1, p);
      c.save();
      c.beginPath(); c.rect(0, 252, FLOOR_V.w, FLOOR_V.h); c.clip();
      drawSprite(c, this.env, { x: ex, y: ey, rot: er, scale: 0.75, lift: 0.05 * (1 - p), shadow: 0.9 });
      c.restore();
      c.restore();
      const g = c.createRadialGradient(480, 760, 300, 540, 960, 1400);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (t < wFila.start) lyricStack(c, Q1, t, [[0, 1, 2, 3], [4, 5, 6, 7]], { key: ['verde'] });
    }

    if (t >= wFila.start - 0.08 && t < wTorni.start) {
      // ------------------------------------------------ fila, timbro, numerino: three bands, stacked
      const hits = [wFila.start, wTimbro.start, wNum.start];
      hits.forEach((th, i) => {
        const p = clamp((t - (th - 0.08)) / 0.08);
        if (p <= 0) return;
        const y0 = BANDS[i]!, bh = BANDS[i + 1]! - y0;
        const off = (1 - ease.inQuad(p)) * (i === 1 ? W : -W);
        c.save();
        c.translate(off, y0);
        c.beginPath(); c.rect(0, 0, W, bh); c.clip();
        this.panelV(c, i, t, th, bh);
        c.restore();
        if (t >= th && t - th < 0.25) add(shakeAt(t, th, 12, 18, 10 + i));
      });
      c.fillStyle = HEX.ink;
      if (t >= wTimbro.start - 0.08) c.fillRect(0, BANDS[1]! - 2, W, 4);
      if (t >= wNum.start - 0.08) c.fillRect(0, BANDS[2]! - 2, W, 4);
    }

    if (t >= wTorni.start && t < Q3.start) {
      // ------------------------------------------------ «Torni martedì alle tre»: the ticket, full height, tilting down
      drawStudio(c, { drift: t * 0.1 });
      const u = clamp((t - wTorni.start) / (Q3.start - wTorni.start));
      const e = ease.inOutCubic(u);
      c.save();
      camera(c, lerp(520, 510, e), lerp(840, 1130, e), lerp(1.0, 1.3, e), lerp(-0.03, -0.012, u));
      const place = { x: 500, y: 900, rot: 0.025, scale: 1.2 };
      drawSprite(c, this.tick, place);
      inSprite(c, this.tick, place, () => this.printLine(c, t));
      c.restore();
    }

    if (t >= Q3.start) {
      // ------------------------------------------------ scadenze sparse in mille posti … arrivano i costi
      drawStudio(c, { drift: t * 0.1 });
      const u = clamp((t - Q3.start) / (this.ctx.end - Q3.start));
      c.save();
      camera(c, 540, 960, lerp(1.06, 0.97, ease.outQuad(u)), lerp(0.012, -0.006, u));
      for (const p of this.pieces) {
        const l = landing(t, p.t, 0.09, { dx: p.dx, dy: p.dy, drot: p.drot, from: 0.2 });
        if (!l) continue;
        drawSprite(c, p.s, { x: p.x + l.dx, y: p.y + l.dy, rot: p.rot + l.drot, scale: p.scale * l.scale, lift: l.lift, alpha: l.alpha });
        if (l.k >= 0 && l.k < 0.15) add(shakeAt(t, p.t, 3.5, 22, Math.round(p.t * 1000)));
      }
      c.restore();
      for (const g of this.tags) {
        const l = landing(t, g.t, 0.06, { from: 0.5, drot: 0.1 });
        if (!l) continue;
        const place = { x: g.x, y: g.y, rot: g.rot + l.drot, scale: l.scale, lift: l.lift, alpha: l.alpha };
        drawSprite(c, g.s, place);
        inSprite(c, g.s, place, () => {
          const pb = clamp((t - g.tb) / 0.1);
          if (pb > 0) drawBar(c, 16, 12, g.s.w - 32, g.s.h - 24, ease.outCubic(pb));
        });
        if (l.k >= 0 && l.k < 0.2) add(shakeAt(t, g.t, 9, 18, Math.round(g.t * 1000) + 3));
      }
      if (t < Q4.start) lyricStack(c, Q3, t, [[0, 1, 2, 3, 4]], { key: ['mille'] });
      else lyricStack(c, Q4, t, [[0, 1, 2, 3], [4, 5, 6, 7]], { key: ['costi'] });
    }

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper: 1, grain: 0.035, vignette: 0.16, shake };
  }

  /** «Torni martedì alle tre» printed onto the ticket (sprite-local coordinates), circled on «tre». */
  printLine(c: CanvasRenderingContext2D, t: number) {
    const ws = this.Q2.words;
    const rows: [number[], number][] = [[[3, 4], TICKET.textY], [[5, 6], TICKET.textY + 84]];
    c.font = font(F.sans(900), 66);
    c.letterSpacing = '-2.6px';
    c.fillStyle = '#161616';
    for (const [idx, y] of rows) {
      const text = idx.map((i) => ws[i]!.w).join(' ');
      let x = TICKET.w / 2 - c.measureText(text).width / 2;
      for (const i of idx) {
        const w = ws[i]!;
        const pw = clamp((t - w.start) / 0.1);
        const ww = c.measureText(w.w).width;
        if (pw > 0) {
          c.save();
          c.beginPath(); c.rect(x - 4, y - 66, ww + 8, 66 * 1.25 * pw); c.clip();
          c.fillText(w.w, x, y);
          c.restore();
        }
        x += ww + c.measureText(' ').width;
      }
    }
    const wTre = ws[6]!;
    const pc = clamp((t - wTre.start) / Math.max(0.2, wTre.end - wTre.start));
    if (pc > 0) circleMark(c, TICKET.w / 2, TICKET.textY + 62, 175, 56, 33, HEX.overdue, 6, ease.outCubic(pc));
  }

  /** One of the three bands (fila, timbro, numerino), full width, `bh` tall, in its own frame. */
  panelV(c: CanvasRenderingContext2D, i: number, t: number, th: number, bh: number) {
    const k = t - th;
    const label = (s: string, y: number, dark: boolean, S = 124) => {
      c.save();
      c.font = font(F.sans(900), S);
      c.letterSpacing = `${-0.04 * S}px`;
      c.fillStyle = dark ? '#f2f2f2' : HEX.pen;
      c.fillText(s, 60, y);
      c.restore();
    };
    if (i === 0) {
      // the queue, from above (Napoli, 1973); the band's top sits under the platform's header
      const iw = this.crowd.width, ih = this.crowd.height, sc = Math.max(W / iw, bh / ih) * (1.04 + 0.03 * Math.max(0, k));
      c.drawImage(this.crowd, W / 2 - (iw * sc) / 2, bh * 0.55 - (ih * sc) / 2, iw * sc, ih * sc);
      c.fillStyle = 'rgba(10,10,10,0.35)'; c.fillRect(0, 0, W, bh);
      const g = c.createLinearGradient(0, 0, 620, 0);
      g.addColorStop(0, 'rgba(10,10,10,0.7)'); g.addColorStop(1, 'rgba(10,10,10,0)');
      c.fillStyle = g; c.fillRect(0, 0, 620, bh);
      c.save(); c.translate(700, 450); c.scale(0.74, 0.74);
      queueDisplay(c, 0, 0, k > 0.12 ? 'A 161' : 'A 160', k > 0.12 ? 1 : 0.6);
      c.restore();
      label('FILA,', 400, true);
    } else if (i === 1) {
      c.fillStyle = HEX.paper; c.fillRect(0, 0, W, bh);
      drawSprite(c, this.form, { x: 730, y: 290, rot: 0.05, scale: 0.58 });
      drawSprite(c, this.numeratore, { x: 970, y: 380, rot: -0.35, lift: 0.15, scale: 0.75 });
      slamImage(c, this.stampIm, 700, 240, 360, k, -0.18);
      label('TIMBRO,', 170, false);
    } else {
      c.fillStyle = '#dcdcdc'; c.fillRect(0, 0, W, bh);
      const g = c.createRadialGradient(760, 200, 50, 760, 200, 760);
      g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
      c.fillStyle = g; c.fillRect(0, 0, W, bh);
      // the ticket is pulled out of the dispenser while «numerino» is sung
      const w = this.Q2.words[2]!;
      const out = ease.outQuad(clamp((t - th) / (w.end - w.start + 0.1)));
      const sc = 0.5, L = out * 560;
      const slot = { x: 878, y: 291 };
      if (L > 1) {
        c.save();
        c.beginPath(); c.rect(0, slot.y, W, bh); c.clip();
        drawSprite(c, this.tick, { x: slot.x, y: slot.y + L - (TICKET.h * sc) / 2, rot: 0.03, scale: sc, shadow: 0.6 });
        c.restore();
      }
      drawSprite(c, this.dispenser, { x: 900, y: 190, rot: 0, scale: 0.72, shadow: 0.7 });
      // the label at the foot of the safe area; the ticket hangs down past it
      label('NUMERINO:', 330, false, 112);
    }
  }

  /** One of the three panels (fila, timbro, numerino), drawn in its own 640×1080 frame. */
  panel(c: CanvasRenderingContext2D, i: number, t: number, th: number) {
    const k = t - th;
    const label = (s: string, dark: boolean) => {
      c.save();
      c.font = font(F.sans(900), 98);
      c.letterSpacing = `${-0.04 * 98}px`;
      c.fillStyle = dark ? '#f2f2f2' : HEX.pen;
      c.fillText(s, 44, 150);
      c.restore();
    };
    if (i === 0) {
      // the queue, from above (Napoli, 1973): it hasn't moved since
      const iw = this.crowd.width, ih = this.crowd.height, sc = Math.max(640 / iw, H / ih) * (1.04 + 0.03 * Math.max(0, k));
      c.drawImage(this.crowd, 320 - (iw * sc) / 2, H / 2 - (ih * sc) / 2, iw * sc, ih * sc);
      c.fillStyle = 'rgba(10,10,10,0.35)'; c.fillRect(0, 0, 640, H);
      const g = c.createLinearGradient(0, 0, 0, 420);
      g.addColorStop(0, 'rgba(10,10,10,0.75)'); g.addColorStop(1, 'rgba(10,10,10,0)');
      c.fillStyle = g; c.fillRect(0, 0, 640, 420);
      c.save(); c.translate(320, 420); c.scale(0.92, 0.92);
      queueDisplay(c, 0, 0, k > 0.12 ? 'A 161' : 'A 160', k > 0.12 ? 1 : 0.6);
      c.restore();
      label('FILA,', true);
    } else if (i === 1) {
      c.fillStyle = HEX.paper; c.fillRect(0, 0, 640, H);
      drawSprite(c, this.form, { x: 330, y: 640, rot: 0.05, scale: 0.78 });
      drawSprite(c, this.numeratore, { x: 500, y: 960, rot: -0.35, lift: 0.15 });
      slamImage(c, this.stampIm, 300, 600, 400, k, -0.18);
      label('TIMBRO,', false);
    } else {
      c.fillStyle = '#dcdcdc'; c.fillRect(0, 0, 640, H);
      const g = c.createRadialGradient(320, 560, 50, 320, 560, 700);
      g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
      c.fillStyle = g; c.fillRect(0, 0, 640, H);
      // the ticket is pulled out of the dispenser while «numerino» is sung
      const w = this.Q2.words[2]!;
      const out = ease.outQuad(clamp((t - th) / (w.end - w.start + 0.1)));
      const sc = 0.6, L = out * 660;
      const slot = { x: 300, y: 560 };
      if (L > 1) {
        c.save();
        c.beginPath(); c.rect(0, slot.y, 640, H); c.clip();
        drawSprite(c, this.tick, { x: slot.x, y: slot.y + L - (TICKET.h * sc) / 2, rot: 0.03, scale: sc, shadow: 0.6 });
        c.restore();
      }
      drawSprite(c, this.dispenser, { x: 330, y: 420, rot: 0, shadow: 0.7 });
      label('NUMERINO:', false);
    }
  }
}

/** A white price label with a big red amount. */
function amountTag(s: string): Sprite {
  const size = 96;
  const c0 = document.createElement('canvas').getContext('2d')!;
  c0.font = font(F.mono(700), size);
  const tw = c0.measureText(s).width;
  const w = Math.ceil(tw + 64), h = Math.ceil(size * 1.3);
  return makeSprite(w, h, (c) => {
    c.fillStyle = HEX.sheet; c.fillRect(0, 0, w, h);
    txt(c, s, 32, h / 2 + size * 0.36, size, { fam: 'mono', w: 700, color: HEX.overdue, ls: -0.02 });
  });
}
void hash;
