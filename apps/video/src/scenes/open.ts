// Plate 1 — `open`, the summons (0 – 10.72 s, intro: synths, no kit).
// One continuous dive from orbit onto the Palazzo delle Finanze in Rome (Sentinel-2 levels, graded
// grey), a log-scale camera that surges after each shout. Each shout slams a red stamp on the lens
// and the next dive punches through it:
//   «Raccomandata!» 0.11 over the globe · «PEC!» 4.04 over Italy · «F24!» 5.27 over Rome
//   «Scadenza!» 7.23 — hard cut onto the palace's facade (photo cut-out on the studio grey), the
//   biggest stamp, cropped and held while paper rains onto the palace and buries it; the last
//   half-beat pushes in.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H, SAFE, VERTICAL } from '../engine/gl';
import { F, font } from '../engine/type';
import { clamp, ease, hash, keys, lerp, mulberry32, smoothstep } from '../engine/util';
import { drawStamp, drawStudio, loadImage, stampSize } from './_motifs';
import {
  type Sprite, calendarPage, camera, drawSprite, envelopeGreen, envelopeWhite, f24, letter, note, pecRow, photoSprite, shakeAt,
} from './open-paper';

const LEVELS = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 8, 9, 10, 11, 12, 13, 14, 15];
// Upright (9:16) the dive centres a little above the frame's middle, inside SAFE, and the levels are
// drawn a hair larger so the square images still cover every corner from there under roll.
const V = VERTICAL;
const CX = V ? 540 : W / 2, CY = V ? 880 : H / 2;
const K = V ? 1.16 : 1.12; // screen px per image px at an exact level (covers the frame's diagonal under roll)
/** Upright: the stamp size whose letters span `w` px (the border bleeds a little past them). */
const fitStamp = (text: string, w: number) => Math.round((w / (stampSize(text, 100).w - 84)) * 100);
const lvlPath = (z: number, grey = true) => `ref/earth/zoom-z${z.toFixed(1).padStart(4, '0')}${grey ? '-grey' : ''}.jpg`;

interface Drop { s: Sprite; t: number; x: number; y: number; rot: number; scale: number; sway: number; spin: number }

export default class Open extends Scene {
  layer = new Layer2D();
  scratch = new Layer2D();
  lv: ImageBitmap[] = [];
  color3!: ImageBitmap;
  facade!: Sprite;
  drops: Drop[] = [];
  tR = 0.11; tPEC = 4.04; tF24 = 5.27; tSC = 7.23;
  zk: [number, number][] = [];
  /** The dive's stamps: text, hit time, x, y, size, angle. */
  st: [string, number, number, number, number, number][] = [];
  scSize = 335;

  override async init() {
    const ly = this.ctx.lyrics;
    this.tR = ly.get('Raccomandata').words[0]!.start;
    this.tPEC = ly.get('PEC!').words[0]!.start;
    this.tF24 = ly.get('F24').words[0]!.start;
    this.tSC = ly.get('Scadenza').words[0]!.start;
    const { tR, tPEC, tF24, tSC } = this;
    // the dive: slow over the globe while «Raccomandata» is shouted, then a surge after each shout
    this.zk = V
      // upright the globe starts closer, filling the width: the hook's first frame is the planet
      ? [[tR - 0.06, 3.36], [tR, 3.42], [tR + 1.6, 3.95], [tPEC - 0.9, 5.6], [tPEC, 7.0], [tPEC + 0.5, 7.9],
        [tF24, 10.2], [tF24 + 1.26, 12.4], [tSC, 15.9]]
      : [[tR - 0.06, 2.92], [tR, 3.0], [tR + 1.6, 3.7], [tPEC - 0.9, 5.6], [tPEC, 7.0], [tPEC + 0.5, 7.9],
        [tF24, 10.2], [tF24 + 1.26, 12.4], [tSC, 15.9]];
    // upright: each stamp's letters as wide as the safe box allows, stacked down the frame as we dive
    const sw = SAFE.right - SAFE.left;
    this.st = V
      ? [['RACCOMANDATA!', tR, 490, 650, fitStamp('RACCOMANDATA!', sw * 0.95), -0.07],
        ['PEC!', tPEC, 500, 600, fitStamp('PEC!', 600), 0.08],
        ['F24!', tF24, 470, 1050, fitStamp('F24!', 640), -0.1]]
      : [['RACCOMANDATA!', tR, 960, 560, 150, -0.07],
        ['PEC!', tPEC, 1130, 600, 250, 0.08],
        ['F24!', tF24, 800, 500, 270, -0.1]];
    // «Scadenza!» is the biggest stamp: upright too its letters run nearly edge to edge and the frame
    // crops its border, as in the wide cut
    this.scSize = V ? fitStamp('SCADENZA!', 960) : 335;
    const imgs = await Promise.all([
      ...LEVELS.map((z) => loadImage(lvlPath(z))),
      loadImage(lvlPath(3, false)),
      loadImage('ref/palazzo-finanze-front-cut-grey.png'),
      loadImage('ref/libro-mastro-cut-grey.png'),
      loadImage('ref/pila-pratiche-b-cut-grey.png'),
      loadImage('ref/marca-da-bollo-cut-grey.png'),
      loadImage('ref/marca-da-bollo-blocco-cut-grey.png'),
      loadImage('ref/timbro-datario-cut-grey.png'),
      loadImage('ref/macchina-da-scrivere-cut-grey.png'),
    ]);
    this.lv = imgs.slice(0, LEVELS.length);
    const rest = imgs.slice(LEVELS.length);
    this.color3 = rest[0]!;
    // upright the palace is drawn bigger: its centre (the pediment, two bays of windows) fills the width
    this.facade = photoSprite(rest[1]!, V ? 2500 : 1800, { contrast: 1.05 });
    const [mastro, pila, bollo, blocco, datario, olivetti] = rest.slice(2);

    // the rain on «Scadenza!»: the papers named by the shouts, forms, notes, and real props
    const kinds: (() => [Sprite, number])[] = [
      () => [envelopeGreen(3), 0.4],
      () => [letter(11, { title: 'Avviso di accertamento IMU 2022' }), 0.42],
      () => [photoSprite(bollo!, 150), 1],
      () => [pecRow(), 0.36],
      () => [note('16/10', 21, { circled: true }), 0.62],
      () => [f24(), 0.4],
      () => [photoSprite(mastro!, 330), 1],
      () => [letter(12, { title: 'Avviso di pagamento TARI 2026', qr: true }), 0.42],
      () => [calendarPage(31, 'ottobre', 'sabato', 4, true), 0.62],
      () => [photoSprite(datario!, 170), 1],
      () => [envelopeWhite(5), 0.46],
      () => [photoSprite(blocco!, 210), 1],
      () => [letter(13, { head: 'REGIONE', sub: 'Tasse automobilistiche', title: 'Avviso bonario — bollo auto' }), 0.42],
      () => [photoSprite(pila!, 150), 1],
      () => [note('entro il 30', 22, { sub: 'novembre!' }), 0.62],
      () => [photoSprite(mastro!, 300), 1],
      () => [calendarPage(16, 'dicembre', 'mercoledì', 5, true), 0.62],
      () => [photoSprite(olivetti!, 380), 1],
      () => [letter(14, { head: 'TRIBUNALE DI ESEMPIO', sub: 'Ufficio Notifiche', title: 'Notifica atto' }), 0.42],
    ];
    const made = kinds.map((k) => k());
    const r = mulberry32(77);
    const N = 46, a = tSC + 0.22, b = this.ctx.end - 0.04;
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1);
      const [s, scale] = made[k % made.length]!;
      // upright the heap climbs higher up the taller frame, over its narrower width
      const heap = V ? 110 + 1080 * Math.pow(u, 0.85) : 90 + 640 * Math.pow(u, 0.85);
      this.drops.push({
        s, scale: scale * (0.9 + r() * 0.2) * (V ? 1.12 : 1), t: a + (b - a) * Math.pow(u, 0.72),
        x: V ? -40 + r() * 1160 : -60 + r() * 2040, y: H + 60 - heap * (0.65 + r() * 0.35),
        rot: (r() - 0.5) * 0.9, sway: (r() - 0.5) * 120, spin: (r() - 0.5) * 3,
      });
    }
  }

  /** Zoom level z at time t (monotone cubic through the keys). */
  zoomAt(t: number) {
    const ks = this.zk;
    if (t <= ks[0]![0]) return ks[0]![1];
    if (t >= ks[ks.length - 1]![0]) return ks[ks.length - 1]![1];
    const n = ks.length;
    const d: number[] = [], m: number[] = [];
    for (let i = 0; i < n - 1; i++) d.push((ks[i + 1]![1] - ks[i]![1]) / (ks[i + 1]![0] - ks[i]![0]));
    m.push(d[0]!);
    for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (2 * d[i - 1]! * d[i]!) / (d[i - 1]! + d[i]!));
    m.push(d[n - 2]!);
    let i = 0;
    while (t > ks[i + 1]![0]) i++;
    const [t0, z0] = ks[i]!, [t1, z1] = ks[i + 1]!;
    const h = t1 - t0, s = (t - t0) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * z0 + h10 * h * m[i]! + h01 * z1 + h11 * h * m[i + 1]!;
  }

  drawEarth(c: CanvasRenderingContext2D, t: number, z: number, roll: number) {
    let i = 0;
    while (i < LEVELS.length - 1 && LEVELS[i + 1]! <= z) i++;
    const lo = LEVELS[i]!, hi = LEVELS[i + 1];
    const put = (cc: CanvasRenderingContext2D, img: CanvasImageSource, lvl: number, alpha = 1) => {
      const S = 2048 * K * Math.pow(2, z - lvl);
      cc.save();
      cc.globalAlpha = alpha;
      cc.translate(CX, CY);
      cc.rotate(roll);
      cc.drawImage(img, -S / 2, -S / 2, S, S);
      cc.restore();
    };
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    put(c, this.lv[i]!, lo);
    // a little real colour at the first frames, draining away
    const col = (1 - smoothstep(this.tR + 0.2, this.tR + 1.6, t)) * 0.85;
    if (lo === 3 && col > 0.01) put(c, this.color3, 3, col * (hi ? 1 - (z - lo) / (hi - lo) : 1));
    if (hi === undefined) return;
    const u = (z - lo) / (hi - lo);
    if (hi <= 6) {
      // the globe's edge doesn't scale ×2 between levels: a quick plain crossfade
      put(c, this.lv[i + 1]!, hi, smoothstep(0.25, 0.75, u));
      return;
    }
    // the finer level in the middle, feathered, over the coarser one
    const sc = this.scratch.ctx;
    this.scratch.clear();
    put(sc, this.lv[i + 1]!, hi);
    const R = (2048 * K * Math.pow(2, z - hi)) / 2;
    sc.save();
    sc.globalCompositeOperation = 'destination-in';
    const g = sc.createRadialGradient(CX, CY, R * 0.55, CX, CY, R * 0.98);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = g; sc.fillRect(0, 0, W, H);
    sc.restore();
    c.save();
    c.globalAlpha = smoothstep(0, 0.35, u);
    c.drawImage(this.scratch.canvas, 0, 0, W, H);
    c.restore();
  }

  hud(c: CanvasRenderingContext2D, t: number, z: number) {
    const { tPEC, tF24 } = this;
    const a = smoothstep(this.tR, this.tR + 0.3, t);
    c.save();
    c.globalAlpha = a * 0.92;
    c.fillStyle = '#e6e6e6';
    // upright: inside SAFE (under the platform's header, above its caption) and phone-sized
    const hx = V ? SAFE.left + 8 : 96;
    c.font = font(F.mono(500), V ? 32 : 22);
    c.letterSpacing = V ? '3px' : '2px';
    const place = t < tPEC ? 'TERRA' : t < tF24 ? 'ITALIA' : 'ROMA · VIA XX SETTEMBRE';
    c.fillText(place, hx, V ? SAFE.top + 56 : 112);
    c.font = font(F.mono(400), V ? 30 : 20);
    c.letterSpacing = V ? '1px' : '0.5px';
    c.fillStyle = '#bdbdbd';
    c.fillText('41,9062° N   12,4976° E', hx, V ? SAFE.bottom - 66 : H - 128);
    const km = 25829.5 * Math.pow(2, -(z - 3));
    const alt = km >= 10 ? `${Math.round(km).toLocaleString('it-IT')} km` : km >= 1 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km * 1000)} m`;
    c.fillText(`ALT ${alt}`, hx, V ? SAFE.bottom - 24 : H - 96);
    // the target: four corner brackets closing in on the centre
    const s = lerp(150, 70, (z - 3) / 13) * (V ? 1.2 : 1);
    const L = V ? 26 : 22, x0 = CX - s / 2, y0 = CY - s / 2;
    c.strokeStyle = 'rgba(235,235,235,0.75)'; c.lineWidth = 2;
    c.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x0 + s, y0, -1, 1], [x0, y0 + s, 1, -1], [x0 + s, y0 + s, -1, -1]] as [number, number, number, number][]) {
      c.moveTo(x + dx * L, y); c.lineTo(x, y); c.lineTo(x, y + dy * L);
    }
    c.stroke();
    c.restore();
  }

  render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const t = f.t;
    const c = this.layer.ctx;
    this.layer.clear();
    const { tR, tPEC, tF24, tSC } = this;
    const end = this.ctx.end;
    const fr = Math.round(t * 60);
    let shake = 0;
    const sh: [number, number] = [0, 0];

    // frame 0 is black: the summons arrives out of nothing
    if (t < tR - 0.06) {
      c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
      this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
      return { paper: 0, grain: 0.05, vignette: 0.3 };
    }

    if (t < tSC) {
      // ------------------------------------------------ the dive
      const z = this.zoomAt(t);
      const roll = lerp(-0.22, 0.0, ease.inOutQuad(clamp((t - tR) / (tSC - tR))));
      this.drawEarth(c, t, z, roll);
      this.hud(c, t, z);
      // stamps on the lens; the next dive punches through each one
      const st = this.st;
      st.forEach(([s, th, x, y, size, ang], i) => {
        const next = i + 1 < st.length ? st[i + 1]![1] : tSC;
        // the dive punches through it just before the next shout
        const tFly = next - 0.36;
        if (t < th - 0.07 || t > tFly + 0.2) return;
        const fly = clamp((t - tFly) / 0.2);
        const grow = 1 + 0.06 * Math.max(0, t - th) + 3.5 * fly * fly;
        c.save();
        c.translate(x, y); c.scale(grow, grow); c.translate(-x, -y);
        c.globalAlpha = 1 - fly;
        shake = Math.max(shake, drawStamp(c, s, x, y, size, t - th + 0.07, { seed: 11 + i, angle: ang }));
        c.restore();
      });
    } else {
      // ------------------------------------------------ the palace, buried in paper
      drawStudio(c, { drift: t * 0.12 });
      const u = clamp((t - tSC) / (end - tSC));
      const k = t - tSC;
      const slam = 1 + 0.12 * Math.exp(-Math.max(0, k) * 14);
      c.save();
      if (V) camera(c, 492, 820, lerp(1.0, 1.07, ease.outQuad(u)) * slam, lerp(0.012, 0, u), 492 - W / 2, 820 - H / 2);
      else camera(c, 960, 560, lerp(1.0, 1.07, ease.outQuad(u)) * slam, lerp(0.012, 0, u));
      const fh = this.facade.h;
      drawSprite(c, this.facade, { x: V ? 540 : 960, y: H + 30 - fh / 2, shadow: 0.6 });
      for (const d of this.drops) {
        const fall = 0.42;
        const p = (t - (d.t - fall)) / fall;
        if (p < 0) continue;
        const e = ease.inQuad(clamp(p));
        const lift = 1 - e;
        const x = d.x + Math.sin(d.spin * 3 + p * 5) * d.sway * lift;
        const y = lerp(-420, d.y, e);
        const kk = t - d.t;
        const bounce = kk > 0 ? Math.exp(-kk * 18) * Math.sin(kk * 40) * 0.015 : 0;
        drawSprite(c, d.s, { x, y, rot: d.rot + d.spin * lift * 0.6, scale: d.scale * (1 + lift * 0.25 + bounce), lift: lift * 0.8 });
        if (kk >= 0 && kk < 0.15 && d.scale > 0.5) { const s2 = shakeAt(t, d.t, 4, 22, Math.round(d.t * 100)); sh[0] += s2[0]; sh[1] += s2[1]; }
      }
      c.restore();
      shake = Math.max(shake, drawStamp(c, 'SCADENZA!', V ? 540 : 960, V ? 780 : 470, this.scSize, t - tSC + 0.07, { seed: 14, angle: -0.06 }) * 1.6);
    }

    // the last half-beat before the cut pushes in
    const au = this.ctx.audio;
    const tPush = au.timeOfBeat(Math.round(au.beatAt(end)) - 0.5);
    const push = keys(t, [[tPush, 1], [end, V ? 1.2 : 1.32, ease.inCubic]]);

    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    const light = t >= tSC;
    return {
      paper: light ? 1 : 0, grain: light ? 0.035 : 0.05, vignette: light ? 0.18 : 0.3,
      shake: [(hash(fr, 3) - 0.5) * shake * 2 + sh[0], (hash(fr, 5) - 0.5) * shake * 2 + sh[1]],
      zoom: push,
    };
  }
}
