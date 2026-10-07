// The `phone` plate in the upright cut (9:16, `?aspect=9x16`). Same four cuts, recomposed: the lyric
// is set big at the top of the safe box, and below it one big iPhone rises from the bottom edge of
// the frame, its top always just under the lyric. Close-ups scroll the screen (the inbox, the chat,
// the Attività page) instead of letting the camera push the phone into the type. The widgets (the
// 60 s ring, the 08:30 clock, the status chip, the git log) float over the phone's edges.
import { SAFE } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font, measure } from '../engine/type';
import { clamp, ease, lerp, TAU } from '../engine/util';
import type { Line } from '../engine/lyrics';
import { roundRect } from './_motifs';
import { drawTouch, pill, rowsOf, statusBar, widget, type Row } from './phone-kit';
import { activityScrolled, appHeader, banner, camera, inboxCard, shareSheet, tgReminder, tgVoice, WARN, type InboxRow } from './phone-screens';
import type Phone from './phone';

/** Horizontal centre of the safe box: the phone's axis. */
const CX = (SAFE.left + SAFE.right) / 2;
/** The phone's top edge: just under the lyric block. */
const TOP = 750;
const CAP_X = SAFE.left + 6;
const SW = 393;

export interface Upright { rows: Row[][]; size: number[]; }

/** Row splits per line and a size per line: each as large as its widest row allows (≤ 112 px). */
export function uprightLayout(L: Line[]): Upright {
  const splits = [[2, 2, 3, 2], [2, 2, 1, 1], [1, 4, 3, 1], [2, 3, 3, 3]];
  const rows = L.map((l, i) => rowsOf(l, splits[i]!));
  const fam = F.sans(900);
  const size = rows.map((rs) => Math.min(112, ...rs.map((r) => (100 * 846) / measure(r.text, fam, 100, -4))));
  return { rows, size };
}

function caption(p: Phone, c: CanvasRenderingContext2D, i: number, t: number, colors?: Record<number, string>) {
  const U = p.up!, size = U.size[i]!;
  p.caption(c, U.rows[i]!, t, size, size * 1.1, SAFE.top + size * 0.84, colors, CAP_X);
}

/** The phone, top edge pinned at TOP (+ `dy`), pushed in by `z` about its top centre. */
function phone(p: Phone, c: CanvasRenderingContext2D, h: number, z: number, rot = 0, dy = 0) {
  return p.phone(c, CX, TOP + h / 2, h, { fx: CX, fy: TOP, px: CX, py: TOP + dy, z }, rot);
}

export function uprightShot(p: Phone, c: CanvasRenderingContext2D, t: number) {
  const [L1, L2, L3, L4] = p.L as [Line, Line, Line, Line];
  if (t < L2.start) shot1(p, c, t, L1);
  else if (t < L3.start) shot2(p, c, t, L2);
  else if (t < L4.start) shot3(p, c, t, L3);
  else shot4(p, c, t, L4);
}

// ------------------------------------------------------------ 1. Inoltro, scatto, un vocale…
function shot1(p: Phone, c: CanvasRenderingContext2D, t: number, L: Line) {
  const w = L.words;
  const s = p.scr.begin();
  const tDown = p.audio.downbeats[25]!;
  const tCam = w[1]!.start - 0.04, tTg = w[2]!.start + 0.03, tInbox = w[4]!.start + 0.02;
  if (t < tCam) {
    const up = t < tDown ? (t - (L.start - 0.1)) / 0.3 : 1 - (t - tDown) / 0.16;
    shareSheet(s, up, t - (tDown - 0.2), 210);
  } else if (t < tTg) camera(s, t - (w[1]!.start + 0.02));
  else if (t < tInbox) tgVoice(s, t - (tTg + 0.04), t - (w[3]!.start + 0.18), 270);
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

  // a slow push from the top edge; the tilt settles on the kit's downbeat
  const z = lerp(1, 1.04, ease.inOutQuad(clamp((t - L.start) / (L.end - L.start))));
  const rot = -0.035 * (1 - ease.outCubic(clamp((t - L.start) / (tDown - L.start))));
  phone(p, c, 1280, z, rot);

  // the 60 s ring, on "in un minuto", over the phone's left edge
  const r0 = w[4]!.start;
  if (t >= r0 - 0.05) {
    const a = ease.outBack(clamp((t - r0 + 0.05) / 0.22), 1.6);
    const cx = 196, cy = 1236, R = 72;
    c.save();
    c.translate(cx, cy); c.scale(a, a); c.translate(-cx, -cy);
    widget(c, cx - 104, cy - 104, 208, 208, 52);
    const sweep = clamp((t - r0) / (w[8]!.start - 0.04 - r0));
    c.lineCap = 'round';
    c.strokeStyle = HEX.bezel; c.lineWidth = 11;
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    c.strokeStyle = HEX.pen;
    if (sweep > 0) { c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * ease.inOutQuad(sweep)); c.stroke(); }
    c.fillStyle = HEX.pen;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (sweep < 1) {
      c.font = font(F.mono(500), 46);
      c.fillText(`${Math.round(60 * ease.inOutQuad(sweep))}`, cx, cy - 6);
      c.font = font(F.mono(400), 22); c.fillStyle = HEX.muted;
      c.fillText('s', cx, cy + 32);
    } else {
      const q = ease.outCubic(clamp((t - w[8]!.start) / 0.16));
      c.lineWidth = 10; c.strokeStyle = HEX.pen; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(cx - 26, cy + 2); c.lineTo(cx - 7, cy + 22);
      c.lineTo(lerp(cx - 7, cx + 30, q), lerp(cy + 22, cy - 20, q)); c.stroke();
    }
    c.restore();
  }
  caption(p, c, 0, t);
}

// ------------------------------------------------------------ 2. falso mittente, «paga subito»? Phishing, segnalato
const PHISH_ROWS: InboxRow[] = [
  { title: 'Verbale multa ZTL', source: 'shortcut', meta: '03/10/26', outcome: 'Multa registrata: pagamento ridotto entro il 1 ott, già scaduto.' },
  { title: 'Rimborso fiscale in attesa: conferma i tuoi dati', source: 'email', from: 'rimborsi@agenzia-entrate-servizi.info', meta: '02/10/26', outcome: WARN.join(' ') },
  { title: 'Nota vocale: bollo auto', source: 'telegram', meta: '02/10/26', outcome: 'Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni.' },
];
let phishY = -1;
function shot2(p: Phone, c: CanvasRenderingContext2D, t: number, L: Line) {
  const w = L.words;
  const s = p.scr.begin();
  // the inbox scrolled so the phishing row sits right under the status bar
  if (phishY < 0) { appHeader(s, 'Inbox', '08:20'); phishY = inboxCard(s, 146, PHISH_ROWS)[1]!; p.scr.begin(); }
  const nchars = WARN.reduce((a, l) => a + Array.from(l).length, 0);
  s.save();
  s.translate(0, -(phishY - 62));
  appHeader(s, 'Inbox', '08:20');
  inboxCard(s, 146, PHISH_ROWS, {
    underline: { row: 1, p: (t - w[1]!.start) / 0.3 },
    warn: { row: 1, typed: nchars * clamp((t - w[4]!.start) / 0.24), hl: ease.inOutQuad(clamp((t - w[5]!.start) / 0.34)) },
  });
  s.restore();
  s.fillStyle = 'rgba(230,230,230,0.96)'; s.fillRect(0, 0, SW, 54);
  statusBar(s, '08:20');
  // a close-up: the phone fills the width; it creeps in until "Phishing," (the drums stop), then holds
  const z = lerp(1, 1.05, ease.outQuad(clamp((t - L.start) / (w[4]!.start - L.start))));
  phone(p, c, 1890, z);
  caption(p, c, 1, t);
}

// ------------------------------------------------------------ 3. Telegram alle otto e mezza: «tra tre giorni», Fatto!
function shot3(p: Phone, c: CanvasRenderingContext2D, t: number, L: Line) {
  const w = L.words;
  const tDown = p.audio.downbeats[27]!;
  const tFatto = w[8]!.start;
  const lift = 260;
  const s = p.scr.begin();
  tgReminder(s, t - (tDown - 0.04), t - w[5]!.start, t - tFatto, lift);
  drawTouch(s, 175, 558 - lift, t - tFatto, 24);
  const z = lerp(1, 1.04, ease.outQuad(clamp((t - L.start) / (tFatto - L.start))));
  const rot = 0.03 * (1 - ease.outCubic(clamp((t - L.start) / (tDown + 0.3 - L.start))));
  phone(p, c, 1440, z, rot);

  // two widgets over the phone's top corners: the clock (on "otto e mezza"), then the chip
  const wy = 866;
  const tc = w[2]!.start;
  if (t >= tc - 0.04) {
    const a = ease.outBack(clamp((t - tc + 0.04) / 0.22), 1.5);
    const cx = SAFE.left + 160;
    c.save();
    c.translate(cx, wy); c.scale(a, a); c.translate(-cx, -wy);
    widget(c, cx - 160, wy - 74, 320, 148, 38);
    c.fillStyle = HEX.pen; c.font = font(F.mono(500), 84);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.letterSpacing = '-3px';
    c.fillText('08:30', cx, wy + 4);
    c.restore();
  }
  const tk = w[5]!.start;
  if (t >= tk - 0.04) {
    const a = ease.outBack(clamp((t - tk + 0.04) / 0.22), 1.5);
    const done = t >= tFatto + 0.06;
    const pop = done ? 1 + 0.12 * Math.exp(-(t - tFatto - 0.06) * 12) * Math.cos((t - tFatto - 0.06) * 30) : 1;
    const cx = SAFE.right - 170;
    c.save();
    c.translate(cx, wy); c.scale(a * pop, a * pop); c.translate(-cx, -wy);
    widget(c, cx - 170, wy - 62, 340, 124, 62);
    pill(c, done ? 'Fatta' : 'tra 3 gg', cx, wy - 31, 38, done ? HEX.done : HEX.urgent, { align: 'center' });
    c.restore();
  }
  caption(p, c, 2, t, { 3: HEX.done });
}

// ------------------------------------------------------------ 4. non paga mai per me: è un registro, non un ricatto
/** Attività scrolled so the "Modifiche ai dati" card sits under the status bar. */
const ACT_SCROLL = 475;
function shot4(p: Phone, c: CanvasRenderingContext2D, t: number, L: Line) {
  const w = L.words;
  const tReg = w[5]!.start, tNon = w[8]!.start, tHit = p.audio.downbeats[29]!;
  const s = p.scr.begin();
  activityScrolled(s, p.actFull!, '08:31', ACT_SCROLL);
  drawTouch(s, 240, 749 - ACT_SCROLL, t - tHit, 26); // the tap on "Annulla", on the last hit

  // the phone rises in on "è un registro"; a small push from the top on "non un ricatto", then still
  const rise = ease.outCubic(clamp((t - tReg + 0.04) / 0.38));
  if (rise > 0) {
    const zp = ease.inOutCubic(clamp((t - tNon) / 0.34));
    phone(p, c, 1350, lerp(1, 1.03, zp), 0.05 * (1 - rise), 760 * (1 - rise));
  }

  // the greyed "Paga": never pressed
  if (t < tReg + 0.25) {
    const a = ease.outBack(clamp((t - L.start + 0.02) / 0.26), 1.3);
    const gone = ease.inCubic(clamp((t - tReg) / 0.2));
    const bx = CX, by = 1070 + gone * 80;
    c.save();
    c.globalAlpha = 1 - gone;
    c.translate(bx, by); c.scale(a * (1 - 0.1 * gone), a * (1 - 0.1 * gone));
    c.shadowColor = 'rgba(0,0,0,0.10)'; c.shadowBlur = 50; c.shadowOffsetY = 20;
    c.fillStyle = '#d7d7d7';
    roundRect(c, -320, -104, 640, 208, 104); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = '#a3a3a3';
    c.font = font(F.sans(600), 100); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.letterSpacing = '-3px';
    c.fillText('Paga', 0, 4);
    c.restore();
    const near = ease.inOutCubic(clamp((t - w[1]!.start - 0.05) / 0.32));
    const away = ease.inCubic(clamp((t - w[4]!.start + 0.02) / 0.3));
    if (near > 0 && gone < 1) {
      const px = lerp(980, bx + 130, near) + away * 240 + Math.sin(t * 5.3) * 2 * near;
      const py = lerp(1560, by + 22, near) + away * 340 + Math.cos(t * 4.1) * 2 * near;
      cursor(c, px, py, 2.6, 1 - gone);
    }
  }
  gitlog(c, t, tReg, tHit);
  caption(p, c, 3, t);
}

/** `git log --oneline` in a white widget over the phone's lower edge; the revert lands on the last hit. */
function gitlog(c: CanvasRenderingContext2D, t: number, t0: number, tHit: number) {
  if (t < t0 - 0.02) return;
  const lines = [
    'de5a772 Agent: profile updated',
    'e1c798b Agent: 3 new item(s)',
    'c438d0c Agent: 2 new item(s)',
    'dff43dd Start tracking the register',
  ];
  const size = 30, lh = 40;
  const x = SAFE.left, y = 1262, wd = 790, ht = 188;
  const a = ease.outBack(clamp((t - t0 + 0.02) / 0.26), 1.3);
  c.save();
  c.translate(x, y + ht); c.scale(a, a); c.translate(-x, -(y + ht));
  widget(c, x, y, wd, ht, 34);
  c.beginPath(); roundRect(c, x, y, wd, ht, 34); c.clip();
  c.font = font(F.mono(400), size);
  c.textBaseline = 'alphabetic';
  const tx = x + 32, y0 = y + 52;
  c.fillStyle = HEX.faint;
  const pr = '$ git log --oneline';
  c.fillText(pr.slice(0, Math.floor(clamp((t - t0) / 0.2) * pr.length)), tx, y0);
  const shift = ease.outCubic(clamp((t - tHit) / 0.14)) * lh;
  lines.forEach((l, i) => {
    const n = Math.floor(clamp((t - t0 - 0.22 - i * 0.07) / 0.2) * l.length);
    if (n <= 0) return;
    c.fillStyle = HEX.muted;
    c.globalAlpha = 1 - clamp((y0 + lh * (i + 1) + shift - (y + ht - 18)) / 24);
    c.fillText(l.slice(0, n), tx, y0 + lh * (i + 1) + shift);
  });
  if (t >= tHit) {
    const l = 'c41e9a0 Revert "Agent: profile updated"';
    const n = Math.floor(clamp((t - tHit) / 0.12) * l.length);
    c.globalAlpha = 1;
    c.fillStyle = HEX.pen;
    c.font = font(F.mono(500), size);
    c.fillText(l.slice(0, n), tx, y0 + lh);
  }
  c.restore();
}

/** The macOS arrow cursor (black, white outline), tip at (x, y). */
function cursor(c: CanvasRenderingContext2D, x: number, y: number, s: number, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y); c.scale(s, s);
  const path = new Path2D('M0 0 L0 22 L5.2 17 L8.6 25.2 L12.4 23.6 L9 15.6 L16 15.6 Z');
  c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  c.lineJoin = 'round';
  c.strokeStyle = '#fff'; c.lineWidth = 3.2; c.stroke(path);
  c.shadowColor = 'transparent';
  c.fillStyle = '#000'; c.fill(path);
  c.restore();
}
