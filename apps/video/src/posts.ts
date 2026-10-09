// Instagram feed posts (posts.html?p=<post>&s=<slide>): 1080×1350 (4:5), drawn with the film's own
// type, palette, props, captures and mascot. The profile grid shows the centred 3:4 (1012×1350), so
// nothing that must be read sits within 80 px of the left and right edges. Captions: docs/POSTS.md.
// Capture every slide with `bun tools/posts.ts` (-> var/video/posts/).
import { drawBolloHead } from './scenes/_bollo-head';
import { drawBollo, VISEME } from './scenes/_bollo';
import { loadFonts, F, font, fitSize } from './engine/type';
import { loadStrokeFonts } from './engine/stroke';
import { HEX } from './engine/palette';
import { TAU } from './engine/util';
import { app, drawBrowser, drawChip, drawPhone, drawStamp, loadImage, roundRect, stampSize, type Status } from './scenes/_motifs';
import { calendarPage, drawSprite, envelopeGreen, f24, letter, note, pecRow, type Sprite } from './scenes/open-paper';
import { cartella, loginWindow } from './scenes/pile-paper';
import { PhoneScreen, pill } from './scenes/phone-kit';
import { appHeader, inboxCard, shareSheet, tgReminder, WARN, type InboxRow } from './scenes/phone-screens';

type C = CanvasRenderingContext2D;
const W = 1080, H = 1350, M = 88;
const TEXT_W = W - 2 * M;

// ---------------------------------------------------------------- page
const q = new URLSearchParams(location.search);
const cv = document.getElementById('c') as HTMLCanvasElement;
const S = 2;
cv.width = W * S; cv.height = H * S;
cv.style.width = `${W}px`; cv.style.height = `${H}px`;
const c = cv.getContext('2d')!;
c.scale(S, S);
await Promise.all([loadFonts(), loadStrokeFonts()]);

// ---------------------------------------------------------------- type and chrome
function setFont(size: number, weight = 900, mono = false) {
  c.font = font(mono ? F.mono(weight) : F.sans(weight), size);
  c.letterSpacing = mono ? '0px' : `${(weight >= 700 ? -0.04 : -0.01) * size}px`;
}
/** Largest size (≤ max) at which every line fits `maxW`. */
function fit(lines: string[], maxW: number, max: number, weight = 900) {
  let size = max;
  for (const l of lines) size = Math.min(size, fitSize(l, F.sans(weight), maxW, max, weight >= 700 ? -0.04 : -0.01));
  return Math.floor(size);
}
/** Headline lines from (x, top); returns the y below the last line. */
function head(lines: string[], x: number, top: number, size: number, color: string = HEX.pen, o: { weight?: number; lh?: number; align?: CanvasTextAlign; colors?: (string | undefined)[] } = {}) {
  setFont(size, o.weight ?? 900);
  c.textAlign = o.align ?? 'left';
  c.textBaseline = 'alphabetic';
  const lh = size * (o.lh ?? 0.98);
  lines.forEach((l, i) => { c.fillStyle = o.colors?.[i] ?? color; c.fillText(l, x, top + size * 0.8 + i * lh); });
  c.textAlign = 'left';
  return top + size * 0.8 + (lines.length - 1) * lh + size * 0.25;
}
function wrapLines(text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const t = line ? `${line} ${w}` : w;
      if (c.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}
/** A paragraph from (x, top); returns the y below it. */
function para(text: string, x: number, top: number, size: number, maxW: number, color: string = HEX.graphite, weight = 500, lh = 1.32) {
  setFont(size, weight);
  c.letterSpacing = '0px';
  c.fillStyle = color;
  c.textBaseline = 'alphabetic';
  const lines = wrapLines(text, maxW);
  lines.forEach((l, i) => c.fillText(l, x, top + size + i * size * lh));
  return top + size + (lines.length - 1) * size * lh + size * 0.4;
}
function mono(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = 500) {
  setFont(size, weight, true);
  c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
  c.fillText(text, x, y);
  c.textAlign = 'left';
}
/** The frame every slide shares: the address bottom left, the page count bottom right. */
function chrome(dark: boolean, i?: number, n?: number) {
  const col = dark ? 'rgba(244,244,241,0.55)' : HEX.muted;
  mono('autocratico.it', M, H - 64, 24, col);
  if (n && n > 1) mono(`${i}/${n}`, W - M, H - 64, 24, col, 'right');
}
/** Kicker above a headline: a mono step number. */
function kicker(text: string, y: number, dark = false) {
  mono(text, M, y, 26, dark ? 'rgba(244,244,241,0.6)' : HEX.muted, 'left', 500);
}

// ---------------------------------------------------------------- backgrounds
function studio(dark = false) {
  c.fillStyle = dark ? HEX.ink : HEX.paper;
  c.fillRect(0, 0, W, H);
  const blobs: [number, number, number, number][] = dark
    ? [[0.2, 0.1, 520, 0.1], [0.8, 0.95, 560, 0.07]]
    : [[0.18, 0.08, 520, 0.85], [0.78, 0.92, 560, 0.75], [1.0, 0.36, 400, 0.6]];
  for (const [fx, fy, r, a] of blobs) {
    const g = c.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
}
/** Light over the dark plate, behind a subject. */
function glow(x: number, y: number, r: number, a = 0.1) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
/** Paper props scattered over the desk (the first half of the film). */
function desk(items: [Sprite, number, number, number, number][]) {
  for (const [s, x, y, rot, sc] of items) drawSprite(c, s, { x, y, rot, scale: sc });
}

// ---------------------------------------------------------------- devices
/** An iPhone showing a drawn screen (PhoneScreen) or a capture; returns the phone's scale (px per pt). */
function phone(img: CanvasImageSource, cx: number, cy: number, h: number, rot = 0, shadow = 1) {
  drawPhone(c, img, cx, cy, h, { rot, shadow });
  return h / 900;
}
const capture = (device: 'desktop' | 'phone', view: string) => loadImage(app(device, view));

// ---------------------------------------------------------------- Bollo
const SHOUT = {
  mouth: { ...VISEME.shout, hw: 130, d: 96 }, jaw: 1,
  lidL: 0, lidR: 0, squint: 0, pupil: 0.48, lookX: -0.1, lookY: 0.55,
  brow: 1.15, browUpL: 24, browUpR: 20,
  tilt: -0.06, turn: -0.08, sx: 0.98, sy: 1.06,
  earL: -0.26, earR: -0.3, whisk: 0.05, border: 18, shadow: 1,
};

// ---------------------------------------------------------------- the posts
type Slide = () => void | Promise<void>;
interface Post { title: string; slides: Slide[] }

/** 1. The launch: BUROCRAZIA struck out, AUTOCRATICO, Bollo screaming at it. */
const lancio: Post = {
  title: 'Lancio',
  slides: [() => {
    studio(true);
    glow(540, 470, 640, 0.11);
    drawBolloHead(c, 540, 560, 112, SHOUT);
    const s1 = fit(['BUROCRAZIA'], TEXT_W, 300), s2 = fit(['AUTOCRATICO'], TEXT_W, 300);
    const y1 = 930 + s1 * 0.72, y2 = y1 + s2 * 0.92;
    setFont(s1); c.fillStyle = 'rgba(244,244,241,0.40)'; c.fillText('BUROCRAZIA', M, y1);
    const w1 = c.measureText('BUROCRAZIA').width;
    c.save(); c.translate(M - 14, y1 - s1 * 0.36); c.rotate(-0.03);
    c.fillStyle = HEX.overdue; c.beginPath(); c.roundRect(0, -s1 * 0.09, w1 + 28, s1 * 0.18, 6); c.fill();
    c.restore();
    setFont(s2); c.fillStyle = '#F4F4F1'; c.fillText('AUTOCRATICO', M - 3, y2);
    para('Il registro personale della burocrazia italiana.', M, y2 + 30, 34, TEXT_W, 'rgba(244,244,241,0.85)', 500);
    mono('open source · i tuoi dati restano a casa', M, H - 64, 24, 'rgba(244,244,241,0.55)');
  }],
};

/** 2. The problem: the first half of the film, as a carousel. */
const problema: Post = {
  title: 'Il problema',
  slides: [
    // the four summons, stamped
    () => {
      studio();
      desk([
        [letter(11, { head: 'Agenzia delle Entrate', title: 'Comunicazione', amounts: 3 }), 300, 420, -0.12, 0.62],
        [envelopeGreen(3), 760, 330, 0.09, 0.55],
        [f24(), 330, 920, 0.07, 0.5],
        [pecRow(), 700, 1080, -0.05, 0.55],
        [letter(23, { head: 'Comune', title: 'Avviso di pagamento', qr: true }), 820, 760, 0.14, 0.55],
      ]);
      const stamps: [string, number, number, number][] = [['RACCOMANDATA!', 300, 0.05, 1], ['PEC!', 560, -0.07, 2], ['F24!', 790, 0.04, 3], ['SCADENZA!', 1050, -0.05, 4]];
      for (const [t, y, a, seed] of stamps) {
        const base = stampSize(t, 100);
        const size = Math.min(150, (100 * (t.length > 6 ? 900 : 560)) / base.w);
        drawStamp(c, t, 540, y, size, 1, { angle: a, seed });
      }
      chrome(false, 1, 5);
    },
    // six portals, six passwords
    () => {
      studio();
      const y = head(['Sei portali.', 'Sei password.'], M, 130, fit(['Sei password.'], TEXT_W, 140));
      const sc = 0.5, cw = 580 * sc, ch = 500 * sc;
      for (let i = 0; i < 6; i++) {
        const col = i % 3, row = Math.floor(i / 3);
        const x = 540 + (col - 1) * (cw + 22) + (row ? 18 : -18);
        drawSprite(c, loginWindow(i), { x, y: y + 50 + ch / 2 + row * (ch + 26), rot: [-0.04, 0.03, -0.02, 0.05, -0.03, 0.02][i]!, scale: sc });
      }
      head(['E nessuno', 'che ti avvisa.'], M, 980, 96, HEX.overdue, { weight: 900 });
      chrome(false, 2, 5);
    },
    // deadlines scattered everywhere
    () => {
      studio();
      desk([
        [calendarPage(16, 'ottobre', 'venerdì', 5, true), 250, 760, -0.1, 0.78],
        [note('bollo 31/10', 7, { circled: true }), 720, 640, 0.08, 0.85],
        [note('TARI: 2ª rata?', 9, { sub: 'chiedere al Comune' }), 800, 1040, -0.06, 0.8],
        [calendarPage(30, 'novembre', 'lunedì', 8), 440, 1090, 0.12, 0.7],
        [note('IMU saldo 16/12', 13, {}), 300, 1180, -0.14, 0.72],
        [calendarPage(6, 'ottobre', 'martedì', 12, true), 880, 820, 0.18, 0.62],
      ]);
      head(['Scadenze sparse', 'in mille posti.'], M, 130, fit(['Scadenze sparse'], TEXT_W, 150));
      chrome(false, 3, 5);
    },
    // and they remind you only when the costs arrive
    () => {
      studio();
      const y = head(['Te le ricordano', 'solo quando', 'arrivano i costi.'], M, 120, fit(['arrivano i costi.'], TEXT_W, 130));
      const s = cartella(), sc = 860 / s.w;
      drawSprite(c, s, { x: 560, y: y + 60 + (s.h * sc) / 2, rot: 0.035, scale: sc });
      chrome(false, 4, 5);
    },
    // the answer
    () => {
      studio(true);
      glow(540, 640, 700, 0.08);
      head(['Un registro', 'solo.'], M, 150, fit(['Un registro'], TEXT_W, 190), '#F4F4F1');
      drawStamp(c, 'AUTOCRATICO', 540, 720, 118, 1, { angle: -0.06, seed: 6, color: '#F4F4F1' });
      para('Scadenze, pagamenti e pratiche in un posto. Un agente legge quello che arriva e ti avvisa prima, non dopo.', M, 900, 38, TEXT_W, 'rgba(244,244,241,0.8)');
      chrome(true, 5, 5);
    },
  ],
};

/** A step of "Come funziona": kicker, headline, paragraph on top; a phone bottom right. */
function step(n: number, total: number, k: string, lines: string[], body: string, screen: CanvasImageSource, side?: (top: number) => void) {
  studio();
  kicker(k, 150);
  let y = head(lines, M, 178, fit(lines, TEXT_W, 120));
  y = para(body, M, y + 6, 34, TEXT_W);
  phone(screen, 750, y + 40 + 560, 1120, 0.02);
  side?.(y + 70);
  chrome(false, n, total);
}

/** 3. How it works. */
const comeFunziona: Post = {
  title: 'Come funziona',
  slides: [
    async () => {
      studio();
      const y = head(['Come', 'funziona.'], M, 140, fit(['funziona.'], TEXT_W, 230));
      const y2 = para('Mandi i documenti. Lui li legge, li archivia e ti avvisa prima delle scadenze.', M, y + 10, 40, 760);
      phone(await capture('phone', 'overview'), 620, y2 + 700, 1260, -0.05);
      chrome(false, 1, 6);
    },
    async () => {
      const s = new PhoneScreen();
      shareSheet(s.begin(), 1, -1);
      step(2, 6, '01', ['Mandagli tutto.'], 'Email e PEC inoltrate, foto e PDF, messaggi e note vocali su Telegram, export di WhatsApp. O il menu Condividi dell’iPhone.', s.canvas, (top) => {
        ['Email', 'PEC', 'Telegram', 'Foto · PDF', 'WhatsApp', 'Condividi'].forEach((l, i) => pill(c, l, M, top + i * 78, 30, HEX.pen, { dot: false, bg: 0.07, weight: 600 }));
      });
    },
    async () => {
      const s = new PhoneScreen();
      const sc = s.begin();
      appHeader(sc, 'Inbox', '09:12');
      const rows: InboxRow[] = [
        { title: 'Nota vocale: bollo auto', source: 'telegram', meta: '03/10/26', outcome: 'Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni.' },
        { title: 'Ricevuta manutenzione caldaia', source: 'upload', meta: '03/10/26', outcome: 'Ricevuta archiviata, prossima manutenzione caldaia in deadlines.toml.' },
        { title: 'Verbale multa ZTL', source: 'shortcut', meta: '03/10/26', outcome: 'Multa registrata: pagamento ridotto entro il 1 ott, già scaduto.' },
      ];
      inboxCard(sc, 146, rows);
      step(3, 6, '02', ['Lui legge', 'e archivia.'], 'Ogni documento diventa una scadenza con data e importo, e apre o aggiorna la sua pratica. In circa un minuto.', s.canvas, (top) => {
        const cx = M + 120, cy = top + 150, R = 96;
        c.lineCap = 'round';
        c.strokeStyle = HEX.bezel; c.lineWidth = 14; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
        c.strokeStyle = HEX.pen; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU); c.stroke();
        c.lineWidth = 13; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(cx - 36, cy + 4); c.lineTo(cx - 9, cy + 31); c.lineTo(cx + 42, cy - 26); c.stroke();
        mono('60 s', cx, cy + R + 64, 34, HEX.graphite, 'center');
      });
    },
    async () => {
      step(4, 6, '03', ['Il colore è il', 'tempo che resta.'], 'Ogni scadenza ha una gravità. Con i giorni che mancano diventa in arrivo, urgente o scaduta.', await capture('phone', 'deadlines'), (top) => {
        const chips: [string, Status][] = [['Scaduta', 'overdue'], ['Urgente', 'urgent'], ['In arrivo', 'soon'], ['Fatta', 'done']];
        chips.forEach(([l, s], i) => drawChip(c, l, M, top + i * 84, s, 32));
      });
    },
    async () => {
      const s = new PhoneScreen();
      tgReminder(s.begin(), 1, 1, -1);
      step(5, 6, '04', ['Ti avvisa', 'su Telegram.'], 'La mattina alle 08:30, con i tasti Fatto, +1 h e Domani 9:00. I dati personali restano oscurati.', s.canvas, (top) => {
        mono('08:30', M, top + 96, 92, HEX.pen, 'left', 500);
      });
    },
    async () => {
      studio();
      kicker('05', 150);
      let y = head(['Non paga mai', 'al posto tuo.'], M, 178, fit(['al posto tuo.'], TEXT_W, 120));
      y = para('Prepara data, importo e riferimenti: paghi tu. Ogni modifica è un commit che puoi annullare.', M, y + 6, 34, TEXT_W);
      phone(await capture('phone', 'activity'), 750, y + 600, 1120, 0.02);
      // the Paga button nobody presses
      c.save();
      c.fillStyle = 'rgba(15,15,15,0.08)'; roundRect(c, M, y + 90, 300, 96, 48); c.fill();
      setFont(40, 600); c.letterSpacing = '0px'; c.fillStyle = HEX.faint; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Paga', M + 150, y + 140);
      c.restore();
      mono('git log --oneline', M, y + 270, 24, HEX.muted);
      ['de5a772 Agent: profile updated', 'e1c798b Agent: 3 new item(s)', 'c438d0c Agent: 2 new item(s)'].forEach((l, i) => mono(l, M, y + 312 + i * 38, 22, HEX.graphite, 'left', 400));
      // the call to action
      c.fillStyle = HEX.pen; roundRect(c, M, H - 200, 380, 84, 42); c.fill();
      setFont(34, 600); c.letterSpacing = '0px'; c.fillStyle = '#F4F4F1'; c.textBaseline = 'middle';
      c.fillText('Prova la demo  →', M + 40, H - 156);
      chrome(false, 6, 6);
    },
  ],
};

/** 4. Phishing, flagged. */
const phishing: Post = {
  title: 'Phishing',
  slides: [() => {
    studio();
    const y0 = head(['«Rimborso fiscale', 'in attesa»?'], M, 120, fit(['«Rimborso fiscale'], TEXT_W, 130));
    const y = head(['Phishing. Segnalato.'], M, y0, fit(['Phishing. Segnalato.'], TEXT_W, 80), HEX.overdue);
    const s = new PhoneScreen();
    const sc = s.begin();
    appHeader(sc, 'Inbox', '08:20');
    const rows: InboxRow[] = [
      { title: 'Verbale multa ZTL', source: 'shortcut', meta: '03/10/26', outcome: 'Multa registrata: pagamento ridotto entro il 1 ott, già scaduto.' },
      { title: 'Rimborso fiscale in attesa: conferma i tuoi dati', source: 'email', from: 'rimborsi@agenzia-entrate-servizi.info', meta: '02/10/26', outcome: WARN.join(' ') },
      { title: 'Nota vocale: bollo auto', source: 'telegram', meta: '02/10/26', outcome: 'Bollo auto aggiunto: scadenza 6 ott, promemoria a 7 e 3 giorni.' },
    ];
    const n = WARN.reduce((a, l) => a + Array.from(l).length, 0);
    const ys = inboxCard(sc, 146, rows, { underline: { row: 1, p: 1 }, warn: { row: 1, typed: n, hl: 1 } });
    // a close-up on the phishing row: the phone runs off the bottom of the frame
    // the phone starts under the headline and is scrolled so the flagged row sits in view
    const h = 1500, k = h / 900, top = y + 120;
    drawPhone(c, s.canvas, 540, top + (900 * k) / 2, h, { scroll: ys[0]! - 120 });
  }],
};

/** 5. Privacy. */
const privacy: Post = {
  title: 'Privacy',
  slides: [
    () => {
      studio(true);
      const y = head(['I tuoi dati', 'restano', 'a casa.'], M, 140, fit(['I tuoi dati'], TEXT_W, 200), '#F4F4F1');
      para('Una cartella di file di testo sul tuo computer o sul tuo server. Niente database, niente cloud di terzi.', M, y + 10, 38, TEXT_W, 'rgba(244,244,241,0.75)');
      const tree = ['registro/', '├─ deadlines.toml', '├─ profile.toml', '├─ cases/', '│  └─ 2026-multa-ztl/README.md', '├─ inbox/', '└─ archive/'];
      tree.forEach((l, i) => mono(l, M, 960 + i * 40, 28, i ? 'rgba(244,244,241,0.85)' : '#F4F4F1', 'left', 400));
      chrome(true, 1, 4);
    },
    () => {
      studio(true);
      const y = head(['File di testo,', 'non un database.'], M, 140, fit(['non un database.'], TEXT_W, 130), '#F4F4F1');
      const blocks: [string[], string][] = [
        [['[[deadline]]', 'id = "bollo-auto"', 'title = "Bollo auto"', 'severity = "high"', 'date = 2026-10-06', 'amount = 245.00'], HEX.urgent],
        [['[[deadline]]', 'id = "multa-ztl"', 'title = "Multa ZTL, pagamento ridotto"', 'date = 2026-10-01', 'amount = 83.30'], HEX.overdue],
      ];
      let by = y + 50;
      for (const [lines, col] of blocks) {
        c.fillStyle = col; c.fillRect(M, by - 6, 6, lines.length * 42 - 6);
        lines.forEach((l, i) => mono(l, M + 32, by + 24 + i * 42, 28, i ? 'rgba(244,244,241,0.88)' : col, 'left', 400));
        by += lines.length * 42 + 44;
      }
      para('Li apri con qualsiasi editor. Ogni modifica finisce nella cronologia git e si annulla.', M, by + 6, 34, TEXT_W, 'rgba(244,244,241,0.7)');
      chrome(true, 2, 4);
    },
    async () => {
      studio();
      const y = head(['Modalità', 'Omissis.'], M, 140, fit(['Modalità'], TEXT_W, 190));
      const y2 = para('Nomi, importi e numeri di documento diventano barre. Per mostrare l’app senza mostrare te.', M, y + 6, 36, TEXT_W);
      const [a, b] = await Promise.all([capture('desktop', 'overview'), capture('desktop', 'overview-privacy')]);
      const bx = M - 20, bw = 1180, by = y2 + 40;
      // the window runs off the right edge; the right part is redacted, split by a bar
      const r = drawBrowser(c, a, bx, by, bw) as unknown as { x: number; y: number; w: number; h: number } | undefined;
      const split = 470;
      c.save();
      c.beginPath(); c.rect(split, 0, W - split, H); c.clip();
      drawBrowser(c, b, bx, by, bw);
      c.restore();
      c.fillStyle = HEX.pen; c.fillRect(split - 4, r ? r.y : by, 8, H);
      // the shortcut: P
      const kx = W - M - 120, ky = H - 220;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 18; c.shadowOffsetY = 8;
      c.fillStyle = HEX.sheet; roundRect(c, kx, ky, 120, 120, 22); c.fill();
      c.restore();
      c.strokeStyle = HEX.bezel; c.lineWidth = 2; roundRect(c, kx, ky, 120, 120, 22); c.stroke();
      setFont(58, 600); c.letterSpacing = '0px'; c.fillStyle = HEX.pen; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('P', kx + 60, ky + 64); c.textAlign = 'left';
    },
    () => {
      studio(true);
      const y = head(['Codice pubblico.', 'Dati privati.'], M, 140, fit(['Codice pubblico.'], TEXT_W, 140), '#F4F4F1');
      const items = [
        'Open source, licenza MIT: il software è gratuito.',
        'Gira sul tuo computer o su un piccolo server di casa.',
        'Telegram riceve solo messaggi con i dati oscurati.',
        'Le note vocali si trascrivono sul tuo server.',
        'Non paga, non firma, non scrive agli enti al posto tuo.',
      ];
      let iy = y + 60;
      for (const t of items) {
        c.strokeStyle = HEX.done; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(M, iy + 22); c.lineTo(M + 14, iy + 36); c.lineTo(M + 40, iy + 6); c.stroke();
        iy = para(t, M + 70, iy - 8, 36, TEXT_W - 70, 'rgba(244,244,241,0.88)') + 26;
      }
      chrome(true, 4, 4);
    },
  ],
};

/** 6. Meet Bollo. */
const bollo: Post = {
  title: 'Bollo',
  slides: [() => {
    studio();
    const y = head(['Questo', 'è Bollo.'], M, 120, fit(['è Bollo.'], 620, 200));
    para('Gatto nero romano, mascotte di Autocratico. Timbra, rappa e non sopporta le code.', M, y + 10, 34, 400);
    drawBollo(c, 720, 840, 78, { mouth: 'a', arm: 'up', brow: 0.9 });
    chrome(false);
  }],
};

const POSTS: Record<string, Post> = { lancio, problema, 'come-funziona': comeFunziona, phishing, privacy, bollo };

// ---------------------------------------------------------------- render one slide
const id = q.get('p') ?? 'lancio';
const si = Math.max(0, +(q.get('s') ?? '1') - 1);
(window as any).__posts = Object.fromEntries(Object.entries(POSTS).map(([k, p]) => [k, { title: p.title, n: p.slides.length }]));
const post = POSTS[id];
try {
  if (post?.slides[si]) {
    c.save();
    await post.slides[si]!();
    c.restore();
  }
} catch (e) {
  console.error(e);
  (window as any).__error = String((e as Error)?.stack ?? e);
}
(window as any).__ready = true;
