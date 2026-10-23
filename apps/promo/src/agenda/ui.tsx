// The app's pieces, redrawn for the screen at video size: the Agenda's week and month (apps/web
// components/agenda-grid.tsx), the chat, the Telegram notifications on a phone. Same tokens and layout as
// the app, bigger type and events, every element animatable on its own.
import React from "react";
import { C, MONO, SANS } from "../kit/theme";
import { clamp, ease, lerp } from "../kit/time";
import { ALLDAY, CAL, DAYS, type Ev, HOURS, MONTH, WEEK } from "./data";

// ---------------------------------------------------------------- the week
export const G = { w: 1640, head: 96, allday: 64, hour: 66, timeCol: 74 };
export const DAY_W = (G.w - G.timeCol) / 7;
export const G_H = G.head + G.allday + (HOURS.to - HOURS.from) * G.hour;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Where an event sits in the week, in its own pixels. */
export function slot(day: number, start: string, end: string) {
  const y0 = G.head + G.allday + ((minutes(start) - HOURS.from * 60) / 60) * G.hour;
  const y1 = G.head + G.allday + ((minutes(end) - HOURS.from * 60) / 60) * G.hour;
  return { x: G.timeCol + day * DAY_W + 6, y: y0 + 2, w: DAY_W - 12, h: y1 - y0 - 4 };
}

export const EventBlock: React.FC<{ ev: Pick<Ev, "title" | "start" | "end" | "cal" | "important">; h: number; lift?: number; style?: React.CSSProperties }> = ({ ev, h, lift = 0, style }) => {
  const col = ev.important ? C.red : CAL[ev.cal];
  const short = h < 44;
  return (
    <div
      style={{
        position: "absolute",
        borderRadius: 12,
        background: `color-mix(in srgb, ${col} ${ev.important ? 14 : 15}%, #fff)`,
        border: `1.5px solid color-mix(in srgb, ${col} 30%, #fff)`,
        overflow: "hidden",
        padding: short ? "0 10px 0 16px" : "7px 10px 6px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: short ? "center" : "flex-start",
        gap: 2,
        boxShadow: `0 ${2 + 18 * lift}px ${6 + 40 * lift}px rgba(0,0,0,${0.06 + 0.18 * lift})`,
        ...style,
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: col }} />
      <span style={{ fontFamily: SANS, fontWeight: 650, fontSize: short ? 17 : 20, lineHeight: 1.25, color: `color-mix(in srgb, ${col} 50%, #111)`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {ev.title}
      </span>
      {!short && <span style={{ fontFamily: MONO, fontSize: 15, color: ev.important ? `color-mix(in srgb, ${C.red} 70%, #fff)` : C.muted }}>{`${ev.start}–${ev.end}`}</span>}
    </div>
  );
};

/** The week (apps/web WeekGrid): `day(i)` 0..1 draws day i in, `item(i)` each event of it. */
export const Week: React.FC<{ day: (i: number) => number; now?: boolean; dim?: (ev: Ev) => number }> = ({ day, dim }) => {
  const hours = Array.from({ length: HOURS.to - HOURS.from }, (_, i) => HOURS.from + i);
  return (
    <div style={{ position: "relative", width: G.w, height: G_H, background: C.card, borderRadius: 28, border: `2px solid ${C.border}`, overflow: "hidden", boxShadow: "0 40px 90px -30px rgba(0,0,0,.35)" }}>
      {/* the hour lines and the time column */}
      {hours.map((h) => (
        <React.Fragment key={h}>
          <div style={{ position: "absolute", left: G.timeCol, right: 0, top: G.head + G.allday + (h - HOURS.from) * G.hour, borderTop: `1.5px solid ${C.border}` }} />
          {h > HOURS.from && (
            <span style={{ position: "absolute", left: 0, width: G.timeCol - 12, textAlign: "right", top: G.head + G.allday + (h - HOURS.from) * G.hour - 10, fontFamily: MONO, fontSize: 15, color: C.muted }}>
              {String(h).padStart(2, "0")}:00
            </span>
          )}
        </React.Fragment>
      ))}
      <div style={{ position: "absolute", left: 0, right: 0, top: G.head, height: G.allday, background: C.well, borderTop: `1.5px solid ${C.border}`, borderBottom: `1.5px solid ${C.border}` }} />
      {DAYS.map((d, i) => {
        const p = day(i);
        const e = ease.outBack(clamp(p), 1.6);
        const [name, num] = d.split(" ");
        const today = i === 4;
        return (
          <div key={d} style={{ position: "absolute", left: G.timeCol + i * DAY_W, top: 0, width: DAY_W, height: G_H, borderLeft: `1.5px solid ${C.border}`, background: today ? "rgba(0,0,0,.018)" : undefined }}>
            <div style={{ height: G.head, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, opacity: clamp(p * 3), translate: `0 ${(1 - e) * 24}px` }}>
              <span style={{ fontFamily: SANS, fontSize: 15, letterSpacing: "0.08em", color: today ? C.ink : C.muted, fontWeight: 600 }}>{name}</span>
              <span
                style={{
                  width: 46, height: 46, borderRadius: 23, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: MONO, fontSize: 22, fontWeight: 600, background: today ? C.ink : "transparent", color: today ? "#fff" : C.ink,
                }}
              >
                {num}
              </span>
            </div>
          </div>
        );
      })}
      {/* all-day events and the register's deadlines */}
      {ALLDAY.map((a, i) => {
        const p = clamp((day(a.day) - 0.25) / 0.75);
        const same = ALLDAY.filter((b, j) => b.day === a.day && j < i).length;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: G.timeCol + a.day * DAY_W + 6, top: G.head + 6 + same * 27, width: DAY_W - 12, height: 24, borderRadius: 7,
              background: a.deadline ? `color-mix(in srgb, ${a.color} 16%, #fff)` : "#fff", border: a.deadline ? "none" : `1.5px dashed ${C.border}`,
              display: "flex", alignItems: "center", gap: 7, padding: "0 8px", scale: `${ease.outBack(p, 2)}`, opacity: clamp(p * 3),
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 4, background: a.color, flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: a.deadline ? `color-mix(in srgb, ${a.color} 70%, #111)` : C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</span>
          </div>
        );
      })}
      {WEEK.map((ev, i) => {
        const order = WEEK.filter((x, j) => x.day === ev.day && j < i).length;
        const p = clamp((day(ev.day) - 0.15 - order * 0.12) / 0.6);
        if (p <= 0) return null;
        const r = slot(ev.day, ev.start, ev.end);
        const e = ease.outBack(p, 2.2);
        return (
          <EventBlock
            key={i}
            ev={ev}
            h={r.h}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, scale: `${lerp(0.4, 1, e)}`, opacity: clamp(p * 2.5) * (1 - (dim?.(ev) ?? 0)), transformOrigin: "50% 50%" }}
          />
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- the chat
const Header: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "22px 24px", borderBottom: `1.5px solid ${C.border}` }}>
    <div style={{ width: 52, height: 52, borderRadius: 14, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Sparkles size={26} color="#fff" />
    </div>
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontFamily: SANS, fontSize: 24, fontWeight: 650, color: C.ink }}>Chiedi a Claude</span>
      <span style={{ fontFamily: SANS, fontSize: 17, color: C.muted }}>Claude Code · sola lettura</span>
    </div>
  </div>
);

export const Sparkles: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.94 14.06A2 2 0 0 0 8.5 12.62L2.37 11a.5.5 0 0 1 0-.96L8.5 8.38A2 2 0 0 0 9.94 6.94L11.56.82a.5.5 0 0 1 .96 0L14.06 6.94A2 2 0 0 0 15.5 8.38l6.13 1.66a.5.5 0 0 1 0 .96L15.5 12.62a2 2 0 0 0-1.44 1.44l-1.62 6.13a.5.5 0 0 1-.96 0z" />
  </svg>
);

export const CalIcon: React.FC<{ size: number; color?: string }> = ({ size, color = C.ink }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v4M16 2v4" />
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </svg>
);

export const Bubble: React.FC<{ text: string; p: number }> = ({ text, p }) => (
  <div
    style={{
      alignSelf: "flex-end", maxWidth: 470, background: C.ink, color: "#fff", borderRadius: 22, padding: "18px 22px",
      fontFamily: SANS, fontSize: 23, lineHeight: 1.35, fontWeight: 500, scale: `${ease.outBack(clamp(p), 1.8)}`, opacity: clamp(p * 4), transformOrigin: "100% 100%",
    }}
  >
    {text}
  </div>
);

/** The server's confirmation card under an answer (apps/web ConfirmationCard). */
export const Confirmation: React.FC<{ label: string; body: string; p: number; tint?: string }> = ({ label, body, p, tint = C.green }) => (
  <div
    style={{
      display: "flex", gap: 16, alignItems: "center", background: C.well, borderRadius: 18, padding: "16px 18px", border: `2px solid color-mix(in srgb, ${tint} ${40 * clamp(1 - (p - 1) * 2)}%, transparent)`,
      scale: `${lerp(0.7, 1, ease.outBack(clamp(p), 2))}`, opacity: clamp(p * 4), transformOrigin: "0 50%",
    }}
  >
    <div style={{ width: 54, height: 54, borderRadius: 14, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <CalIcon size={28} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: SANS, fontSize: 17, fontWeight: 600, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: SANS, fontSize: 21, fontWeight: 600, color: C.ink }}>{body}</span>
    </div>
  </div>
);

export const Chat: React.FC<{ typed: string; sent: number; steps: number; shimmer: number; answer: string; confirm: number; caret: boolean }> = ({ typed, sent, steps, shimmer, answer, confirm, caret }) => (
  <div style={{ width: 660, height: 920, background: C.card, borderRadius: 32, border: `2px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 50px 100px -30px rgba(0,0,0,.4)" }}>
    <Header />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 22, padding: "28px 28px" }}>
      {sent > 0 && <Bubble text="Metti in calendario la visita dal dentista giovedì alle 15" p={sent} />}
      {steps > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["Legge  calendar/agenda.md", "Esegue  python3 scripts/when.py giovedì 15:00"].slice(0, steps).map((s, i) => (
            <span
              key={i}
              style={{
                fontFamily: MONO, fontSize: 17, color: "transparent", backgroundClip: "text", WebkitBackgroundClip: "text",
                backgroundImage: `linear-gradient(90deg, ${C.muted} ${shimmer * 100 - 30}%, ${C.ink} ${shimmer * 100}%, ${C.muted} ${shimmer * 100 + 30}%)`,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {answer && (
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 23, lineHeight: 1.45, color: C.ink }}>
          {answer.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))}
        </p>
      )}
      {confirm > 0 && <Confirmation label="Aggiunto a Google Calendar" body="Visita dal dentista — gio 29 ott, 15:00–16:00" p={confirm} />}
    </div>
    <div style={{ margin: 20, borderRadius: 20, border: `2px solid ${typed ? C.ink : C.border}`, background: C.well, padding: "20px 22px", fontFamily: SANS, fontSize: 22, color: typed ? C.ink : C.muted, minHeight: 66 }}>
      {typed || "Scrivi una domanda…"}
      {caret && <span style={{ display: "inline-block", width: 2.5, height: 26, background: C.ink, marginLeft: 2, translate: "0 5px" }} />}
    </div>
  </div>
);

/** The second request, small: the question, the answer asking to confirm, the yes. */
export const AskMove: React.FC<{ q: number; a: number; press: number; chosen: boolean }> = ({ q, a, press, chosen }) => (
  <div style={{ width: 600, background: C.card, borderRadius: 30, border: `2px solid ${C.border}`, padding: 26, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 40px 90px -30px rgba(0,0,0,.4)" }}>
    <Bubble text="Sposta il dentista a venerdì alle 17" p={q} />
    <div style={{ opacity: clamp(a * 3), translate: `0 ${(1 - ease.outCubic(clamp(a))) * 20}px`, display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ margin: 0, fontFamily: SANS, fontSize: 23, lineHeight: 1.4, color: C.ink }}>
        Sposto <b>Visita dal dentista</b> a <b>ven 30 ott, 17:00</b>, stessa durata. Confermi?
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ fontFamily: SANS, fontSize: 21, fontWeight: 650, padding: "10px 22px", borderRadius: 12, background: chosen ? C.green : C.ink, color: "#fff", scale: `${1 - 0.08 * press}` }}>✓ Sì</span>
        <span style={{ fontFamily: SANS, fontSize: 21, fontWeight: 600, padding: "10px 22px", borderRadius: 12, background: C.well, color: C.ink }}>✕ No</span>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------- Telegram on a phone
export type Note = { title: string; body: string[]; keys?: string[] };
export const NOTES: Note[] = [
  { title: "📅 Tra 1 h: Visita dal dentista", body: ["ven 30 ott, 17:00–18:00"] },
  { title: "🔔 Oggi in calendario", body: ["09:30 Stand-up · 14:00 Demo", "17:00 Dentista · 19:00 Aperitivo"] },
  { title: "📅 Trovato in un documento", body: ["Ritiro passaporto in Questura", "lun 2 nov, 11:20 · Lo aggiungo?"], keys: ["📅 Aggiungi", "No"] },
];

export const Phone: React.FC<{ notes: number[]; press: number }> = ({ notes, press }) => (
  <div style={{ width: 500, height: 1040, borderRadius: 74, background: "#1C1C1E", padding: 16, boxShadow: "0 60px 120px -30px rgba(0,0,0,.6), inset 0 0 0 3px #3A3A3C" }}>
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 60, overflow: "hidden", background: "linear-gradient(160deg, #3B2E5A 0%, #1B1B28 45%, #0B0B0F 100%)" }}>
      <div style={{ position: "absolute", left: "50%", top: 18, width: 150, height: 44, marginLeft: -75, borderRadius: 22, background: "#000" }} />
      <div style={{ position: "absolute", top: 100, width: "100%", textAlign: "center", color: "rgba(255,255,255,.92)", fontFamily: SANS }}>
        <div style={{ fontSize: 24, fontWeight: 500 }}>venerdì 30 ottobre</div>
        <div style={{ fontSize: 124, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>16:00</div>
      </div>
      <div style={{ position: "absolute", top: 330, left: 16, right: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {NOTES.map((n, i) => {
          const p = notes[i] ?? 0;
          if (p <= 0) return null;
          return (
            <div key={i} style={{ opacity: clamp(p * 4), translate: `0 ${(1 - p) * -120}px`, scale: `${lerp(0.9, 1, clamp(p))}`, filter: `blur(${(1 - clamp(p * 1.5)) * 6}px)` }}>
              <div style={{ background: "rgba(245,245,247,.94)", borderRadius: 26, padding: "16px 18px", display: "flex", gap: 14 }}>
                <svg width={44} height={44} viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
                  <rect width="100" height="100" rx="22" fill="#1a1a1a" />
                  <path fillRule="evenodd" fill="#ececec" d="M44 20h12l21 60H64l-4.5-15h-19L36 80H23zm-6 36h24l-12-34z" />
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 15, color: "#6B6B6B" }}>
                    <span>TELEGRAM · AUTOCRATICO</span>
                    <span>ora</span>
                  </div>
                  <span style={{ fontFamily: SANS, fontSize: 20, fontWeight: 650, color: "#111" }}>{n.title}</span>
                  {n.body.map((l) => (
                    <span key={l} style={{ fontFamily: SANS, fontSize: 18, color: "#333" }}>{l}</span>
                  ))}
                </div>
              </div>
              {n.keys && (
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  {n.keys.map((k, j) => (
                    <span
                      key={k}
                      style={{
                        flex: 1, textAlign: "center", fontFamily: SANS, fontSize: 19, fontWeight: 650, padding: "14px 0", borderRadius: 18,
                        background: j === 0 ? `rgba(255,255,255,${0.95 - 0.25 * press})` : "rgba(255,255,255,.18)", color: j === 0 ? "#111" : "#fff", scale: `${j === 0 ? 1 - 0.06 * press : 1}`,
                      }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------- the month
export const M = { w: 1240, head: 54, rows: 6 };
export const CELL_W = M.w / 7;
export const CELL_H = 128;
export const M_H = M.head + M.rows * CELL_H;
/** Cell index -> date: the grid starts on Monday 26 October. */
const dateOf = (i: number) => (i < 6 ? { m: 10, d: 26 + i } : i - 5 <= 30 ? { m: 11, d: i - 5 } : { m: 12, d: i - 35 });

export const Month: React.FC<{ cell: (i: number) => number; letter: number; mark: number }> = ({ cell, letter, mark }) => (
  <div style={{ position: "relative", width: M.w, height: M_H, background: C.card, borderRadius: 28, border: `2px solid ${C.border}`, overflow: "hidden", boxShadow: "0 50px 100px -30px rgba(0,0,0,.35)" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", height: M.head, borderBottom: `1.5px solid ${C.border}` }}>
      {["LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"].map((d) => (
        <span key={d} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 15, fontWeight: 600, letterSpacing: "0.08em", color: C.muted }}>{d}</span>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: CELL_H }}>
      {Array.from({ length: 42 }, (_, i) => {
        const { m, d } = dateOf(i);
        const p = cell(i);
        const e = ease.outBack(clamp(p), 1.8);
        const chips = m === 11 ? (MONTH[d] ?? []) : [];
        const isLetter = m === 11 && d === 2;
        return (
          <div key={i} style={{ borderLeft: i % 7 ? `1.5px solid ${C.border}` : undefined, borderTop: i >= 7 ? `1.5px solid ${C.border}` : undefined, background: m !== 11 ? C.well : isLetter ? `rgba(239,168,16,${0.22 * mark})` : undefined, padding: 10, display: "flex", flexDirection: "column", gap: 6, opacity: clamp(p * 3), scale: `${lerp(0.75, 1, e)}` }}>
            <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, color: m !== 11 ? C.muted : C.ink }}>{d}</span>
            {isLetter && letter > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, background: `color-mix(in srgb, ${C.red} 15%, #fff)`, borderRadius: 7, padding: "3px 7px", fontFamily: SANS, fontSize: 14, fontWeight: 650, color: C.red, scale: `${ease.outBack(clamp(letter), 2.4)}`, transformOrigin: "0 50%" }}>
                11:20 Passaporto
              </span>
            )}
            {chips.slice(0, isLetter && letter > 0 ? 1 : 2).map((c, j) => {
              const q = clamp((p - 0.3 - j * 0.2) / 0.5);
              return (
                <span key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: C.ink, opacity: q, translate: `${(1 - q) * -12}px 0`, whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: c.color, flexShrink: 0 }} />
                  {c.time && <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{c.time}</span>}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  </div>
);
