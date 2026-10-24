// The phishing promo (?film=phishing, 24 s, docs/PHISHING.md): the agent unmasks a fake email. A hook of
// fake senders slammed on the beat, "Vera o falsa?", the drop on the inbox as the row turns red, the analysis
// read reason by reason, the link that lies (what it shows, where it goes), the email's traps marked on the
// beat, the warning on Telegram, the end card. The app is the public demo, captured in Italian
// (public/phishing/, tools/capture-phishing.ts).
//
// 120 BPM, a bar every 2 s from 0: two bars of build, the drop at bar 2 (4 s), two bars a shot, one for the
// marks and one for the phone, the hit that opens the outro at bar 10 (20 s) is the end card.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, prog, springStep, TAU } from '../engine/util';
import { drawIcon, drawStudio, roundRect } from './_motifs';
import { caption, Card3D, setFont, shadowUnder, T, text, type CaptionSpec, type Pose } from './board-kit';

type Rect = { x: number; y: number; w: number; h: number };
const inOut = ease.inOutCubic;
const out4 = ease.outQuart;

// ---------------------------------------------------------------- the grid of the music
const BAR = 2;
const BEAT = BAR / 4;
const D = (i: number) => i * BAR;
const b = (k: number) => k * BEAT;
const S = {
  drop: D(2),
  report: D(4),
  link: D(6),
  marks: D(8),
  phone: D(9),
  end: D(10),
  out: 24,
};
const FLASHES = [S.drop, S.report, S.link, S.marks, S.phone, S.end];
const RED = T.overdue;

const HOOK = [
  { word: 'Rimborso.', chip: 'agenzia-entrate-servizi.info' },
  { word: 'Pacco.', chip: 'poste-consegne.top' },
  { word: 'Multa.', chip: 'pagopa-verbali.xyz' },
  { word: 'Conto.', chip: 'sicurezza-bancaria.click' },
];
const INBOX_H = 1150; // the top of the inbox: three rows, the flagged one in the middle
const SHOWN = 'www.agenziaentrate.gov.it';
const REAL = 'agenziaentrate-rimborsi.top';

const CAPTIONS: CaptionSpec[] = [
  { at: S.drop + 0.3, out: S.report - 0.3, exit: 0.25, x: 110, y: 500, lines: [{ text: 'Smascherata.', size: 104, weight: 800 }, { text: 'Prima che tu clicchi.', size: 42, weight: 500, color: T.muted }] },
  { at: S.report + 0.3, out: S.link - 0.3, exit: 0.25, x: 110, y: 430, lines: [{ text: 'Ti dice', size: 100, weight: 800 }, { text: 'perché.', size: 100, weight: 800 }, { text: 'Punto per punto, con le sue parole.', size: 38, weight: 500, color: T.muted }] },
  { at: S.link + 2.0, out: S.marks - 0.25, exit: 0.2, x: W / 2, y: 900, align: 'center', lines: [{ text: 'Il link mente.', size: 100, weight: 800 }, { text: 'Autocratico lo vede prima di te.', size: 40, weight: 500, color: T.muted }] },
  { at: S.marks + 0.25, out: S.phone - 0.2, exit: 0.2, x: W / 2, y: 850, align: 'center', lines: [{ text: 'Le trappole, evidenziate.', size: 88, weight: 800 }] },
  { at: S.phone + 0.25, out: S.end - 0.2, exit: 0.2, x: 110, y: 450, lines: [{ text: 'Non aprire.', size: 100, weight: 800 }, { text: 'Non pagare.', size: 100, weight: 800, color: RED }, { text: 'L’avviso ti arriva su Telegram.', size: 38, weight: 500, color: T.muted }] },
];

async function bitmap(src: string): Promise<ImageBitmap> {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
  return createImageBitmap(await r.blob());
}

const lerpPose = (a: Pose, c: Pose, e: number): Pose => ({
  x: lerp(a.x, c.x, e), y: lerp(a.y, c.y, e), s: Math.exp(lerp(Math.log(a.s ?? 1), Math.log(c.s ?? 1), e)),
  rx: lerp(a.rx ?? 0, c.rx ?? 0, e), ry: lerp(a.ry ?? 0, c.ry ?? 0, e), rz: lerp(a.rz ?? 0, c.rz ?? 0, e), z: lerp(a.z ?? 0, c.z ?? 0, e),
});

export default class Phishing extends Scene {
  bg = new Layer2D();
  top = new Layer2D();
  img: Record<string, ImageBitmap> = {};
  L: Record<string, Rect> = {};
  inbox!: Card3D;
  report!: Card3D;
  email!: Card3D;
  lock!: HTMLCanvasElement;
  reasons: Rect[] = [];
  marks: Rect[] = [];
  outRT: THREE.WebGLRenderTarget | null = null;
  get target(): THREE.WebGLRenderTarget { return this.outRT!; }

  override async init() {
    const names = ['inbox', 'report', 'email', 'email-plain'];
    const loaded = await Promise.all(names.map((n) => bitmap(`phishing/${n}.png`)));
    names.forEach((n, i) => (this.img[n] = loaded[i]!));
    this.L = await (await fetch('phishing/layout.json')).json();
    for (let i = 0; this.L[`reason-${i}`]; i++) this.reasons.push(this.L[`reason-${i}`]!);
    for (let i = 0; this.L[`mark-${i}`]; i++) this.marks.push(this.L[`mark-${i}`]!);
    const ib = this.img.inbox!;
    this.inbox = new Card3D(ib.width, INBOX_H, 1);
    this.inbox.draw('inbox', (c) => this.window(c, ib, ib.width, INBOX_H));
    const rp = this.img.report!;
    this.report = new Card3D(rp.width, rp.height, 1);
    this.report.draw('report', (c) => this.window(c, rp, rp.width, rp.height, 20));
    const em = this.img.email!;
    this.email = new Card3D(em.width, em.height, 2);
    this.lock = this.lockScreen();
  }

  /** A capture as the app draws it: rounded corners, a hairline; `h` crops it. */
  window(c: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number, r = 24) {
    c.save();
    roundRect(c, 0, 0, w, h, r); c.clip();
    c.fillStyle = '#FDFDFD'; c.fillRect(0, 0, w, h);
    c.drawImage(img, 0, 0);
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 2;
    roundRect(c, 1, 1, w - 2, h - 2, r); c.stroke();
  }

  /** A small push of the whole frame on each downbeat after the drop. */
  kick(t: number) {
    if (t < S.drop || t > S.end + 0.2) return 1;
    const k = t % BAR;
    return 1 + 0.016 * Math.pow(0.5, k / 0.08);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.outRT = out;
    this.bg.clear();
    this.top.clear();
    const bg = this.bg.ctx, top = this.top.ctx;
    drawStudio(bg, { drift: t * 0.3 });

    const planes: (() => void)[] = [];
    const after: ((c: CanvasRenderingContext2D) => void)[] = [];
    this.shotHook(t, top);
    this.shotInbox(t, bg, planes, after);
    this.shotReport(t, bg, planes, after);
    this.shotLink(t, top);
    this.shotMarks(t, bg, planes, after);
    this.shotPhone(t, top);

    // a veil behind the captions while a capture fills the frame
    const veil = prog(t, S.drop + 1.9, S.drop + 2.4) * (1 - prog(t, S.report - 0.2, S.report));
    if (veil > 0) {
      after.unshift((c) => {
        const g = c.createLinearGradient(0, 0, 1100, 0);
        g.addColorStop(0, `rgba(230,230,230,${0.95 * veil})`);
        g.addColorStop(0.6, `rgba(230,230,230,${0.78 * veil})`);
        g.addColorStop(1, 'rgba(230,230,230,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
      });
    }
    for (const fn of after) fn(top);
    for (const cap of CAPTIONS) caption(top, t, cap);
    this.endCard(t, top);

    comp.draw(renderer, this.bg.upload(), out, { mode: 'replace' });
    for (const p of planes) p();
    comp.draw(renderer, this.top.upload(), out);

    const hit = (at: number, a: number, hl: number) => (t >= at ? a * Math.pow(0.5, (t - at) / hl) : 0);
    return {
      grain: 0.03,
      vignette: 0.16,
      bloom: 0.14,
      ca: 0.2 + (t < S.drop ? 0 : 0.6 * hit(S.link + 1.5, 1, 0.12)),
      flash: FLASHES.reduce((s, at, i) => s + hit(at, i === 0 || i === FLASHES.length - 1 ? 0.5 : 0.2, 0.1), 0) + (t < S.drop ? hit(b(4), 0.1, 0.06) : 0),
      fade: prog(t, S.out - 0.35, S.out, ease.inQuad),
    };
  }

  // ---------------------------------------------------------------- 0–4 the hook: fake senders on the beat, "Vera o falsa?"
  shotHook(t: number, c: CanvasRenderingContext2D) {
    if (t > S.drop + 0.05) return;
    const k = Math.floor(t / BEAT);
    if (k <= 3) {
      const i = Math.max(0, k);
      const h = HOOK[i]!;
      const lt = t - b(i);
      const pop = ease.outBack(clamp(lt / 0.22), 2.2);
      c.save();
      c.translate(W / 2, 560);
      c.rotate((i % 2 ? 1 : -1) * 0.025 * (1 - clamp(lt / 0.3)));
      c.scale(lerp(1.25, 1, pop), lerp(1.25, 1, pop));
      // the sender's real domain, in red
      c.font = font(F.mono(500), 38);
      const chipW = c.measureText(h.chip).width + 120;
      c.fillStyle = RED;
      roundRect(c, -chipW / 2, -230, chipW, 70, 35); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.beginPath(); c.arc(-chipW / 2 + 34, -195, 7, 0, TAU); c.fill();
      text(c, h.chip, 24, -181, 38, { mono: true, weight: 500, color: '#FFFFFF', align: 'center' });
      setFont(c, 800, 220, -0.05);
      c.fillStyle = T.fg; c.textAlign = 'center';
      c.fillText(h.word, 0, 60);
      c.restore();
      return;
    }
    // bar 1: "Vera o falsa?", a word a beat, then a push into the drop
    const words = ['Vera', 'o', 'falsa?'];
    const zoom = Math.exp(lerp(0, Math.log(1.8), prog(t, b(7), S.drop, ease.inCubic)));
    c.save();
    c.translate(W / 2, 540);
    c.scale(zoom, zoom);
    setFont(c, 800, 190, -0.05);
    const widths = words.map((w) => c.measureText(w).width);
    const space = 50;
    const total = widths.reduce((s, w) => s + w, 0) + space * (words.length - 1);
    let x = -total / 2;
    for (const [j, w] of words.entries()) {
      const lt = t - b(4 + j);
      if (lt >= 0) {
        const e = ease.outBack(clamp(lt / 0.2), 2);
        c.save();
        c.translate(x + widths[j]! / 2, 60);
        c.scale(lerp(0.6, 1, e), lerp(0.6, 1, e));
        c.globalAlpha = clamp(lt / 0.08);
        c.fillStyle = j === 2 ? RED : T.fg;
        c.textAlign = 'center';
        c.fillText(w, 0, 0);
        c.restore();
      }
      x += widths[j]! + space;
    }
    c.restore();
  }

  // ---------------------------------------------------------------- 4–8 the inbox: the row turns red
  inboxPose(t: number): Pose {
    const C = this.inbox;
    const row = this.L['row-in-inbox']!;
    const enterFrom: Pose = { x: 1280, y: 1600, s: 0.6, rx: 0.95, ry: -0.35, rz: 0.08 };
    const rest: Pose = { x: 1300, y: 560, s: 0.78, rx: 0.07, ry: -0.15 };
    const s = 1.0;
    const close: Pose = { x: 1260 - s * (row.x + row.w / 2 - C.w / 2), y: 560 - s * (row.y + row.h / 2 - C.h / 2), s, rx: 0.03, ry: -0.06 };
    let P = lerpPose(enterFrom, rest, out4(prog(t, S.drop, S.drop + 0.6)));
    P = lerpPose(P, close, inOut(prog(t, S.drop + 1.8, S.drop + 2.6)));
    const leave = prog(t, S.report - 0.25, S.report + 0.2, ease.inCubic);
    const u = ((t - S.drop) % (2 * BAR)) / (2 * BAR);
    return { ...P, y: P.y - leave * 1400, rx: (P.rx ?? 0) - leave * 0.6, ry: (P.ry ?? 0) + 0.035 * (u - 0.5), s: (P.s ?? 1) * this.kick(t) * (1 + 0.04 * u) };
  }
  shotInbox(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.drop - 0.02 || t > S.report + 0.25) return;
    const { renderer } = this.ctx;
    const P = this.inboxPose(t);
    const op = clamp(prog(t, S.drop - 0.02, S.drop + 0.12)) * (1 - prog(t, S.report, S.report + 0.2));
    shadowUnder(bg, this.inbox.corners(P), { alpha: 0.18 * op, blur: 110, dy: 60 });
    planes.push(() => this.inbox.render(renderer, this.target, P, op));
    const row = this.L['row-in-inbox']!;
    const badge = this.L.badge!;
    // the flagged row: a red wash and two rings on the beat after the drop; the badge pulses on the next
    this.glow(this.inbox, P, row, t - (S.drop + BEAT), after, 6);
    this.glow(this.inbox, P, { x: row.x + badge.x, y: row.y + badge.y, w: badge.w, h: badge.h }, t - (S.drop + 2 * BEAT), after, 20);
    this.glow(this.inbox, P, { x: row.x + badge.x, y: row.y + badge.y, w: badge.w, h: badge.h }, t - (S.drop + 2.6), after, 20);
  }
  /** The app's "this one" mark, in red: a wash over `r` (a rect of `card`) and two rings growing out of it. */
  glow(card: Card3D, P: Pose, r: Rect, k: number, after: ((c: CanvasRenderingContext2D) => void)[], radius = 12) {
    if (k < -0.02 || k > 1.4) return;
    after.push((c) => {
      const q = (pad: number) => [
        card.project(r.x - pad, r.y - pad, P), card.project(r.x + r.w + pad, r.y - pad, P),
        card.project(r.x + r.w + pad, r.y + r.h + pad, P), card.project(r.x - pad, r.y + r.h + pad, P),
      ];
      const path = (pts: { x: number; y: number }[]) => {
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
      };
      const wash = Math.pow(1 - clamp(k / 1.2), 2);
      c.save();
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(220,38,39,${0.16 * wash})`;
      path(q(4)); c.fill();
      c.restore();
      for (const [i, d] of [0, 0.16].entries()) {
        const e = clamp((k - d) / 0.8);
        if (e <= 0 || e >= 1) continue;
        c.save();
        c.strokeStyle = `rgba(220,38,39,${(i ? 0.3 : 0.55) * (1 - e)})`;
        c.lineWidth = 3;
        c.lineJoin = 'round';
        path(q(radius * 0.5 + 56 * ease.outCubic(e))); c.stroke();
        c.restore();
      }
    });
  }

  // ---------------------------------------------------------------- 8–12 the analysis, reason by reason
  reportPose(t: number): Pose {
    const C = this.report;
    const s = 0.74;
    const X = 1310, Y = 560;
    // where the eye is on the card: the verdict, then each reason as it is marked
    const keys: [number, number][] = [[S.report, 330], ...this.reasons.slice(0, 7).map((r, i): [number, number] => [S.report + BEAT * (i + 1), r.y + r.h / 2])];
    let v = keys[0]![1];
    for (let i = 1; i < keys.length; i++) v = lerp(v, keys[i]![1], inOut(prog(t, keys[i]![0] - 0.3, keys[i]![0] + 0.05)));
    const enter = out4(prog(t, S.report - 0.1, S.report + 0.5));
    const leave = prog(t, S.link - 0.25, S.link + 0.15, ease.inCubic);
    return {
      x: lerp(2300, X, enter) - leave * 200, y: Y - s * (v - C.h / 2) - leave * 300, s: s * this.kick(t),
      rx: 0.05, ry: lerp(-0.6, -0.12, enter) + leave * 0.5, rz: lerp(0.05, 0, enter), z: -leave * 400,
    };
  }
  shotReport(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.report - 0.12 || t > S.link + 0.2) return;
    const { renderer } = this.ctx;
    const P = this.reportPose(t);
    const op = clamp(prog(t, S.report - 0.1, S.report + 0.1)) * (1 - prog(t, S.link - 0.1, S.link + 0.15));
    shadowUnder(bg, this.report.corners(P), { alpha: 0.18 * op, blur: 100, dy: 50 });
    planes.push(() => this.report.render(renderer, this.target, P, op));
    this.reasons.slice(0, 7).forEach((r, i) => this.glow(this.report, P, r, t - (S.report + BEAT * (i + 1)), after, 10));
  }

  // ---------------------------------------------------------------- 12–16 the link: what it shows, where it goes
  shotLink(t: number, c: CanvasRenderingContext2D) {
    if (t < S.link - 0.05 || t > S.marks + 0.1) return;
    const leave = prog(t, S.marks - 0.25, S.marks, ease.inCubic);
    const lift = ease.inOutCubic(prog(t, S.link + 1.85, S.link + 2.3));
    c.save();
    c.globalAlpha = 1 - leave;
    c.translate(W / 2, -lift * 150 - leave * 120);
    const k = this.kick(t);
    c.scale(k, k);
    const mono = (s: string, y: number, color: string, alpha = 1) => {
      c.save();
      c.font = font(F.mono(600), 96);
      c.globalAlpha *= alpha;
      c.fillStyle = color; c.textAlign = 'center';
      c.fillText(s, 0, y);
      const w = c.measureText(s).width;
      c.restore();
      return w;
    };
    // what it shows
    const a = t - S.link;
    if (a >= 0) {
      const e = ease.outBack(clamp(a / 0.22), 2);
      text(c, 'Il link mostra', 0, 330, 44, { weight: 500, color: T.muted, align: 'center', alpha: clamp(a / 0.15) });
      c.save();
      c.translate(0, 440); c.scale(lerp(0.7, 1, e), lerp(0.7, 1, e)); c.translate(0, -440);
      const strike = prog(t, S.link + 1.0, S.link + 1.2, ease.outCubic);
      const w = mono(SHOWN, 440, T.fg, clamp(a / 0.1) * (1 - 0.6 * strike));
      if (strike > 0) {
        c.fillStyle = RED;
        c.fillRect(-w / 2 - 20, 440 - 36, (w + 40) * strike, 10);
      }
      c.restore();
    }
    // where it goes
    const g = t - (S.link + 1.5);
    if (g >= 0) {
      const e = ease.outBack(clamp(g / 0.2), 2.6);
      const shake = Math.sin(g * 70) * 14 * Math.pow(0.5, g / 0.06);
      text(c, 'ma porta a', 0, 590, 44, { weight: 500, color: T.muted, align: 'center', alpha: clamp(g / 0.12) });
      c.save();
      c.translate(shake, 710); c.scale(lerp(1.35, 1, e), lerp(1.35, 1, e)); c.translate(0, -710);
      mono(REAL, 710, RED, clamp(g / 0.06));
      c.restore();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- 16–18 the traps, marked on the beat
  shotMarks(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.marks - 0.1 || t > S.phone + 0.25) return;
    const { renderer } = this.ctx;
    const em = this.img.email!, plain = this.img['email-plain']!;
    const sweep = this.marks.map((_, i) => prog(t, S.marks + BEAT * i, S.marks + BEAT * i + 0.22, ease.outCubic));
    const done = t >= S.marks + BEAT * this.marks.length;
    const key = done ? 'done' : sweep.map((s) => s.toFixed(2)).join('|');
    this.email.draw(key, (c) => {
      c.save();
      roundRect(c, 0, 0, em.width, em.height, 20); c.clip();
      c.fillStyle = '#FDFDFD'; c.fillRect(0, 0, em.width, em.height);
      c.drawImage(done ? em : plain, 0, 0);
      if (!done) {
        this.marks.forEach((m, i) => {
          if (sweep[i]! <= 0) return;
          c.save();
          c.beginPath(); c.rect(m.x - 4, m.y - 4, (m.w + 8) * sweep[i]!, m.h + 8); c.clip();
          c.fillStyle = '#FDFDFD'; c.fillRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
          c.drawImage(em, 0, 0);
          c.restore();
        });
      }
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 2;
      roundRect(c, 1, 1, em.width - 2, em.height - 2, 20); c.stroke();
    });
    const enter = out4(prog(t, S.marks - 0.1, S.marks + 0.35));
    const leave = prog(t, S.phone - 0.15, S.phone + 0.15, ease.inCubic);
    const P: Pose = { x: W / 2, y: lerp(1300, 480, enter) - leave * 900, s: 1.28 * this.kick(t) * (1 + 0.03 * prog(t, S.marks, S.phone)), rx: lerp(0.7, 0.04, enter) - leave * 0.4, ry: 0, z: 0 };
    const op = clamp(enter * 1.5) * (1 - leave);
    shadowUnder(bg, this.email.corners(P), { alpha: 0.18 * op, blur: 90, dy: 50 });
    planes.push(() => this.email.render(renderer, this.target, P, op));
    this.marks.forEach((m, i) => this.glow(this.email, P, m, t - (S.marks + BEAT * i), after, 4));
  }

  // ---------------------------------------------------------------- 18–20 the warning on Telegram
  lockScreen() {
    const w = 1179, h = 2556;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2B2B30'); g.addColorStop(0.55, '#16161A'); g.addColorStop(1, '#0B0B0D');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = c.createRadialGradient(w * 0.75, h * 0.25, 0, w * 0.75, h * 0.25, w * 0.9);
    r.addColorStop(0, 'rgba(255,255,255,0.10)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = r; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.92)';
    c.textAlign = 'center';
    setFont(c, 500, 54); c.fillText('venerdì 23 ottobre', w / 2, 330);
    setFont(c, 700, 300, -0.02); c.fillText('08:12', w / 2, 610);
    return cv;
  }
  /** A Telegram notification from the bot (iOS style). */
  banner(c: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, body: string[]) {
    const h = 168 + body.length * 58;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
    c.fillStyle = 'rgba(245,245,247,0.96)';
    roundRect(c, x, y, w, h, 56); c.fill();
    c.restore();
    drawIcon(c, x + 92, y + 96, 104);
    text(c, 'Telegram · Autocratico', x + 176, y + 80, 38, { weight: 500, color: '#6B6B6B' });
    text(c, 'ora', x + w - 46, y + 80, 36, { color: '#6B6B6B', align: 'right' });
    text(c, title, x + 176, y + 142, 50, { weight: 700, color: RED });
    body.forEach((l, i) => text(c, l, x + 176, y + 202 + i * 58, 44, { color: '#222', weight: i === body.length - 1 ? 600 : 400 }));
    return h;
  }
  shotPhone(t: number, c: CanvasRenderingContext2D) {
    if (t < S.phone - 0.1 || t > S.end + 0.3) return;
    const up = out4(prog(t, S.phone - 0.1, S.phone + 0.4));
    const away = prog(t, S.end - 0.15, S.end + 0.2, ease.inCubic);
    const ph = 1560, pw = ph * (1179 / 2556);
    const cx = 1320, cy = lerp(2100, 820, up) - away * 120;
    const k = (pw - 34) / 1179;
    const z = this.kick(t) * (1 + 0.05 * prog(t, S.phone, S.end));
    c.save();
    c.globalAlpha = 1 - away;
    c.translate(cx, cy); c.scale(z, z); c.rotate(lerp(0.06, -0.015, up)); c.translate(-cx, -cy);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 70; c.shadowOffsetY = 30;
    c.fillStyle = '#1C1C1E';
    roundRect(c, cx - pw / 2, cy - ph / 2, pw, ph, 80); c.fill();
    c.restore();
    c.save();
    roundRect(c, cx - pw / 2 + 17, cy - ph / 2 + 17, pw - 34, ph - 34, 64); c.clip();
    c.translate(cx - pw / 2 + 17, cy - ph / 2 + 17);
    c.scale(k, k);
    c.drawImage(this.lock, 0, 0);
    c.fillStyle = '#000'; roundRect(c, 1179 / 2 - 190, 44, 380, 110, 55); c.fill();
    const at = S.phone + 0.3;
    if (t >= at) {
      const e = clamp(springStep(t - at, 3.2, 0.55));
      c.save();
      c.globalAlpha *= clamp((t - at) / 0.12);
      c.translate(0, (1 - e) * -260);
      this.banner(c, 44, 760, 1179 - 88, '⚠️ Possibile phishing', ['Rischio alto: finto rimborso', 'dell’Agenzia delle Entrate.', 'Non aprire i link, non pagare.']);
      c.restore();
    }
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- 20–24 the end card
  endCard(t: number, c: CanvasRenderingContext2D) {
    if (t < S.end) return;
    const k = t - S.end;
    const e = out4(clamp(k / 0.6));
    c.save();
    c.globalAlpha = clamp(k / 0.2);
    drawStudio(c, { drift: t * 0.3 });
    c.restore();
    const s = 1 + 0.04 * (1 - e) + 0.01 * k;
    c.save();
    c.translate(W / 2, H / 2 - 40);
    c.scale(s, s);
    c.save();
    c.globalAlpha = e;
    const pop = springStep(k, 2.4, 0.45);
    c.save(); c.translate(0, -150); c.scale(pop, pop); drawIcon(c, 0, 0, 124, { shadow: 1 }); c.restore();
    setFont(c, 700, 112, -0.045);
    c.fillStyle = T.fg; c.textAlign = 'center';
    c.fillText('autocratico', 0, 40);
    c.restore();
    c.globalAlpha = clamp((k - 0.35) / 0.4);
    text(c, 'Il phishing, smascherato.', 0, 122, 46, { weight: 500, color: T.fg, align: 'center' });
    c.globalAlpha = clamp((k - 0.75) / 0.4);
    text(c, 'Provalo su demo.autocratico.it', 0, 186, 36, { weight: 500, color: T.muted, align: 'center' });
    c.restore();
  }
}
