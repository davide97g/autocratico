// Paper objects for the `pile` plate: the old protocol register, the login windows, the cartella.
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { mulberry32, TAU } from '../engine/util';
import { roundRect } from './_motifs';
import { type Sprite, bar, barcode, bodyLines, hand, hline, makeSprite, paperGrain, qr, txt, vline } from './open-paper';

const OLD = '#e9e8e5';

/** The registro di protocollo, 1987: an open book, ruled columns, entries in a clerk's hand. 1800×1100. */
export function ledger(): Sprite {
  const w = 1800, h = 1100;
  return makeSprite(w, h, (c) => {
    const r = mulberry32(1987);
    // cloth cover
    c.fillStyle = '#1d1d1d';
    roundRect(c, 0, 0, w, h, 14); c.fill();
    c.save(); roundRect(c, 0, 0, w, h, 14); c.clip(); paperGrain(c, w, h, 2.5); c.restore();
    // page stack edges
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#d4d3d0' : '#c4c3c0';
      roundRect(c, 16 + i * 1.5, 18 + i * 1.2, w - 32 - i * 3, h - 36 - i * 2.4, 4); c.fill();
    }
    const top = 26, bot = h - 26, mid = w / 2;
    for (const [x0, x1] of [[26, mid], [mid, w - 26]] as [number, number][]) {
      c.save();
      c.beginPath(); c.rect(x0, top, x1 - x0, bot - top); c.clip();
      c.fillStyle = OLD; c.fillRect(x0, top, x1 - x0, bot - top);
      paperGrain(c, w, h, 1.6);
      // foxing and age
      for (let i = 0; i < 9; i++) {
        const fx = x0 + r() * (x1 - x0), fy = top + r() * (bot - top), fr = 20 + r() * 120;
        const g = c.createRadialGradient(fx, fy, 0, fx, fy, fr);
        g.addColorStop(0, `rgba(90,85,80,${0.04 + r() * 0.06})`); g.addColorStop(1, 'rgba(90,85,80,0)');
        c.fillStyle = g; c.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
      }
      const eg = c.createLinearGradient(x0, 0, x1, 0);
      const left = x0 < mid;
      eg.addColorStop(0, left ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.30)');
      eg.addColorStop(left ? 0.08 : 0.06, 'rgba(0,0,0,0)');
      eg.addColorStop(left ? 0.93 : 0.92, 'rgba(0,0,0,0)');
      eg.addColorStop(1, left ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.10)');
      c.fillStyle = eg; c.fillRect(x0, top, x1 - x0, bot - top);
      c.restore();
    }
    const ink = '#2a2a2a', rule = 'rgba(60,60,60,0.55)';
    const serif = (s: string, x: number, y: number, size: number, align: CanvasTextAlign = 'left', wt = 600) => {
      c.font = font(F.serif(wt), size); c.fillStyle = ink; c.textAlign = align; c.letterSpacing = `${size * 0.08}px`;
      c.fillText(s, x, y); c.letterSpacing = '0px'; c.textAlign = 'left';
    };
    serif('REGISTRO DI PROTOCOLLO', mid / 2 + 13, 84, 30, 'center');
    serif('ANNO 1987', mid + (w - 26 - mid) / 2, 84, 30, 'center');
    serif('Comune di Esempio — Ufficio Tributi', mid / 2 + 13, 112, 18, 'center', 400);
    serif('foglio n. 214', mid + (w - 26 - mid) / 2, 112, 18, 'center', 400);
    const hy = 140, rowH = 39, rows = 23;
    const colsL: [string, number][] = [['N.', 60], ['Data', 150], ['Provenienza', 400], ['Oggetto', 846]];
    const colsR: [string, number][] = [['', 920], ['Ufficio', 1120], ['Classif.', 1260], ['Annotazioni', 1460]];
    // header band
    for (const [x0, x1] of [[60, 846], [920, 1740]] as [number, number][]) {
      hline(c, x0, x1, hy, 1.4, rule); hline(c, x0, x1, hy + 4, 0.8, rule); hline(c, x0, x1, hy + 40, 1.2, rule);
    }
    for (const [name, x] of [...colsL, ...colsR]) {
      if (name) serif(name, x + 8, hy + 28, 17, 'left', 600);
    }
    for (const [, x] of [...colsL.slice(1), ...colsR.slice(1)]) vline(c, x, hy, hy + 40 + rows * rowH, 1, rule);
    for (let i = 1; i <= rows; i++) {
      hline(c, 60, 846, hy + 40 + i * rowH, 0.7, 'rgba(60,60,60,0.35)');
      hline(c, 920, 1740, hy + 40 + i * rowH, 0.7, 'rgba(60,60,60,0.35)');
    }
    // margin rule in faded red, as old registers had
    vline(c, 56, hy, hy + 40 + rows * rowH, 1.2, 'rgba(180,60,60,0.35)');
    const prov = ['Rossi Mario', 'Intendenza di Finanza', 'Ufficio del Registro', 'Pretura', 'Esattoria', 'Bianchi G.', 'Prefettura', 'Ferri Anna', 'Ufficio Imposte', 'Conti Luigi'];
    const ogg = ['ricorso tassa rifiuti 1985', 'istanza rimborso IRPEF', 'certificato di residenza', 'sollecito pagamento INVIM', 'reclamo ruolo esattoriale', 'domanda di sgravio', 'notifica avviso', 'richiesta copia atti', 'tassa occupazione suolo', 'opposizione ingiunzione'];
    const uff = ['Tributi', 'Ragioneria', 'Anagrafe', 'Segreteria', 'Tributi'];
    const ann = ['evasa', 'in attesa', 'sollecitato', 'archiviare', 'restituita', 'manca firma', 'in attesa', 'rinviata'];
    let d = 2;
    for (let i = 0; i < rows; i++) {
      const y = hy + 40 + (i + 1) * rowH - 10;
      if (r() < 0.32) d++;
      const tilt = (r() - 0.5) * 0.02;
      const col = `rgba(28,30,38,${0.72 + r() * 0.2})`;
      hand(c, String(4127 + i), 66, y, 25, { font: 'hscript', rot: tilt, color: col, lw: 1.5 });
      hand(c, `${d}/3/87`, 160, y, 25, { font: 'hscript', rot: tilt, color: col, lw: 1.5 });
      hand(c, prov[Math.floor(r() * prov.length)]!, 410, y, 25, { font: 'hscript', rot: tilt, color: col, lw: 1.5 });
      c.save(); c.beginPath(); c.rect(560, y - 30, 280, 40); c.clip();
      hand(c, ogg[(i * 7 + 3) % ogg.length]!, 566, y, 23, { font: 'hscript', rot: tilt, color: col, lw: 1.4 });
      c.restore();
      if (r() > 0.25) hand(c, uff[Math.floor(r() * uff.length)]!, 1128, y, 25, { font: 'hscript', rot: tilt, color: col, lw: 1.5 });
      hand(c, `${['I', 'II', 'IV', 'VI'][Math.floor(r() * 4)]}/${1 + Math.floor(r() * 9)}`, 1268, y, 25, { font: 'hscript', color: col, lw: 1.5 });
      if (r() > 0.4) hand(c, ann[Math.floor(r() * ann.length)]!, 1468, y, 25, { font: 'hscript', rot: tilt, color: col, lw: 1.5 });
      // crossed-out entries
      if (i === 6 || i === 15) { c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath(); c.moveTo(408, y - 8); c.lineTo(830, y - 6); c.stroke(); }
    }
    // the office's date stamp, faded red, twice
    const dateStamp = (x: number, y: number, a: number, rot: number, day: string) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      c.globalAlpha = a; c.strokeStyle = HEX.overdue; c.fillStyle = HEX.overdue; c.lineWidth = 3;
      roundRect(c, -130, -52, 260, 104, 8); c.stroke();
      c.lineWidth = 1.2; roundRect(c, -122, -44, 244, 88, 6); c.stroke();
      c.font = font(F.sans(700), 15); c.textAlign = 'center'; c.letterSpacing = '2px';
      c.fillText('COMUNE DI ESEMPIO', 0, -20);
      c.font = font(F.mono(700), 30); c.letterSpacing = '0px';
      c.fillText(day, 0, 16);
      c.font = font(F.sans(500), 13); c.fillText('PROTOCOLLO GENERALE', 0, 36);
      c.restore();
    };
    dateStamp(1540, 360, 0.55, -0.12, '13 MAR 1987');
    dateStamp(650, 860, 0.42, 0.08, '16 MAR 1987');
    // a coffee ring
    c.save();
    c.strokeStyle = 'rgba(80,72,64,0.18)'; c.lineWidth = 5; c.filter = 'blur(1.5px)';
    c.beginPath(); c.arc(1300, 880, 74, 0.3, TAU - 0.5); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.arc(1302, 878, 66, 1.2, TAU + 0.2); c.stroke();
    c.restore();
    // spine
    const sg = c.createLinearGradient(mid - 40, 0, mid + 40, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.5, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.fillRect(mid - 40, top, 80, bot - top);
  });
}

export const PORTALS: { title: string; head: string; sub: string; err: string }[] = [
  { title: 'Portale 1 — Area riservata', head: 'Area riservata', sub: 'Accedi ai servizi online', err: 'Credenziali non valide.' },
  { title: 'Portale 2 — Servizi online', head: 'Servizi online', sub: 'Entra con la tua identità digitale', err: 'Sessione scaduta. Accedi di nuovo.' },
  { title: 'Portale 3 — Fascicolo', head: 'Il tuo fascicolo', sub: 'Consulta pratiche e versamenti', err: 'Password scaduta: va cambiata ogni 90 giorni.' },
  { title: 'Portale 4 — Tributi', head: 'Pagamenti e tributi', sub: 'Avvisi, ricevute, rimborsi', err: 'Servizio non disponibile. Riprova più tardi.' },
  { title: 'Portale 5 — Cassetto', head: 'Cassetto fiscale', sub: 'Dichiarazioni e comunicazioni', err: 'Codice OTP errato.' },
  { title: 'Portale 6 — Sportello', head: 'Sportello digitale', sub: 'Prenota, richiedi, paga', err: 'Troppi tentativi. Account bloccato per 24 ore.' },
];
export const LOGIN = { w: 580, h: 500, cf: { x: 30, y: 300, w: 520, h: 46 }, pw: { x: 30, y: 384, w: 520, h: 46 }, err: { x: 30, y: 446 } };

/** A login window of a public portal, without wordmark: SPID/CIE buttons, codice fiscale, password. */
export function loginWindow(i: number): Sprite {
  const p = PORTALS[i]!;
  const { w, h } = LOGIN;
  return makeSprite(w, h, (c) => {
    c.fillStyle = HEX.sheet;
    roundRect(c, 0, 0, w, h, 16); c.fill();
    c.save(); roundRect(c, 0, 0, w, h, 16); c.clip();
    c.fillStyle = '#efefef'; c.fillRect(0, 0, w, 44);
    hline(c, 0, w, 44, 1, HEX.bezel);
    for (let k = 0; k < 3; k++) { c.fillStyle = ['#c9c9c9', '#d4d4d4', '#dcdcdc'][k]!; c.beginPath(); c.arc(24 + k * 20, 22, 6.5, 0, TAU); c.fill(); }
    txt(c, p.title, w / 2, 28, 15, { w: 500, color: HEX.graphite, align: 'center' });
    c.restore();
    c.strokeStyle = HEX.bezel; c.lineWidth = 1.2; roundRect(c, 0.6, 0.6, w - 1.2, h - 1.2, 16); c.stroke();
    txt(c, p.head, 30, 96, 32, { w: 700, color: HEX.pen, ls: -0.02 });
    txt(c, p.sub, 30, 126, 18, { w: 400, color: HEX.muted });
    // identity buttons
    c.fillStyle = HEX.pen; roundRect(c, 30, 148, 254, 50, 10); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 2.2;
    c.beginPath(); c.arc(56, 166, 6, 0, TAU); c.stroke();
    c.beginPath(); c.arc(56, 186, 10, Math.PI, TAU); c.stroke();
    txt(c, 'Entra con SPID', 76, 180, 18, { w: 600, color: '#fff' });
    c.strokeStyle = HEX.pen; c.lineWidth = 1.6; roundRect(c, 296, 148, 254, 50, 10); c.stroke();
    c.strokeRect(318, 162, 30, 22); c.fillStyle = HEX.pen; c.fillRect(322, 167, 9, 9);
    txt(c, 'Entra con CIE', 358, 180, 18, { w: 600, color: HEX.pen });
    hline(c, 30, 250, 232, 1, HEX.bezel); hline(c, 330, 550, 232, 1, HEX.bezel);
    txt(c, 'oppure', w / 2, 238, 15, { w: 500, color: HEX.faint, align: 'center' });
    const field = (f: { x: number; y: number; w: number; h: number }, label: string) => {
      txt(c, label, f.x, f.y - 10, 15, { w: 600, color: HEX.graphite });
      c.fillStyle = '#f6f6f6'; roundRect(c, f.x, f.y, f.w, f.h, 9); c.fill();
      c.strokeStyle = HEX.bezel; c.lineWidth = 1.2; roundRect(c, f.x, f.y, f.w, f.h, 9); c.stroke();
    };
    field(LOGIN.cf, 'Codice fiscale');
    field(LOGIN.pw, 'Password');
    txt(c, 'Password dimenticata?', w - 30, LOGIN.pw.y - 10, 14, { w: 500, color: HEX.muted, align: 'right' });
    // eye toggle in the password field
    c.strokeStyle = HEX.faint; c.lineWidth = 1.8;
    const ex = LOGIN.pw.x + LOGIN.pw.w - 30, ey = LOGIN.pw.y + LOGIN.pw.h / 2;
    c.beginPath(); c.ellipse(ex, ey, 11, 6.5, 0, 0, TAU); c.stroke();
    c.beginPath(); c.arc(ex, ey, 2.6, 0, TAU); c.stroke();
  });
}

/** The cartella di pagamento: the payment demand of the collection agent. 960×1340. */
export function cartella(): Sprite {
  const w = 960, h = 1340;
  return makeSprite(w, h, (c) => {
    c.fillStyle = HEX.sheet; c.fillRect(0, 0, w, h);
    c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); paperGrain(c, w, h, 0.8); c.restore();
    const L = 60, R = w - 60, ink = '#1a1a1a';
    // header
    c.fillStyle = '#161616'; c.fillRect(0, 0, w, 16);
    txt(c, 'AGENTE DELLA RISCOSSIONE', L, 78, 18, { w: 700, color: '#444', ls: 0.12 });
    txt(c, 'Ambito provinciale di Esempio', L, 104, 17, { w: 400, color: '#555' });
    txt(c, 'CARTELLA', L, 208, 92, { w: 900, color: ink, ls: -0.04 });
    txt(c, 'DI PAGAMENTO', L, 290, 92, { w: 900, color: ink, ls: -0.04 });
    // number box
    c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(R - 330, 52, 330, 96);
    txt(c, 'NUMERO CARTELLA', R - 314, 80, 14, { w: 700, color: '#444', ls: 0.08 });
    txt(c, '097 2026 0041277 31', R - 314, 116, 26, { fam: 'mono', w: 500, color: ink });
    txt(c, '000', R - 314, 140, 16, { fam: 'mono', w: 400, color: '#555' });
    // intestatario
    hline(c, L, R, 330, 1.2, '#999');
    txt(c, 'Intestatario', L, 368, 16, { w: 500, color: '#666' });
    txt(c, 'ROSSI MARIA', L, 400, 26, { fam: 'mono', w: 700, color: ink });
    txt(c, 'Codice fiscale', L + 440, 368, 16, { w: 500, color: '#666' });
    bar(c, L + 440, 382, 300, 22, '#151515');
    // deadline band
    c.fillStyle = '#151515'; c.fillRect(L, 440, R - L, 70);
    txt(c, 'DA PAGARE ENTRO 60 GIORNI DALLA NOTIFICA', w / 2, 486, 26, { w: 900, color: '#f4f4f4', align: 'center', ls: 0.02 });
    // table
    let y = 560;
    const cols = [L, L + 250, L + 560, R];
    ['Ente creditore', 'Descrizione', 'Anno', 'Importo'].forEach((s, i) => txt(c, s, i === 3 ? R : cols[i]!, y, 16, { w: 700, color: '#333', align: i === 3 ? 'right' : 'left' }));
    hline(c, L, R, y + 14, 1.4, '#555');
    const rows: [string, string, string, number][] = [
      ['Comune di Esempio', 'TARI — tassa rifiuti', '2021', 150],
      ['Comune di Esempio', 'IMU — saldo', '2020', 130],
      ['Regione', 'Tassa automobilistica', '2019', 110],
      ['', 'Sanzioni', '', 120],
      ['', 'Interessi di mora', '', 100],
      ['', 'Oneri di riscossione', '', 110],
      ['', 'Diritti di notifica', '', 70],
    ];
    rows.forEach(([a, b, yr, bw], i) => {
      const yy = y + 56 + i * 46;
      txt(c, a, cols[0]!, yy, 19, { w: 400, color: '#2a2a2a' });
      txt(c, b, cols[1]!, yy, 19, { w: 500, color: '#2a2a2a' });
      txt(c, yr, cols[2]!, yy, 19, { fam: 'mono', w: 400, color: '#2a2a2a' });
      bar(c, R - bw, yy - 18, bw, 20, '#151515');
      hline(c, L, R, yy + 16, 0.7, '#ccc');
    });
    y += 56 + rows.length * 46 + 30;
    hline(c, L, R, y - 18, 2, ink);
    txt(c, 'TOTALE DA PAGARE', L, y + 26, 30, { w: 900, color: ink });
    bar(c, R - 260, y - 2, 260, 36, '#151515');
    bodyLines(c, L, y + 80, R - L, 3, 24, 51);
    // tear-off slip
    y = h - 270;
    c.strokeStyle = '#888'; c.setLineDash([10, 8]); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); c.setLineDash([]);
    txt(c, '✂', 18, y + 7, 20, { color: '#888' });
    txt(c, 'AVVISO DI PAGAMENTO — unica soluzione', L, y + 50, 18, { w: 700, color: ink });
    txt(c, 'Codice avviso', L, y + 92, 15, { w: 500, color: '#555' });
    txt(c, '3020 0004 1277 3109 87', L, y + 122, 24, { fam: 'mono', w: 500, color: ink });
    txt(c, 'Importo', L, y + 166, 15, { w: 500, color: '#555' });
    bar(c, L, y + 178, 200, 26, '#151515');
    barcode(c, L + 380, y + 150, 260, 60, 13, ink);
    qr(c, R - 170, y + 40, 170, 97);
  });
}
