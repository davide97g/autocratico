// Shared pieces of the spots: the studio background with its colour fields, kinetic captions, bursts of
// rings and confetti, the pointer, the flash, the app's icon. Everything is a function of the time `t`.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C, GRADIENT, SANS } from "./theme";
import { BEAT, clamp, ease, hit, lerp, prog, rand } from "./time";

// ---------------------------------------------------------------- the studio
type Blob = { x: number; y: number; r: number; color: string; speed: number };

/** Light studio grey with slow fields of colour that breathe on the beat; `energy` 0..1 makes them louder. */
export const Studio: React.FC<{ t: number; energy?: number; blobs: Blob[]; dark?: number }> = ({ t, energy = 0.5, blobs, dark = 0 }) => {
  const beat = Math.pow(0.5, (((t - 0.047) % BEAT) + BEAT) % BEAT / 0.12);
  return (
    <AbsoluteFill style={{ background: dark > 0 ? `color-mix(in oklab, ${C.ink} ${dark * 100}%, ${C.paper})` : C.paper, overflow: "hidden" }}>
      {blobs.map((b, i) => {
        const x = b.x + Math.sin(t * b.speed + i * 1.7) * 140;
        const y = b.y + Math.cos(t * b.speed * 0.8 + i) * 110;
        const s = b.r * (1 + 0.04 * beat * energy);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - s,
              top: y - s,
              width: s * 2,
              height: s * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
              opacity: lerp(0.22, 0.55, energy) * (0.9 + 0.1 * beat),
              filter: "blur(30px)",
            }}
          />
        );
      })}
      <Grain />
    </AbsoluteFill>
  );
};

const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.5 0"/></filter><rect width="240" height="240" filter="url(#n)"/></svg>',
)}")`;
export const Grain: React.FC = () => <AbsoluteFill style={{ backgroundImage: NOISE, opacity: 0.18, mixBlendMode: "overlay" }} />;

// ---------------------------------------------------------------- captions
export type Line = { text: string; size: number; weight?: number; color?: string; gradient?: boolean };

/**
 * Words rise out of a mask one after the other, with a little blur and overshoot; on the way out the block
 * lifts, blurs and fades. A slot in normal layout: the parent places it.
 */
export const Caption: React.FC<{ t: number; at: number; out: number; lines: Line[]; align?: "left" | "center" }> = ({ t, at, out, lines, align = "left" }) => {
  if (t < at - 0.05 || t > out + 0.4) return null;
  const leave = prog(t, out, out + 0.3, ease.inCubic);
  let w = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: align === "center" ? "center" : "flex-start", opacity: 1 - leave, translate: `0 ${-40 * leave}px`, filter: `blur(${12 * leave}px)` }}>
      {lines.map((l, li) => (
        <div key={li} style={{ display: "flex", gap: l.size * 0.26, overflow: "hidden", padding: `${l.size * 0.06}px ${l.size * 0.1}px ${l.size * 0.14}px`, margin: `-${l.size * 0.06}px -${l.size * 0.1}px -${l.size * 0.14}px` }}>
          {l.text.split(" ").map((word, i) => {
            const k = t - (at + w++ * 0.055 + li * 0.08);
            const e = ease.outBack(clamp(k / 0.42), 1.4);
            return (
              <span
                key={i}
                style={{
                  fontFamily: SANS,
                  fontSize: l.size,
                  fontWeight: l.weight ?? 800,
                  letterSpacing: "-0.045em",
                  lineHeight: 1.02,
                  color: l.gradient ? "transparent" : (l.color ?? C.ink),
                  backgroundImage: l.gradient ? GRADIENT : undefined,
                  backgroundClip: l.gradient ? "text" : undefined,
                  WebkitBackgroundClip: l.gradient ? "text" : undefined,
                  display: "inline-block",
                  translate: `0 ${(1 - e) * l.size}px`,
                  opacity: clamp(k / 0.12),
                  filter: `blur(${(1 - clamp(k / 0.25)) * 8}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------- bursts
/** Rings easing outward from (x, y), `k` seconds after the hit, in the given colours. */
export const Rings: React.FC<{ x: number; y: number; k: number; colors: string[]; size?: number }> = ({ x, y, k, colors, size = 260 }) => {
  if (k < 0 || k > 1.1) return null;
  return (
    <>
      {colors.map((c, i) => {
        const e = clamp((k - i * 0.07) / 0.8);
        if (e <= 0 || e >= 1) return null;
        const r = size * (0.25 + ease.outCubic(e) * (0.9 + i * 0.25));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `${lerp(10, 1, e)}px solid ${c}`,
              opacity: 1 - e,
              boxShadow: `0 0 40px ${c}`,
            }}
          />
        );
      })}
    </>
  );
};

/** Confetti: paper bits and sparks thrown from (x, y), falling, `k` seconds after the hit. */
export const Confetti: React.FC<{ x: number; y: number; k: number; colors: string[]; n?: number; spread?: number; seed?: number }> = ({ x, y, k, colors, n = 46, spread = 1, seed = 1 }) => {
  if (k < 0 || k > 1.8) return null;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const r1 = rand(seed * 97 + i), r2 = rand(seed * 31 + i * 7), r3 = rand(seed * 13 + i * 3);
        const a = r1 * Math.PI * 2;
        const v = (600 + 900 * r2) * spread;
        const px = x + Math.cos(a) * v * k * 0.9;
        const py = y + Math.sin(a) * v * k * 0.7 + 900 * k * k;
        const life = clamp(1 - k / (1.1 + 0.6 * r3));
        const w = 8 + 12 * r3, h = r3 > 0.5 ? w * 0.45 : w;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: w,
              height: h,
              borderRadius: r3 > 0.75 ? "50%" : 2,
              background: colors[i % colors.length],
              opacity: life,
              rotate: `${(r1 * 720 + k * 900 * (r2 - 0.5)).toFixed(1)}deg`,
              boxShadow: r3 > 0.85 ? `0 0 14px ${colors[i % colors.length]}` : undefined,
            }}
          />
        );
      })}
    </>
  );
};

/** A white (or coloured) flash over everything. */
export const Flash: React.FC<{ t: number; at: number[]; color?: string; amount?: number }> = ({ t, at, color = "#fff", amount = 0.7 }) => {
  const a = at.reduce((s, x) => s + hit(t, x, 0.07), 0) * amount;
  return a > 0.002 ? <AbsoluteFill style={{ background: color, opacity: clamp(a), pointerEvents: "none" }} /> : null;
};

// ---------------------------------------------------------------- the pointer and the app's icon
export const Pointer: React.FC<{ x: number; y: number; press?: number; scale?: number }> = ({ x, y, press = 0, scale = 1.6 }) => (
  <svg width={40 * scale} height={44 * scale} viewBox="0 0 20 22" style={{ position: "absolute", left: x, top: y, overflow: "visible", scale: `${1 - 0.15 * press}`, transformOrigin: "0 0", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.35))" }}>
    <path d="M1 1 L1 18 L5.4 13.8 L8.4 20.6 L11.6 19.3 L8.6 12.6 L14.6 12.6 Z" fill="#000" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
  </svg>
);

export const Icon: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={style}>
    <rect width="100" height="100" rx="22" fill="#1a1a1a" />
    <path fillRule="evenodd" fill="#ececec" d="M44 20h12l21 60H64l-4.5-15h-19L36 80H23zm-6 36h24l-12-34z" />
  </svg>
);

/** A glow that follows a point, for the focus of a shot. */
export const Glow: React.FC<{ x: number; y: number; r: number; color: string; a: number }> = ({ x, y, r, color, a }) =>
  a > 0 ? <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: `radial-gradient(circle, ${color} 0%, transparent 70%)`, opacity: a, mixBlendMode: "multiply" }} /> : null;
