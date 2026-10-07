#!/usr/bin/env bun
// The upright film and its short cuts for Reels and Shorts, rendered by render.ts (--vertical, with Bollo).
// A short cut is a stretch of the film, then the closing line and the end card ("Il futuro è
// automatico." → icon, wordmark, line), joined with a short audio crossfade.
//
//   bun scripts/shorts.ts film                 (the whole upright film -> var/video/autocratico-vertical.mp4)
//   bun scripts/shorts.ts [follia|esempi|all] [--samples auto] [--shutter 0.2] [--scale 1] [--preset slow]
//   bun scripts/shorts.ts share FILE...        (re-encode for upload: smaller, 30 Mbit/s cap, AAC 48 kHz)
//
// Long upright renders can outlive the headless browser (it has crashed after ~15 minutes), so every
// range is rendered in chunks of --chunk seconds (default 10), each in a fresh browser, kept on disk
// (a rerun skips the chunks already there), joined without re-encoding, and the song muxed once.
//
// The end card starts on the same beat phase the stretch ends on, so the groove carries over the cut.
import path from 'node:path';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1]! : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const OUT = path.resolve(APP, '../../var/video/shorts');
const FPS = 60;
const audio: { beats: number[]; duration: number } = await Bun.file(path.join(APP, 'data/audio.json')).json();

/** Continuous beat index at t (linear between tracked beats). */
function beatAt(t: number) {
  const b = audio.beats;
  let i = b.findIndex((x) => x > t) - 1;
  if (i < 0) i = t < b[0]! ? 0 : b.length - 2;
  i = Math.min(i, b.length - 2);
  return i + (t - b[i]!) / (b[i + 1]! - b[i]!);
}
function timeOfBeat(x: number) {
  const b = audio.beats, i = Math.max(0, Math.min(b.length - 2, Math.floor(x)));
  return b[i]! + (x - i) * (b[i + 1]! - b[i]!);
}
const frame = (t: number) => Math.round(t * FPS) / FPS;

/** Closing line "Il futuro è automatico." (80.38) through the end card. */
const CARD = { from: 80.38, to: audio.duration };

const CUTS: Record<string, { from: number; to: number; title: string }> = {
  // "La multa come obiettivo dello Stato?" … Follia! … the drop … "Pratico, rapido, autocratico!"
  follia: { from: 29.68, to: 46.88, title: 'Follia → automatico' },
  // "Inoltro, scatto, un vocale" … phishing … Telegram, Fatto! … "futuro autocratico" ×2
  esempi: { from: 61.45, to: 76.55, title: 'Come funziona' },
};

async function run(cmd: string[]) {
  const p = Bun.spawn(cmd, { cwd: APP, stdout: 'inherit', stderr: 'inherit' });
  if ((await p.exited) !== 0) throw new Error(`failed: ${cmd.join(' ')}`);
}

/** Render [from, to) upright with Bollo, in chunks (fresh browser each), with the song's audio. */
async function render(from: number, to: number, out: string) {
  const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS), step = Math.round(+opt('chunk', '10') * FPS);
  const dir = `${out}.chunks`;
  mkdirSync(dir, { recursive: true });
  const parts: string[] = [];
  for (let a = n0; a < n1; a += step) {
    const b = Math.min(n1, a + step);
    const part = path.join(dir, `${String(a).padStart(6, '0')}-${String(b).padStart(6, '0')}.mp4`);
    parts.push(part);
    if (existsSync(part)) continue;
    const tmp = `${part}.tmp.mp4`;
    await run(['bun', 'scripts/render.ts', 'video', '--vertical', '--noaudio', '--query', 'bollo=1', '--from', String(a / FPS), '--to', String(b / FPS),
      '--samples', opt('samples', 'auto'), '--shutter', opt('shutter', '0.2'), '--scale', opt('scale', '1'), '--preset', opt('preset', 'slow'), '--out', tmp]);
    renameSync(tmp, part);
  }
  const list = path.join(dir, 'list.txt');
  await Bun.write(list, parts.map((p) => `file '${p}'`).join('\n') + '\n');
  await run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-ss', String(n0 / FPS), '-t', String((n1 - n0) / FPS), '-i', path.join(APP, 'song/autocratico.mp3'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', out]);
  if (!flag('keep')) rmSync(dir, { recursive: true, force: true });
  console.log(`wrote ${out}`);
}

async function cut(name: string) {
  const c = CUTS[name];
  if (!c) throw new Error(`unknown cut ${name}: ${Object.keys(CUTS).join(', ')}`);
  mkdirSync(OUT, { recursive: true });
  const from = frame(c.from), to = frame(c.to);
  // start the card on the beat phase the stretch ends on, at or just before the closing line
  const ph = beatAt(to) % 1;
  let k = Math.floor(beatAt(CARD.from)) + ph;
  if (timeOfBeat(k) > CARD.from) k -= 1;
  const cardFrom = frame(timeOfBeat(k));
  const a = path.join(OUT, `${name}-a.mp4`), b = path.join(OUT, `${name}-card.mp4`), out = path.join(OUT, `autocratico-${name}.mp4`);
  console.log(`${name}: ${from.toFixed(2)}–${to.toFixed(2)} + card ${cardFrom.toFixed(2)}–${CARD.to.toFixed(2)}`);
  await render(from, to, a);
  await render(cardFrom, CARD.to, b);
  const xf = 0.04;
  await run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a, '-i', b, '-filter_complex',
    `[0:v][1:v]concat=n=2:v=1:a=0[v];[0:a][1:a]acrossfade=d=${xf}:c1=tri:c2=tri[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', out]);
  console.log(`wrote ${out}`);
  return out;
}

/** Upload copy: Reels and Shorts re-encode anyway; keep it sharp but small (1080x1920, H.264 High, AAC 48 kHz). */
async function share(file: string) {
  const out = file.replace(/\.mp4$/, '-share.mp4');
  await run(['ffmpeg', '-y', '-loglevel', 'error', '-i', file, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-crf', '18',
    '-maxrate', '30M', '-bufsize', '60M', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', out]);
  console.log(`wrote ${out}`);
}

const mode = argv[0] ?? 'all';
if (mode === 'film') {
  const out = path.resolve(APP, '../../var/video/autocratico-vertical.mp4');
  await render(0, audio.duration, out);
  await share(out);
} else if (mode === 'share') for (const f of argv.slice(1).filter((x) => x.endsWith('.mp4'))) await share(path.resolve(f));
else for (const n of mode === 'all' ? Object.keys(CUTS) : [mode]) await share(await cut(n));
