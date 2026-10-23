// The Agenda promo (?film=agenda, 30 s, docs/AGENDA.md): Google Calendar managed by the agent. A hook of
// appointments slammed on the beat, the week as the app draws it, the request typed in the chat, the event
// landing in the week (red: important), moved after a yes, the alerts on Telegram, the appointment found in a
// letter added with one tap, the month. The app is the public demo, captured in Italian (public/agenda/,
// tools/capture-agenda.ts): the chat frames are the real typing and the real streamed answer.
//
// 128 BPM, a bar every 1.872 s from 0.047 s: two bars of groove, the drop at bar 2 (3.79 s), two bars a shot,
// the hit that opens the outro at bar 14 (26.26 s) is the end card.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { clamp, ease, lerp, prog, springStep, TAU } from '../engine/util';
import { drawIcon, drawStudio, roundRect } from './_motifs';
import { caption, Card3D, clickRing, pointer, setFont, shadowUnder, T, text, type CaptionSpec, type Pose } from './board-kit';

type Rect = { x: number; y: number; w: number; h: number };
type Live = { type: string[]; think: { file: string; t: number }[] };
const inOut = ease.inOutCubic;
const out4 = ease.outQuart;

// ---------------------------------------------------------------- the grid of the music
const BAR = 1.872;
const BEAT = BAR / 4;
const D = (i: number) => 0.047 + i * BAR;
const b = (k: number) => 0.047 + k * BEAT;
const S = {
  week: D(2), // the drop
  chat: D(4),
  land: D(6),
  move: D(8),
  phone: D(10),
  letter: D(12),
  end: D(14),
  out: 30,
};
const FLASHES = [S.week, S.land, S.phone, S.letter, S.end];

const HOOK = [
  { word: 'Dentista.', chip: 'GIO 29 · 15:00', color: T.overdue },
  { word: 'CAF.', chip: 'GIO 29 · 10:30', color: T.urgent },
  { word: 'Revisione.', chip: 'DOM 1 · 08:30', color: T.soon },
  { word: 'Questura.', chip: 'LUN 2 · 11:20', color: T.overdue },
];

const CAPTIONS: CaptionSpec[] = [
  { at: S.week + 0.35, out: S.chat - 0.35, exit: 0.25, x: 110, y: 480, lines: [{ text: 'La tua agenda.', size: 96, weight: 700 }, { text: 'Google Calendar, ma pulito.', size: 40, weight: 500, color: T.muted }] },
  { at: S.chat + 0.25, out: S.land - 0.3, exit: 0.25, x: 110, y: 380, lines: [{ text: 'Dillo', size: 96, weight: 700 }, { text: 'a parole.', size: 96, weight: 700 }, { text: 'In chat o su Telegram.', size: 40, weight: 500, color: T.muted }] },
  { at: S.land + 1.25, out: S.move - 0.3, exit: 0.25, x: 110, y: 470, lines: [{ text: 'Importante?', size: 96, weight: 700 }, { text: 'Diventa rosso.', size: 96, weight: 700 }, { text: 'Promemoria il giorno prima e un’ora prima.', size: 38, weight: 500, color: T.muted }] },
  { at: S.move + BAR / 4 + 0.3, out: S.phone - 0.3, exit: 0.25, x: 110, y: 520, lines: [{ text: 'Spostalo.', size: 96, weight: 700 }, { text: 'Prima ti chiede.', size: 40, weight: 500, color: T.muted }] },
  { at: S.phone + 0.3, out: S.letter - 0.3, exit: 0.25, x: 110, y: 470, lines: [{ text: 'Ti avvisa', size: 96, weight: 700 }, { text: 'su Telegram.', size: 96, weight: 700 }, { text: 'Gli appuntamenti importanti, in tempo.', size: 38, weight: 500, color: T.muted }] },
  { at: S.letter + 0.95, out: S.end - 0.3, exit: 0.25, x: 110, y: 560, lines: [{ text: 'Lo trova', size: 90, weight: 700 }, { text: 'nelle lettere.', size: 90, weight: 700 }, { text: 'Tu dici solo sì.', size: 40, weight: 500, color: T.muted }] },
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

export default class Agenda extends Scene {
  bg = new Layer2D();
  top = new Layer2D();
  img: Record<string, ImageBitmap> = {};
  frames: Record<string, HTMLImageElement> = {};
  live!: Live;
  L: Record<string, Rect> = {};
  grid!: Card3D;
  chat!: Card3D;
  event!: Card3D;
  ask!: Card3D;
  letter!: Card3D;
  month!: Card3D;
  lock!: HTMLCanvasElement;
  outRT: THREE.WebGLRenderTarget | null = null;
  get target(): THREE.WebGLRenderTarget { return this.outRT!; }

  override async init() {
    const names = ['week-before', 'week-after', 'week-moved', 'event-thu', 'chat-move-ask', 'proposal', 'month'];
    const loaded = await Promise.all(names.map((n) => bitmap(`agenda/${n}.png`)));
    names.forEach((n, i) => (this.img[n] = loaded[i]!));
    this.L = await (await fetch('agenda/layout.json')).json();
    this.live = await (await fetch('agenda/live.json')).json();
    await Promise.all([...this.live.type, ...this.live.think.map((x) => x.file)].map(async (f) => {
      const im = new Image();
      im.src = `agenda/${f}`;
      await im.decode();
      this.frames[f] = im;
    }));
    const g = this.L['week-before']!;
    this.grid = new Card3D(g.w, g.h, 1);
    const p = this.L.panel!;
    this.chat = new Card3D(p.w, p.h, 1);
    const ev = this.img['event-thu']!;
    this.event = new Card3D(ev.width, ev.height, 2);
    this.event.draw('event', (c) => c.drawImage(ev, 0, 0));
    this.ask = new Card3D(704, 660, 1);
    this.ask.draw('ask', (c) => {
      c.save(); roundRect(c, 0, 0, 704, 660, 30); c.clip();
      c.fillStyle = '#FDFDFD'; c.fillRect(0, 0, 704, 660);
      c.drawImage(this.img['chat-move-ask']!, 0, 92, 704, 660, 0, 0, 704, 660);
      c.restore();
    });
    const pr = this.img.proposal!;
    this.letter = new Card3D(pr.width, pr.height, 1);
    this.letter.draw('letter', (c) => c.drawImage(pr, 0, 0));
    const m = this.img.month!;
    this.month = new Card3D(m.width, m.height, 1);
    this.month.draw('month', (c) => this.window(c, m));
    this.lock = this.lockScreen();
  }

  /** A capture as the app draws it: rounded corners, a hairline. */
  window(c: CanvasRenderingContext2D, img: ImageBitmap) {
    c.save();
    roundRect(c, 0, 0, img.width, img.height, 24); c.clip();
    c.fillStyle = '#FDFDFD'; c.fillRect(0, 0, img.width, img.height);
    c.drawImage(img, 0, 0);
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 2;
    roundRect(c, 1, 1, img.width - 2, img.height - 2, 24); c.stroke();
  }

  /** A small push of the whole frame on each downbeat after the drop. */
  kick(t: number) {
    if (t < S.week || t > S.end + 0.2) return 1;
    const k = (t - 0.047) % BAR;
    return 1 + 0.014 * Math.pow(0.5, k / 0.09);
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
    this.shotGrid(t, bg, planes, after);
    this.shotChat(t, bg, planes);
    this.shotMove(t, bg, planes, after);
    this.shotPhone(t, top);
    this.shotLetter(t, bg, planes, after);

    // a veil behind the captions while a capture fills the frame
    const yesAt = S.move + BAR / 4 - 0.25;
    const veil = prog(t, S.land + 1.0, S.land + 1.4) * (1 - prog(t, S.move - 0.25, S.move)) + prog(t, yesAt + 0.4, yesAt + 0.8) * (1 - prog(t, S.phone - 0.2, S.phone + 0.1));
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
      grain: 0.028,
      vignette: 0.14,
      bloom: 0.14,
      ca: 0.18,
      flash: FLASHES.reduce((s, at, i) => s + hit(at, i === 0 || i === FLASHES.length - 1 ? 0.5 : 0.18, 0.1), 0) + (t < S.week ? hit(b(4), 0.08, 0.06) : 0),
      fade: prog(t, S.out - 0.35, S.out, ease.inQuad),
    };
  }

  // ---------------------------------------------------------------- 0–3.8 the hook: appointments on the beat
  shotHook(t: number, c: CanvasRenderingContext2D) {
    if (t > S.week + 0.05) return;
    const k = Math.floor((t - 0.047) / BEAT);
    if (k <= 3) {
      const i = Math.max(0, k);
      const h = HOOK[i]!;
      const lt = t - b(i);
      const pop = ease.outBack(clamp(lt / 0.22), 2.2);
      c.save();
      c.translate(W / 2, 560);
      c.rotate((i % 2 ? 1 : -1) * 0.025 * (1 - clamp(lt / 0.3)));
      c.scale(lerp(1.25, 1, pop), lerp(1.25, 1, pop));
      // the date chip, in the color of how close it is
      setFont(c, 600, 40);
      c.font = c.font.replace(/^\d+ /, '500 ');
      const chipW = c.measureText(h.chip).width * 0.95 + 110;
      c.fillStyle = h.color;
      roundRect(c, -chipW / 2, -230, chipW, 70, 35); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath(); c.arc(-chipW / 2 + 32, -195, 7, 0, TAU); c.fill();
      text(c, h.chip, 22, -181, 36, { mono: true, weight: 500, color: '#FFFFFF', align: 'center' });
      setFont(c, 800, 210, -0.05);
      c.fillStyle = T.fg; c.textAlign = 'center';
      c.fillText(h.word, 0, 60);
      c.restore();
      return;
    }
    // bar 2: "Chi te li ricorda tutti?", a word a beat, then into the drop
    const words = ['Chi', 'te li', 'ricorda', 'tutti?'];
    const zoom = Math.exp(lerp(0, Math.log(1.7), prog(t, b(7), S.week, ease.inCubic)));
    c.save();
    c.translate(W / 2, 540);
    c.scale(zoom, zoom);
    setFont(c, 800, 150, -0.05);
    const widths = words.map((w) => c.measureText(w).width);
    const space = 40;
    const total = widths.reduce((s, w) => s + w, 0) + space * 3;
    let x = -total / 2;
    for (const [j, w] of words.entries()) {
      const lt = t - b(4 + j);
      if (lt >= 0) {
        const e = ease.outBack(clamp(lt / 0.2), 2);
        c.save();
        c.translate(x + widths[j]! / 2, 50);
        c.scale(lerp(0.6, 1, e), lerp(0.6, 1, e));
        c.globalAlpha = clamp(lt / 0.08);
        c.fillStyle = j === 3 ? T.overdue : T.fg;
        c.textAlign = 'center';
        c.fillText(w, 0, 0);
        c.restore();
      }
      x += widths[j]! + space;
    }
    c.restore();
  }

  // ---------------------------------------------------------------- 3.8–18.8 the week: drawn in, the chat, the landing, the move
  /** Grid pose for a layer point (u, v) of the grid at screen (X, Y), scale s. */
  focus(u: number, v: number, X: number, Y: number, s: number, rx = 0.03, ry = -0.06): Pose {
    return { x: X - s * (u - this.grid.w / 2), y: Y - s * (v - this.grid.h / 2), s, rx, ry };
  }
  gridPose(t: number): Pose {
    const g = this.grid;
    const enterFrom: Pose = { x: 1250, y: 1550, s: 0.5, rx: 0.95, ry: -0.35, rz: 0.08 };
    const rest: Pose = { x: 1250, y: 560, s: 0.55, rx: 0.07, ry: -0.14 };
    const aside: Pose = { x: 700, y: 570, s: 0.44, rx: 0.05, ry: 0.2 };
    const front: Pose = { x: 1180, y: 560, s: 0.56, rx: 0.04, ry: -0.05 };
    const thu = this.L['event-thu-in-grid']!, fri = this.L['event-fri-in-grid']!;
    const close = this.focus(thu.x + thu.w / 2, thu.y + thu.h / 2, 1260, 560, 1.35);
    const pair = this.focus((thu.x + fri.x + fri.w) / 2, (thu.y + fri.y + fri.h) / 2, 1200, 520, 1.0, 0.04, -0.04);
    let P = lerpPose(enterFrom, rest, out4(prog(t, S.week, S.week + 0.6)));
    P = lerpPose(P, aside, inOut(prog(t, S.chat - 0.05, S.chat + 0.5)));
    P = lerpPose(P, front, inOut(prog(t, S.land - 0.1, S.land + 0.45)));
    P = lerpPose(P, close, inOut(prog(t, S.land + 1.0, S.land + 1.9)));
    P = lerpPose(P, pair, inOut(prog(t, S.move - 0.2, S.move + 0.4)));
    const leave = prog(t, S.phone - 0.2, S.phone + 0.25, ease.inCubic);
    void g;
    // never still: a slow push and turn through every two-bar shot
    const u = ((t - S.week) % (2 * BAR)) / (2 * BAR);
    const drift = t > S.week ? u : 0;
    return { ...P, y: P.y - leave * 1400, rx: (P.rx ?? 0) - leave * 0.6, ry: (P.ry ?? 0) + 0.035 * (drift - 0.5), s: (P.s ?? 1) * this.kick(t) * (1 + 0.05 * drift) };
  }
  /** Which capture the week shows, and how many of its days are drawn in. */
  gridContent(t: number): { img: string; cols: number } {
    const cols = Math.min(7, Math.floor((t - S.week) / (BEAT / 2)) + 1);
    if (t < S.land + 1.1) return { img: 'week-before', cols };
    if (t < S.move + BAR / 4 + 0.15) return { img: 'week-after', cols: 7 };
    if (t < S.move + BAR / 4 + 0.95) return { img: 'week-before', cols: 7 }; // the event travels on its own
    return { img: 'week-moved', cols: 7 };
  }
  shotGrid(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.week - 0.02 || t > S.phone + 0.3) return;
    const { renderer } = this.ctx;
    const P = this.gridPose(t);
    const { img, cols } = this.gridContent(t);
    this.grid.draw(`${img}|${cols}`, (c) => {
      this.window(c, this.img[img]!);
      // the days not drawn in yet: the empty grid, as the week fills in on the beat
      if (cols < 7) {
        const d = this.L[`day-${cols}`]!;
        c.fillStyle = '#FDFDFD';
        c.fillRect(d.x, 0, this.grid.w - d.x - 2, this.grid.h - 2);
        c.strokeStyle = '#E5E5E5'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(d.x, 0); c.lineTo(d.x, this.grid.h); c.stroke();
      }
    });
    const dim = 0.55 * prog(t, S.chat, S.chat + 0.4) * (1 - prog(t, S.land - 0.1, S.land + 0.3));
    const op = clamp(prog(t, S.week - 0.02, S.week + 0.12)) * (1 - prog(t, S.phone, S.phone + 0.25));
    shadowUnder(bg, this.grid.corners(P), { alpha: 0.18 * op, blur: 110, dy: 60 });
    planes.push(() => this.grid.render(renderer, this.target, P, op * (1 - dim)));

    // the event flies out of the chat's confirmation onto Thursday at 15:00
    const thu = this.L['event-thu-in-grid']!;
    const go = prog(t, S.land + 0.25, S.land + 1.1, inOut);
    if (go > 0 && go < 1) {
      const C = this.chatPose(t), lc = this.L['live-confirm']!;
      const from = this.chat.project(lc.x + lc.w / 2, lc.y + lc.h / 2, C);
      const to = this.grid.project(thu.x + thu.w / 2, thu.y + thu.h / 2, P);
      const F: Pose = {
        x: lerp(from.x, to.x, go), y: lerp(from.y, to.y, go) - Math.sin(go * Math.PI) * 160,
        s: lerp(1.25, P.s!, go), rx: lerp(0.1, P.rx ?? 0, go), ry: lerp(-0.2, P.ry ?? 0, go), rz: Math.sin(go * Math.PI) * 0.06, z: Math.sin(go * Math.PI) * 140,
      };
      planes.push(() => this.event.render(renderer, this.target, F, 1));
    }
    // the landing: the app's "just changed" glow and two rings
    this.glow(t - (S.land + 1.1), thu, P, after);
    this.glow(t - (S.move + BAR / 4 + 0.95), this.L['event-fri-in-grid']!, P, after);
  }
  glow(k: number, r: Rect, P: Pose, after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (k < -0.05 || k > 1.6) return;
    after.push((c) => {
      const q = (pad: number) => [
        this.grid.project(r.x - pad, r.y - pad, P), this.grid.project(r.x + r.w + pad, r.y - pad, P),
        this.grid.project(r.x + r.w + pad, r.y + r.h + pad, P), this.grid.project(r.x - pad, r.y + r.h + pad, P),
      ];
      const path = (pts: { x: number; y: number }[]) => {
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath();
      };
      const wash = Math.pow(1 - clamp(k / 1.3), 2);
      c.save();
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = `rgba(239,168,16,${0.22 * wash})`;
      path(q(4)); c.fill();
      c.restore();
      for (const [i, d] of [0, 0.18].entries()) {
        const e = clamp((k - d) / 0.9);
        if (e <= 0 || e >= 1) continue;
        c.save();
        c.strokeStyle = `rgba(23,23,23,${(i ? 0.16 : 0.26) * (1 - e)})`;
        c.lineWidth = 2.5;
        c.lineJoin = 'round';
        path(q(6 + 60 * ease.outCubic(e))); c.stroke();
        c.restore();
      }
    });
  }

  // ---------------------------------------------------------------- 7.5–12.4 the chat: typed, answered
  chatPose(t: number): Pose {
    const enter = out4(prog(t, S.chat - 0.1, S.chat + 0.5));
    const leave = prog(t, S.land + 0.5, S.land + 1.0, ease.inCubic);
    return {
      x: lerp(1560, 1400, enter), y: lerp(1450, 545, enter) + leave * 1000, s: 0.62 * this.kick(t),
      rx: lerp(0.6, 0.03, enter) + leave * 0.4, ry: -0.16, rz: lerp(-0.06, 0, enter),
    };
  }
  chatFrame(t: number): { a: string; b: string; mix: number } {
    const types = this.live.type, think = this.live.think;
    const t0 = S.chat + 0.2, t1 = S.chat + 1.35;
    if (t < t1) {
      const u = clamp((t - t0) / (t1 - t0)) * (types.length - 1);
      return { a: types[Math.floor(u)]!, b: types[Math.floor(u)]!, mix: 0 };
    }
    const real = (t - (t1 + 0.1)) * 1.9;
    let i = 0;
    while (i < think.length - 1 && think[i + 1]!.t <= real) i++;
    const j = Math.min(think.length - 1, i + 1);
    const mix = j === i ? 0 : clamp((real - think[i]!.t) / (think[j]!.t - think[i]!.t));
    return { a: think[i]!.file, b: think[j]!.file, mix };
  }
  shotChat(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[]) {
    if (t < S.chat - 0.12 || t > S.land + 1.05) return;
    const { renderer } = this.ctx;
    const p = this.L.panel!;
    const fr = this.chatFrame(t);
    const mix = Math.round(fr.mix * 10) / 10;
    this.chat.draw(`${fr.a}|${fr.b}|${mix}`, (c) => {
      c.save(); roundRect(c, 0, 0, p.w, p.h, 30); c.clip();
      c.drawImage(this.frames[fr.a]!, 0, 0, p.w, p.h);
      if (mix > 0) { c.globalAlpha = mix; c.drawImage(this.frames[fr.b]!, 0, 0, p.w, p.h); }
      c.restore();
    });
    const P = this.chatPose(t);
    const op = clamp(prog(t, S.chat - 0.1, S.chat + 0.15)) * (1 - prog(t, S.land + 0.75, S.land + 1.0));
    shadowUnder(bg, this.chat.corners(P), { alpha: 0.2 * op, blur: 80, dy: 44 });
    planes.push(() => this.chat.render(renderer, this.target, P, op));
  }

  // ---------------------------------------------------------------- 15.0–18.8 moved, after a yes
  shotMove(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.move - 0.1 || t > S.phone + 0.1) return;
    const { renderer } = this.ctx;
    const yesAt = S.move + BAR / 4 - 0.25;
    // the question, small, over the week
    const inn = out4(prog(t, S.move - 0.05, S.move + 0.35));
    const outp = prog(t, yesAt + 0.3, yesAt + 0.6, ease.inCubic);
    const A: Pose = { x: 520, y: 360 - (1 - inn) * 200, s: 0.62 * this.kick(t), rx: 0.08 + (1 - inn) * 0.5, ry: 0.18, z: -outp * 300 };
    const aop = clamp(inn * 1.5) * (1 - outp);
    if (aop > 0) {
      shadowUnder(bg, this.ask.corners(A), { alpha: 0.2 * aop, blur: 70, dy: 40 });
      planes.push(() => this.ask.render(renderer, this.target, A, aop));
      const y = this.L.yes!;
      after.push((c) => {
        const yes = this.ask.project(y.x + y.w / 2, y.y - 92 + y.h / 2, A);
        const mv = out4(prog(t, yesAt - 0.45, yesAt - 0.05));
        pointer(c, lerp(1000, yes.x + 4, mv), lerp(900, yes.y + 6, mv), 1.5, clamp(1 - Math.abs(t - yesAt) / 0.1));
        clickRing(c, yes.x, yes.y, t - yesAt);
      });
    }
    // the event lifts off Thursday and lands on Friday at 17:00
    const go = prog(t, yesAt + 0.4, yesAt + 1.2, inOut);
    if (go > 0 && go < 1) {
      const P = this.gridPose(t);
      const a = this.L['event-thu-in-grid']!, z = this.L['event-fri-in-grid']!;
      const u = lerp(a.x, z.x, go) + a.w / 2, v = lerp(a.y, z.y, go) + a.h / 2;
      const lift = Math.sin(go * Math.PI) * 90;
      const s = this.event.w / a.w;
      planes.push(() => this.child(this.event, this.grid, P, u, v, lift, s, Math.sin(go * Math.PI) * 0.05));
    }
  }

  /** Draw `child` on `parent`'s plane at layer point (u, v), lifted `z` towards the camera. */
  child(child: Card3D, parent: Card3D, P: Pose, u: number, v: number, z: number, res: number, rz = 0) {
    const { renderer } = this.ctx;
    parent.project(0, 0, P);
    const m = new THREE.Matrix4().makeTranslation(u - parent.w / 2, parent.h / 2 - v, z).multiply(new THREE.Matrix4().makeRotationZ(rz)).multiply(new THREE.Matrix4().makeScale(1 / res, 1 / res, 1));
    child.mesh.matrixAutoUpdate = false;
    child.mesh.matrixWorld.multiplyMatrices(parent.mesh.matrixWorld, m);
    child.mesh.matrix.copy(child.mesh.matrixWorld);
    child.mat.opacity = 1;
    child.sync();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    renderer.render(child.scene, parent.cam);
    renderer.autoClear = ac;
    child.mesh.matrixAutoUpdate = true;
  }

  // ---------------------------------------------------------------- 18.8–22.5 Telegram on the phone
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
    setFont(c, 500, 54); c.fillText('venerdì 30 ottobre', w / 2, 330);
    setFont(c, 700, 300, -0.02); c.fillText('16:00', w / 2, 610);
    return cv;
  }
  /** A Telegram notification from the bot (iOS style); `keys` draws the bot's buttons under it. */
  banner(c: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, body: string[], keys?: string[], press = 0) {
    const h = 168 + body.length * 58;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
    c.fillStyle = 'rgba(245,245,247,0.95)';
    roundRect(c, x, y, w, h, 56); c.fill();
    c.restore();
    drawIcon(c, x + 92, y + 96, 104);
    text(c, 'Telegram · Autocratico', x + 176, y + 80, 38, { weight: 500, color: '#6B6B6B' });
    text(c, 'ora', x + w - 46, y + 80, 36, { color: '#6B6B6B', align: 'right' });
    text(c, title, x + 176, y + 142, 50, { weight: 600, color: '#111' });
    body.forEach((l, i) => text(c, l, x + 176, y + 202 + i * 58, 44, { color: '#333' }));
    if (keys) {
      const kw = (w - 24) / keys.length;
      keys.forEach((k, i) => {
        const kx = x + i * (kw + 24), ky = y + h + 18;
        const p = i === 0 ? press : 0;
        c.save();
        c.translate(kx + kw / 2, ky + 55);
        c.scale(1 - 0.05 * p, 1 - 0.05 * p);
        c.fillStyle = i === 0 ? `rgba(255,255,255,${0.92 - 0.2 * p})` : 'rgba(255,255,255,0.22)';
        roundRect(c, -kw / 2, -55, kw, 110, 40); c.fill();
        text(c, k, 0, 14, 40, { weight: 600, color: i === 0 ? '#111' : '#FFF', align: 'center' });
        c.restore();
      });
      return h + 150;
    }
    return h;
  }
  shotPhone(t: number, c: CanvasRenderingContext2D) {
    if (t < S.phone - 0.1 || t > S.letter + 0.6) return;
    const up = out4(prog(t, S.phone - 0.1, S.phone + 0.45));
    const dive = prog(t, S.letter + 0.15, S.letter + 0.55, ease.inQuart);
    const ph = 1260, pw = ph * (1179 / 2556);
    const cx = 1300, cy = lerp(1900, 650, up);
    const k = (pw - 34) / 1179;
    const tapAt = S.letter - 0.05;
    // the third notification's "Aggiungi" key: the zoom's centre
    const key = { x: 310, y: 1687 }; // the centre of the third notification's "Aggiungi" (banner layout below)
    const focus = { x: cx - pw / 2 + 17 + key.x * k, y: cy - ph / 2 + 17 + key.y * k };
    const z = Math.exp(lerp(0, Math.log(6), dive)) * this.kick(t) * (1 + 0.06 * prog(t, S.phone, S.letter));
    c.save();
    c.globalAlpha = 1 - prog(t, S.letter + 0.35, S.letter + 0.55);
    c.translate(focus.x, focus.y); c.scale(z, z); c.translate(-focus.x, -focus.y);
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
    // three notifications, a beat apart, stacking downward
    const notes = [
      { at: S.phone + 0.35, title: '📅 Tra 1 h: Visita dal dentista', body: ['ven 30 ott, 17:00–18:00'] },
      { at: S.phone + 0.35 + 2 * BEAT, title: '🔔 Oggi in calendario', body: ['09:30 Stand-up · 17:00 Dentista', '18:30 Palestra'] },
      { at: S.phone + BAR + 0.35, title: '📅 Appuntamento in un documento', body: ['Ritiro passaporto in Questura', 'lun 2 nov, 11:20 · Lo aggiungo?'], keys: ['📅 Aggiungi', 'No'] },
    ];
    let y = 760;
    for (const n of notes) {
      const e = clamp(springStep(t - n.at, 3.2, 0.55));
      if (t < n.at) break;
      c.save();
      c.globalAlpha *= clamp((t - n.at) / 0.12);
      c.translate(0, (1 - e) * -260);
      const press = clamp(1 - Math.abs(t - tapAt) / 0.12);
      const h = this.banner(c, 44, y, 1179 - 88, n.title, n.body, n.keys, press);
      c.restore();
      y += h + 30;
    }
    const kk = t - tapAt;
    if (kk > -0.15 && kk < 0.5) {
      c.fillStyle = `rgba(255,255,255,${0.5 * clamp(1 - Math.abs(kk) / 0.25)})`;
      c.beginPath(); c.arc(key.x, key.y, 70 + 40 * clamp(kk / 0.4), 0, TAU); c.fill();
    }
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- 22.5–26.3 the letter, then the month
  shotLetter(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.letter + 0.2 || t > S.end + 0.5) return;
    const { renderer } = this.ctx;
    const inn = out4(prog(t, S.letter + 0.3, S.letter + 0.75));
    const addAt = S.letter + 0.95 + 0.2;
    const fly = prog(t, addAt + 0.2, addAt + 0.9, inOut);
    const M = this.monthPose(t);
    const cell = { u: 6 + this.month.w / 7 / 2, v: 70 + (this.month.h - 70) / 6 * 1.5 }; // Monday 2 November
    const target = this.month.project(cell.u, cell.v, M);
    const rest: Pose = { x: 1260, y: 190 + (1 - inn) * -260, s: 0.58 * this.kick(t), rx: 0.1 - 0.4 * (1 - inn), ry: -0.06 };
    const P: Pose = fly > 0 ? { x: lerp(rest.x, target.x, fly), y: lerp(rest.y, target.y, fly), s: lerp(rest.s!, 0.12, fly), rx: lerp(rest.rx!, M.rx ?? 0, fly), ry: lerp(rest.ry!, M.ry ?? 0, fly), z: Math.sin(fly * Math.PI) * 120 } : rest;
    const op = clamp(inn * 1.4) * (1 - prog(t, addAt + 0.75, addAt + 0.95));
    if (op > 0) {
      shadowUnder(bg, this.letter.corners(P), { alpha: 0.2 * op, blur: 60, dy: 34 });
      planes.push(() => this.letter.render(renderer, this.target, P, op));
      const a = this.L['proposal-add']!;
      if (t < addAt + 0.3) {
        after.push((c) => {
          const btn = this.letter.project(a.x + a.w / 2, a.y + a.h / 2, P);
          const mv = out4(prog(t, addAt - 0.45, addAt - 0.05));
          pointer(c, lerp(1650, btn.x + 4, mv), lerp(900, btn.y + 6, mv), 1.5, clamp(1 - Math.abs(t - addAt) / 0.1));
          clickRing(c, btn.x, btn.y, t - addAt);
        });
      }
    }
    const mop = clamp(prog(t, S.letter + 0.55, S.letter + 0.8)) * (1 - prog(t, S.end, S.end + 0.25));
    if (mop > 0) {
      shadowUnder(bg, this.month.corners(M), { alpha: 0.16 * mop, blur: 110, dy: 60 });
      planes.unshift(() => this.month.render(renderer, this.target, M, mop));
      const land = t - (addAt + 0.9);
      if (land > -0.05 && land < 1.2) {
        after.push((c) => {
          const w = this.month.w / 7, h = (this.month.h - 70) / 6;
          const q = [this.month.project(6, 70 + h, M), this.month.project(6 + w, 70 + h, M), this.month.project(6 + w, 70 + 2 * h, M), this.month.project(6, 70 + 2 * h, M)];
          const e = clamp(land / 0.9);
          c.save();
          c.strokeStyle = `rgba(23,23,23,${0.3 * (1 - e)})`; c.lineWidth = 3;
          c.beginPath(); q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.stroke();
          c.globalCompositeOperation = 'multiply';
          c.fillStyle = `rgba(239,168,16,${0.25 * Math.pow(1 - e, 2)})`; c.fill();
          c.restore();
        });
      }
    }
  }
  monthPose(t: number): Pose {
    const enter = out4(prog(t, S.letter + 0.55, S.letter + 1.15));
    const dolly = inOut(prog(t, S.letter + 0.55, S.end));
    return {
      x: 1260 - 30 * dolly, y: lerp(1500, 640, enter) - 20 * dolly, s: lerp(0.5, 0.56, dolly) * this.kick(t),
      rx: lerp(0.9, 0.14, enter) - 0.05 * dolly, ry: lerp(-0.3, -0.12, enter) + 0.06 * dolly, rz: lerp(0.06, 0, enter),
    };
  }

  // ---------------------------------------------------------------- 26.3–30 the end card
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
    text(c, 'La tua agenda, a parole.', 0, 122, 46, { weight: 500, color: T.fg, align: 'center' });
    c.globalAlpha = clamp((k - 0.75) / 0.4);
    text(c, 'Provalo su demo.autocratico.it', 0, 186, 36, { weight: 500, color: T.muted, align: 'center' });
    c.restore();
  }
}
