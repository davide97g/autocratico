// 7. hero — "Il futuro è automatico, autocratico!" (chorus c, second time).
// The dark "Prossimo adempimento" card of the Panoramica, rebuilt as vectors and shot big: the chrome
// orb floats, "6 ott · Bollo auto · tra 3 gg" with the Urgente chip (it ticks on the downbeat). A slow
// push, then on the end of "automatico" a pull back lands the card into its slot of the full
// Panoramica in the browser, beside the phone; "autocratico!" lands as the frame settles.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { HEX } from '../engine/palette';
import { F, font } from '../engine/type';
import { clamp, ease, lerp, prog, springStep, TAU } from '../engine/util';
const inOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
import { app, drawBrowser, drawOrb, drawPhone, drawStudio, roundRect } from './_motifs';
import { capture, blurredCapture, icon, bars, riseWord, textW } from './inbox-kit';
import type { Word } from '../engine/lyrics';

// the wide shot (screen px)
const BX = 330, BY = 96, BW = 990;
const BK = BW / 1440;
const BAR = 52 * BK;
// the card in the capture (1440-wide CSS px)
const CARD = { x: 1051, y: 128, w: 341, h: 497 };
const PHONE = { x: 1530, y: 540, h: 740 };

export default class Hero extends Scene {
  layer = new Layer2D();
  desk!: ImageBitmap;
  deskSoft!: ImageBitmap;
  phone!: ImageBitmap;
  w: Word[] = [];

  override async init() {
    [this.desk, this.deskSoft, this.phone] = await Promise.all([
      capture(app('desktop', 'overview')), blurredCapture(app('desktop', 'overview'), 5, 1440), capture(app('phone', 'overview')),
    ]);
    this.w = this.ctx.lyrics.get('Il futuro è automatico', 1).words;
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp, audio } = this.ctx;
    const t = f.t, t0 = this.ctx.start;
    const c = this.layer.ctx;
    this.layer.clear();
    const [wIl, wFut, wE, wAuto, wCrat] = this.w as [Word, Word, Word, Word, Word];

    // ---- camera: close on the card, a slow push, then the pull back
    const db = audio.downbeats.find((d) => d > t0 + 0.2)!; // 52.40
    const u = prog(t, db + 0.12, wCrat.start + 0.24, ease.inOutCubic);
    const land = springStep(t - (wCrat.start + 0.18), 1.6, 0.5);
    const cardW = { x: BX + CARD.x * BK, y: BY + BAR + CARD.y * BK, w: CARD.w * BK, h: CARD.h * BK };
    const Pc = { x: cardW.x + cardW.w / 2, y: cardW.y + cardW.h / 2 };
    const Zc = (860 / cardW.h) * (0.93 + 0.13 * prog(t, t0, db + 0.4, inOutSine));
    const Zw = 1 + 0.012 * Math.max(0, t - (wCrat.start + 0.2)) - 0.004 * (land - 1);
    const Z = Math.exp(lerp(Math.log(Zc), Math.log(Zw), u));
    // mid-pull the frame rides up so the window's bottom edge passes above the caption
    const S = { x: lerp(1255, Pc.x, ease.inOutCubic(u)), y: lerp(498, Pc.y, ease.inOutCubic(u)) - 190 * Math.sin(Math.PI * Math.pow(u, 0.8)) };
    const rz = 0.022 * (1 - springStep(t - t0, 0.9, 0.55)) + 0.01 * (1 - springStep(t - db, 1.4, 0.5)) * (1 - u);
    const toScreen = (x: number, y: number) => ({ x: S.x + Z * (x - Pc.x), y: S.y + Z * (y - Pc.y) });
    const setCam = (extraX = 0, extraY = 0) => {
      c.setTransform(Z, 0, 0, Z, S.x - Z * Pc.x + extraX, S.y - Z * Pc.y + extraY);
    };

    // ---- the studio, the browser (soft at close range), the phone
    drawStudio(c, { drift: t * 0.3 });
    c.save();
    setCam();
    drawBrowser(c, this.desk, BX, BY, BW, { shadow: 1 });
    const soft = clamp(1 - u * 1.4);
    if (soft > 0) {
      c.save();
      c.globalAlpha = soft;
      roundRect(c, BX, BY + BAR, BW, 900 * BK, 0); c.clip();
      c.drawImage(this.deskSoft, BX, BY + BAR, BW, 900 * BK);
      c.fillStyle = 'rgba(230,230,230,0.25)';
      c.fillRect(BX, BY + BAR, BW, 900 * BK);
      c.restore();
    }
    c.restore();
    // the phone floats nearer the camera: more parallax
    c.save();
    const par = (1 - ease.outCubic(u)) * 1;
    setCam(par * 380, par * 160);
    drawPhone(c, this.phone, PHONE.x, PHONE.y, PHONE.h, { shadow: 1 });
    c.restore();

    // ---- the card, lifted while close, landing in its slot
    const lift = 1 - ease.outCubic(u);
    c.save();
    setCam();
    c.translate(Pc.x, Pc.y);
    c.rotate(rz);
    c.scale(1 + 0.035 * lift, 1 + 0.035 * lift);
    c.translate(-Pc.x, -Pc.y);
    c.translate(cardW.x, cardW.y);
    c.scale(BK, BK);
    this.card(c, t, lift, db);
    c.restore();
    void toScreen;

    // ---- the line, bottom left, on a soft fall of studio grey (the UI recedes behind it)
    c.save();
    c.globalAlpha = 1 - prog(t, wCrat.start + 0.05, wCrat.start + 0.4, ease.inOutQuad);
    const sg = c.createRadialGradient(420, 1080, 60, 420, 1080, 640);
    sg.addColorStop(0, 'rgba(230,230,230,0.92)'); sg.addColorStop(0.55, 'rgba(230,230,230,0.6)'); sg.addColorStop(1, 'rgba(230,230,230,0)');
    c.fillStyle = sg;
    c.fillRect(0, 300, 1300, 780);
    c.restore();
    const X = 150;
    const rp = (wd: Word, d = 0.2) => prog(t, wd.start - 0.05, wd.start + d);
    const sS = 52, sB = 128;
    let x = X + 2;
    const sp = textW(c, ' ', sS, 500, -0.02);
    x += riseWord(c, 'Il', x, 868, sS, rp(wIl), { weight: 500, color: HEX.graphite, tracking: -0.02 }) + sp;
    x += riseWord(c, 'futuro', x, 868, sS, rp(wFut), { weight: 500, color: HEX.graphite, tracking: -0.02 }) + sp;
    x += riseWord(c, 'è', x, 868, sS, rp(wE, 0.1), { weight: 500, color: HEX.graphite, tracking: -0.02 }) + sp;
    // "automatico," big while sung, then it joins the small line and "autocratico!" takes its place
    const mv = prog(t, wCrat.start - 0.1, wCrat.start + 0.12, ease.inOutCubic);
    if (mv < 1) {
      c.save();
      c.globalAlpha = 1 - mv;
      riseWord(c, 'automatico,', X, lerp(1000, 940, mv), sB, rp(wAuto, 0.24));
      c.restore();
    }
    if (mv > 0) riseWord(c, 'automatico,', x, 868, sS, mv, { weight: 500, color: HEX.graphite, tracking: -0.02 });
    const hit = t - wCrat.start;
    if (hit > -0.06) {
      const p = prog(t, wCrat.start - 0.06, wCrat.start + 0.14, ease.outCubic);
      c.save();
      const s = 1 + 0.06 * (1 - p);
      c.translate(X, 1000);
      c.scale(s, s);
      riseWord(c, 'autocratico!', 0, 0, sB, p);
      c.restore();
    }

    comp.draw(renderer, this.layer.upload(), out, { mode: 'replace' });
    return { paper: 1, grain: 0.03, vignette: 0.15, halation: 0 };
  }

  /** The "Prossimo adempimento" card (apps/web overview, dark), in CSS px of a 1440-wide window. */
  private card(c: CanvasRenderingContext2D, t: number, lift: number, db: number) {
    const { w, h } = CARD;
    c.save();
    if (lift > 0) {
      c.shadowColor = `rgba(0,0,0,${0.45 * lift})`;
      c.shadowBlur = 40 * lift * 2.3; c.shadowOffsetY = 26 * lift * 2.3;
    }
    c.fillStyle = '#0a0a0a';
    roundRect(c, -0.6, -0.6, w + 1.2, h + 1.2, 14); c.fill();
    c.restore();
    c.save();
    roundRect(c, 0, 0, w, h, 14); c.clip();
    // the orb's soft halo, then the orb
    const g = c.createRadialGradient(170, 150, 20, 170, 150, 165);
    g.addColorStop(0, 'rgba(40,40,40,0.55)'); g.addColorStop(1, 'rgba(20,20,20,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    drawOrb(c, 170, 134, 72, t - 47);
    c.restore();
    // header
    icon(c, 'arrow', 24, 27.5, 16, '#fafafa', 2);
    c.fillStyle = '#fafafa';
    c.font = font(F.sans(500), 16);
    c.fillText('Prossimo adempimento', 48, 40.5);
    // Urgente chip (dark theme: urgent at 20% on the card); its dot ticks on the downbeat
    const k = t - db;
    const tick = k < 0 ? 0 : Math.exp(-k * 7);
    c.save();
    c.font = font(F.sans(500), 12);
    const lw = c.measureText('Urgente').width;
    const cw = lw + 16 + 10, cx = w - 24 - cw;
    c.fillStyle = tick > 0 ? `rgb(${39 + 30 * tick},${24 + 10 * tick},${16})` : '#271810';
    roundRect(c, cx, 26, cw, 20, 8); c.fill();
    c.fillStyle = '#f97c3d';
    c.beginPath(); c.arc(cx + 11, 36, 3 * (1 + 0.6 * tick), 0, TAU); c.fill();
    c.fillText('Urgente', cx + 18, 40.3);
    c.restore();
    // the date and the deadline
    c.fillStyle = '#fafafa';
    c.font = font(F.sans(500), 48);
    c.letterSpacing = '-1.2px';
    c.fillText('6 ott', 23, 370.5);
    c.letterSpacing = '0px';
    c.font = font(F.sans(600), 17);
    c.fillText('Bollo auto', 24, 398.5);
    c.fillStyle = '#a1a1a1';
    c.font = font(F.sans(400), 14);
    const meta = 'tra 3 gg · Veicoli';
    c.fillText(meta, 24, 421.5);
    bars(c, 24 + c.measureText(meta).width + 9, 421.5, 1, 4, '#a1a1a1', '#3a3a3a');
    // Segna fatto
    c.fillStyle = '#e5e5e5';
    roundRect(c, 25, 446, 104, 26, 6); c.fill();
    icon(c, 'check', 33, 452, 14, '#171717', 2);
    c.fillStyle = '#171717';
    c.font = font(F.sans(500), 13);
    c.fillText('Segna fatto', 50, 463.5);
  }
}
