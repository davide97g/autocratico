// 9. `phone` — the examples (break, 61.45 – 71.88). Four hard cuts, one per lyric line, all on an
// iPhone on the studio grey: the ways in, the phishing flag, the 08:30 Telegram reminder ("Fatto!" =
// the film's first green), and "non paga mai per me": a greyed Paga that is never pressed, then the
// Attività capture with a git log behind it. Each line is set big on the left, word by word.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, TAU } from '../engine/util';
import type { Line } from '../engine/lyrics';
import { app, drawPhone, drawStudio, loadImage, roundRect } from './_motifs';
import { drawRow, drawTouch, PhoneScreen, pill, rowsOf, widget, type Row } from './phone-kit';
import { activity, appHeader, banner, camera, inboxCard, shareSheet, tgReminder, tgVoice, WARN, type InboxRow } from './phone-screens';

const CAP_X = 150;

export default class Phone extends Scene {
  layer = new Layer2D();
  scr = new PhoneScreen();
  act!: ImageBitmap;
  dead!: ImageBitmap;
  L!: Line[];
  R!: Row[][];

  override async init() {
    [this.act, this.dead] = await Promise.all([loadImage(app('phone', 'activity')), loadImage(app('phone', 'deadlines'))]);
    const ly = this.ctx.lyrics;
    this.L = [ly.get('Inoltro'), ly.get('falso mittente'), ly.get('Telegram alle'), ly.get('non paga mai')];
    this.R = [
      rowsOf(this.L[0]!, [1, 1, 2, 3, 2]),
      rowsOf(this.L[1]!, [2, 2, 1, 1]),
      rowsOf(this.L[2]!, [1, 4, 3, 1]),
      rowsOf(this.L[3]!, [2, 3, 3, 3]),
    ];
  }

  /** The caption stack: rows on the left; a row dims once the next one starts. */
  caption(c: CanvasRenderingContext2D, rows: Row[], t: number, size: number, gap: number, y0: number, colors?: Record<number, string>) {
    rows.forEach((row, i) => {
      const next = rows[i + 1];
      const dim = next ? 0.8 * clamp((t - next.words[0]!.start) / 0.18) : 0;
      drawRow(c, row, CAP_X, y0 + i * gap, size, t, { dim, color: colors?.[i] });
    });
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { t } = f;
    const c = this.layer.ctx;
    this.layer.clear();
    drawStudio(c, { drift: t * 0.12 });
    const [L1, L2, L3, L4] = this.L as [Line, Line, Line, Line];
    if (t < L2.start) this.shot1(c, t, L1);
    else if (t < L3.start) this.shot2(c, t, L2);
    else if (t < L4.start) this.shot3(c, t, L3);
    else this.shot4(c, t, L4);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper: 1, grain: 0.03, vignette: 0.15 };
  }

  /** Draw the phone (world coords) under a camera that keeps (fx, fy) at frame (px, py), zoomed. */
  phone(c: CanvasRenderingContext2D, cx: number, cy: number, h: number, cam: { fx: number; fy: number; px: number; py: number; z: number }, rot = 0, before?: () => void, after?: (r: { x: number; y: number; k: number }) => void) {
    c.save();
    c.translate(cam.px, cam.py);
    c.scale(cam.z, cam.z);
    c.translate(-cam.fx, -cam.fy);
    before?.();
    const r = drawPhone(c, this.scr.canvas, cx, cy, h, { rot });
    after?.(r);
    c.restore();
    return r;
  }

  // ------------------------------------------------------------ 1. Inoltro, scatto, un vocale…
  shot1(c: CanvasRenderingContext2D, t: number, L: Line) {
    const w = L.words;
    const s = this.scr.begin();
    const tDown = this.ctx.audio.downbeats[25]!; // 62.055, the kit
    const tCam = w[1]!.start - 0.04, tTg = w[2]!.start + 0.03, tInbox = w[4]!.start + 0.02;
    if (t < tCam) {
      const up = t < tDown ? (t - (L.start - 0.1)) / 0.3 : 1 - (t - tDown) / 0.16;
      shareSheet(s, up, t - (tDown - 0.2));
    } else if (t < tTg) camera(s, t - (w[1]!.start + 0.02));
    else if (t < tInbox) tgVoice(s, t - (tTg + 0.04), t - (w[3]!.start + 0.18));
    else {
      appHeader(s, 'Inbox', '08:06');
      const arch = w[8]!.start;
      const rows: InboxRow[] = [
        { title: 'Nota vocale: bollo auto', source: 'telegram', meta: '03/10/26', outcome: 'Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni.', done: t - arch },
        { title: 'Ricevuta manutenzione caldaia', source: 'upload', meta: '03/10/26', outcome: 'Ricevuta archiviata, prossima manutenzione caldaia in deadlines.toml.', done: t - arch - 0.1 },
        { title: 'Verbale multa ZTL', source: 'shortcut', meta: '03/10/26', outcome: 'Multa registrata: pagamento ridotto entro il 1 ott, già scaduto.', done: t - arch - 0.2 },
      ];
      inboxCard(s, 146, rows);
    }
    banner(s, t - tDown);

    // camera: a slow push; the phone's tilt settles on the kit's downbeat
    const z = lerp(1, 1.045, ease.inOutQuad(clamp((t - L.start) / (L.end - L.start))));
    const rot = -0.045 * (1 - ease.outCubic(clamp((t - L.start) / (tDown - L.start))));
    this.phone(c, 1330, 548, 980, { fx: 1330, fy: 548, px: 1330, py: 548, z }, rot);

    // the 60 s ring, on "in un minuto"
    const r0 = w[4]!.start;
    if (t >= r0 - 0.05) {
      const a = ease.outBack(clamp((t - r0 + 0.05) / 0.22), 1.6);
      const cx = 1060, cy = 742, R = 66;
      c.save();
      c.translate(cx, cy); c.scale(a, a); c.translate(-cx, -cy);
      widget(c, cx - 96, cy - 96, 192, 192, 48);
      const sweep = clamp((t - r0) / (w[8]!.start - 0.04 - r0));
      c.lineCap = 'round';
      c.strokeStyle = HEX.bezel; c.lineWidth = 10;
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
      c.strokeStyle = HEX.pen;
      if (sweep > 0) { c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * ease.inOutQuad(sweep)); c.stroke(); }
      c.fillStyle = HEX.pen;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (sweep < 1) {
        c.font = font(F.mono(500), 40);
        c.fillText(`${Math.round(60 * ease.inOutQuad(sweep))}`, cx, cy - 4);
        c.font = font(F.mono(400), 16); c.fillStyle = HEX.muted;
        c.fillText('s', cx, cy + 28);
      } else {
        // archived: a check
        const p = ease.outCubic(clamp((t - w[8]!.start) / 0.16));
        c.lineWidth = 9; c.strokeStyle = HEX.pen; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(cx - 24, cy + 2); c.lineTo(cx - 6, cy + 20);
        c.lineTo(lerp(cx - 6, cx + 28, p), lerp(cy + 20, cy - 18, p)); c.stroke();
      }
      c.restore();
    }
    this.caption(c, this.R[0]!, t, 104, 126, 290);
  }

  // ------------------------------------------------------------ 2. falso mittente, «paga subito»? Phishing, segnalato
  shot2(c: CanvasRenderingContext2D, t: number, L: Line) {
    const w = L.words;
    const s = this.scr.begin();
    appHeader(s, 'Inbox', '08:20');
    const rows: InboxRow[] = [
      { title: 'Verbale multa ZTL', source: 'shortcut', meta: '03/10/26', outcome: 'Multa registrata: pagamento ridotto entro il 1 ott, già scaduto.' },
      { title: 'Rimborso fiscale in attesa: conferma i tuoi dati', source: 'email', from: 'rimborsi@agenzia-entrate-servizi.info', meta: '02/10/26', outcome: WARN.join(' ') },
      { title: 'Nota vocale: bollo auto', source: 'telegram', meta: '02/10/26', outcome: 'Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni.' },
    ];
    const nchars = WARN.reduce((a, l) => a + Array.from(l).length, 0);
    const ys = inboxCard(s, 146, rows, {
      underline: { row: 1, p: (t - w[1]!.start) / 0.3 },
      warn: { row: 1, typed: nchars * clamp((t - w[4]!.start) / 0.24), hl: ease.inOutQuad(clamp((t - w[5]!.start) / 0.34)) },
    });
    // camera: close on the phishing row; it creeps in until "Phishing," (the drums stop), then holds
    const k = 980 / 900, top = 548 - (852 * k) / 2, left = 1360 - (393 * k) / 2;
    const fy = top + (ys[1]! + 92) * k, fx = left + 200 * k;
    const z = lerp(1.9, 2.04, ease.outQuad(clamp((t - L.start) / (w[4]!.start - L.start))));
    this.phone(c, 1360, 548, 980, { fx, fy, px: 1400, py: 560, z }, 0);
    this.caption(c, this.R[1]!, t, 96, 122, 330);
  }

  // ------------------------------------------------------------ 3. Telegram alle otto e mezza: «tra tre giorni», Fatto!
  shot3(c: CanvasRenderingContext2D, t: number, L: Line) {
    const w = L.words;
    const tDown = this.ctx.audio.downbeats[27]!; // 66.893
    const tFatto = w[8]!.start;
    const s = this.scr.begin();
    tgReminder(s, t - (tDown - 0.04), t - w[5]!.start, t - tFatto);
    drawTouch(s, 175, 558, t - tFatto, 24);
    // camera: close on the reminder, creeping in; still from "Fatto!" (the kit stops)
    const k = 980 / 900, top = 548 - (852 * k) / 2, left = 1360 - (393 * k) / 2;
    const fx = left + 196 * k, fy = top + 530 * k;
    const z = lerp(1.42, 1.52, ease.outQuad(clamp((t - L.start) / (tFatto - L.start))));
    const rot = 0.035 * (1 - ease.outCubic(clamp((t - L.start) / (tDown + 0.3 - L.start))));
    this.phone(c, 1360, 548, 980, { fx, fy, px: 1390, py: 560, z }, rot);

    // the clock, on "otto e mezza"
    const tc = w[2]!.start;
    if (t >= tc - 0.04) {
      const a = ease.outBack(clamp((t - tc + 0.04) / 0.22), 1.5);
      const cx = 1640, cy = 196;
      c.save();
      c.translate(cx, cy); c.scale(a, a); c.translate(-cx, -cy);
      widget(c, cx - 160, cy - 74, 320, 148, 38);
      c.fillStyle = HEX.pen; c.font = font(F.mono(500), 84);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.letterSpacing = '-3px';
      c.fillText('08:30', cx, cy + 4);
      c.restore();
    }
    // the chip, on «tra tre giorni»; green on "Fatto!"
    const tk = w[5]!.start;
    if (t >= tk - 0.04) {
      const a = ease.outBack(clamp((t - tk + 0.04) / 0.22), 1.5);
      const done = t >= tFatto + 0.06;
      const pop = done ? 1 + 0.12 * Math.exp(-(t - tFatto - 0.06) * 12) * Math.cos((t - tFatto - 0.06) * 30) : 1;
      const cx = 1100, cy = 860;
      c.save();
      c.translate(cx, cy); c.scale(a * pop, a * pop); c.translate(-cx, -cy);
      widget(c, cx - 170, cy - 62, 340, 124, 62);
      pill(c, done ? 'Fatta' : 'tra 3 gg', cx, cy - 31, 38, done ? HEX.done : HEX.urgent, { align: 'center' });
      c.restore();
    }
    this.caption(c, this.R[2]!, t, 92, 132, 300, { 3: HEX.done });
  }

  // ------------------------------------------------------------ 4. non paga mai per me: è un registro, non un ricatto
  shot4(c: CanvasRenderingContext2D, t: number, L: Line) {
    const w = L.words;
    const tReg = w[5]!.start, tNon = w[8]!.start, tHit = this.ctx.audio.downbeats[29]!; // 71.72
    const s = this.scr.begin();
    activity(s, this.act, '08:31');
    drawTouch(s, 252, 751, t - tHit, 26); // the tap on "Annulla", on the last hit

    this.gitlog(c, t, tReg, tHit);

    // the phone rises in on "è un registro"; the camera pushes to the commit row on "non un ricatto",
    // then holds still while the kit is out
    const rise = ease.outCubic(clamp((t - tReg + 0.04) / 0.38));
    if (rise > 0) {
      const zp = ease.inOutCubic(clamp((t - tNon) / 0.34));
      const k = 980 / 900, top = 548 - (852 * k) / 2;
      const rowY = top + 700 * k, rowX = 1360 - (393 * k) / 2 + 200 * k;
      const cam = { fx: lerp(1360, rowX, zp), fy: lerp(548, rowY, zp), px: lerp(1360, 1380, zp), py: lerp(548 + 760 * (1 - rise), 600, zp), z: lerp(1, 1.75, zp) };
      this.phone(c, 1360, 548, 980, cam, 0.05 * (1 - rise));
    }

    // the greyed "Paga": never pressed
    if (t < tReg + 0.25) {
      const a = ease.outBack(clamp((t - L.start + 0.02) / 0.26), 1.3);
      const gone = ease.inCubic(clamp((t - tReg) / 0.2));
      const bx = 1360, by = 540 + gone * 80;
      c.save();
      c.globalAlpha = 1 - gone;
      c.translate(bx, by); c.scale(a * (1 - 0.1 * gone), a * (1 - 0.1 * gone));
      c.shadowColor = 'rgba(0,0,0,0.10)'; c.shadowBlur = 50; c.shadowOffsetY = 20;
      c.fillStyle = '#d7d7d7';
      roundRect(c, -300, -96, 600, 192, 96); c.fill();
      c.shadowColor = 'transparent';
      c.fillStyle = '#a3a3a3';
      c.font = font(F.sans(600), 92); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.letterSpacing = '-3px';
      c.fillText('Paga', 0, 4);
      c.restore();
      // the cursor comes over it on "mai", hovers, never clicks, and leaves on "me:"
      const near = ease.inOutCubic(clamp((t - w[1]!.start - 0.05) / 0.32));
      const away = ease.inCubic(clamp((t - w[4]!.start + 0.02) / 0.3));
      if (near > 0 && gone < 1) {
        const px = lerp(1760, bx + 120, near) + away * 260 + Math.sin(t * 5.3) * 2 * near;
        const py = lerp(900, by + 18, near) + away * 300 + Math.cos(t * 4.1) * 2 * near;
        cursor(c, px, py, 2.4, 1 - gone);
      }
    }
    this.caption(c, this.R[3]!, t, 104, 126, 300);
  }

  /** The mono `git log --oneline`, lower left; the revert commit lands on the last hit. */
  gitlog(c: CanvasRenderingContext2D, t: number, t0: number, tHit: number) {
    const lines = [
      'de5a772 Agent: profile updated',
      'e1c798b Agent: 3 new item(s)',
      'c438d0c Agent: 2 new item(s)',
      'dff43dd Start tracking the register',
    ];
    const x = CAP_X + 4, y0 = 792, lh = 38, size = 24;
    if (t < t0) return;
    c.save();
    c.font = font(F.mono(400), size);
    c.textBaseline = 'alphabetic';
    c.fillStyle = HEX.muted;
    const pr = '$ git log --oneline';
    c.fillText(pr.slice(0, Math.floor(clamp((t - t0) / 0.2) * pr.length)), x, y0);
    const shift = ease.outCubic(clamp((t - tHit) / 0.14)) * lh;
    lines.forEach((l, i) => {
      const n = Math.floor(clamp((t - t0 - 0.22 - i * 0.07) / 0.2) * l.length);
      if (n <= 0) return;
      c.fillStyle = HEX.faint;
      c.globalAlpha = 1 - clamp((y0 + lh * (i + 1) + shift - 950) / 30);
      c.fillText(l.slice(0, n), x, y0 + lh * (i + 1) + shift);
    });
    if (t >= tHit) {
      const l = 'c41e9a0 Revert "Agent: profile updated"';
      const n = Math.floor(clamp((t - tHit) / 0.12) * l.length);
      c.globalAlpha = 1;
      c.fillStyle = HEX.pen;
      c.fillText(l.slice(0, n), x, y0 + lh);
    }
    c.restore();
  }
}

/** The macOS arrow cursor (black, white outline), tip at (x, y). */
function cursor(c: CanvasRenderingContext2D, x: number, y: number, s: number, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y); c.scale(s, s);
  const p = new Path2D('M0 0 L0 22 L5.2 17 L8.6 25.2 L12.4 23.6 L9 15.6 L16 15.6 Z');
  c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.fillStyle = '#fff';
  c.lineJoin = 'round';
  c.strokeStyle = '#fff'; c.lineWidth = 3.2; c.stroke(p);
  c.shadowColor = 'transparent';
  c.fillStyle = '#000'; c.fill(p);
  c.restore();
}
