// The made-up week and month the spot shows: a busy person's calendar, as Google Calendar syncs it into
// Autocratico, with the register's deadlines on their days. Nothing here is real.
import { C } from "../kit/theme";

export type Cal = "personal" | "work" | "family" | "sport";
export const CAL: Record<Cal, string> = { personal: C.blue, work: C.work, family: C.family, sport: C.sport };

export type Ev = { day: number; start: string; end: string; title: string; cal: Cal; important?: boolean; where?: string };
export type AllDay = { day: number; title: string; color: string; deadline?: boolean };

export const DAYS = ["LUN 26", "MAR 27", "MER 28", "GIO 29", "VEN 30", "SAB 31", "DOM 1"];
export const HOURS = { from: 8, to: 21 };

export const WEEK: Ev[] = [
  { day: 0, start: "08:00", end: "08:45", title: "Corsa al parco", cal: "sport" },
  { day: 0, start: "09:30", end: "10:00", title: "Stand-up", cal: "work" },
  { day: 0, start: "11:00", end: "12:30", title: "Call fornitore", cal: "work" },
  { day: 0, start: "13:00", end: "14:00", title: "Pranzo con Giulia", cal: "personal" },
  { day: 0, start: "16:00", end: "17:00", title: "Pediatra", cal: "family", important: true },
  { day: 0, start: "18:30", end: "19:30", title: "Palestra", cal: "sport" },
  { day: 1, start: "09:30", end: "10:00", title: "Stand-up", cal: "work" },
  { day: 1, start: "10:15", end: "11:45", title: "Sprint review", cal: "work" },
  { day: 1, start: "13:30", end: "14:15", title: "Ritiro raccomandata", cal: "personal", important: true },
  { day: 1, start: "17:30", end: "18:30", title: "Inglese", cal: "personal" },
  { day: 1, start: "20:00", end: "21:00", title: "Calcetto", cal: "sport" },
  { day: 2, start: "08:15", end: "09:00", title: "Scuola: entrata", cal: "family" },
  { day: 2, start: "09:30", end: "10:00", title: "Stand-up", cal: "work" },
  { day: 2, start: "11:00", end: "12:00", title: "Commercialista", cal: "personal" },
  { day: 2, start: "12:30", end: "13:30", title: "Pranzo team", cal: "work" },
  { day: 2, start: "16:00", end: "17:00", title: "Colloquio maestre", cal: "family" },
  { day: 2, start: "19:30", end: "21:00", title: "Cena da mamma", cal: "family" },
  { day: 3, start: "09:30", end: "10:00", title: "Stand-up", cal: "work" },
  { day: 3, start: "10:30", end: "11:30", title: "CAF: 730", cal: "personal", important: true },
  { day: 3, start: "12:30", end: "13:30", title: "Budget Q4", cal: "work" },
  { day: 3, start: "18:30", end: "19:30", title: "Palestra", cal: "sport" },
  { day: 4, start: "09:30", end: "10:00", title: "Stand-up", cal: "work" },
  { day: 4, start: "11:00", end: "11:45", title: "1:1 con Laura", cal: "work" },
  { day: 4, start: "14:00", end: "15:30", title: "Demo cliente", cal: "work" },
  { day: 4, start: "19:00", end: "20:30", title: "Aperitivo", cal: "personal" },
  { day: 5, start: "09:00", end: "10:30", title: "Treno per Torino", cal: "personal", important: true },
  { day: 5, start: "13:00", end: "14:30", title: "Pranzo da Zia", cal: "family" },
  { day: 6, start: "08:30", end: "09:30", title: "Revisione auto", cal: "personal", important: true },
  { day: 6, start: "17:00", end: "18:30", title: "Rientro", cal: "personal" },
];

export const ALLDAY: AllDay[] = [
  { day: 0, title: "Controllo dentista", color: C.orange, deadline: true },
  { day: 0, title: "Compleanno Luca", color: C.blue },
  { day: 3, title: "Carta d'identità", color: C.orange, deadline: true },
  { day: 4, title: "Weekend a Torino", color: C.blue },
  { day: 5, title: "Weekend a Torino", color: C.blue },
  { day: 6, title: "Rata condominio", color: C.amber, deadline: true },
];

/** The event the agent adds, then moves. */
export const DENTIST = { title: "Visita dal dentista", thu: { day: 3, start: "15:00", end: "16:00" }, fri: { day: 4, start: "17:00", end: "18:00" } };

// ---------------------------------------------------------------- November, for the month
export type Chip = { title: string; color: string; time?: string };
/** Day of November -> its chips (dots in the month). */
export const MONTH: Record<number, Chip[]> = {
  2: [{ title: "Stand-up", color: C.work, time: "09:30" }],
  3: [{ title: "Stand-up", color: C.work, time: "09:30" }, { title: "Dentista", color: C.red, time: "17:00" }],
  4: [{ title: "Sprint", color: C.work, time: "10:00" }, { title: "Inglese", color: C.blue, time: "17:30" }],
  5: [{ title: "Affitto box", color: C.amber }, { title: "Palestra", color: C.sport, time: "18:30" }],
  6: [{ title: "Demo", color: C.work, time: "14:00" }, { title: "Aperitivo", color: C.blue, time: "19:00" }],
  7: [{ title: "Matrimonio Sara", color: C.family }],
  9: [{ title: "Stand-up", color: C.work, time: "09:30" }, { title: "Pediatra", color: C.red, time: "16:00" }],
  10: [{ title: "Calcetto", color: C.sport, time: "20:00" }],
  11: [{ title: "Commercialista", color: C.blue, time: "11:00" }],
  12: [{ title: "Festa scuola", color: C.family }, { title: "Palestra", color: C.sport, time: "18:30" }],
  13: [{ title: "1:1 Laura", color: C.work, time: "11:00" }],
  14: [{ title: "Gita al lago", color: C.family }],
  16: [{ title: "Gomme invernali", color: C.orange }, { title: "Stand-up", color: C.work, time: "09:30" }],
  17: [{ title: "Caldaia", color: C.amber }, { title: "Inglese", color: C.blue, time: "17:30" }],
  18: [{ title: "Budget", color: C.work, time: "12:30" }],
  19: [{ title: "Palestra", color: C.sport, time: "18:30" }],
  20: [{ title: "Cena aziendale", color: C.work, time: "20:00" }],
  23: [{ title: "Stand-up", color: C.work, time: "09:30" }],
  24: [{ title: "Visita oculista", color: C.red, time: "15:00" }],
  25: [{ title: "Inglese", color: C.blue, time: "17:30" }],
  26: [{ title: "Palestra", color: C.sport, time: "18:30" }],
  27: [{ title: "Black Friday", color: C.purple }],
  30: [{ title: "Bollo auto", color: C.amber }, { title: "Acconto IRPEF", color: C.orange }],
};
/** The appointment found in a letter: added to Monday 2 November. */
export const LETTER = { day: 2, title: "Ritiro passaporto", time: "11:20", where: "Questura, via Verdi 2", full: "Ritiro passaporto in Questura" };
