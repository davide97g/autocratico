// The Board promo (?film=board, 34 s, docs/BOARD.md): a notification asks "Ti serve un widget?"; in the chat
// the question is typed, Claude reads the register and answers with a live preview, one click puts it on
// the Board. Then "something original": creative mode, asked first, read, run in a sandbox only on the
// user's yes, and the heatmap it draws. The app is the public demo, captured in Italian (public/board/,
// tools/capture-board.ts): the chat frames are the real typing and the real streamed answer.
//
// Bars every 2.00 s (120 BPM): the bass enters at 10.0 (the preview), the full band from 20.0 ("Creative
// mode."), the last downbeat at 32.0 is the end card.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { clamp, ease, hash, keys, lerp, mulberry32, prog, springStep, TAU } from '../engine/util';
import { drawIcon, drawStudio, roundRect } from './_motifs';
import { capture } from './inbox-kit';
import {
  boardCard, caption, Card3D, clickRing, heatmapWidget, MONTH_ROWS, pointer, sandboxBox, setFont, shadowUnder, T, text,
  type CaptionSpec, type Pose,
} from './board-kit';

type Rect = { x: number; y: number; w: number; h: number };
type Live = { type: string[]; think: { file: string; t: number }[] };
const inOut = ease.inOutCubic;
const out4 = ease.outQuart;

// ---------------------------------------------------------------- the edit
const S = {
  title: 0.1,
  phone: 1.55, // the iPhone rises
  notify: 2.35, // the notification drops in
  tap: 3.35,
  dive: 3.45, // into the notification, through to the chat
  chat: 4.0,
  type: 4.45, // the real typing frames
  send: 6.6,
  answerSpeed: 1.6, // the streamed answer, played faster than real time until the preview shows
  lift: 10.0, // the bass: closer on the preview
  add: 14.0, // "Aggiungi alla Bacheca"
  land: 15.55,
  zoom: 15.8, // close on the new widget
  turn: 18.0, // "E se volessi qualcosa di originale?"
  creative: 20.0, // the full band: "Creative mode."
  custom: 21.5, // the yes
  gate: 23.0,
  run: 24.75,
  wow: 26.0, // the heatmap
  finale: 29.6,
  end: 32.0,
  out: 34.0,
};

const CAPTIONS: CaptionSpec[] = [
  { at: 4.05, out: 6.35, exit: 0.3, x: 120, y: 470, lines: [{ text: 'Chiedilo in chat.', size: 100, weight: 700 }, { text: 'Descrivi quello che vuoi, a parole tue.', size: 40, weight: 500, color: T.muted }] },
  { at: 6.75, out: 9.7, exit: 0.3, x: 120, y: 470, lines: [{ text: 'Claude legge', size: 100, weight: 700 }, { text: 'il tuo registro…', size: 100, weight: 700 }] },
  { at: 10.15, out: 11.85, exit: 0.28, x: 120, y: 470, lines: [{ text: '…e lo disegna.', size: 100, weight: 700 }, { text: 'Con il design system dell’app.', size: 40, weight: 500, color: T.muted }] },
  { at: 12.05, out: 13.8, exit: 0.28, x: 120, y: 470, lines: [{ text: 'Sui tuoi', size: 100, weight: 700 }, { text: 'dati veri.', size: 100, weight: 700 }, { text: 'E si aggiorna da solo.', size: 40, weight: 500, color: T.muted }] },
  { at: 16.0, out: 17.75, exit: 0.3, x: 110, y: 470, lines: [{ text: 'Un clic.', size: 100, weight: 700 }, { text: 'È in Bacheca.', size: 100, weight: 700 }] },
  { at: 18.2, out: 19.6, exit: 0.3, x: W / 2, y: 500, align: 'center', lines: [{ text: 'E se volessi qualcosa', size: 104, weight: 700, color: '#FAFAFA' }, { text: 'di originale?', size: 104, weight: 700, color: '#FAFAFA' }] },
  { at: 21.75, out: 22.85, exit: 0.25, x: 1200, y: 500, lines: [{ text: 'Prima,', size: 96, weight: 700, color: '#FAFAFA' }, { text: 'il tuo sì.', size: 96, weight: 700, color: '#FAFAFA' }] },
  { at: 23.2, out: 24.4, exit: 0.25, x: 1200, y: 500, lines: [{ text: 'Leggi il codice.', size: 96, weight: 700, color: '#FAFAFA' }, { text: 'Poi lo esegui tu.', size: 40, weight: 500, color: '#A3A3A3' }] },
  { at: 24.75, out: 25.8, exit: 0.22, x: 1200, y: 500, lines: [{ text: 'In sandbox.', size: 96, weight: 700, color: '#FAFAFA' }, { text: 'Niente rete. Nessun accesso.', size: 40, weight: 500, color: '#A3A3A3' }] },
  { at: 26.25, out: 27.75, exit: 0.25, x: 120, y: 180, lines: [{ text: 'Qualsiasi idea.', size: 96, weight: 700, color: '#FAFAFA' }] },
  { at: 28.0, out: 29.45, exit: 0.3, x: 120, y: 180, lines: [{ text: 'Interattiva.', size: 96, weight: 700, color: '#FAFAFA' }, { text: 'Sui tuoi dati, in tempo reale.', size: 40, weight: 500, color: '#A3A3A3' }] },
  { at: 29.95, out: 31.75, exit: 0.3, x: 120, y: 210, lines: [{ text: 'La tua Bacheca.', size: 104, weight: 700 }, { text: 'Disegnata da Claude, su misura.', size: 42, weight: 500, color: T.muted }] },
];

/** The creative gradient (apps/web --creative-from/via/to). */
const CREATIVE = ['#8B4FE0', '#E04F9A', '#B8E04F'];

export default class Board extends Scene {
  bg = new Layer2D();
  top = new Layer2D();
  img: Record<string, ImageBitmap> = {};
  frames: Record<string, HTMLImageElement> = {};
  live!: Live;
  L: Record<string, Rect> = {};
  chat!: Card3D; // the chat panel, frame by frame
  fly!: Card3D; // the preview, on its way to the Board
  board!: Card3D; // the Board, full page, for the landing
  ask!: Card3D;
  gate!: Card3D;
  code!: Card3D;
  heat!: Card3D;
  final!: Card3D;
  cards: Card3D[] = [];
  parts: { u: number; v: number; seed: number }[] = [];
  lock!: HTMLCanvasElement;
  outRT: THREE.WebGLRenderTarget | null = null;
  get target(): THREE.WebGLRenderTarget { return this.outRT!; }

  override async init() {
    const names = ['board-wide-full', 'chat-custom-ask', 'gate-card', 'gate-code'];
    const loaded = await Promise.all(names.map((n) => capture(`board/${n}.png`)));
    names.forEach((n, i) => (this.img[n] = loaded[i]!));
    this.L = await (await fetch('board/layout.json')).json();
    this.live = await (await fetch('board/live.json')).json();
    const files = [...this.live.type, ...this.live.think.map((x) => x.file)];
    await Promise.all(files.map(async (f) => {
      const im = new Image();
      im.src = `board/${f}`;
      await im.decode();
      this.frames[f] = im;
    }));

    const panel = this.L.panel!;
    this.chat = new Card3D(panel.w, panel.h, 1);
    const wgt = this.L['live-widget']!;
    this.fly = new Card3D(wgt.w, wgt.h, 1);
    const last = this.frames[this.live.think[this.live.think.length - 1]!.file]!;
    this.fly.draw('fly', (c) => {
      c.save(); roundRect(c, 0, 0, wgt.w, wgt.h, 18); c.clip();
      c.drawImage(last, wgt.x, wgt.y, wgt.w, wgt.h, 0, 0, wgt.w, wgt.h);
      c.restore();
    });
    this.board = new Card3D(2880, 2040, 1);
    const ask = this.askCrop();
    this.ask = new Card3D(ask.w, ask.h, 1);
    this.ask.draw('ask', (c) => {
      c.save(); roundRect(c, 0, 0, ask.w, ask.h, 30); c.clip();
      c.drawImage(this.img['chat-custom-ask']!, ask.x, ask.y, ask.w, ask.h, 0, 0, ask.w, ask.h);
      c.restore();
    });
    this.gate = new Card3D(640, 746, 1);
    this.gate.draw('gate', (c) => c.drawImage(this.img['gate-card']!, 0, 0));
    this.code = new Card3D(640, 1282, 1);
    this.code.draw('code', (c) => c.drawImage(this.img['gate-code']!, 0, 0));
    this.heat = new Card3D(1000, 560, 2.5);
    this.final = new Card3D(2880, 2760, 1);
    for (let i = 0; i < 5; i++) {
      const r = this.L[`wide-card-${i}`]!;
      const card = new Card3D(r.w, r.h, 1);
      card.draw(`card${i}`, (c) => {
        c.drawImage(this.img['board-wide-full']!, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
        if (i === 4) this.heatInBoard(c, r.w, r.h);
      });
      this.cards.push(card);
    }
    const rnd = mulberry32(11);
    for (let i = 0; i < 260; i++) this.parts.push({ u: rnd(), v: rnd(), seed: rnd() });
    this.lock = this.lockScreen();
  }

  askCrop(): Rect {
    const ch = this.L.chat!;
    return { x: ch.x, y: ch.y, w: ch.w, h: 940 };
  }

  /** A capture as the app's window: rounded corners, a hairline. */
  window(c: CanvasRenderingContext2D, img: ImageBitmap, w: number, h: number, full = false) {
    c.save();
    roundRect(c, 0, 0, w, h, 36); c.clip();
    c.drawImage(img, 0, 0, w, full ? h : (img.height * w) / img.width, 0, 0, w, full ? h : (img.height * w) / img.width);
    if (full) this.heatInBoard(c, 0, 0, this.L['wide-card-4']!);
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.10)'; c.lineWidth = 2;
    roundRect(c, 1, 1, w - 2, h - 2, 36); c.stroke();
  }
  /** The heatmap inside its Board card (the capture's frame is lazy, so it is drawn here). */
  heatInBoard(c: CanvasRenderingContext2D, w: number, _h: number, at?: Rect) {
    const ox = at?.x ?? 0, oy = at?.y ?? 0;
    heatmapWidget(c, ox + 48, oy + 140, (at?.w ?? w) - 96, 2 * 0.86, { number: 1, cells: () => 1, sel: 1, selOn: 1, rows: 3, month: 1 });
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const bg = this.bg.ctx, top = this.top.ctx;
    this.outRT = out;
    this.bg.clear();
    this.top.clear();

    const dark = clamp(prog(t, S.turn, S.turn + 0.4, inOut) - prog(t, S.finale - 0.05, S.finale + 0.45, inOut));
    drawStudio(bg, { drift: t * 0.25 });
    if (dark > 0) {
      bg.save(); bg.globalAlpha = dark;
      drawStudio(bg, { dark: true, drift: t * 0.25 });
      bg.restore();
    }

    const planes: (() => void)[] = [];
    const after: ((c: CanvasRenderingContext2D) => void)[] = [];
    this.shotIntro(t, top);
    this.shotBoard(t, bg, planes, after); // under the preview that flies into it
    this.shotChat(t, bg, planes, after);
    this.shotCreative(t, after);
    this.shotCustom(t, bg, planes, after);
    this.shotHeat(t, bg, planes, after);
    this.shotFinale(t, bg, planes);

    // a soft veil behind the captions while the Board fills the frame
    const veil = prog(t, S.zoom - 0.1, S.zoom + 0.5) * (1 - prog(t, S.turn - 0.25, S.turn + 0.1));
    if (veil > 0) {
      after.unshift((c) => {
        const g = c.createLinearGradient(0, 0, 1050, 0);
        g.addColorStop(0, `rgba(230,230,230,${0.94 * veil})`);
        g.addColorStop(0.6, `rgba(230,230,230,${0.75 * veil})`);
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
      paper: 1 - dark,
      grain: 0.028,
      vignette: lerp(0.14, 0.32, dark),
      bloom: lerp(0.12, 0.35, dark),
      ca: 0.15,
      flash: hit(S.dive + 0.5, 0.35, 0.1) + hit(S.lift, 0.12, 0.08) + hit(S.creative, 0.12, 0.1) + hit(S.wow, 0.1, 0.08) + hit(S.end, 0.45, 0.12),
      fade: prog(t, S.out - 0.3, S.out, ease.inQuad),
    };
  }

  // ---------------------------------------------------------------- 0.0–4.1 title, the iPhone, the notification
  /** The lock screen with Autocratico's notification (1179×2556, as an iPhone 15 Pro screen). */
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
    setFont(c, 500, 54); c.fillText('martedì 14 ottobre', w / 2, 330);
    setFont(c, 700, 300, -0.02); c.fillText('9:41', w / 2, 610);
    return cv;
  }
  /** The notification banner (iOS style), drawn into `c` at (x, y), width `w`. */
  banner(c: CanvasRenderingContext2D, x: number, y: number, w: number, s = 1) {
    const h = 250 * s;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 40 * s; c.shadowOffsetY = 14 * s;
    c.fillStyle = 'rgba(245,245,247,0.94)';
    roundRect(c, x, y, w, h, 60 * s); c.fill();
    c.restore();
    drawIcon(c, x + 92 * s, y + h / 2, 96 * s);
    text(c, 'Autocratico', x + 168 * s, y + 92 * s, 40 * s, { weight: 600, color: '#111' });
    text(c, 'ora', x + w - 46 * s, y + 92 * s, 36 * s, { color: '#6B6B6B', align: 'right' });
    text(c, 'Ti serve un widget?', x + 168 * s, y + 150 * s, 42 * s, { weight: 600, color: '#111' });
    text(c, 'Chiedilo in chat: Claude lo disegna per te.', x + 168 * s, y + 204 * s, 38 * s, { color: '#333' });
    return { x, y, w, h };
  }
  shotIntro(t: number, c: CanvasRenderingContext2D) {
    if (t > S.chat + 0.4) return;
    // title: the icon pops, the name rises; it lifts away as the phone comes
    const pop = springStep(t - S.title, 2.2, 0.5);
    const away = prog(t, S.phone - 0.35, S.phone + 0.15, ease.inCubic);
    if (away < 1) {
      c.save();
      c.globalAlpha = 1 - away;
      c.translate(W / 2, 520 - away * 160);
      c.save(); c.scale(pop, pop); drawIcon(c, 0, -80, 128, { shadow: 1 }); c.restore();
      const rise = out4(prog(t, S.title + 0.25, S.title + 0.9));
      c.beginPath(); c.rect(-700, 20, 1400, 160); c.clip();
      setFont(c, 700, 128, -0.045);
      c.fillStyle = T.fg; c.textAlign = 'center';
      c.globalAlpha *= rise;
      c.fillText('Autocratico', 0, 140 + (1 - rise) * 120);
      c.restore();
    }
    // the phone
    const up = out4(prog(t, S.phone, S.phone + 0.8));
    if (up <= 0) return;
    const dive = prog(t, S.dive, S.chat + 0.05, ease.inQuart);
    const ph = 960, pw = ph * (1179 / 2556);
    const cx = W / 2, cy = lerp(1500, 560, up);
    // where the notification sits on the screen, the zoom's centre
    const scrScale = (pw - 34) / 1179;
    const drop = out4(prog(t, S.notify, S.notify + 0.45));
    const bx = 44, bw = 1179 - 88, by = lerp(-300, 760, drop);
    const focus = { x: cx - pw / 2 + 17 + (bx + bw / 2) * scrScale, y: cy - ph / 2 + 17 + (by + 125) * scrScale };
    const z = Math.exp(lerp(0, Math.log(9), dive));
    c.save();
    c.globalAlpha = clamp(1 - prog(t, S.chat - 0.12, S.chat + 0.15));
    c.translate(focus.x, focus.y);
    c.scale(z, z);
    c.translate(-focus.x, -focus.y);
    // device
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 70; c.shadowOffsetY = 30;
    c.fillStyle = '#1C1C1E';
    roundRect(c, cx - pw / 2, cy - ph / 2, pw, ph, 78); c.fill();
    c.restore();
    c.strokeStyle = '#3A3A3C'; c.lineWidth = 3;
    roundRect(c, cx - pw / 2 + 2, cy - ph / 2 + 2, pw - 4, ph - 4, 76); c.stroke();
    c.save();
    roundRect(c, cx - pw / 2 + 17, cy - ph / 2 + 17, pw - 34, ph - 34, 62); c.clip();
    c.translate(cx - pw / 2 + 17, cy - ph / 2 + 17);
    c.scale(scrScale, scrScale);
    c.drawImage(this.lock, 0, 0);
    // dynamic island
    c.fillStyle = '#000'; roundRect(c, 1179 / 2 - 190, 44, 380, 110, 55); c.fill();
    if (drop > 0) {
      const press = clamp(1 - Math.abs(t - S.tap) / 0.12);
      c.save();
      c.translate(bx + bw / 2, by + 125);
      c.scale(1 - 0.03 * press, 1 - 0.03 * press);
      c.translate(-(bx + bw / 2), -(by + 125));
      this.banner(c, bx, by, bw);
      c.restore();
      // the tap: a soft round touch
      const k = t - S.tap;
      if (k > -0.15 && k < 0.5) {
        c.fillStyle = `rgba(255,255,255,${0.45 * clamp(1 - Math.abs(k) / 0.25)})`;
        c.beginPath(); c.arc(bx + bw * 0.62, by + 140, 70 + 40 * clamp(k / 0.4), 0, TAU); c.fill();
      }
    }
    c.restore();
    c.restore();
  }

  // ---------------------------------------------------------------- 4.0–15.6 the chat, the answer, the preview
  /** Which chat frame shows at t (typing, then the streamed answer), and how much of the next one. */
  chatFrame(t: number): { a: string; b: string; mix: number } {
    const types = this.live.type, think = this.live.think;
    if (t < S.send) {
      const u = clamp((t - S.type) / (S.send - 0.12 - S.type)) * (types.length - 1);
      const i = Math.floor(u);
      return { a: types[i]!, b: types[Math.min(types.length - 1, i + 1)]!, mix: 0 };
    }
    // the answer: faster than real time until the preview shows, then at real speed while it animates
    const shownAt = think.find((x, i) => i > 0 && x.t > 2.6)?.t ?? 3; // the preview appears about here
    const lt = t - S.send;
    const real = lt * S.answerSpeed < shownAt ? lt * S.answerSpeed : shownAt + (lt - shownAt / S.answerSpeed);
    let i = 0;
    while (i < think.length - 1 && think[i + 1]!.t <= real) i++;
    const j = Math.min(think.length - 1, i + 1);
    const mix = j === i ? 0 : clamp((real - think[i]!.t) / (think[j]!.t - think[i]!.t));
    return { a: think[i]!.file, b: think[j]!.file, mix };
  }
  chatPose(t: number): Pose {
    const panel = this.L.panel!, wg = this.L['live-widget']!;
    const enter = out4(prog(t, S.chat - 0.1, S.chat + 0.6));
    const rest: Pose = { x: 1300, y: 548, s: 0.62, rx: 0.03, ry: -0.14 };
    // close on the preview (its centre to the right half), from the lift
    const close = inOut(prog(t, S.lift - 0.45, S.lift + 0.6));
    const sz = 1.0;
    const wc = { x: wg.x + wg.w / 2 - panel.w / 2, y: wg.y + wg.h / 2 - panel.h / 2 };
    const near: Pose = { x: 1260 - sz * wc.x, y: 560 - sz * wc.y, s: sz, rx: 0.02, ry: -0.1 };
    const drift = prog(t, S.lift + 0.6, S.add, inOut);
    const leave = prog(t, S.add + 0.45, S.add + 1.0, ease.inCubic);
    return {
      x: lerp(lerp(1300, rest.x, enter), near.x, close) - 30 * drift,
      y: lerp(lerp(1300, rest.y, enter), near.y, close) + leave * 900,
      s: lerp(rest.s!, near.s!, close) * (1 + 0.03 * drift),
      rx: lerp(lerp(0.5, rest.rx!, enter), near.rx!, close) + leave * 0.4, ry: lerp(rest.ry!, near.ry!, close) + 0.04 * drift, z: 0,
    };
  }
  shotChat(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.chat - 0.15 || t > S.land + 0.3) return;
    const { renderer } = this.ctx;
    const panel = this.L.panel!;
    const fr = this.chatFrame(t);
    const mix = Math.round(fr.mix * 12) / 12;
    this.chat.draw(`${fr.a}|${fr.b}|${mix}`, (c) => {
      c.save(); roundRect(c, 0, 0, panel.w, panel.h, 30); c.clip();
      c.drawImage(this.frames[fr.a]!, 0, 0, panel.w, panel.h);
      if (mix > 0) { c.globalAlpha = mix; c.drawImage(this.frames[fr.b]!, 0, 0, panel.w, panel.h); }
      c.restore();
    });
    const P = this.chatPose(t);
    const op = clamp(prog(t, S.chat - 0.1, S.chat + 0.2)) * (1 - prog(t, S.add + 0.6, S.add + 0.95));
    if (op > 0) {
      shadowUnder(bg, this.chat.corners(P), { alpha: 0.2 * op, blur: 80, dy: 44 });
      planes.push(() => this.chat.render(renderer, this.target, P, op));
    }
    // the click on "Aggiungi alla Bacheca" (the real button, in the last frame)
    const add = this.L['live-add']!;
    if (t > S.add - 0.6 && t < S.add + 0.7) {
      after.push((c) => {
        const btn = this.chat.project(add.x + add.w * 0.55, add.y + add.h / 2, P);
        const press = clamp(1 - Math.abs(t - (S.add + 0.25)) / 0.1);
        const mv = out4(prog(t, S.add - 0.55, S.add + 0.2));
        pointer(c, lerp(1750, btn.x + 4, mv), lerp(1050, btn.y + 6, mv), 1.5, press);
        clickRing(c, btn.x, btn.y, t - (S.add + 0.25));
      });
    }
    // the preview leaves the chat for the Board
    const wg = this.L['live-widget']!;
    const go = prog(t, S.add + 0.35, S.land, inOut);
    if (go > 0) {
      const from = this.chat.project(wg.x + wg.w / 2, wg.y + wg.h / 2, P);
      const slot = this.slotPose(t);
      const sFrom = P.s!, sTo = slot.s!;
      const F: Pose = {
        x: lerp(from.x, slot.x, go), y: lerp(from.y, slot.y, go) - Math.sin(go * Math.PI) * 140,
        s: Math.exp(lerp(Math.log(sFrom), Math.log(sTo), go)), rx: lerp(P.rx ?? 0, slot.rx ?? 0, go), ry: lerp(P.ry ?? 0, slot.ry ?? 0, go),
        rz: Math.sin(go * Math.PI) * 0.04, z: Math.sin(go * Math.PI) * 120,
      };
      const fop = 1 - prog(t, S.land - 0.1, S.land + 0.15);
      shadowUnder(bg, this.fly.corners(F), { alpha: 0.22 * fop, blur: 70, dy: 40 });
      planes.push(() => this.fly.render(renderer, this.target, F, fop));
    }
  }

  // ---------------------------------------------------------------- 14.4–18.6 the Board: the landing, the ripple, close on it
  boardPose(t: number): Pose {
    const enter = out4(prog(t, S.add + 0.4, S.add + 1.3));
    const leave = prog(t, S.turn, S.turn + 0.65, ease.inCubic);
    const z = inOut(prog(t, S.zoom, S.zoom + 1.6));
    const slot = this.L['wide-card-3']!;
    const sc = { x: slot.x + slot.w / 2 - 1440, y: slot.y + slot.h / 2 - 1020 };
    const wide: Pose = { x: 1295, y: lerp(1700, 560, enter), s: 0.42, rx: lerp(0.55, 0.05, enter), ry: -0.2 };
    const s2 = 0.8 + 0.02 * prog(t, S.zoom + 1.6, S.turn, inOut);
    const close: Pose = { x: 1290 - s2 * sc.x, y: 560 - s2 * sc.y, s: s2, rx: 0.03, ry: -0.08 };
    return {
      x: lerp(wide.x, close.x, z), y: lerp(wide.y, close.y, z) + leave * 900, s: Math.exp(lerp(Math.log(wide.s!), Math.log(close.s!), z)),
      rx: lerp(wide.rx!, close.rx!, z) + leave * 0.5, ry: lerp(wide.ry!, close.ry!, z), rz: 0,
    };
  }
  slotPose(t: number): Pose {
    const P = this.boardPose(t);
    const s = this.L['wide-card-3']!, wg = this.L['live-widget']!;
    const c = this.board.project(s.x + s.w / 2, s.y + s.h / 2, P);
    return { x: c.x, y: c.y, s: Math.min((s.w * P.s!) / wg.w, (s.h * P.s!) / wg.h), rx: P.rx, ry: P.ry, rz: P.rz };
  }
  shotBoard(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.add + 0.35 || t > S.turn + 0.7) return;
    const { renderer } = this.ctx;
    const P = this.boardPose(t);
    const op = clamp(prog(t, S.add + 0.35, S.add + 0.6)) * (1 - prog(t, S.turn + 0.3, S.turn + 0.65));
    const landed = prog(t, S.land - 0.1, S.land + 0.25);
    const r = this.L['wide-card-3']!;
    this.board.draw(landed > 0 ? `landed${Math.round(landed * 20)}` : 'empty', (c) => {
      this.window(c, this.img['board-wide-full']!, 2880, 2040);
      // the slot waits, empty, as the Board does while a widget is on its way
      c.fillStyle = '#EFEFEF';
      roundRect(c, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 30); c.fill();
      if (landed > 0) {
        c.save(); c.globalAlpha = landed;
        c.drawImage(this.img['board-wide-full']!, r.x - 4, r.y - 4, r.w + 8, r.h + 8, r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        c.restore();
      }
    });
    shadowUnder(bg, this.board.corners(P), { alpha: 0.16 * op, blur: 100, dy: 60 });
    planes.push(() => this.board.render(renderer, this.target, P, op));
    // the landing: the app's "just changed" glow, and two thin rings easing outward
    const k = t - S.land;
    if (k > -0.05 && k < 2.2) {
      after.push((c) => {
        const quad = (pad: number) => [
          this.board.project(r.x - pad, r.y - pad, P), this.board.project(r.x + r.w + pad, r.y - pad, P),
          this.board.project(r.x + r.w + pad, r.y + r.h + pad, P), this.board.project(r.x - pad, r.y + r.h + pad, P),
        ];
        const path = (q: { x: number; y: number }[], rad: number) => {
          c.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = q[i]!, b = q[(i + 1) % 4]!, n = q[(i + 2) % 4]!;
            const m1 = { x: lerp(a.x, b.x, 0.5), y: lerp(a.y, b.y, 0.5) };
            if (i === 0) c.moveTo(m1.x, m1.y);
            const m2 = { x: lerp(b.x, n.x, 0.5), y: lerp(b.y, n.y, 0.5) };
            c.arcTo(b.x, b.y, m2.x, m2.y, rad);
          }
          c.closePath();
        };
        const wash = Math.pow(1 - clamp(k / 1.8), 2);
        if (wash > 0) {
          c.save();
          c.globalCompositeOperation = 'multiply';
          c.fillStyle = `rgba(239,168,16,${0.16 * wash})`;
          path(quad(0), 14 * P.s! * 2); c.fill();
          c.restore();
        }
        for (const [i, d] of [0, 0.22].entries()) {
          const e = clamp((k - d) / 1.1);
          if (e <= 0 || e >= 1) continue;
          const pad = 6 + 70 * ease.outCubic(e);
          c.save();
          c.strokeStyle = `rgba(23,23,23,${(i ? 0.14 : 0.22) * (1 - e)})`;
          c.lineWidth = 2;
          path(quad(pad), (14 * 2 + pad) * P.s!); c.stroke();
          c.restore();
        }
      });
    }
  }

  // ---------------------------------------------------------------- 19.8–21.6 "Creative mode."
  shotCreative(t: number, after: ((c: CanvasRenderingContext2D) => void)[]) {
    const a = S.creative - 0.15, b = S.custom - 0.25;
    if (t < a || t > b + 0.3) return;
    after.push((c) => {
      const inn = out4(prog(t, a, a + 0.6));
      const outp = prog(t, b - 0.2, b + 0.2, ease.inCubic);
      c.save();
      c.globalAlpha = inn * (1 - outp);
      c.translate(W / 2, 590 - (1 - inn) * 40 - outp * 30);
      const s = 1 + 0.02 * prog(t, a, b);
      c.scale(s, s);
      setFont(c, 800, 176, -0.045);
      const label = 'Creative mode.';
      const tw = c.measureText(label).width;
      const icon = 150, gap = 40, total = icon + gap + tw;
      const x0 = -total / 2;
      // the gradient runs across the words (lime on the last ones), with a slow drift
      const shift = Math.sin((t - a) * 1.6) * 60;
      const g = c.createLinearGradient(x0 + icon + gap + shift, 0, x0 + total + shift, 0);
      g.addColorStop(0, CREATIVE[0]!); g.addColorStop(0.5, CREATIVE[1]!); g.addColorStop(0.92, CREATIVE[2]!);
      // the brush mark: a rounded tile in the app's diagonal gradient, a white brush
      const tile = c.createLinearGradient(x0, -icon * 0.82, x0 + icon, icon * 0.18);
      tile.addColorStop(0, CREATIVE[0]!); tile.addColorStop(0.5, CREATIVE[1]!); tile.addColorStop(1, CREATIVE[2]!);
      c.save();
      c.fillStyle = tile;
      c.shadowColor = 'rgba(224,79,154,0.55)'; c.shadowBlur = 50;
      roundRect(c, x0, -icon * 0.82, icon, icon, 34); c.fill();
      c.restore();
      this.brush(c, x0 + icon / 2, -icon * 0.82 + icon / 2, icon * 0.52);
      c.fillStyle = g;
      c.textAlign = 'left';
      c.fillText(label, x0 + icon + gap, 0);
      c.restore();
    });
  }
  /** Lucide's brush, white, centred at (cx, cy), `s` px. */
  brush(c: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
    c.save();
    c.translate(cx - s / 2, cy - s / 2);
    c.scale(s / 24, s / 24);
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke(new Path2D('m11 10 3 3'));
    c.stroke(new Path2D('M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z'));
    c.stroke(new Path2D('M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031'));
    c.restore();
  }

  // ---------------------------------------------------------------- 21.4–26.2 creative mode: the yes, the code, the sandbox
  shotCustom(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.custom - 0.2 || t > S.wow + 0.4) return;
    const { renderer } = this.ctx;
    const glowBack = (c: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${0.16 * a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    };
    // 1. the answer asking to switch to creative mode, and the yes
    const askIn = out4(prog(t, S.custom - 0.15, S.custom + 0.45));
    const askOut = prog(t, S.gate - 0.15, S.gate + 0.2, ease.inCubic);
    if (askIn > 0 && askOut < 1) {
      const P: Pose = { x: 640, y: 560 + (1 - askIn) * 300, s: 0.98, rx: 0.06 + (1 - askIn) * 0.4, ry: 0.16 - askOut * 0.4, z: -askOut * 400 };
      const op = clamp(askIn * 1.4) * (1 - askOut);
      glowBack(bg, 640, 560, 700, op);
      planes.push(() => this.ask.render(renderer, this.target, P, op));
      const y = this.L.yes!, crop = this.askCrop();
      const at = S.custom + 0.9;
      const press = clamp(1 - Math.abs(t - at) / 0.1);
      after.push((c) => {
        if (op <= 0) return;
        const yes = this.ask.project(y.x - crop.x + y.w / 2, y.y - crop.y + y.h / 2, P);
        const mv = out4(prog(t, at - 0.55, at - 0.05));
        pointer(c, lerp(1100, yes.x + 6, mv), lerp(980, yes.y + 6, mv), 1.5, press);
        clickRing(c, yes.x, yes.y, t - at, 'rgba(255,255,255,');
      });
    }
    // 2. the gate, then its code, then "Run in sandbox"
    const gIn = out4(prog(t, S.gate, S.gate + 0.5));
    const codeOn = inOut(prog(t, S.gate + 0.55, S.gate + 0.95)) * (1 - inOut(prog(t, S.run - 0.45, S.run - 0.2)));
    const gOut = prog(t, S.run + 0.3, S.wow, ease.inCubic);
    if (gIn > 0 && gOut < 1) {
      const P: Pose = { x: 640, y: 548 + (1 - gIn) * 240, s: 1.0, rx: 0.05 + (1 - gIn) * 0.3, ry: 0.18 - 0.06 * prog(t, S.gate, S.wow, inOut), z: 0 };
      const op = clamp(gIn * 1.5) * (1 - gOut);
      glowBack(bg, 640, 548, 760, op);
      const PC: Pose = { ...P, y: P.y - 20 * codeOn, s: 0.78 };
      planes.push(() => this.gate.render(renderer, this.target, P, op * (1 - codeOn)));
      planes.push(() => this.code.render(renderer, this.target, PC, op * codeOn));
      const run = this.L.run!, g = this.L['gate-card']!;
      const press = clamp(1 - Math.abs(t - S.run) / 0.1);
      after.push((c) => {
        if (op <= 0.02 || t > S.run + 0.6) return;
        const btn = this.gate.project(run.x - g.x + run.w * 0.5, run.y - g.y + run.h / 2, P);
        const mv = out4(prog(t, S.run - 0.5, S.run - 0.05));
        pointer(c, lerp(1150, btn.x + 4, mv), lerp(1000, btn.y + 6, mv), 1.5, press);
        clickRing(c, btn.x, btn.y, t - S.run, 'rgba(255,255,255,');
      });
    }
    // 3. the sandbox closes around it: a glass box of light
    const box = prog(t, S.run + 0.1, S.wow - 0.15, ease.outCubic);
    if (box > 0 && t < S.wow + 0.05) {
      after.push((c) => {
        const a = -0.5 + 0.55 * prog(t, S.run, S.wow, inOut);
        sandboxBox(c, 640, 548, 400, a, box, 0.6 + 0.4 * Math.sin(t * 9));
      });
    }
  }

  // ---------------------------------------------------------------- 26.0–30.0 the heatmap
  shotHeat(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[], after: ((c: CanvasRenderingContext2D) => void)[]) {
    if (t < S.wow - 0.1 || t > S.finale + 0.45) return;
    const { renderer } = this.ctx;
    const t0 = S.wow;
    const cellAt = (i: number) => t0 + 0.12 + i * 0.065;
    const sel = keys(t, [[t0 + 1.9, 0], [t0 + 2.05, 1, ease.inOutCubic], [t0 + 2.75, 1], [t0 + 2.92, 4, ease.inOutCubic]]);
    const month = t < t0 + 2.02 ? 0 : t < t0 + 2.85 ? 1 : 4;
    const rows = month === 0 ? clamp((t - (t0 + 0.9)) / 0.3) : month === 1 ? (t - (t0 + 2.05)) / 0.08 : (t - (t0 + 2.92)) / 0.08;
    const ph = {
      number: prog(t, t0 + 0.2, t0 + 1.2),
      cells: (i: number) => (t - cellAt(i)) / 0.3,
      glow: (i: number) => Math.pow(0.5, Math.max(0, t - cellAt(i) - 0.15) / 0.18) * (t >= cellAt(i) ? 1 : 0) * 0.9,
      sel,
      selOn: prog(t, t0 + 0.95, t0 + 1.25),
      rows: Math.max(0, rows),
      month,
    };
    this.heat.draw(`${Math.round((t - t0) * 60)}`, (c) => {
      const k = 1.62;
      const box = boardCard(c, 0, 0, 1000, 560, 'Mappa dei pagamenti', k);
      // creative mode's brush, beside the title
      c.save();
      const g = c.createLinearGradient(330, 0, 380, 0);
      g.addColorStop(0, CREATIVE[0]!); g.addColorStop(1, CREATIVE[2]!);
      c.fillStyle = g;
      c.beginPath(); c.arc(24 * k + 238 * k, 38 * k, 11 * k, 0, TAU); c.fill();
      c.restore();
      this.brush(c, 24 * k + 238 * k, 38 * k, 13 * k);
      heatmapWidget(c, box.x, box.y - 4, box.w, k, { ...ph, rows: Math.min(ph.rows, (MONTH_ROWS[month] ?? []).length) });
    });
    const intro = out4(prog(t, t0, t0 + 0.8));
    const leave = prog(t, S.finale - 0.1, S.finale + 0.4, ease.inCubic);
    const P: Pose = {
      x: 1040, y: 600 - leave * 80, s: lerp(0.65, 1.12, intro) * (1 - 0.35 * leave),
      rx: lerp(0.5, 0.1, intro) - 0.05 * prog(t, t0, S.finale, inOut), ry: lerp(-0.35, 0.16, prog(t, t0, S.finale, inOut)), rz: lerp(0.06, 0, intro), z: -leave * 300,
    };
    const op = clamp(prog(t, t0 - 0.02, t0 + 0.15)) * (1 - leave);
    const q = this.heat.corners(P);
    const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
    const g = bg.createRadialGradient(cx, cy, 0, cx, cy, 900);
    g.addColorStop(0, `rgba(139,79,224,${0.2 * op})`);
    g.addColorStop(0.35, `rgba(207,105,99,${0.12 * op})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    bg.fillStyle = g; bg.fillRect(0, 0, W, H);
    planes.push(() => this.heat.render(renderer, this.target, P, op));
    // the sandbox breaking into light that streams into the cells
    const burst = prog(t, t0 - 0.05, t0 + 0.95);
    if (burst > 0 && burst < 1) {
      after.push((c) => {
        const k = 1.62, gap = 7 * k, w = 1000 - 48 * k, cw = (w - gap * 11) / 12;
        c.save();
        c.globalCompositeOperation = 'lighter';
        for (const p of this.parts) {
          const i = Math.floor(p.u * 12);
          const local = clamp((t - (cellAt(i) - 0.35)) / 0.4);
          if (local <= 0 || local >= 1) continue;
          const tgt = this.heat.project(24 * k + i * (cw + gap) + cw * (0.2 + 0.6 * p.v), 74 * k + 54 * k + cw * (0.2 + 0.6 * p.seed), P);
          const ang = p.seed * TAU, rad = 380 + 260 * p.v;
          const sx = 640 + Math.cos(ang) * rad * 0.9, sy = 548 + Math.sin(ang) * rad * 0.6;
          const e = ease.inOutCubic(local);
          const x = lerp(sx, tgt.x, e) + Math.sin(local * Math.PI) * 80 * (p.v - 0.5);
          const y = lerp(sy, tgt.y, e) - Math.sin(local * Math.PI) * 120 * p.u;
          const a = Math.sin(local * Math.PI);
          const col = p.seed < 0.33 ? '180,140,255' : p.seed < 0.66 ? '255,150,200' : '210,255,150';
          c.fillStyle = `rgba(${col},${0.85 * a})`;
          c.beginPath(); c.arc(x, y, 2 + 2.5 * p.seed, 0, TAU); c.fill();
        }
        c.restore();
      });
    }
    // the pointer picks November, then February
    after.push((c) => {
      if (t < t0 + 1.4 || t > S.finale - 0.15) return;
      const k = 1.62, gap = 7 * k, w = 1000 - 48 * k, cw = (w - gap * 11) / 12;
      const cell = (i: number) => this.heat.project(24 * k + i * (cw + gap) + cw * 0.55, 74 * k + 54 * k + cw * 0.6, P);
      const a = cell(1), b = cell(4);
      const m1 = out4(prog(t, t0 + 1.45, t0 + 1.95)), m2 = inOut(prog(t, t0 + 2.3, t0 + 2.8));
      const x = lerp(lerp(1500, a.x, m1), b.x, m2), y = lerp(lerp(1000, a.y, m1), b.y, m2);
      const press = clamp(1 - Math.abs(t - (t0 + 2.0)) / 0.1) + clamp(1 - Math.abs(t - (t0 + 2.85)) / 0.1);
      pointer(c, x + 4, y + 6, 1.5, press);
      clickRing(c, a.x, a.y, t - (t0 + 2.0), 'rgba(255,255,255,');
      clickRing(c, b.x, b.y, t - (t0 + 2.85), 'rgba(255,255,255,');
    });
  }

  // ---------------------------------------------------------------- 29.6–32.6 the finale: the Board assembles
  shotFinale(t: number, bg: CanvasRenderingContext2D, planes: (() => void)[]) {
    if (t < S.finale - 0.05 || t > S.end + 0.6) return;
    const { renderer } = this.ctx;
    const t0 = S.finale;
    const enter = out4(prog(t, t0, t0 + 1.0));
    const dolly = inOut(prog(t, t0, S.end));
    const leave = prog(t, S.end - 0.05, S.end + 0.45, ease.inCubic);
    const P: Pose = {
      x: lerp(1300, 1265, dolly), y: lerp(1320, 740, enter) - 40 * dolly + leave * 300, s: lerp(0.36, 0.4, dolly) * (1 + 0.15 * leave),
      rx: lerp(0.95, 0.5, enter) - 0.06 * dolly, ry: -0.32 + 0.1 * dolly, rz: 0.12 - 0.04 * dolly,
    };
    const op = clamp(prog(t, t0, t0 + 0.3)) * (1 - leave);
    shadowUnder(bg, this.final.corners(P), { alpha: 0.14 * op, blur: 120, dy: 70 });
    this.final.draw('final-empty', (c) => {
      this.window(c, this.img['board-wide-full']!, 2880, 2760, true);
      for (let i = 0; i < 5; i++) {
        const r = this.L[`wide-card-${i}`]!;
        c.fillStyle = '#EFEFEF';
        roundRect(c, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 30); c.fill();
      }
    });
    planes.push(() => this.final.render(renderer, this.target, P, op));
    for (let i = 0; i < 5; i++) {
      const r = this.L[`wide-card-${i}`]!;
      const ti = t0 + 0.3 + i * 0.2;
      const d = clamp((t - ti) / 0.65);
      if (d <= 0) continue;
      const e = ease.outBack(d, 1.1);
      const lift = (1 - e) * 1400;
      const off = { x: (1 - e) * (hash(i * 7.3) - 0.5) * 600, y: (1 - e) * (hash(i * 3.1) - 0.5) * 500 };
      const card = this.cards[i]!;
      planes.push(() => this.renderChild(card, this.final, P, r.x + r.w / 2 + off.x, r.y + r.h / 2 + off.y, lift, op * clamp(d * 3)));
    }
  }

  /** Draw `child` on `parent`'s plane at layer point (u, v) of the parent, lifted `z` towards the camera. */
  renderChild(child: Card3D, parent: Card3D, P: Pose, u: number, v: number, z: number, opacity: number) {
    if (opacity <= 0.001) return;
    const { renderer } = this.ctx;
    parent.project(0, 0, P);
    const m = new THREE.Matrix4().makeTranslation(u - parent.w / 2, parent.h / 2 - v, z);
    child.mesh.matrixAutoUpdate = false;
    child.mesh.matrixWorld.multiplyMatrices(parent.mesh.matrixWorld, m);
    child.mesh.matrix.copy(child.mesh.matrixWorld);
    child.mat.opacity = opacity;
    child.sync();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    renderer.render(child.scene, parent.cam);
    renderer.autoClear = ac;
  }

  // ---------------------------------------------------------------- 32.0–34.0 the end card
  endCard(t: number, c: CanvasRenderingContext2D) {
    if (t < S.end) return;
    const k = t - S.end;
    const e = out4(clamp(k / 0.7));
    c.save();
    c.globalAlpha = clamp(k / 0.25);
    drawStudio(c, { drift: t * 0.25 });
    c.restore();
    const s = 1 + 0.03 * (1 - e) + 0.012 * k;
    c.save();
    c.translate(W / 2, H / 2 - 30);
    c.scale(s, s);
    c.globalAlpha = e;
    drawIcon(c, 0, -130, 120, { shadow: 1 });
    setFont(c, 700, 110, -0.045);
    c.fillStyle = T.fg; c.textAlign = 'center';
    c.fillText('autocratico', 0, 44);
    c.globalAlpha = clamp((k - 0.3) / 0.5);
    text(c, 'Provalo ora su demo.autocratico.it', 0, 128, 40, { weight: 500, color: T.muted, align: 'center' });
    c.restore();
  }
}
