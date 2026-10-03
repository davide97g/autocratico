// Plate 2 — `pile`, gerontocrazia (10.72 – 20.36, verse a; the kit enters at 11.35).
//  «La burocrazia è per i vecchi: gerontocrazia»  the 1987 protocol register under a dim lamp; the
//      words are cut-out paper strips; the kit switches the light on; GERONTOCRAZIA stamps across it.
//  «sei portali, sei password, e nessuno che ti avvisa»  six login windows slam in, one per kick;
//      the passwords type in; on «che ti avvisa» every one of them shows a red error.
//  «IMU, TARI, bollo, la PEC finita nello spam»  three stamps over the windows; a mail client where
//      the PEC row drops into the Spam folder.
//  «evado e nemmeno lo so, poi la cartella: bam!»  calm small type, a shadow growing over it, then
//      the cartella di pagamento smashes in with a red flash.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { HEX, rgba } from '../engine/palette';
import { F, font, layout } from '../engine/type';
import { clamp, ease, hash, lerp, mulberry32, TAU } from '../engine/util';
import { drawStamp, drawStudio, loadImage, roundRect } from './_motifs';
import type { Line } from '../engine/lyrics';
import {
  type Sprite, camera, drawSprite, dust, inSprite, landing, lyricStrip, photoSprite, shakeAt, warnIcon,
} from './open-paper';
import { cartella, ledger, LOGIN, loginWindow, PORTALS } from './pile-paper';

const WIN_POS: [number, number, number][] = [
  [335, 270, -0.05], [975, 245, 0.03], [1605, 290, -0.025], [365, 795, 0.04], [1000, 775, -0.035], [1630, 805, 0.05],
];
const CF = 'RSSMRA80A41H501U';

export default class Pile extends Scene {
  layer = new Layer2D();
  book!: Sprite; wins: Sprite[] = []; cart!: Sprite;
  L1!: Line; L2!: Line; L3!: Line; L4!: Line;
  kit = 11.35; winT: number[] = []; tMail = 16.17;

  archive!: ImageBitmap; bollo!: Sprite; office!: Sprite;

  override async init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    this.L1 = ly.get('La burocrazia');
    this.L2 = ly.get('sei portali');
    this.L3 = ly.get('IMU, TARI');
    this.L4 = ly.get('evado');
    this.kit = au.downbeats[4]!;
    // one window per kick from «sei»
    const kicks = au.events('kick', this.L2.start - 0.06, this.L2.end).map(([t]) => t);
    this.winT = kicks.slice(0, 6);
    while (this.winT.length < 6) this.winT.push(this.L2.start + this.winT.length * 0.3);
    this.tMail = au.downbeats.find((d) => d > this.L3.words[2]!.start) ?? this.L3.words[3]!.start;
    this.tMail = Math.min(this.tMail, this.L3.words[4]!.start - 0.05);
    this.book = ledger();
    this.wins = PORTALS.map((_, i) => loginWindow(i));
    this.cart = cartella();
    const [archive, bollo, office] = await Promise.all([
      loadImage('ref/archivio-palermo-registri-grey.jpg'),
      loadImage('ref/marca-da-bollo-cut-grey.png'),
      loadImage('ref/agenzia-entrate-milano-cut-grey.png'),
    ]);
    this.archive = archive;
    this.bollo = photoSprite(bollo, 300);
    this.office = photoSprite(office, 1750, { contrast: 1.1, bright: 0.9 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear();
    const { L1, L2, L3, L4 } = this;
    let shake: [number, number] = [0, 0];
    const addShake = (s: [number, number]) => { shake = [shake[0] + s[0], shake[1] + s[1]]; };
    const stampShake = (s: number) => addShake([(hash(Math.round(t * 60), 3) - 0.5) * s * 2.2, (hash(Math.round(t * 60), 4) - 0.5) * s * 2.2]);
    let exposure = 1, flash = 0;

    if (t < L2.start) {
      // ------------------------------------------------ the register
      drawStudio(c, { drift: t * 0.1 });
      const pre = t < this.kit;
      const k = t - this.kit;
      const punch = pre ? 0 : 0.14 * Math.exp(-k * 8);
      const u = clamp((t - this.ctx.start) / (L2.start - this.ctx.start));
      const zoom = (pre ? lerp(0.9, 0.93, clamp((t - this.ctx.start) / (this.kit - this.ctx.start))) : lerp(1.0, 1.06, ease.outQuad(clamp(k / 1.5)))) + punch;
      c.save();
      camera(c, pre ? 960 : 990, pre ? 640 : 620, zoom, pre ? -0.05 : -0.035 + u * 0.01);
      drawSprite(c, this.book, { x: 960, y: 640, rot: -0.02 });
      dust(c, t, this.kit, 960, 640, 1500, 160, 7, 'rgba(60,60,60,');
      dust(c, t, this.kit, 960, 400, 900, 60, 8, 'rgba(250,250,250,');
      c.restore();
      if (pre) {
        // a dim lamp: only the middle of the page is lit
        const g = c.createRadialGradient(900, 560, 120, 960, 560, 1100);
        g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.78)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      if (!pre) { addShake(shakeAt(t, this.kit, 22, 12, 41)); flash = 0.28 * Math.pow(0.5, k / 0.04); }
      exposure = pre ? 0.85 : 1;
      const w = L1.words;
      const tG = w[6]!.start;
      if (t >= tG) {
        // «gerontocrazia»: cut to the archive, registers rotting on the shelves
        const kz = t - tG;
        const z = 1.12 + kz * 0.05 + 0.06 * Math.exp(-kz * 10);
        const iw = this.archive.width, ih = this.archive.height;
        const sc = Math.max(W / iw, H / ih) * z;
        c.drawImage(this.archive, W / 2 - (iw * sc) / 2 + 40, H / 2 - (ih * sc) / 2, iw * sc, ih * sc);
        c.fillStyle = 'rgba(230,230,230,0.12)'; c.fillRect(0, 0, W, H);
        addShake(shakeAt(t, tG, 16, 14, 42));
      }
      // the words, cut-out strips of paper
      // laid out in two rows, each strip a hair apart, alternating tilt
      const rowsW = [[0, 1], [2, 3, 4, 5]];
      rowsW.forEach((row, ri) => {
        let x = 90;
        row.forEach((wi, j) => {
          const s = w[wi]!.w.toUpperCase();
          const bw = strip(c, s, x, 205 + ri * 140, 104, t - w[wi]!.start, (j % 2 ? 1 : -1) * (0.012 + 0.01 * ((wi * 7) % 3)), wi);
          x += bw + 14;
        });
      });
      stampShake(drawStamp(c, 'GERONTOCRAZIA', 960, 720, 172, t - tG + 0.07, { seed: 21, angle: -0.07 }) * 1.3);
    } else if (t < this.tMail) {
      // ------------------------------------------------ six portals, six passwords
      drawStudio(c, { drift: t * 0.1 });
      let punch = 0;
      for (const tw of this.winT) if (t >= tw) punch += 0.018 * Math.exp(-(t - tw) * 9);
      const tS = [L3.words[0]!.start, L3.words[1]!.start, L3.words[2]!.start];
      for (const ts of tS) if (t >= ts) punch += 0.03 * Math.exp(-(t - ts) * 8);
      const drift = clamp((t - L2.start) / (this.tMail - L2.start));
      c.save();
      camera(c, 990, 550, 0.97 + drift * 0.05 + punch, -0.01 + drift * 0.012);
      const wPw = L2.words[3]!, tErr0 = L2.words[6]!.start, tErr1 = L2.words[8]!.start;
      this.winT.forEach((tw, i) => {
        const [x, y, rot] = WIN_POS[i]!;
        const ang = Math.atan2(y - 540, x - 960);
        const l = landing(t, tw, 0.09, { dx: Math.cos(ang) * 300, dy: Math.sin(ang) * 260, drot: (i % 2 ? 1 : -1) * 0.1, from: 0.3 });
        if (!l) return;
        if (l.k >= 0 && l.k < 0.25) addShake(shakeAt(t, tw, 7, 20, 50 + i));
        const place = { x: x + l.dx, y: y + l.dy, rot: rot + l.drot, scale: 1.0 * l.scale, lift: l.lift, alpha: l.alpha };
        drawSprite(c, this.wins[i]!, place);
        const tE = lerp(tErr0, tErr1, i / 5);
        const err = t >= tE;
        inSprite(c, this.wins[i]!, place, () => {
          // codice fiscale types in as the window lands
          const nCf = Math.floor(clamp((t - tw - 0.02) / 0.28) * CF.length);
          c.font = font(F.mono(500), 21); c.fillStyle = HEX.pen; c.textBaseline = 'middle';
          c.fillText(CF.slice(0, nCf), LOGIN.cf.x + 16, LOGIN.cf.y + LOGIN.cf.h / 2 + 1);
          // the password: dots on «password», at once for windows that land after it
          const pStart = Math.max(wPw.start, tw + 0.05);
          const nDots = Math.floor(clamp((t - pStart) / Math.max(0.12, wPw.end - wPw.start)) * 12);
          c.fillStyle = HEX.pen;
          for (let d = 0; d < nDots; d++) { c.beginPath(); c.arc(LOGIN.pw.x + 22 + d * 19, LOGIN.pw.y + LOGIN.pw.h / 2, 5, 0, TAU); c.fill(); }
          if (err) {
            const ek = clamp((t - tE) / 0.06);
            c.globalAlpha = ek;
            c.strokeStyle = HEX.overdue; c.lineWidth = 2.4;
            roundRect(c, LOGIN.pw.x, LOGIN.pw.y, LOGIN.pw.w, LOGIN.pw.h, 9); c.stroke();
            roundRect(c, LOGIN.cf.x, LOGIN.cf.y, LOGIN.cf.w, LOGIN.cf.h, 9); c.stroke();
            warnIcon(c, LOGIN.err.x, LOGIN.err.y + 2, 20);
            c.fillStyle = rgba('overdue', 0.1); roundRect(c, LOGIN.err.x - 8, LOGIN.err.y - 6, LOGIN.cf.w + 16, 36, 8); c.fill();
            c.font = font(F.sans(600), 18); c.fillStyle = HEX.overdue; c.textBaseline = 'alphabetic';
            c.fillText(PORTALS[i]!.err, LOGIN.err.x + 30, LOGIN.err.y + 19, LOGIN.cf.w - 36);
          }
        });
        if (err && t - tE < 0.2) addShake(shakeAt(t, tE, 4, 20, 70 + i));
      });
      // a real marca da bollo slaps down with «bollo»
      const lb = landing(t, tS[2]! - 0.02, 0.08, { from: 0.6, drot: 0.4, dx: 200, dy: 120 });
      if (lb) drawSprite(c, this.bollo, { x: 1600 + lb.dx, y: 700 + lb.dy, rot: 0.16 + lb.drot, scale: lb.scale, lift: lb.lift, alpha: lb.alpha });
      // IMU, TARI, bollo: stamped over the wall of portals
      const st: [string, number, number, number][] = [['IMU', 560, 430, -0.12], ['TARI', 1380, 330, 0.07], ['BOLLO', 1010, 770, -0.05]];
      st.forEach(([s, x, y, a], i) => stampShake(drawStamp(c, s, x, y, 300, t - tS[i]! + 0.07, { seed: 30 + i, angle: a })));
      c.restore();
      if (t >= tErr1) addShake(shakeAt(t, tErr1, 10, 16, 77));
      if (t < L3.start) lyricStrip(c, L2, t, 80, H - 56, { key: ['nessuno'] });
      else lyricStrip(c, L3, t, 80, H - 56, {});
    } else if (t < L4.start) {
      // ------------------------------------------------ the PEC drops into the spam
      drawStudio(c, { drift: t * 0.1 });
      const u = clamp((t - this.tMail) / (L4.start - this.tMail));
      c.save();
      const k0 = t - this.tMail;
      camera(c, lerp(975, 860, ease.inOutCubic(u)), lerp(480, 450, u), 1.12 + u * 0.07 + 0.05 * Math.exp(-k0 * 8), 0);
      this.mail(c, t);
      c.restore();
      if (k0 < 0.25) addShake(shakeAt(t, this.tMail, 8, 18, 90));
      lyricStrip(c, L3, t, 80, H - 56, { key: ['spam'] });
    } else {
      // ------------------------------------------------ evado… poi la cartella: bam!
      drawStudio(c, { drift: t * 0.1 });
      const bam = L4.words[8]!;
      const loom0 = L4.words[7]!.start;
      const pushU = clamp((t - L4.start) / (bam.start - L4.start));
      // «poi la cartella:» the office rises behind the quiet line, a building looming
      const tPoi = L4.words[5]!.start;
      if (t >= tPoi) {
        const ru = clamp((t - tPoi) / (bam.start - tPoi));
        const oh = this.office.h;
        drawSprite(c, this.office, { x: 900, y: 610 + oh / 2 + (1 - ease.outCubic(ru)) * 600, alpha: 0.9 * clamp(ru * 3), shadow: 0 });
      }
      c.save();
      camera(c, 960, 540, 1 + ease.inQuad(pushU) * 0.05, 0);
      this.calm(c, t);
      c.restore();
      // the shadow of something big coming down
      if (t >= loom0 && t < bam.start + 0.05) {
        const lu = ease.inCubic(clamp((t - loom0) / (bam.start - loom0)));
        const g = c.createRadialGradient(980, 600, 0, 980, 600, lerp(1300, 700, lu));
        g.addColorStop(0, `rgba(0,0,0,${0.5 * lu})`); g.addColorStop(0.6, `rgba(0,0,0,${0.32 * lu})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      }
      const l = landing(t, bam.start, 0.07, { from: 0.9, drot: 0.15, dy: -60 });
      if (l) {
        const k = t - bam.start;
        c.save();
        camera(c, 960, 540, 1 + 0.06 * Math.exp(-Math.max(0, k) * 5) + Math.max(0, k) * 0.04, 0);
        drawSprite(c, this.cart, { x: 1010, y: 610 + l.dy, rot: -0.06 + l.drot, scale: 0.98 * l.scale, lift: l.lift, alpha: Math.min(1, l.alpha * 2) });
        c.restore();
        if (k >= 0) {
          // red flash
          c.fillStyle = rgba('overdue', 0.62 * Math.pow(0.5, k / 0.07));
          c.fillRect(0, 0, W, H);
          addShake(shakeAt(t, bam.start, 34, 9, 99));
          flash = 0.35 * Math.pow(0.5, k / 0.05);
          // BAM!, giant and cropped
          const bk = clamp(k / 0.06);
          c.save();
          c.translate(1000, 1000);
          c.rotate(-0.07);
          c.scale(1.35 - 0.35 * ease.outCubic(bk), 1.35 - 0.35 * ease.outCubic(bk));
          c.font = font(F.sans(900), 430);
          c.letterSpacing = `${-0.05 * 430}px`;
          c.textAlign = 'center';
          c.fillStyle = HEX.overdue;
          c.globalAlpha = clamp(bk * 2);
          c.fillText('BAM!', 0, 60);
          c.restore();
        }
      }
    }

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper: 1, grain: 0.035, vignette: 0.16, shake, exposure, flash };
  }

  // ---------------------------------------------------------------- the calm line
  calm(c: CanvasRenderingContext2D, t: number) {
    const ws = this.L4.words;
    const rows = [[0, 1, 2, 3, 4], [5, 6, 7]];
    const size = 46;
    const fam = F.sans(500);
    rows.forEach((row, ri) => {
      const text = row.map((i) => ws[i]!.w).join(' ');
      const lay = layout(text, fam, size);
      const x0 = W / 2 - lay.width / 2, y = 512 + ri * 66;
      let ci = 0;
      for (const wi of row) {
        const w = ws[wi]!;
        const n = Array.from(w.w).length;
        const a = clamp((t - w.start) / 0.12);
        if (a > 0) {
          c.save();
          c.globalAlpha = a;
          c.font = font(wi === 7 ? F.sans(700) : fam, size);
          c.fillStyle = ri === 0 ? HEX.graphite : HEX.pen;
          c.fillText(w.w, x0 + lay.glyphs[ci]!.x, y + (1 - ease.outCubic(a)) * 8);
          c.restore();
        }
        ci += n + 1;
      }
    });
  }

  // ---------------------------------------------------------------- the mail client
  mail(c: CanvasRenderingContext2D, t: number) {
    const ws = this.L3.words;
    const tPEC = ws[4]!.start, tFin = ws[5]!.start, tSpam = ws[7]!.start;
    const X = 140, Y = 90, WW = 1640, HH = 900;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.22)'; c.shadowBlur = 60; c.shadowOffsetY = 26;
    c.fillStyle = HEX.sheet; roundRect(c, X, Y, WW, HH, 20); c.fill();
    c.restore();
    c.save();
    roundRect(c, X, Y, WW, HH, 20); c.clip();
    // title bar
    c.fillStyle = '#efefef'; c.fillRect(X, Y, WW, 50);
    c.fillStyle = HEX.bezel; c.fillRect(X, Y + 50, WW, 1);
    for (let k = 0; k < 3; k++) { c.fillStyle = ['#c9c9c9', '#d4d4d4', '#dcdcdc'][k]!; c.beginPath(); c.arc(X + 26 + k * 21, Y + 25, 7, 0, TAU); c.fill(); }
    c.font = font(F.sans(500), 16); c.fillStyle = HEX.graphite; c.textAlign = 'center';
    c.fillText('Posta — Posta in arrivo', X + WW / 2, Y + 31); c.textAlign = 'left';
    // sidebar
    c.fillStyle = '#f7f7f7'; c.fillRect(X, Y + 51, 330, HH);
    c.fillStyle = HEX.bezel; c.fillRect(X + 330, Y + 51, 1, HH);
    c.fillStyle = HEX.pen; roundRect(c, X + 24, Y + 80, 280, 54, 12); c.fill();
    c.font = font(F.sans(600), 20); c.fillStyle = '#fff'; c.fillText('Scrivi', X + 64, Y + 114);
    const folders = ['Posta in arrivo', 'Speciali', 'Inviata', 'Bozze', 'Spam', 'Cestino'];
    const spamIn = t >= tSpam;
    const sk = spamIn ? t - tSpam : -1;
    folders.forEach((name, i) => {
      const fy = Y + 170 + i * 56;
      const isSpam = name === 'Spam';
      if (i === 0) { c.fillStyle = '#ebebeb'; roundRect(c, X + 14, fy - 30, 300, 48, 10); c.fill(); }
      if (isSpam && spamIn) { c.fillStyle = rgba('overdue', 0.12 * (0.6 + 0.4 * Math.exp(-sk * 4))); roundRect(c, X + 14, fy - 30, 300, 48, 10); c.fill(); }
      // folder glyph
      c.strokeStyle = isSpam && spamIn ? HEX.overdue : HEX.graphite; c.lineWidth = 2;
      c.strokeRect(X + 36, fy - 16, 22, 16);
      c.font = font(F.sans(i === 0 ? 600 : 500), 20);
      c.fillStyle = isSpam && spamIn ? HEX.overdue : HEX.pen;
      c.fillText(name, X + 74, fy);
      const count = i === 0 ? (t >= tFin + 0.15 ? '2' : '3') : i === 3 ? '1' : isSpam ? (spamIn ? '13' : '12') : '';
      if (count) {
        const pop = isSpam && spamIn ? 1 + 0.5 * Math.exp(-sk * 10) : 1;
        c.save(); c.translate(X + 296, fy - 6); c.scale(pop, pop);
        c.font = font(F.sans(600), 17); c.textAlign = 'right';
        c.fillStyle = isSpam && spamIn ? HEX.overdue : HEX.muted;
        c.fillText(count, 0, 6); c.restore();
      }
    });
    // list
    const LX = X + 360, LW = WW - 390;
    c.font = font(F.sans(700), 32); c.fillStyle = HEX.pen; c.fillText('Posta in arrivo', LX, Y + 112);
    c.fillStyle = '#f2f2f2'; roundRect(c, LX + LW - 420, Y + 76, 420, 48, 24); c.fill();
    c.font = font(F.sans(400), 18); c.fillStyle = HEX.faint; c.fillText('Cerca nella posta', LX + LW - 380, Y + 107);
    const rows: [string, string, string, string, boolean][] = [
      ['Offerte Luce e Gas', 'Ultimi giorni: blocca il prezzo!', 'Solo per te un’offerta riservata…', '09:02', false],
      ['Condominio Via Roma', 'Verbale assemblea ordinaria', 'In allegato il verbale della seduta del…', '08:47', true],
      ['protocollo@pec.comune.esempio.it', 'POSTA CERTIFICATA: Avviso di pagamento TARI 2026', 'Messaggio di posta certificata · postacert.eml', '08:14', true],
      ['Supermercato', 'I tuoi punti stanno per scadere', 'Usali entro domenica', 'ieri', false],
      ['Banca', 'Estratto conto disponibile', 'Il documento è nella tua area personale', 'ieri', false],
      ['Corriere Espresso', 'Il tuo pacco è in consegna', 'Oggi tra le 9:00 e le 13:00', 'ieri', false],
      ['Mamma', 'Domenica pranzo da noi?', 'Porta il pane', '2 ott', false],
      ['Palestra', 'Rinnova l’abbonamento', 'Ultimi posti per il corso di…', '1 ott', false],
    ];
    const RY = Y + 150, RH = 88;
    const gap = ease.inOutCubic(clamp((t - tFin - 0.12) / 0.3));
    rows.forEach((r, i) => {
      if (i === 2) return;
      const yy = RY + i * RH - (i > 2 ? gap * RH : 0);
      this.mailRow(c, LX, yy, LW, RH, r, false, 0);
    });
    c.restore();
    // the PEC row: highlighted on «PEC», lifted on «finita», into the Spam folder on «spam»
    const r = rows[2]!;
    const hl = t >= tPEC ? 1 : 0;
    const mv = ease.inOutCubic(clamp((t - tFin) / (tSpam - tFin)));
    if (mv >= 1 && t > tSpam + 0.02) return;
    const sx = LX, sy = RY + 2 * RH;
    const tx = X + 60, ty = Y + 170 + 4 * 56 - 30;
    const x = lerp(sx, tx, mv), y = lerp(sy, ty, ease.inQuad(mv)) - Math.sin(mv * Math.PI) * 120;
    const sc = lerp(1, 0.12, ease.inQuad(mv)) * (1 + 0.04 * Math.sin(Math.min(1, (t - tFin) / 0.15) * Math.PI) * (mv < 0.2 ? 1 : 0));
    c.save();
    c.translate(x, y);
    c.rotate(-0.12 * Math.sin(mv * Math.PI));
    c.scale(sc, sc);
    if (t >= tFin) {
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 40; c.shadowOffsetY = 24;
      c.fillStyle = HEX.sheet; roundRect(c, 0, 0, LW, RH, 12); c.fill();
      c.restore();
    }
    this.mailRow(c, 0, 0, LW, RH, r, true, hl * (t < tFin ? 1 : 1));
    c.restore();
  }

  mailRow(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: [string, string, string, string, boolean], pec: boolean, hl: number) {
    const [from, subj, prev, time, unread] = r;
    c.save();
    c.fillStyle = HEX.sheet; c.fillRect(x, y, w, h);
    if (hl > 0) {
      c.fillStyle = rgba('overdue', 0.09 * hl); roundRect(c, x, y, w, h, 12); c.fill();
      c.fillStyle = HEX.overdue; roundRect(c, x, y + 10, 6, h - 20, 3); c.fill();
    }
    c.fillStyle = HEX.bezel; c.fillRect(x + 20, y + h - 1, w - 40, 1);
    if (unread) { c.fillStyle = hl ? HEX.overdue : HEX.pen; c.beginPath(); c.arc(x + 26, y + 34, 6, 0, TAU); c.fill(); }
    c.font = pec ? font(F.mono(700), 20) : font(F.sans(unread ? 700 : 500), 21);
    c.fillStyle = HEX.pen;
    c.fillText(from, x + 46, y + 40, 460);
    let sx = x + 540;
    if (pec) {
      c.fillStyle = hl ? HEX.overdue : HEX.pen; roundRect(c, sx, y + 18, 60, 30, 8); c.fill();
      c.font = font(F.sans(700), 16); c.fillStyle = '#fff'; c.fillText('PEC', sx + 13, y + 39);
      sx += 76;
    }
    c.font = font(F.sans(unread ? 600 : 500), 21); c.fillStyle = HEX.pen;
    c.fillText(subj, sx, y + 40, w - (sx - x) - 120);
    c.font = font(F.sans(400), 18); c.fillStyle = HEX.muted;
    c.fillText(prev, x + 540, y + 70, w - 660);
    c.textAlign = 'right'; c.font = font(F.sans(500), 18);
    c.fillText(time, x + w - 24, y + 40);
    c.restore();
  }
}

/** A word cut out of paper and slammed down: white strip, black Geist Black, a soft shadow. */
function strip(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, k: number, rot: number, seed: number): number {
  c.save();
  c.font = font(F.sans(900), size);
  c.letterSpacing = `${-0.04 * size}px`;
  const bw0 = c.measureText(s).width + size * 0.32;
  c.restore();
  if (k < -0.04) return bw0;
  const p = clamp((k + 0.04) / 0.07);
  const sc = 1 + (1 - ease.inQuad(p)) * 0.35;
  c.save();
  c.font = font(F.sans(900), size);
  c.letterSpacing = `${-0.04 * size}px`;
  const tw = c.measureText(s).width;
  const padX = size * 0.16, padT = size * 0.12, padB = size * 0.14;
  const bw = tw + padX * 2, bh = size * 0.74 + padT + padB;
  c.translate(x + bw / 2, y - size * 0.37);
  c.rotate(rot);
  c.scale(sc, sc);
  c.globalAlpha = clamp(p * 3);
  // torn-ish strip: a polygon with seeded jitter on its long edges
  const r = mulberry32(seed * 31 + 5);
  c.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) c.lineTo(-bw / 2 + (bw * i) / n, -bh / 2 + (r() - 0.5) * 3);
  for (let i = n; i >= 0; i--) c.lineTo(-bw / 2 + (bw * i) / n, bh / 2 + (r() - 0.5) * 3);
  c.closePath();
  c.save();
  c.shadowColor = `rgba(0,0,0,${0.28 * (p < 1 ? 0.5 : 1)})`;
  c.shadowBlur = p < 1 ? 30 : 14; c.shadowOffsetY = p < 1 ? 18 : 5;
  c.fillStyle = HEX.sheet; c.fill();
  c.restore();
  c.fillStyle = HEX.pen;
  c.textBaseline = 'alphabetic';
  c.fillText(s, -bw / 2 + padX, bh / 2 - padB - size * 0.02);
  c.restore();
  return bw;
}
