// The iPhone screens of the `phone` plate, drawn in points (393×852) into a PhoneScreen canvas.
// Real copy only: share-sheet shortcut name from docs/ios-shortcut.md, inbox strings and demo items
// from apps/web/src/i18n/it.ts and var/video/appdata/inbox, Telegram copy from apps/server/src/
// telegram.ts and jobs.ts. Everything is greyscale until the first "Fatto!" (green).
import { HEX, rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, hash, TAU } from '../engine/util';
import { drawBar, drawIcon, roundRect } from './_motifs';
import { drawTouch, glyph, statusBar, wrap } from './phone-kit';

const SW = 393, SH = 852;
type C = CanvasRenderingContext2D;

function text(c: C, s: string, x: number, y: number, size: number, o: { w?: number; col?: string; align?: CanvasTextAlign; mono?: boolean; base?: CanvasTextBaseline } = {}) {
  c.font = font(o.mono ? F.mono(o.w ?? 400) : F.sans(o.w ?? 400), size);
  c.fillStyle = o.col ?? HEX.pen;
  c.textAlign = o.align ?? 'left';
  c.textBaseline = o.base ?? 'alphabetic';
  c.letterSpacing = '0px';
  c.fillText(s, x, y);
  return c.measureText(s).width;
}

// ---------------------------------------------------------------- 1a. share sheet over a PDF
/**
 * `up` 0..1 sheet position, `tap` s since the tap on "Invia ad Autocratico" (negative = not yet).
 * `lift` (pt): the sheet opens that much taller (the upright cut keeps its actions higher on screen).
 */
export function shareSheet(c: C, up: number, tap: number, lift = 0) {
  // the PDF in Quick Look
  c.fillStyle = '#f2f2f2'; c.fillRect(0, 0, SW, SH);
  statusBar(c, '08:05');
  text(c, 'Fine', 20, 82, 17, { w: 500 });
  text(c, 'Verbale multa ZTL.pdf', SW / 2, 82, 16, { w: 600, align: 'center' });
  c.fillStyle = '#e4e4e4'; c.fillRect(0, 100, SW, SH - 100);
  // the page
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.12)'; c.shadowBlur = 14; c.shadowOffsetY = 4;
  c.fillStyle = '#fff'; c.fillRect(34, 124, SW - 68, 460);
  c.restore();
  text(c, 'COMUNE DI ESEMPIO', 56, 160, 9, { w: 700, col: HEX.graphite });
  text(c, 'Polizia Locale', 56, 174, 8, { col: HEX.muted });
  text(c, 'VERBALE DI ACCERTAMENTO', 56, 210, 13, { w: 700 });
  text(c, 'di violazione al Codice della Strada', 56, 226, 9, { col: HEX.graphite });
  text(c, 'N. 2026/04812', SW - 56, 160, 9, { mono: true, align: 'right', col: HEX.graphite });
  const rnd = (i: number) => hash(i, 11);
  for (let i = 0; i < 14; i++) {
    const y = 252 + i * 15;
    c.fillStyle = '#d6d6d6';
    c.fillRect(56, y, (SW - 112) * (0.55 + 0.45 * rnd(i)), 5);
  }
  c.strokeStyle = '#cfcfcf'; c.lineWidth = 1;
  c.strokeRect(56, 476, SW - 112, 70);
  text(c, 'Importo', 66, 496, 8, { col: HEX.muted });
  drawBar(c, 66, 506, 74, 12, 1, '#bdbdbd');
  // the sheet
  if (up <= 0) return;
  const e = ease.outQuart(clamp(up));
  c.fillStyle = `rgba(0,0,0,${0.22 * e})`; c.fillRect(0, 0, SW, SH);
  const top = SH - (548 + lift) * e;
  c.save();
  c.fillStyle = '#f2f2f2';
  roundRect(c, 0, top, SW, 620 + lift, 14); c.fill();
  c.fillStyle = '#c7c7c7'; roundRect(c, SW / 2 - 18, top + 6, 36, 5, 2.5); c.fill();
  // header: thumbnail + name
  c.fillStyle = '#fff'; c.fillRect(20, top + 26, 38, 48);
  c.strokeStyle = '#d4d4d4'; c.strokeRect(20.5, top + 26.5, 37, 47);
  for (let i = 0; i < 6; i++) { c.fillStyle = '#ddd'; c.fillRect(26, top + 36 + i * 6, 20 + 6 * hash(i, 4), 2); }
  text(c, 'Verbale multa ZTL', 70, top + 46, 16, { w: 600 });
  text(c, 'Documento PDF · 412 KB', 70, top + 66, 13, { col: HEX.muted });
  c.fillStyle = '#e2e2e2'; c.beginPath(); c.arc(SW - 36, top + 46, 15, 0, TAU); c.fill();
  glyph(c, 'x', SW - 44, top + 38, 16, HEX.muted, 2.4);
  c.fillStyle = '#dcdcdc'; c.fillRect(0, top + 92, SW, 0.7);
  // app row (generic, no logos)
  const apps: [string, string][] = [['bubble', 'Messaggi'], ['mail', 'Mail'], ['send', 'Telegram'], ['note', 'Note']];
  apps.forEach(([g, label], i) => {
    const x = 22 + i * 92, y = top + 108;
    c.fillStyle = '#fff';
    roundRect(c, x, y, 62, 62, 15); c.fill();
    glyph(c, g, x + 18, y + 18, 26, HEX.graphite, 1.6);
    text(c, label, x + 31, y + 82, 12, { align: 'center', col: HEX.graphite });
  });
  // action list
  const rows: [string, string][] = [['Copia', 'copy'], ['Invia ad Autocratico', 'icon'], ['Salva su File', 'folder'], ['Stampa', 'printer']];
  const lx = 16, ly = top + 216, rh = 52, lw = SW - 32;
  c.fillStyle = '#fff';
  roundRect(c, lx, ly, lw, rh * rows.length, 12); c.fill();
  rows.forEach(([label, g], i) => {
    const y = ly + i * rh;
    if (i === 1 && tap >= -0.05) {
      const a = tap < 0.25 ? 1 : clamp(1 - (tap - 0.25) / 0.3);
      c.save();
      roundRect(c, lx, ly, lw, rh * rows.length, 12); c.clip();
      c.fillStyle = `rgba(0,0,0,${0.09 * a})`; c.fillRect(lx, y, lw, rh);
      c.restore();
    }
    if (i > 0) { c.fillStyle = '#e4e4e4'; c.fillRect(lx + 16, y, lw - 16, 0.7); }
    text(c, label, lx + 16, y + rh / 2 + 6, 17, { w: i === 1 ? 500 : 400 });
    if (g === 'icon') drawIcon(c, lx + lw - 32, y + rh / 2, 28);
    else glyph(c, g, lx + lw - 44, y + rh / 2 - 12, 24, HEX.pen, 1.6);
  });
  text(c, 'Modifica azioni…', SW / 2, ly + rh * rows.length + 40, 16, { align: 'center', col: HEX.graphite });
  drawTouch(c, 250, ly + rh * 1.5, tap, 24);
  c.restore();
}

/** The notification banner "Inviato ad Autocratico" (docs/ios-shortcut.md), `k` s since it fired. */
export function banner(c: C, k: number) {
  if (k < 0 || k > 1.2) return;
  const inn = ease.outBack(clamp(k / 0.28), 1.2), out = ease.inCubic(clamp((k - 0.9) / 0.3));
  const y = -90 + 102 * inn - 110 * out;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.18)'; c.shadowBlur = 20; c.shadowOffsetY = 6;
  c.fillStyle = 'rgba(250,250,250,0.97)';
  roundRect(c, 10, y, SW - 20, 72, 22); c.fill();
  c.restore();
  drawIcon(c, 44, y + 36, 38);
  text(c, 'Invia ad Autocratico', 74, y + 31, 15, { w: 600 });
  text(c, 'Inviato ad Autocratico', 74, y + 51, 15);
  text(c, 'ora', SW - 26, y + 31, 13, { col: HEX.muted, align: 'right' });
}

// ---------------------------------------------------------------- 1b. camera
/** `snap` s since the shutter (negative = before). */
export function camera(c: C, snap: number) {
  c.fillStyle = '#000'; c.fillRect(0, 0, SW, SH);
  statusBar(c, '08:05', true);
  // viewfinder 4:3
  const vy = 118, vh = 524;
  c.save();
  c.beginPath(); c.rect(0, vy, SW, vh); c.clip();
  const g = c.createLinearGradient(0, vy, SW, vy + vh);
  g.addColorStop(0, '#5a5a5a'); g.addColorStop(1, '#2e2e2e');
  c.fillStyle = g; c.fillRect(0, vy, SW, vh);
  // a receipt on the table, slightly rotated (hand-held drift until the snap)
  const drift = snap < 0 ? Math.sin(snap * 9) * 2 : 0;
  c.translate(SW / 2 + drift, vy + vh / 2 + 6);
  c.rotate(-0.06);
  c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
  c.fillStyle = '#f4f4f2';
  c.fillRect(-120, -210, 240, 420);
  c.shadowColor = 'transparent';
  text(c, 'RICEVUTA', 0, -170, 16, { w: 700, align: 'center' });
  text(c, 'Manutenzione caldaia', 0, -148, 11, { align: 'center', col: HEX.graphite });
  text(c, '28/09/2026', 0, -132, 10, { mono: true, align: 'center', col: HEX.muted });
  c.setLineDash([3, 3]); c.strokeStyle = '#bbb'; c.beginPath(); c.moveTo(-100, -116); c.lineTo(100, -116); c.stroke(); c.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const y = -96 + i * 22;
    c.fillStyle = '#cfcfcf'; c.fillRect(-100, y, 90 + 40 * hash(i, 2), 5);
    c.fillRect(60, y, 40, 5);
  }
  c.setLineDash([3, 3]); c.beginPath(); c.moveTo(-100, 92); c.lineTo(100, 92); c.stroke(); c.setLineDash([]);
  text(c, 'TOTALE', -100, 122, 12, { w: 700 });
  drawBar(c, 40, 110, 60, 14, 1, '#2a2a2a');
  c.restore();
  // focus square
  if (snap < 0.05) {
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.2;
    const s = 86 + Math.max(0, -snap) * 30;
    c.strokeRect(SW / 2 - s / 2, vy + vh / 2 - s / 2, s, s);
  }
  // flash
  if (snap >= 0 && snap < 0.2) {
    c.fillStyle = `rgba(255,255,255,${1 - snap / 0.2})`;
    c.fillRect(0, vy, SW, vh);
  }
  // modes
  const modes = ['VIDEO', 'FOTO', 'RITRATTO'];
  modes.forEach((m, i) => text(c, m, SW / 2 + (i - 1) * 86, 676, 13, { w: i === 1 ? 600 : 500, align: 'center', col: i === 1 ? '#fff' : '#9a9a9a' }));
  // shutter
  const press = snap >= -0.04 && snap < 0.14 ? 1 - Math.abs((snap - 0.05) / 0.09) : 0;
  c.strokeStyle = '#fff'; c.lineWidth = 4;
  c.beginPath(); c.arc(SW / 2, 748, 36, 0, TAU); c.stroke();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(SW / 2, 748, 30 - 4 * clamp(press), 0, TAU); c.fill();
  // thumbnail
  c.fillStyle = '#222'; roundRect(c, 40, 726, 44, 44, 8); c.fill();
  if (snap > 0.12) {
    const p = ease.outCubic(clamp((snap - 0.12) / 0.2));
    c.save();
    roundRect(c, 40, 726, 44, 44, 8); c.clip();
    c.globalAlpha = p;
    c.fillStyle = '#4a4a4a'; c.fillRect(40, 726, 44, 44);
    c.fillStyle = '#eee'; c.fillRect(52, 732, 20, 32);
    c.restore();
  }
}

// ---------------------------------------------------------------- Telegram (greyscale, plain)
const TG_BG = '#e3e3e3';
function tgFrame(c: C, time: string) {
  c.fillStyle = TG_BG; c.fillRect(0, 0, SW, SH);
  // header
  c.fillStyle = 'rgba(248,248,248,0.98)'; c.fillRect(0, 0, SW, 104);
  c.fillStyle = '#d0d0d0'; c.fillRect(0, 104, SW, 0.6);
  statusBar(c, time);
  glyph(c, 'chevron', 6, 62, 26, HEX.pen, 2.2);
  text(c, 'Chat', 30, 81, 17);
  text(c, 'Autocratico', SW / 2, 74, 17, { w: 600, align: 'center' });
  text(c, 'bot', SW / 2, 93, 13, { align: 'center', col: HEX.muted });
  c.save();
  c.beginPath(); c.arc(SW - 34, 76, 19, 0, TAU); c.clip();
  drawIcon(c, SW - 34, 76, 46);
  c.restore();
  // input bar
  c.fillStyle = 'rgba(248,248,248,0.98)'; c.fillRect(0, SH - 84, SW, 84);
  c.fillStyle = '#d0d0d0'; c.fillRect(0, SH - 84, SW, 0.6);
  glyph(c, 'clip', 14, SH - 72, 24, HEX.muted, 1.7);
  c.fillStyle = '#fff'; roundRect(c, 50, SH - 76, SW - 104, 36, 18); c.fill();
  c.strokeStyle = '#d6d6d6'; c.lineWidth = 0.8; roundRect(c, 50, SH - 76, SW - 104, 36, 18); c.stroke();
  text(c, 'Messaggio', 66, SH - 52, 16, { col: HEX.faint });
  glyph(c, 'mic', SW - 40, SH - 70, 24, HEX.muted, 1.7);
  c.fillStyle = '#000'; roundRect(c, SW / 2 - 67, SH - 10, 134, 5, 2.5); c.fill();
}
function bubble(c: C, x: number, y: number, w: number, h: number, out: boolean) {
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.08)'; c.shadowBlur = 2; c.shadowOffsetY = 1;
  c.fillStyle = out ? HEX.ink2 : '#fff';
  roundRect(c, x, y, w, h, 17); c.fill();
  c.restore();
}

/** Telegram chat content scrolled up by `lift` pt, clipped under the header (the upright cut). */
function lifted(c: C, lift: number, body: () => void) {
  if (!lift) { body(); return; }
  c.save();
  c.beginPath(); c.rect(0, 105, SW, SH - 189); c.clip();
  c.translate(0, -lift);
  body();
  c.restore();
}

/** 1c. A forwarded voice note and the bot's answer ("🎙️ …" + "Aggiunto all'inbox."). `lift`: see lifted(). */
export function tgVoice(c: C, k: number, reply: number, lift = 0) {
  tgFrame(c, '08:05');
  lifted(c, lift, () => tgVoiceBody(c, k, reply));
}
function tgVoiceBody(c: C, k: number, reply: number) {
  text(c, 'Oggi', SW / 2, 128, 13, { w: 500, align: 'center', col: HEX.graphite });
  // the voice bubble (outgoing)
  if (k >= 0) {
    const p = ease.outBack(clamp(k / 0.22), 1.3);
    const w = 268, h = 82, x = SW - 12 - w;
    const y = (reply >= 0 ? 520 - 128 * ease.outCubic(clamp(reply / 0.22)) : 520) + (1 - p) * 30;
    c.save();
    c.globalAlpha = clamp(k / 0.1);
    bubble(c, x, y, w, h, true);
    text(c, 'Messaggio inoltrato', x + 14, y + 20, 12, { w: 500, col: '#bdbdbd' });
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 34, y + 50, 18, 0, TAU); c.fill();
    c.fillStyle = HEX.ink2; c.beginPath(); c.moveTo(x + 29, y + 41); c.lineTo(x + 42, y + 50); c.lineTo(x + 29, y + 59); c.closePath(); c.fill();
    const played = clamp((k - 0.15) / 0.5);
    for (let i = 0; i < 34; i++) {
      const a = hash(i, 77), hh = 3 + 17 * Math.pow(a, 1.4) * (0.5 + 0.5 * Math.sin(i * 0.5));
      c.fillStyle = i / 34 < played ? '#fff' : '#6a6a6a';
      roundRect(c, x + 62 + i * 5, y + 46 - hh / 2, 3, Math.max(3, hh), 1.5); c.fill();
    }
    text(c, '0:07', x + 62, y + 72, 11, { col: '#bdbdbd', mono: true });
    text(c, '08:05', x + w - 14, y + 72, 11, { col: '#bdbdbd', align: 'right' });
    c.restore();
  }
  if (reply >= 0) {
    const p = ease.outCubic(clamp(reply / 0.22));
    const x = 12, w = 286, y = 618 + (1 - p) * 30;
    c.save();
    c.globalAlpha = p;
    bubble(c, x, y, w, 112, false);
    c.font = font(F.sans(400), 15);
    text(c, '🎙️ Ricordami il bollo auto,', x + 14, y + 26, 15);
    text(c, 'scade il 6 ottobre.', x + 14, y + 46, 15);
    text(c, 'Aggiunto all\'inbox.', x + 14, y + 80, 15);
    text(c, '08:05', x + w - 12, y + 100, 11, { col: HEX.muted, align: 'right' });
    c.restore();
  }
}

/**
 * 3. The 08:30 reminder (jobs.ts #reminders: "🔔 Promemoria" / "• Bollo auto — tra 3 giorni (2026-10-06)")
 * with the buttons. `k` s since it arrived, `hl` s since "tra tre giorni", `tap` s since "Fatto!".
 */
export function tgReminder(c: C, k: number, hl: number, tap: number, lift = 0) {
  tgFrame(c, '08:30');
  lifted(c, lift, () => tgReminderBody(c, k, hl, tap));
}
function tgReminderBody(c: C, k: number, hl: number, tap: number) {
  text(c, 'Oggi', SW / 2, 128, 13, { w: 500, align: 'center', col: HEX.graphite });
  // yesterday's exchange above, faint context
  bubble(c, SW - 12 - 188, 232, 188, 40, true);
  text(c, 'Messaggio vocale · 0:07', SW - 24 - 164, 257, 13, { col: '#bdbdbd' });
  bubble(c, 12, 282, 172, 40, false);
  text(c, 'Aggiunto all\'inbox.', 26, 307, 14);
  if (k < 0) return;
  const p = ease.outBack(clamp(k / 0.26), 1.2);
  const x = 12, w = 326, h = 92;
  const y = 440 + (1 - p) * 40;
  c.save();
  c.globalAlpha = clamp(k / 0.12);
  bubble(c, x, y, w, h, false);
  text(c, '🔔 Promemoria', x + 14, y + 28, 16, { w: 400 });
  // "• Bollo auto — tra 3 giorni (2026-10-06)"
  c.font = font(F.sans(400), 15);
  const pre = '• Bollo auto — ', mid = 'tra 3 giorni', post = ' (2026-10-06)';
  const x0 = x + 14, by = y + 54;
  const w0 = c.measureText(pre).width, w1 = c.measureText(mid).width;
  if (hl >= 0) {
    const q = ease.outCubic(clamp(hl / 0.2));
    const col = HEX.urgent;
    c.fillStyle = rgba(col, 0.16);
    roundRect(c, x0 + w0 - 3, by - 15, (w1 + 6) * q, 21, 5); c.fill();
  }
  text(c, pre, x0, by, 15);
  text(c, mid, x0 + w0, by, 15, { col: hl >= 0.05 ? HEX.urgent : HEX.pen, w: hl >= 0.05 ? 500 : 400 });
  text(c, post, x0 + w0 + w1, by, 15);
  text(c, '08:30', x + w - 12, y + 80, 11, { col: HEX.muted, align: 'right' });
  // inline keyboard
  const by0 = y + h + 6, bh = 40;
  const btn = (label: string, bx: number, bw: number, yy: number, pressed: number, done = 0) => {
    c.save();
    c.fillStyle = done > 0 ? mixHex('#7d7d7d', HEX.done, done) : `rgba(110,110,110,${0.55 + 0.25 * pressed})`;
    roundRect(c, bx, yy, bw, bh, 12); c.fill();
    text(c, label, bx + bw / 2, yy + bh / 2 + 5.5, 15, { w: 500, col: '#fff', align: 'center' });
    c.restore();
  };
  const press = tap >= -0.02 && tap < 0.3 ? 1 - clamp(Math.abs(tap - 0.06) / 0.2) : 0;
  btn('✓ Fatto: Bollo auto', x, w, by0, press, tap >= 0.06 ? ease.outCubic(clamp((tap - 0.06) / 0.14)) : 0);
  btn('+1 h', x, w / 2 - 3, by0 + bh + 6, 0);
  btn('Domani 9:00', x + w / 2 + 3, w / 2 - 3, by0 + bh + 6, 0);
  c.restore();
  // the callback toast (telegram.ts doneOk)
  if (tap >= 0.1) {
    const q = ease.outBack(clamp((tap - 0.1) / 0.2), 1.4);
    c.save();
    c.globalAlpha = clamp((tap - 0.1) / 0.1);
    c.translate(SW / 2, 380);
    c.scale(0.85 + 0.15 * q, 0.85 + 0.15 * q);
    c.fillStyle = 'rgba(28,28,28,0.92)';
    roundRect(c, -160, -26, 320, 52, 14); c.fill();
    c.font = font(F.sans(500), 15);
    const s1 = '✓', s2 = ' Segnata come fatta: Bollo auto';
    const tw = c.measureText(s1 + s2).width, a = c.measureText(s1).width;
    text(c, s1, -tw / 2, 5.5, 15, { w: 600, col: HEX.done });
    text(c, s2, -tw / 2 + a, 5.5, 15, { w: 500, col: '#fff' });
    c.restore();
  }
}
function mixHex(a: string, b: string, k: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// ---------------------------------------------------------------- the app's Inbox (phone layout)
export interface InboxRow {
  title: string; source: 'email' | 'telegram' | 'shortcut' | 'upload'; meta: string; outcome: string; from?: string;
  /** s since it was archived (negative: still "In lavorazione"); undefined = archived long ago. */
  done?: number;
}
const SOURCE: Record<InboxRow['source'], [string, string]> = {
  email: ['Email', 'mail'], telegram: ['Telegram', 'send'], shortcut: ['Comando rapido', 'phone'], upload: ['Caricamento', 'upload'],
};

/** Header of an app page (date, title, eye + sparkles buttons). */
export function appHeader(c: C, title: string, time: string) {
  c.fillStyle = HEX.paper; c.fillRect(0, 0, SW, SH);
  statusBar(c, time);
  text(c, 'Sabato, 3 ottobre 2026', 16, 78, 14, { col: HEX.muted });
  text(c, title, 15, 116, 34, { w: 600 });
  for (const [i, g] of [[0, 'eye'], [1, 'sparkles']] as const) {
    const x = 271 + i * 56;
    c.fillStyle = HEX.sheet; roundRect(c, x, 68, 42, 42, 10); c.fill();
    glyph(c, g, x + 11, 79, 20, HEX.pen, 1.8);
  }
}

function chip(c: C, label: string, xr: number, y: number, col: string, bg: string) {
  c.font = font(F.sans(500), 12.5);
  const w = c.measureText(label).width + 18;
  c.fillStyle = bg; roundRect(c, xr - w, y, w, 22, 11); c.fill();
  text(c, label, xr - w + 9, y + 15.5, 12.5, { w: 500, col });
  return w;
}

/**
 * The "Arrivati" card with its rows, at `top` (pt). Returns the y of each row (for the camera and
 * the highlight). `warn` draws the phishing outcome typed to `typed` chars with a highlight bar
 * `hl` 0..1 (the black redaction bar, text inverted to white).
 */
export function inboxCard(c: C, top: number, rows: InboxRow[], o: { warn?: { row: number; typed: number; hl: number }; underline?: { row: number; p: number } } = {}) {
  const x = 14, w = SW - 28;
  const ys: number[] = [];
  // measure rows
  const inner = w - 32, tx = x + 16 + 50, tw = inner - 50;
  const heights = rows.map((r, i) => {
    c.font = font(F.sans(500), 15.5);
    const tl = wrap(c, r.title, tw - 122).length;
    c.font = font(F.sans(400), 13.5);
    const ol = wrap(c, r.outcome, tw).length;
    return 22 + tl * 20 + 20 + ol * (i === o.warn?.row ? 21 : 18) + 16 + (rowsFrom(r) ? 18 : 0);
  });
  const total = 96 + heights.reduce((a, b) => a + b + 10, 0) + 10;
  c.fillStyle = HEX.sheet; roundRect(c, x, top, w, total, 24); c.fill();
  c.strokeStyle = HEX.bezel; c.lineWidth = 1; roundRect(c, x + 0.5, top + 0.5, w - 1, total - 1, 24); c.stroke();
  text(c, 'Arrivati', x + 24, top + 42, 20, { w: 600 });
  text(c, 'Da email, Telegram, comandi rapidi e caricamenti', x + 24, top + 66, 12.5, { col: HEX.muted });
  let y = top + 90;
  rows.forEach((r, i) => {
    const h = heights[i]!;
    ys.push(y);
    c.fillStyle = '#f5f5f5'; roundRect(c, x + 12, y, w - 24, h, 14); c.fill();
    // source tile
    c.fillStyle = HEX.sheet; roundRect(c, x + 24, y + 14, 36, 36, 9); c.fill();
    glyph(c, SOURCE[r.source][1], x + 33, y + 23, 18, HEX.pen, 1.7);
    // title
    c.font = font(F.sans(500), 15.5);
    const tl = wrap(c, r.title, tw - 122);
    let yy = y + 30;
    for (const l of tl) { text(c, l, tx, yy, 15.5, { w: 500 }); yy += 20; }
    // meta
    const from = rowsFrom(r);
    const meta1 = `${SOURCE[r.source][0]}${from ? ' ·' : ` · ${r.meta}`}`;
    const mw = text(c, meta1, tx, yy, 12.5, { col: HEX.muted });
    if (from) {
      text(c, from, tx, yy + 18, 12.5, { col: HEX.muted });
      if (o.underline?.row === i && o.underline.p > 0) {
        c.font = font(F.sans(400), 12.5);
        const fw = c.measureText(from).width;
        c.fillStyle = HEX.pen;
        c.fillRect(tx, yy + 22, fw * ease.outCubic(clamp(o.underline.p)), 1.6);
      }
      text(c, r.meta, tx + mw + 4, yy, 12.5, { col: HEX.muted });
      yy += 18;
    }
    yy += 22;
    // outcome / warning
    if (o.warn?.row === i) {
      warnLines(c, tx, yy, tw, o.warn.typed, o.warn.hl);
    } else {
      c.font = font(F.sans(400), 13.5);
      const done = r.done === undefined ? 1 : r.done < 0 ? 0 : clamp(r.done / 0.25);
      if (done > 0) {
        c.save(); c.globalAlpha = done;
        for (const l of wrap(c, r.outcome, tw)) { text(c, l, tx, yy, 13.5); yy += 18; }
        c.restore();
      } else {
        c.fillStyle = '#e6e6e6';
        roundRect(c, tx, yy - 10, tw * 0.8, 9, 4.5); c.fill();
      }
    }
    // status chip (neutral until the film's first green)
    const right = x + w - 24;
    if (r.done !== undefined && r.done < 0) {
      const cw = chip(c, 'In lavorazione', right, y + 14, HEX.graphite, '#e8e8e8');
      // spinner
      const a = (r.done * 9) % TAU;
      c.strokeStyle = HEX.graphite; c.lineWidth = 1.6; c.lineCap = 'round';
      c.beginPath(); c.arc(right - cw - 10, y + 25, 6, a, a + 4.2); c.stroke();
    } else {
      const pop = r.done === undefined ? 1 : ease.outBack(clamp(r.done / 0.18), 2);
      c.save();
      c.translate(right, y + 25); c.scale(pop, pop); c.translate(-right, -(y + 25));
      chip(c, 'Archiviato', right, y + 14, HEX.pen, '#e4e4e4');
      c.restore();
    }
    y += h + 10;
  });
  return ys;
}
function rowsFrom(r: InboxRow) { return r.from; }

export const WARN = ['Possibile phishing: non aprire link', 'e non pagare. Il mittente non è', 'dell\'Agenzia delle Entrate.'];
/** The phishing outcome (jobs.ts: "⚠️ Possibile phishing: non aprire link e non pagare" + the agent's note). */
function warnLines(c: C, x: number, y: number, _w: number, typed: number, hl: number) {
  const size = 14.5, lh = 21;
  c.font = font(F.sans(500), size);
  // highlight: first sentence, line 1 whole and "e non pagare" on line 2
  const segs: [number, number, number][] = [
    [x - 4, y - 15, 22 + c.measureText(WARN[0]!).width + 10],
    [x - 4, y + lh - 15, c.measureText('e non pagare.').width + 8],
  ];
  if (hl > 0) {
    const total = segs[0]![2] + segs[1]![2];
    let left = hl * total;
    for (const [sx, sy, sw] of segs) {
      const ww = Math.min(sw, left);
      if (ww > 0) drawBar(c, sx, sy, sw, 20, ww / sw, HEX.pen);
      left -= sw;
    }
  }
  let n = typed;
  const inv = (i: number, cx: number) => {
    // is char at line i / x inside the drawn highlight?
    if (hl <= 0) return false;
    const total = segs[0]![2] + segs[1]![2];
    const reach = hl * total;
    if (i === 0) return cx < x - 4 + Math.min(reach, segs[0]![2]);
    if (i === 1) return reach > segs[0]![2] && cx < x - 4 + (reach - segs[0]![2]) && cx < x - 4 + segs[1]![2];
    return false;
  };
  // the ⚠️ sign
  if (n > 0) glyph(c, 'warn', x - 1, y - 14, 17);
  WARN.forEach((l, i) => {
    const lx = x + (i === 0 ? 22 : 0), ly = y + i * lh;
    const chars = Array.from(l);
    const k = Math.max(0, Math.min(chars.length, Math.floor(n)));
    n -= chars.length;
    if (k <= 0) return;
    // draw per glyph so the highlight can invert part of a line
    let cx = lx;
    c.font = font(F.sans(500), size);
    for (let j = 0; j < k; j++) {
      const ch = chars[j]!;
      const adv = c.measureText(chars.slice(0, j + 1).join('')).width - c.measureText(chars.slice(0, j).join('')).width;
      c.fillStyle = inv(i, cx + adv * 0.5) ? '#fff' : HEX.pen;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText(ch, cx, ly);
      cx += adv;
    }
  });
}

// ---------------------------------------------------------------- the Attività capture, scrolled
/** The phone-activity capture with an iOS status bar over it. */
export function activity(c: C, img: ImageBitmap, time: string) {
  c.drawImage(img, 0, 0, SW, SH);
  statusBar(c, time);
}

/**
 * The upright cut: the whole Attività page (phone-activity-full) scrolled by `scroll` pt, under an
 * iOS status bar. The full capture has the tab bar baked in over the second commit (pt 758–870):
 * that band is rebuilt plainly (card, rows, the commit's title as in the git log).
 */
export function activityScrolled(c: C, full: ImageBitmap, time: string, scroll: number) {
  const s = full.width / SW;
  c.fillStyle = HEX.paper; c.fillRect(0, 0, SW, SH);
  c.drawImage(full, 0, scroll * s, full.width, SH * s, 0, 0, SW, SH);
  c.save();
  c.translate(0, -scroll);
  c.fillStyle = '#d0d0d0'; c.fillRect(15, 758, 363, 112);
  c.fillStyle = '#fdfdfd'; c.fillRect(16, 758, 361, 112);
  c.save();
  c.beginPath(); c.rect(0, 758, SW, 112); c.clip();
  c.fillStyle = '#f6f6f6';
  roundRect(c, 40, 700, 313, 68, 12); c.fill();
  roundRect(c, 40, 778, 313, 200, 12); c.fill();
  glyph(c, 'commit', 53, 791, 18, HEX.graphite, 1.6);
  text(c, 'Agent: 3 new item(s)', 80, 806, 16, { w: 500 });
  text(c, 'e1c798b · 03/10/26, 18:01 ·', 80, 825, 12.5, { mono: true, col: HEX.graphite });
  c.restore();
  c.restore();
  c.fillStyle = 'rgba(230,230,230,0.96)'; c.fillRect(0, 0, SW, 54);
  statusBar(c, time);
}
