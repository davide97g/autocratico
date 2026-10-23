// The Agenda spot (30 s, 1920×1080, 60 fps): Google Calendar managed by Autocratico's agent. Shots of two
// bars each on the music's grid (kit/time.ts), the app's pieces redrawn in 3D (ui.tsx), camera motion blur,
// rack focus between the planes, and a sound for every interaction (tools/sfx.py), placed on the same grid.
//
//  0.0  hook: four appointments slammed on the beat, "Chi te li ricorda tutti?", a riser into the drop
//  3.8  the drop: the week flies in and fills itself day by day
//  7.5  the chat swings in, the request is typed, Claude answers and confirms
// 11.3  the event flies into Thursday 15:00, lands, turns red; close on it, its reminders
// 15.0  "Sposta…", the yes, the event slides to Friday 17:00
// 18.8  the phone: three Telegram notifications on the beat
// 22.5  "Aggiungi": the letter's appointment drops into the month, which assembles around it
// 26.3  end card
import React from "react";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { Caption, Confetti, Flash, Icon, Pointer, Rings, Studio } from "../kit/fx";
import { C, GRADIENT, MONO, SANS } from "../kit/theme";
import { B, BAR, BEAT, clamp, D, ease, frameOf, hit, lerp, prog, rand, spring, useT } from "../kit/time";
import { DENTIST } from "./data";
import { AskMove, CalIcon, Chat, EventBlock, G, G_H, M, M_H, CELL_H, CELL_W, Month, Phone, slot, Week } from "./ui";

const S = { week: D(2), chat: D(4), land: D(6), move: D(8), phone: D(10), letter: D(12), end: D(14) };
const LAND = S.land + 0.85; // the event touches Thursday
const SLIDE = D(9) + 0.05; // it leaves Thursday for Friday
const SLID = SLIDE + 0.7;
const TAP = S.letter - 0.1; // "Aggiungi" on the phone
const DROP_IN = S.letter + 1.3; // the letter lands in the month
const ASK = "Metti in calendario la visita dal dentista giovedì alle 15";
const ANSWER = "Aggiungo **Visita dal dentista** giovedì 29 ottobre alle 15:00. È importante: rosso in calendario, promemoria il giorno prima e un'ora prima.";

type Pose = { x: number; y: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number; blur?: number; o?: number };
const mix = (a: Pose, b: Pose, e: number): Pose => ({
  x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z ?? 0, b.z ?? 0, e), rx: lerp(a.rx ?? 0, b.rx ?? 0, e), ry: lerp(a.ry ?? 0, b.ry ?? 0, e),
  rz: lerp(a.rz ?? 0, b.rz ?? 0, e), s: Math.exp(lerp(Math.log(a.s ?? 1), Math.log(b.s ?? 1), e)), blur: lerp(a.blur ?? 0, b.blur ?? 0, e), o: lerp(a.o ?? 1, b.o ?? 1, e),
});
/** A plane of `w`×`h` centred on the frame, moved by `p` (px and degrees). */
const Plane: React.FC<{ p: Pose; w: number; h: number; children: React.ReactNode; origin?: string }> = ({ p, w, h, children, origin }) =>
  (p.o ?? 1) <= 0.001 ? null : (
    <div
      style={{
        position: "absolute", left: 960 - w / 2, top: 540 - h / 2, width: w, height: h, transformOrigin: origin ?? "50% 50%", transformStyle: "preserve-3d",
        transform: `translate3d(${p.x}px, ${p.y}px, ${p.z ?? 0}px) rotateX(${p.rx ?? 0}deg) rotateY(${p.ry ?? 0}deg) rotateZ(${p.rz ?? 0}deg) scale(${p.s ?? 1})`,
        opacity: p.o ?? 1, filter: p.blur ? `blur(${p.blur.toFixed(2)}px)` : undefined,
      }}
    >
      {children}
    </div>
  );

/** The answer so far: whole words, with its bold markers kept balanced. */
function stream(text: string, p: number) {
  const words = text.split(" ");
  let s = words.slice(0, Math.round(words.length * clamp(p))).join(" ");
  if ((s.match(/\*\*/g)?.length ?? 0) % 2) s += "**";
  return s;
}

// ---------------------------------------------------------------- sound: every cue on the grid
type Cue = { at: number; sfx: string; vol: number };
const CUES: Cue[] = (() => {
  const c: Cue[] = [];
  const add = (at: number, sfx: string, vol: number) => c.push({ at, sfx, vol });
  [0, 1, 2, 3].forEach((k) => add(B(k), `pop-${k + 1}`, 0.55));
  [4, 5, 6, 7].forEach((k) => add(B(k), `pop-${k - 3}`, 0.35));
  add(B(4), "riser", 0.4);
  add(S.week - 0.28, "whoosh", 0.45);
  add(S.week, "impact", 0.75);
  for (let i = 0; i < 7; i++) add(S.week + 0.25 + i * (BEAT / 2), `plink-${i + 2}`, 0.32);
  add(S.week + 0.3, "swish", 0.3);
  add(S.chat - 0.05, "whoosh", 0.4);
  for (let i = 0; i < ASK.length; i += 3) add(S.chat + 0.3 + (i / ASK.length) * 1.15, `type-${(i % 3) + 1}`, 0.22);
  add(S.chat + 1.55, "whip", 0.4);
  add(S.chat + 1.8, "plink-1", 0.25);
  add(S.chat + 2.05, "plink-3", 0.25);
  add(S.chat + 3.2, "ding", 0.5);
  add(S.land, "whoosh-down", 0.35);
  add(S.land + 0.12, "whoosh", 0.45);
  add(LAND, "thud", 0.7);
  add(LAND, "pop-4", 0.35);
  add(D(7), "pop-2", 0.4);
  add(D(7) + BEAT, "pop-3", 0.4);
  add(S.move, "swish", 0.35);
  add(S.move + 0.35, "plink-5", 0.3);
  add(D(8) + 2 * BEAT - 0.02, "click", 0.7);
  add(SLIDE, "whoosh", 0.4);
  add(SLID, "thud", 0.6);
  add(SLID + 0.1, "ding", 0.35);
  add(S.phone - 0.1, "whip", 0.45);
  add(S.phone + 0.3, "chime-1", 0.55);
  add(S.phone + 0.3 + 2 * BEAT, "chime-2", 0.55);
  add(D(11) + 0.3, "chime-3", 0.55);
  add(TAP, "click", 0.7);
  add(S.letter, "whoosh", 0.45);
  add(S.letter + 0.3, "sparkle", 0.4);
  add(S.letter + 0.75, "whoosh-down", 0.3);
  add(DROP_IN, "thud", 0.6);
  add(DROP_IN, "ding", 0.4);
  add(S.end - 0.3, "whoosh", 0.4);
  add(S.end, "impact", 0.8);
  add(S.end + 0.1, "sparkle", 0.45);
  add(S.end + 0.6, "pop-3", 0.3);
  return c;
})();

const Sound: React.FC = () => (
  <>
    <Audio src={staticFile("music/agenda.mp3")} volume={0.55} />
    {CUES.map((c, i) => (
      <Sequence key={i} from={frameOf(c.at)} durationInFrames={frameOf(2)} layout="none">
        <Audio src={staticFile(`sfx/${c.sfx}.wav`)} volume={c.vol * 0.7} />
      </Sequence>
    ))}
  </>
);

// ---------------------------------------------------------------- the picture
const BLOBS = [
  { x: 260, y: 220, r: 520, color: C.purple, speed: 0.35 },
  { x: 1680, y: 260, r: 560, color: C.blue, speed: 0.28 },
  { x: 1500, y: 900, r: 600, color: C.pink, speed: 0.31 },
  { x: 380, y: 920, r: 520, color: C.amber, speed: 0.4 },
];

const HOOK = [
  { word: "Dentista.", chip: "GIO 29 · 15:00", color: C.red },
  { word: "CAF.", chip: "GIO 29 · 10:30", color: C.orange },
  { word: "Revisione.", chip: "DOM 1 · 08:30", color: C.amber },
  { word: "Questura.", chip: "LUN 2 · 11:20", color: C.purple },
];

const Hook: React.FC<{ t: number }> = ({ t }) => {
  if (t > S.week + 0.05) return null;
  const k = Math.floor((t - B(0)) / BEAT);
  if (k <= 3) {
    const h = HOOK[Math.max(0, k)]!;
    const lt = t - B(Math.max(0, k));
    const e = ease.outExpo(clamp(lt / 0.2));
    const split = 16 * hit(t, B(Math.max(0, k)), 0.06);
    return (
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: 1400, height: 1400, borderRadius: "50%", background: `radial-gradient(circle, ${h.color} 0%, transparent 60%)`, opacity: 0.35 * (1 - clamp(lt / 0.45)) + 0.12, scale: `${lerp(0.3, 1.1, e)}` }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, scale: `${lerp(1.6, 1, e)}`, rotate: `${(k % 2 ? 1 : -1) * 3 * (1 - e)}deg` }}>
          <span style={{ display: "flex", alignItems: "center", gap: 14, background: h.color, color: "#fff", borderRadius: 999, padding: "14px 30px", fontFamily: MONO, fontSize: 42, fontWeight: 600, boxShadow: `0 20px 60px -10px ${h.color}` }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: "rgba(255,255,255,.85)" }} />
            {h.chip}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 230, fontWeight: 900, letterSpacing: "-0.055em", lineHeight: 1, color: C.ink, textShadow: `${split}px 0 0 rgba(255,40,110,.75), ${-split}px 0 0 rgba(0,190,255,.75)` }}>{h.word}</span>
        </div>
      </AbsoluteFill>
    );
  }
  // "Chi te li ricorda tutti?", a word a beat, then into the drop
  const words = ["Chi", "te li", "ricorda", "tutti?"];
  const zoom = Math.exp(lerp(0, Math.log(7), prog(t, B(7) + 0.1, S.week, ease.inCubic)));
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", scale: `${zoom}`, filter: `blur(${prog(t, B(7) + 0.2, S.week) * 14}px)` }}>
      <div style={{ display: "flex", gap: 34 }}>
        {words.map((w, j) => {
          const lt = t - B(4 + j);
          if (lt < 0) return <span key={j} />;
          const e = ease.outBack(clamp(lt / 0.22), 2.2);
          const last = j === 3;
          return (
            <span
              key={j}
              style={{
                fontFamily: SANS, fontSize: 150, fontWeight: 900, letterSpacing: "-0.05em", display: "inline-block", scale: `${lerp(0.4, 1, e)}`, opacity: clamp(lt / 0.06),
                color: last ? "transparent" : C.ink, backgroundImage: last ? GRADIENT : undefined, backgroundClip: last ? "text" : undefined, WebkitBackgroundClip: last ? "text" : undefined,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** Where the week is: in from far away, aside for the chat, close on the event, framing the move, away. */
function weekPose(t: number): Pose {
  const thu = slot(DENTIST.thu.day, DENTIST.thu.start, DENTIST.thu.end);
  const fri = slot(DENTIST.fri.day, DENTIST.fri.start, DENTIST.fri.end);
  const on = (cx: number, cy: number, X: number, Y: number, s: number): Pose => ({ x: X - 960 - s * (cx - G.w / 2), y: Y - 540 - s * (cy - G_H / 2), s });
  const far: Pose = { x: 300, y: 600, z: -2400, rx: 62, ry: -34, rz: 10, s: 0.8, o: 0 };
  const rest: Pose = { x: 250, y: 10, rx: 12, ry: -16, s: 0.74 };
  const restLate: Pose = { ...rest, ry: -9, s: 0.77 };
  const aside: Pose = { x: -360, y: 10, z: -600, rx: 10, ry: 24, s: 0.74, blur: 9, o: 0.85 };
  const front: Pose = { x: 30, y: 30, rx: 9, ry: -6, s: 0.9 };
  const close: Pose = { ...on(thu.x + thu.w / 2, thu.y + thu.h / 2, 1170, 470, 1.9), rx: 4, ry: 9 };
  const closeLate: Pose = { ...on(thu.x + thu.w / 2, thu.y + thu.h / 2, 1150, 480, 2.1), rx: 2, ry: 15, rz: -1.5 };
  const pair: Pose = { ...on((thu.x + fri.x + fri.w) / 2, (thu.y + fri.y + fri.h) / 2, 1200, 560, 1.16), rx: 6, ry: -5 };
  const pairLate: Pose = { ...pair, ...on((thu.x + fri.x + fri.w) / 2, (thu.y + fri.y + fri.h) / 2, 1210, 565, 1.24), ry: -1 };
  const away: Pose = { x: -1700, y: -800, z: -900, rx: 30, ry: 45, rz: -18, s: 1, o: 0 };
  let p = mix(far, rest, prog(t, S.week, S.week + 0.65, ease.outExpo));
  p = mix(p, restLate, prog(t, S.week + 0.65, S.chat, ease.inOutCubic) * 0.999);
  p = mix(p, aside, prog(t, S.chat - 0.05, S.chat + 0.5, ease.inOutCubic));
  p = mix(p, front, prog(t, S.land - 0.05, S.land + 0.5, ease.inOutCubic));
  p = mix(p, close, prog(t, LAND + 0.2, LAND + 1.0, ease.inOutQuint));
  p = mix(p, closeLate, prog(t, LAND + 1.0, S.move - 0.15, ease.inOutCubic));
  p = mix(p, pair, prog(t, S.move - 0.15, S.move + 0.45, ease.inOutCubic));
  p = mix(p, pairLate, prog(t, S.move + 0.45, S.phone - 0.1, ease.inOutCubic));
  p = mix(p, away, prog(t, S.phone - 0.12, S.phone + 0.3, ease.inCubic));
  return p;
}

const WeekShot: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.week - 0.02 || t > S.phone + 0.35) return null;
  const p = weekPose(t);
  const day = (i: number) => prog(t, S.week + 0.25 + i * (BEAT / 2), S.week + 0.25 + i * (BEAT / 2) + 0.5);
  // focus: the rest of the week goes soft while the camera is on the event
  const dof = 5 * prog(t, LAND + 0.3, LAND + 0.9) * (1 - prog(t, S.move - 0.15, S.move + 0.3));
  const thu = slot(DENTIST.thu.day, DENTIST.thu.start, DENTIST.thu.end);
  const fri = slot(DENTIST.fri.day, DENTIST.fri.start, DENTIST.fri.end);
  // the event: from the chat (right, lifted) to Thursday; later to Friday
  const fly = prog(t, S.land + 0.05, LAND, ease.inOutCubic);
  const slide = prog(t, SLIDE, SLID, ease.inOutCubic);
  let ex = thu.x, ey = thu.y, ez = 0, es = 1, erz = 0, lift = 0;
  if (t < LAND) {
    ex = lerp(G.w + 180, thu.x, fly);
    ey = lerp(380, thu.y, fly) - Math.sin(fly * Math.PI) * 260;
    ez = lerp(520, 0, fly) + Math.sin(fly * Math.PI) * 160;
    es = lerp(1.35, 1, fly);
    erz = Math.sin(fly * Math.PI) * -8;
    lift = 1 - fly;
  } else if (t >= SLIDE - 0.2) {
    const up = prog(t, SLIDE - 0.2, SLIDE + 0.05, ease.outCubic) * (1 - prog(t, SLID - 0.05, SLID + 0.1));
    ex = lerp(thu.x, fri.x, slide);
    ey = lerp(thu.y, fri.y, slide) - Math.sin(slide * Math.PI) * 60;
    ez = 110 * up;
    es = 1 + 0.08 * up;
    erz = Math.sin(slide * Math.PI) * 4;
    lift = up;
  }
  const showEvent = t >= S.land + 0.05;
  const landK = t - LAND, slidK = t - SLID;
  const glow = hit(t, LAND, 0.35) + 0.35 * Math.max(0, Math.sin((t - LAND) * 6)) * prog(t, LAND, LAND + 0.3) * (1 - prog(t, D(7) + 0.8, S.move));
  const chips = [
    { at: D(7), text: "🔔  1 giorno prima" },
    { at: D(7) + BEAT, text: "🔔  1 ora prima" },
  ];
  const cx = (r: typeof thu) => r.x + r.w / 2, cy = (r: typeof thu) => r.y + r.h / 2;
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2600, perspectiveOrigin: "50% 45%" }}>
      <Plane p={p} w={G.w} h={G_H}>
        <div style={{ filter: dof ? `blur(${dof.toFixed(2)}px)` : undefined }}>
          <Week day={day} />
        </div>
        {showEvent && (
          <>
            <Rings x={cx(thu)} y={cy(thu)} k={landK} colors={[C.red, C.orange, C.amber]} size={220} />
            <Rings x={cx(fri)} y={cy(fri)} k={slidK} colors={[C.blue, C.green]} size={200} />
            <div style={{ position: "absolute", left: 0, top: 0, transformStyle: "preserve-3d", transform: `translate3d(${ex}px, ${ey}px, ${ez}px) rotateZ(${erz}deg) scale(${es})`, transformOrigin: `${thu.w / 2}px ${thu.h / 2}px` }}>
              <EventBlock
                ev={{ title: DENTIST.title, start: t < SLID ? DENTIST.thu.start : DENTIST.fri.start, end: t < SLID ? DENTIST.thu.end : DENTIST.fri.end, cal: "personal", important: true }}
                h={thu.h}
                lift={lift}
                style={{ left: 0, top: 0, width: thu.w, height: thu.h, outline: glow > 0.02 ? `${2 + 4 * glow}px solid rgba(220,38,39,${0.5 * clamp(glow)})` : undefined, boxShadow: `0 0 ${60 * glow}px rgba(220,38,39,${0.6 * clamp(glow)}), 0 ${4 + 24 * lift}px ${10 + 50 * lift}px rgba(0,0,0,${0.12 + 0.2 * lift})` }}
              />
            </div>
            {chips.map((c, i) => {
              const q = spring(t - c.at, 3, 0.5) * (1 - prog(t, S.move - 0.2, S.move + 0.05));
              if (q <= 0.001) return null;
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute", left: thu.x + 4, top: thu.y + thu.h + 10 + i * 40, height: 34, padding: "0 14px", borderRadius: 17, background: C.ink, color: "#fff",
                    display: "flex", alignItems: "center", fontFamily: SANS, fontSize: 17, fontWeight: 650, whiteSpace: "nowrap", scale: `${q}`, transformOrigin: "0 50%", opacity: clamp(q * 2),
                  }}
                >
                  {c.text}
                </div>
              );
            })}
            <Confetti x={cx(thu)} y={cy(thu)} k={landK} colors={[C.red, C.orange, C.amber, C.pink]} n={40} spread={0.55} seed={3} />
          </>
        )}
      </Plane>
    </div>
  );
};

const ChatShot: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.chat - 0.1 || t > S.land + 0.5) return null;
  const inn = prog(t, S.chat - 0.08, S.chat + 0.5, ease.outExpo);
  const out = prog(t, S.land - 0.02, S.land + 0.4, ease.inCubic);
  const p = mix(mix({ x: 1200, y: 60, z: -500, ry: -48, rx: 8, o: 0 }, { x: 420, y: 0, ry: -11, rx: 4 }, inn), { x: 1400, y: 260, z: -400, ry: -55, rx: 10, o: 0 }, out);
  const typedN = Math.round(ASK.length * prog(t, S.chat + 0.3, S.chat + 1.45));
  const sentAt = S.chat + 1.55;
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2200 }}>
      <Plane p={{ ...p, ry: (p.ry ?? 0) + 2 * Math.sin(t * 1.3) }} w={660} h={920}>
        <Chat
          typed={t < sentAt ? ASK.slice(0, typedN) : ""}
          caret={t < sentAt && Math.floor(t * 3) % 2 === 0}
          sent={spring(t - sentAt, 3.5, 0.5)}
          steps={t > S.chat + 2.05 ? 2 : t > S.chat + 1.8 ? 1 : 0}
          shimmer={((t * 0.9) % 1.3) - 0.15}
          answer={t > S.chat + 2.3 ? stream(ANSWER, prog(t, S.chat + 2.3, S.chat + 3.05)) : ""}
          confirm={t > S.chat + 3.2 ? spring(t - (S.chat + 3.2), 3, 0.45) : 0}
        />
      </Plane>
    </div>
  );
};

const MoveAsk: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.move - 0.05 || t > D(9) + 0.5) return null;
  const clickAt = D(8) + 2 * BEAT - 0.02;
  const inn = spring(t - S.move, 2.6, 0.55);
  const out = prog(t, clickAt + 0.35, clickAt + 0.7, ease.inCubic);
  const mv = prog(t, clickAt - 0.5, clickAt - 0.05, ease.outQuart);
  const press = clamp(1 - Math.abs(t - clickAt) / 0.1);
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2000 }}>
      <div style={{ position: "absolute", left: 120, top: 150, opacity: clamp(inn * 2) * (1 - out), scale: `${lerp(0.6, 1, inn) * (1 - 0.15 * out)}`, rotate: `${-3 * (1 - inn)}deg`, transformOrigin: "0 0", filter: out ? `blur(${8 * out}px)` : undefined }}>
        <AskMove q={spring(t - S.move, 3.5, 0.5)} a={prog(t, S.move + 0.35, S.move + 0.7)} press={press} chosen={t > clickAt} />
        <div style={{ position: "absolute", left: 0, top: 0 }}>
          <Pointer x={lerp(700, 70, mv)} y={lerp(560, 372, mv)} press={press} />
        </div>
        <Rings x={82} y={360} k={t - clickAt} colors={[C.green]} size={90} />
      </div>
    </div>
  );
};

const PhoneShot: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.phone - 0.1 || t > S.letter + 0.5) return null;
  const inn = prog(t, S.phone - 0.08, S.phone + 0.55, ease.outExpo);
  const dive = prog(t, TAP + 0.05, S.letter + 0.45, ease.inQuart);
  let p = mix({ x: 450, y: 1000, z: -400, ry: 50, rx: 22, rz: 8, o: 0 }, { x: 360, y: 10, ry: -16, rx: 6, rz: -2 }, inn);
  p = { ...p, ry: (p.ry ?? 0) + 10 * prog(t, S.phone + 0.55, TAP, ease.inOutCubic), rx: (p.rx ?? 0) - 2 * prog(t, S.phone, TAP) };
  p = mix(p, { ...p, s: 2.8, z: 300, o: 0, blur: 6 }, dive);
  const notes = [S.phone + 0.3, S.phone + 0.3 + 2 * BEAT, D(11) + 0.3].map((a) => spring(t - a, 2.6, 0.5));
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 2400 }}>
      <Plane p={p} w={500} h={1040} origin="28% 82%">
        <Phone notes={notes} press={clamp(1 - Math.abs(t - TAP) / 0.12)} />
      </Plane>
    </div>
  );
};

function monthPose(t: number): Pose {
  const inn = prog(t, S.letter + 0.12, S.letter + 0.75, ease.outExpo);
  let p = mix({ x: 600, y: 800, z: -1600, rx: 55, ry: -25, rz: 6, o: 0 }, { x: 250, y: 30, rx: 12, ry: -14, s: 0.86 }, inn);
  p = { ...p, ry: (p.ry ?? 0) + 7 * prog(t, S.letter + 0.75, S.end, ease.inOutCubic), s: (p.s ?? 1) * (1 + 0.04 * prog(t, S.letter + 0.75, S.end)) };
  return mix(p, { ...p, s: 1.6, z: 400, o: 0, blur: 10 }, prog(t, S.end - 0.05, S.end + 0.3, ease.inCubic));
}
/** Monday 2 November in the month grid. */
const LETTER_CELL = { x: 0 * CELL_W + CELL_W / 2, y: M.head + 1 * CELL_H + CELL_H / 2 };

const LetterShot: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.letter - 0.05 || t > S.end + 0.35) return null;
  const mp = monthPose(t);
  const cell = (i: number) => {
    const r = Math.floor(i / 7), c = i % 7;
    const at = S.letter + 0.15 + (r + c) * 0.04;
    return prog(t, at, at + 0.45);
  };
  const landK = t - DROP_IN;
  // the letter's card: out of the phone, towards the camera, then into its day
  const out = prog(t, S.letter - 0.05, S.letter + 0.55, ease.outExpo);
  const into = prog(t, S.letter + 0.75, DROP_IN, ease.inOutCubic);
  const target = { x: 960 + mp.x + (mp.s ?? 1) * (LETTER_CELL.x - M.w / 2) - 960, y: 540 + mp.y + (mp.s ?? 1) * (LETTER_CELL.y - M_H / 2) - 540 };
  const cardP = mix(mix({ x: 230, y: 330, z: -200, s: 0.5, rx: 20, ry: -20, o: 0 }, { x: -260, y: -260, z: 200, s: 1.05, rx: 6, ry: 10 }, out), { x: target.x, y: target.y, z: 0, s: 0.18, rx: mp.rx, ry: mp.ry, o: 0.3 }, into);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, perspective: 2600 }}>
        <Plane p={mp} w={M.w} h={M_H}>
          <Month cell={cell} letter={prog(t, DROP_IN - 0.05, DROP_IN + 0.3)} mark={hit(t, DROP_IN, 0.4)} />
          <Rings x={LETTER_CELL.x} y={LETTER_CELL.y} k={landK} colors={[C.red, C.purple, C.amber]} size={150} />
          <Confetti x={LETTER_CELL.x} y={LETTER_CELL.y} k={landK} colors={[C.red, C.purple, C.amber, C.blue]} n={36} spread={0.45} seed={7} />
        </Plane>
      </div>
      {t < DROP_IN + 0.02 && (
        <div style={{ position: "absolute", inset: 0, perspective: 2000 }}>
          <Plane p={cardP} w={760} h={150}>
            <div style={{ width: 760, height: 150, background: C.card, borderRadius: 26, border: `2px solid ${C.border}`, display: "flex", alignItems: "center", gap: 22, padding: "0 28px", boxShadow: "0 40px 80px -20px rgba(0,0,0,.4)" }}>
              <div style={{ width: 80, height: 80, borderRadius: 20, background: `color-mix(in srgb, ${C.red} 14%, #fff)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CalIcon size={40} color={C.red} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontFamily: SANS, fontSize: 32, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>Ritiro passaporto in Questura</span>
                <span style={{ fontFamily: SANS, fontSize: 22, color: C.muted }}>lun 2 nov · 11:20–11:40 · Questura, via Verdi 2</span>
              </div>
            </div>
          </Plane>
        </div>
      )}
    </>
  );
};

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  if (t < S.end) return null;
  const k = t - S.end;
  const pop = spring(k, 2.2, 0.4);
  const name = "autocratico";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <Rings x={960} y={400} k={k} colors={[C.purple, C.pink, C.amber, C.blue]} size={420} />
      <Rings x={960} y={400} k={k - 2 * BEAT} colors={[C.lime, C.purple]} size={300} />
      <Confetti x={960} y={420} k={k} colors={[C.purple, C.pink, C.amber, C.blue, C.lime, C.red]} n={90} spread={1.1} seed={11} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, translate: "0 -10px" }}>
        <Icon size={150} style={{ scale: `${pop}`, rotate: `${(1 - pop) * -20}deg`, filter: "drop-shadow(0 24px 40px rgba(0,0,0,.35))" }} />
        <div style={{ display: "flex" }}>
          {name.split("").map((ch, i) => {
            const q = ease.outBack(clamp((k - 0.15 - i * 0.03) / 0.35), 2);
            return (
              <span key={i} style={{ fontFamily: SANS, fontSize: 150, fontWeight: 800, letterSpacing: "-0.05em", color: C.ink, display: "inline-block", translate: `0 ${(1 - q) * 90}px`, opacity: clamp(q * 2) }}>
                {ch}
              </span>
            );
          })}
        </div>
        <Caption t={t} at={S.end + 0.55} out={99} lines={[{ text: "La tua agenda, a parole.", size: 58, weight: 700, gradient: true }]} align="center" />
        <div style={{ opacity: prog(t, S.end + 1.0, S.end + 1.3), translate: `0 ${(1 - prog(t, S.end + 1.0, S.end + 1.4, ease.outCubic)) * 20}px`, fontFamily: MONO, fontSize: 34, fontWeight: 500, color: C.ink, background: "#fff", borderRadius: 999, padding: "14px 32px", boxShadow: "0 20px 50px -20px rgba(0,0,0,.35)" }}>
          demo.autocratico.it
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CAPTIONS = [
  { at: S.week + 0.3, out: S.chat - 0.3, lines: [{ text: "La tua", size: 112 }, { text: "agenda.", size: 112 }, { text: "Google Calendar,", size: 44, weight: 600, color: C.muted }, { text: "ma pulito.", size: 44, weight: 600, color: C.muted }] },
  { at: S.chat + 0.3, out: S.land - 0.25, lines: [{ text: "Dillo", size: 112 }, { text: "a parole.", size: 112, gradient: true }, { text: "In chat o su Telegram.", size: 44, weight: 600, color: C.muted }] },
  { at: LAND + 0.45, out: S.move - 0.25, lines: [{ text: "Importante?", size: 104 }, { text: "Diventa", size: 104 }, { text: "rosso.", size: 104, color: C.red }, { text: "E ti ricorda prima.", size: 44, weight: 600, color: C.muted }] },
  { at: SLID + 0.1, out: S.phone - 0.25, lines: [{ text: "Spostalo.", size: 112 }, { text: "Prima ti chiede.", size: 44, weight: 600, color: C.muted }] },
  { at: S.phone + 0.35, out: S.letter - 0.25, lines: [{ text: "Ti avvisa", size: 112 }, { text: "su Telegram.", size: 112, gradient: true }, { text: "Al momento giusto.", size: 44, weight: 600, color: C.muted }] },
  { at: S.letter + 0.55, out: S.end - 0.25, lines: [{ text: "Lo trova", size: 104 }, { text: "nelle lettere.", size: 104 }, { text: "Tu dici solo sì.", size: 44, weight: 600, color: C.muted }] },
];

const Stage: React.FC = () => {
  const t = useT();
  // a push on every downbeat after the drop, a shake on the big hits
  const sinceBar = (((t - D(0)) % BAR) + BAR) % BAR;
  const punch = t > S.week && t < S.end + 0.5 ? 1 + 0.012 * Math.pow(0.5, sinceBar / 0.08) : 1;
  const shake = 18 * (hit(t, S.week, 0.08) + hit(t, S.end, 0.08)) + 6 * hit(t, LAND, 0.06) + 4 * hit(t, DROP_IN, 0.06);
  const sx = shake * (rand(Math.floor(t * 60)) - 0.5), sy = shake * (rand(Math.floor(t * 60) + 99) - 0.5);
  const energy = 0.35 + 0.4 * prog(t, S.week, S.week + 0.3) + 0.25 * prog(t, S.end - 0.2, S.end);
  // a sweep of coloured light across the frame on the cuts
  const sweeps = [S.chat, S.phone, S.letter].map((a) => prog(t, a - 0.15, a + 0.45));
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Studio t={t} energy={energy} blobs={BLOBS} />
      <AbsoluteFill style={{ translate: `${sx}px ${sy}px`, scale: `${punch}` }}>
        <Hook t={t} />
        <WeekShot t={t} />
        {/* a soft paper veil on the left while a plane fills the frame, so the captions read */}
        <AbsoluteFill
          style={{
            background: `linear-gradient(90deg, ${C.paper}F2 0%, ${C.paper}D9 38%, ${C.paper}00 62%)`,
            opacity: prog(t, LAND + 0.25, LAND + 0.6) * (1 - prog(t, S.phone - 0.25, S.phone)) + prog(t, S.letter + 0.4, S.letter + 0.7) * (1 - prog(t, S.end - 0.2, S.end)),
          }}
        />
        <ChatShot t={t} />
        <MoveAsk t={t} />
        <PhoneShot t={t} />
        <LetterShot t={t} />
        <EndCard t={t} />
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 120, pointerEvents: "none" }}>
          {CAPTIONS.map((c, i) => (
            <div key={i} style={{ position: "absolute", left: 120 }}>
              <Caption t={t} at={c.at} out={c.out} lines={c.lines} />
            </div>
          ))}
        </AbsoluteFill>
      </AbsoluteFill>
      {sweeps.map((s, i) =>
        s > 0 && s < 1 ? (
          <AbsoluteFill key={i} style={{ background: `linear-gradient(110deg, transparent ${s * 160 - 60}%, ${[C.pink, C.blue, C.amber][i]}55 ${s * 160 - 30}%, transparent ${s * 160}%)`, mixBlendMode: "screen" }} />
        ) : null,
      )}
      <Flash t={t} at={[S.week, S.end]} amount={0.85} />
      <Flash t={t} at={[LAND, DROP_IN]} color={C.amber} amount={0.18} />
      <AbsoluteFill style={{ background: C.paper, opacity: prog(t, 29.55, 30) }} />
    </AbsoluteFill>
  );
};

export const Agenda: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    <CameraMotionBlur shutterAngle={200} samples={6}>
      <Stage />
    </CameraMotionBlur>
    <Sound />
  </AbsoluteFill>
);
