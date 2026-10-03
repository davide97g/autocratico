// Bollo's choreography over the film: where he is, how big, what he looks at and does, line by line.
// Anchors are lyric words or bars, so it follows the aligned data. See _bollo-choreo.ts for the cue
// fields (x, y = head centre in frame px; s = px per 100 head units: s 40 ≈ a 170 px head, s 140 ≈
// 590 px, s 400 fills the frame).
import type { Crowd, Cue } from './_bollo-choreo';

const W = (line: string, word = 0, dt = 0, nth = 0) => ({ line, word, dt, nth });
const E = (line: string, word = 0, dt = 0, nth = 0) => ({ line, word, dt, nth, end: true });
const B = (bar: number, beat = 0, dt = 0) => ({ bar, beat, dt });

export const CUES: Cue[] = [
  // ---------------------------------------------------------------- open: the summons (0 – 10.72)
  { at: W('Raccomandata'), x: 1580, y: 860, s: 52, move: 'slam', show: true, act: 'scream', actDur: 1.55, look: 'camera', note: 'slams on with the first stamp, screams it at us' },
  { at: E('Raccomandata', 0, 0.06), look: [960, 560], act: 'smug', actDur: 0.9, note: 'eyes the stamp' },
  { at: B(0, 1), x: 400, y: 890, s: 44, move: 'hop', dur: 0.55, arc: 110, look: [900, 420], note: 'trots along the bottom, watching the globe turn' },
  { at: B(0, 3), look: 'camera' },
  { at: W('PEC', 0, -0.26), x: 1660, y: 300, s: 50, move: 'fly', dur: 0.26, arc: 130, note: 'leaps to the PEC stamp' },
  { at: W('PEC'), act: 'scream', actDur: 0.5 },
  { at: E('PEC', 0, 0.05), look: [1140, 590] },
  { at: W('F24', 0, -0.2), x: 1360, y: 600, s: 66, move: 'spring', dur: 0.32, look: 'camera' },
  { at: W('F24'), act: 'scream', actDur: 0.62 },
  { at: B(1, 3, -0.2), look: [1150, 480], act: 'bite', actDur: 0.6, note: 'bites the F24 stamp' },
  { at: B(2), x: 1520, y: 1330, move: 'smooth', dur: 0.45, show: false, note: 'ducks out before the big one' },
  { at: W('Scadenza'), from: { x: 1500, y: 1250, s: 85 }, x: 1500, y: 905, s: 85, move: 'spring', dur: 0.35, show: true, act: 'scream', actDur: 1.71, look: 'camera' },
  { at: B(2, 2), x: 960, y: 650, s: 330, move: 'zoom', dur: 0.4, rot: -0.05, note: 'into the lens for the held "Scadenzaaa"' },
  { at: B(3), x: 300, y: 900, s: 42, rot: 0, move: 'zoom', dur: 0.45, look: [520, 0], act: 'shiver', actDur: 1.2, note: 'back off: paper raining on him' },
  { at: B(3, 2), x: 300, y: 1320, move: 'smooth', dur: 0.5, show: false, note: 'buried' },

  // ---------------------------------------------------------------- pile: gerontocrazia (10.72 – 20.36)
  { at: W('La burocrazia'), from: { x: 1700, y: 1360 }, x: 1690, y: 930, s: 75, rot: -0.18, move: 'spring', dur: 0.5, show: true, look: [330, 240], note: 'peeks up at the register' },
  { at: W('La burocrazia', 5), look: [1250, 620], act: 'glare', actDur: 0.9 },
  { at: W('La burocrazia', 6), x: 1650, y: 230, s: 55, rot: 0.06, move: 'hop', dur: 0.3, arc: 90, look: [960, 700], act: 'shake', actDur: 0.75, note: 'no no: gerontocrazia' },
  { at: W('sei portali', 0, -0.16), x: 560, y: 120, s: 34, rot: 0, move: 'hop', dur: 0.2, arc: 70, look: [330, 330], note: 'hops portal to portal as they slam in' },
  { at: W('sei portali', 1, -0.16), x: 1180, y: 95, move: 'hop', dur: 0.2, arc: 60, look: [940, 300] },
  { at: W('sei portali', 2, -0.16), x: 1830, y: 150, move: 'hop', dur: 0.17, arc: 60, look: [1590, 330] },
  { at: W('sei portali', 3, -0.16), x: 600, y: 600, move: 'hop', dur: 0.17, arc: 60, look: [346, 800] },
  { at: W('sei portali', 4, -0.16), x: 1220, y: 590, move: 'hop', dur: 0.16, arc: 50, look: [986, 800] },
  { at: W('sei portali', 5, -0.16), x: 1830, y: 610, move: 'hop', dur: 0.2, arc: 50, look: [1600, 800] },
  { at: W('sei portali', 6), x: 1010, y: 900, s: 50, move: 'hop', dur: 0.3, arc: 80, look: 'camera' },
  { at: W('sei portali', 7), act: 'shake', actDur: 0.6, note: 'nobody warns you' },
  { at: W('IMU', 0, -0.12), x: 1770, y: 905, s: 44, move: 'hop', dur: 0.2, arc: 60, look: [500, 360] },
  { at: W('IMU'), act: 'startle', actDur: 0.45 },
  { at: W('IMU', 1), look: [1360, 300], act: 'gasp', actDur: 0.3 },
  { at: W('IMU', 2), s: 52, move: 'spring', dur: 0.3, look: 'camera', act: 'wink', actDur: 0.65, note: '"bollo": that is me' },
  { at: W('IMU', 3), x: 1790, y: 575, s: 42, move: 'hop', dur: 0.25, arc: 70, look: [1500, 505] },
  { at: W('IMU', 5, -0.17), look: [1560, 505], act: 'bite', actDur: 0.5, note: 'snaps at the PEC row' },
  { at: W('IMU', 6, 0.05), look: [600, 380] },
  { at: W('IMU', 7, -0.12), x: 430, y: 720, s: 44, move: 'hop', dur: 0.25, arc: 80, look: [200, 568] },
  { at: W('IMU', 7), act: 'glare', actDur: 0.5 },
  { at: W('evado'), x: -260, y: 700, move: 'smooth', dur: 0.7, look: 'camera', act: 'smug', actDur: 0.7, note: '"evado": he evades, off the left edge' },
  { at: W('evado', 4), from: { x: -220, y: 520, rot: 0.7 }, x: 40, y: 540, s: 62, rot: 0.5, move: 'spring', dur: 0.4, look: [960, 500], note: 'peeks back in' },
  { at: W('evado', 6), look: [960, 1000], act: 'gasp', actDur: 0.7 },
  { at: W('evado', 8, -0.13), x: 520, y: 520, s: 80, rot: 0.08, move: 'spring', dur: 0.14, look: [760, 440] },
  { at: W('evado', 8, -0.21), act: 'bite', actDur: 0.6, note: 'bites the cartella: bam!' },

  // ---------------------------------------------------------------- queue: torni martedì alle tre (20.36 – 29.68)
  { at: W('Busta verde'), x: 1530, y: 800, s: 60, rot: -0.08, move: 'cut', look: [900, 380], note: 'a cat on the doormat, sniffing the green envelope' },
  { at: W('Busta verde', 1), x: 1420, y: 740, move: 'drift', dur: 1.0, look: [980, 430] },
  { at: W('Busta verde', 3), look: [1350, 1000], note: 'zerbino: looks down at the mat' },
  { at: W('Busta verde', 4), look: 'camera', act: 'glare', actDur: 0.9, note: 'già lo so com’è' },
  { at: W('Busta verde', 6), act: 'shake', actDur: 0.6 },
  { at: W('fila'), x: 330, y: 930, s: 40, rot: 0, move: 'cut', look: [330, 480] },
  { at: W('fila', 1, -0.05), x: 960, y: 935, move: 'hop', dur: 0.12, arc: 50, look: [960, 480] },
  { at: W('fila', 1, 0.06), act: 'startle', actDur: 0.35, note: 'the TIMBRO stamp makes him jump' },
  { at: W('fila', 2, -0.08), x: 1600, y: 940, move: 'hop', dur: 0.16, arc: 60, look: [1600, 420] },
  { at: W('fila', 3), x: 1480, y: 760, s: 68, move: 'spring', dur: 0.4, look: [960, 600], note: 'reads the ticket' },
  { at: W('fila', 4), look: [900, 720], act: 'gasp', actDur: 0.4 },
  { at: W('fila', 5), look: 'camera', act: 'glare', actDur: 0.8, note: 'martedì alle tre?!' },
  { at: W('fila', 6), act: 'shake', actDur: 0.5 },
  { at: W('scadenze sparse'), from: { x: 1460, y: -260, rot: Math.PI }, x: 1460, y: 70, s: 56, rot: Math.PI, move: 'spring', dur: 0.45, look: [960, 560], note: 'hangs upside down from the top edge, watching dates multiply' },
  { at: B(10, 0), look: [420, 700] },
  { at: B(10, 1), look: [1500, 760] },
  { at: B(10, 2), look: [700, 980], act: 'shiver', actDur: 0.5 },
  { at: W('te le ricordano'), x: 1660, y: 880, s: 56, rot: Math.PI * 2, move: 'fly', dur: 0.45, arc: -80, look: [900, 600], note: 'drops down and lands' },
  { at: W('te le ricordano', 5), look: [560, 480], act: 'gasp', actDur: 0.45, note: 'the costs' },
  { at: W('te le ricordano', 7), look: [1250, 520], act: 'chomp', actDur: 0.55, note: 'eats the amounts as they black out' },

  // ---------------------------------------------------------------- follia: the manifesto (29.68 – 41.53)
  { at: W('La multa'), x: 1460, y: 595, s: 50, rot: 0, move: 'cut', look: [700, 420], note: 'beside the question, reading it' },
  { at: W('La multa', 3), look: [620, 560], act: 'glare', actDur: 2.0 },
  { at: W('La multa', 5), look: 'camera', note: 'Stato? — glares at us' },
  { at: W('Follia!', 0, -0.06, 0), x: 960, y: 1000, s: 82, move: 'zoom', dur: 0.2, act: 'scream', actDur: 0.62, look: 'camera' },
  { at: W('Credere'), from: { x: 2150, y: 760, rot: -0.6 }, x: 1890, y: 760, s: 72, rot: -0.5, move: 'spring', dur: 0.45, look: [800, 500], note: 'leans in from the right edge' },
  { at: W('Credere', 3), look: [900, 640] },
  { at: W('Credere', 7), look: 'camera', act: 'shake', actDur: 0.7, note: 'a qualcuno? no' },
  { at: W('Carte perse'), x: 1560, y: 885, s: 52, rot: 0, move: 'hop', dur: 0.3, arc: 90, look: [300, 860], note: 'carte perse: searching' },
  { at: W('Carte perse', 1), look: [1850, 250] },
  { at: W('Carte perse', 1, 0.25), look: [1500, 1050] },
  { at: W('Carte perse', 2), look: [700, 560] },
  { at: W('Carte perse', 3), look: 'camera', act: 'glare', actDur: 0.5 },
  { at: W('Follia!', 0, -0.05, 1), x: 960, y: 640, s: 340, move: 'zoom', dur: 0.25, act: 'scream', actDur: 0.6, look: 'camera', note: 'FOLLIA! into the lens' },
  { at: W('devono'), x: 1500, y: 905, s: 52, move: 'zoom', dur: 0.35, look: [700, 380] },
  { at: W('devono', 4), x: 1730, y: 955, s: 48, move: 'spring', dur: 0.3, act: 'scream', actDur: 0.85, look: 'camera' },
  { at: W('devono', 4, 0.26), act: 'hold', actDur: 0.42, note: 'visibili!: everything freezes, him too' },
  { at: W('devono', 5, -0.16), x: 1560, y: 330, s: 56, move: 'hop', dur: 0.3, arc: 60, act: 'gasp', actDur: 0.3, look: [960, 470] },
  { at: W('devono', 5, 0.3), x: 960, y: 470, s: 1.5, rot: Math.PI * 5, move: 'suck', dur: 1.1, act: 'scream', actDur: 1.1, note: 'Centralizzate!: pulled into the point, spinning' },
  { at: W('devono', 5, 1.32), show: false, move: 'cut' },

  // ---------------------------------------------------------------- drop: il futuro è automatico (41.53 – 46.88)
  // gone into the point; the white silence and the bar are his to sit out. He comes back for "autocratico!"
  { at: W('Il futuro', 4, -0.05, 0), x: 960, y: 935, s: 60, rot: 0, move: 'slam', show: true, act: 'scream', actDur: 0.62, look: 'camera', note: 'back with a slam under AUTOCRATICO' },
  { at: E('Il futuro', 4, 0, 0), look: [960, 540], act: 'smug', actDur: 0.4 },
  { at: W('Pratico', 0, -0.1), x: 820, y: 175, s: 40, move: 'hop', dur: 0.24, arc: 80, look: [430, 180], note: 'up beside the line' },
  { at: W('Pratico', 1, -0.08), x: 1340, y: 175, move: 'zoom', dur: 0.16, look: [760, 180], note: 'rapido: a whip' },
  { at: W('Pratico', 2, -0.12), x: 1790, y: 185, s: 42, move: 'hop', dur: 0.2, arc: 60, look: 'camera' },
  { at: W('Pratico', 2), act: 'scream', actDur: 0.8 },

  // ---------------------------------------------------------------- inbox: mandagli tutto (46.88 – 51.48)
  { at: W('Mandagli'), x: 950, y: 935, s: 50, move: 'cut', look: 'camera', note: 'between the line and the phone' },
  { at: W('Mandagli', 1), look: [1330, 420], act: 'smug', actDur: 0.4 },
  { at: W('Mandagli', 2), look: 'camera', act: 'wink', actDur: 0.45, note: '"lui": that is me' },
  { at: W('Mandagli', 3), look: [1330, 330] },
  { at: W('Mandagli', 3, 0.15), look: [1300, 520] },
  { at: W('Mandagli', 5), look: [1320, 700], act: 'nod', actDur: 0.8, note: 'archivia' },
  { at: W('rosso'), x: 560, y: 900, s: 50, move: 'cut', look: [1210, 480], act: 'glare', actDur: 0.6 },
  { at: W('rosso', 3, 0.1), look: [1694, 174], act: 'startle', actDur: 0.55, note: 'the bell goes off' },
  { at: W('rosso', 5), look: 'camera', act: 'smug', actDur: 0.35 },
  { at: W('rosso', 6, -0.05), x: 2250, y: 640, s: 50, rot: 0.4, move: 'smooth', dur: 0.35, note: '"e via": gone, out of the frame' },

  // ---------------------------------------------------------------- hero: the next task (51.48 – 54.21)
  { at: W('Il futuro', 0, 0, 1), from: { x: 380, y: 1300, rot: 0.3 }, x: 560, y: 470, s: 72, rot: 0.05, move: 'spring', dur: 0.5, show: true, look: [1224, 319], act: 'awe', actDur: 1.05, note: 'a cat and a shiny ball' },
  { at: W('Il futuro', 1, 0.1, 1), act: 'shiver', actDur: 0.35, note: 'the wiggle before the pounce' },
  { at: W('Il futuro', 3, 0.05, 1), x: 1090, y: 330, s: 62, move: 'fly', dur: 0.28, arc: 120, look: [1235, 315] },
  { at: W('Il futuro', 3, 0.15, 1), act: 'bite', actDur: 0.55, note: 'bites the orb' },
  { at: W('Il futuro', 4, -0.22, 1), x: 1815, y: 900, s: 46, move: 'hop', dur: 0.22, arc: 120, look: 'camera' },
  { at: W('Il futuro', 4, 0, 1), act: 'scream', actDur: 0.85 },

  // ---------------------------------------------------------------- italia: l'Italia lenta e pallosa (54.21 – 61.45)
  { at: W('In un attimo'), x: 1470, y: 560, s: 40, move: 'slam', look: 'camera', note: 'in un attimo: he is in Rome on the map' },
  { at: W('In un attimo', 2), look: [500, 560] },
  { at: W('In un attimo', 3, -0.12), x: 1790, y: 150, s: 44, move: 'hop', dur: 0.2, arc: 80, look: 'camera' },
  { at: W('In un attimo', 3), act: 'scream', actDur: 1.6, note: 'rivoluzioniamo!' },
  { at: W("l'Italia"), x: 760, y: 850, s: 62, move: 'cut', look: [960, 500], act: 'bored', actDur: 1.3 },
  { at: W("l'Italia", 1), x: 1560, y: 870, move: 'drift', dur: 2.4, act: 'bored', actDur: 1.0, note: 'lenta: a slow drift across' },
  { at: W("l'Italia", 3, 0.05), look: 'camera', act: 'yawn', actDur: 1.25, note: 'pallosa: the long yawn' },
  { at: W("l'Italia", 3, 1.15), act: 'sleep', actDur: 1.2, note: 'nods off' },
  { at: W('Autocratico!', 0, -0.02, 3), act: 'startle', actDur: 0.5, look: [960, 480], note: 'the black stamp wakes him' },
  { at: W('Autocratico!', 0, 0.18, 3), act: 'scream', actDur: 0.75 },

  // ---------------------------------------------------------------- phone: the examples (61.45 – 71.88)
  { at: W('Inoltro'), move: 'cut', show: false, note: 'a beat of quiet after the shout' },
  { at: W('Inoltro', 1, -0.04), from: { s: 0 }, x: 1770, y: 770, s: 50, rot: 0, move: 'spring', dur: 0.35, show: true, look: 'camera', act: 'smug', actDur: 0.5, note: 'scatto: pops in to pose for the photo' },
  { at: W('Inoltro', 1, 0.12), act: 'wink', actDur: 0.38 },
  { at: W('Inoltro', 3), look: [1340, 560] },
  { at: W('Inoltro', 4), look: [1056, 725], note: 'in un minuto: eyes on the ring' },
  { at: W('Inoltro', 8), look: [1050, 725], act: 'nod', actDur: 0.55, note: 'archiviato' },
  { at: W('falso'), x: 640, y: 830, s: 62, move: 'cut', look: [1300, 460], act: 'glare', actDur: 0.7, note: 'suspicious of the sender' },
  { at: W('falso', 2), look: [1300, 520], act: 'gasp', actDur: 0.75, note: '«paga subito»?' },
  { at: W('falso', 4, -0.1), x: 860, y: 780, s: 70, move: 'spring', dur: 0.3, look: [1400, 680], act: 'bite', actDur: 0.45, note: 'Phishing: he snaps at it' },
  { at: W('falso', 5, 0.05), look: [1460, 690], act: 'nod', actDur: 0.5, note: 'segnalato' },
  { at: W('falso', 5, 0.4), look: 'camera', act: 'smug', actDur: 0.35 },
  { at: W('Telegram'), x: 560, y: 860, s: 58, move: 'cut', look: [1330, 500] },
  { at: W('Telegram', 2), look: [1641, 197], note: '08:30' },
  { at: W('Telegram', 5), look: [1080, 858] },
  { at: W('Telegram', 8, -0.14), x: 640, y: 800, s: 68, move: 'hop', dur: 0.2, arc: 120, look: 'camera' },
  { at: W('Telegram', 8), act: 'scream', actDur: 0.42, note: 'Fatto!' },
  { at: W('Telegram', 8, 0.42), look: [1340, 597], act: 'laugh', actDur: 0.55 },
  { at: W('non paga'), x: 1000, y: 905, s: 54, move: 'cut', look: [1357, 540], note: 'the Paga button, never pressed' },
  { at: W('non paga', 2), act: 'shake', actDur: 0.55 },
  { at: W('non paga', 7), look: [1400, 650], act: 'nod', actDur: 0.4 },
  { at: W('non paga', 8), look: 'camera', act: 'smug', actDur: 1.3, note: 'non un ricatto (the kit drops out: he keeps still)' },

  // ---------------------------------------------------------------- chant: futuro autocratico (71.88 – 76.55)
  { at: E('non paga', 10), move: 'cut', show: false, note: 'off for the cut, back from the right edge' },
  { at: W('futuro autocratico', 0, -0.1, 0), from: { x: 2100, y: 560, rot: -0.5 }, x: 1680, y: 560, s: 78, rot: -0.12, move: 'spring', dur: 0.4, show: true, look: 'camera' },
  { at: W('futuro autocratico', 0, 0, 0), act: 'scream', actDur: 0.9 },
  { at: W('futuro autocratico', 1, -0.14, 0), x: 250, y: 560, s: 78, rot: 0.12, move: 'fly', dur: 0.24, arc: 160 },
  { at: W('futuro autocratico', 1, 0, 0), act: 'scream', actDur: 0.8 },
  { at: W('futuro autocratico', 0, -0.05, 1), x: 960, y: 590, s: 68, rot: 0, move: 'zoom', dur: 0.3, act: 'scream', actDur: 1.55, note: 'the crowd chants with him' },
  { at: B(30, 3), x: 960, y: 610, s: 340, move: 'zoom', dur: 0.3, act: 'scream', actDur: 0.62, note: 'AUTOCRATICO into the lens' },

  // ---------------------------------------------------------------- outro: the close (76.55 – 83.6)
  { at: B(31), x: 1800, y: 560, s: 48, rot: 0, move: 'cut', look: [700, 500], act: 'smug', actDur: 1.2, note: 'calm now, at the edge' },
  { at: B(31, 2), look: [1746, 886] },
  { at: B(32, 0, -0.32), x: 1746, y: 742, s: 38, move: 'hop', dur: 0.32, arc: 150, note: 'he presses P' },
  { at: B(32, 0, 0.2), look: [900, 560], act: 'smug', actDur: 1.0, note: 'privacy: the numbers become bars' },
  { at: B(32, 2), look: 'camera' },
  { at: W('Il futuro', 0, -0.3, 2), x: 1630, y: 590, s: 44, move: 'hop', dur: 0.3, arc: 110, look: 'camera', note: 'sings the last line beside it' },
  { at: W('Il futuro', 3, 0.2, 2), look: [960, 600] },
  { at: 81.658, move: 'cut', show: false, note: 'hard black' },
  { at: 81.95, from: { x: 1265, y: -260, rot: 0.4 }, x: 1262, y: 340, s: 44, rot: 0.08, move: 'spring', dur: 0.5, zeta: 0.32, show: true, look: [960, 318], note: 'lands beside the icon' },
  { at: 82.5, look: 'camera', act: 'smug', actDur: 1.4 },
  { at: 82.7, act: 'wink', actDur: 0.62 },
];

export const CROWDS: Crowd[] = [
  {
    at: W('Follia!', 0, -0.04, 0), dur: 0.44, note: 'FOLLIA! is shouted by a crowd: Bollos from every edge',
    spots: [[150, 1030, 62, 0.25], [560, 1100, 50, -0.1], [1380, 1095, 52, 0.12], [1790, 1010, 66, -0.25], [-20, 560, 58, 0.95], [1940, 470, 56, -0.95], [420, -20, 46, Math.PI - 0.15], [1530, -10, 50, Math.PI + 0.2]],
  },
  {
    at: W('futuro autocratico', 0, -0.03, 1), dur: 1.56, note: 'the second chant: a crowd from the edges',
    spots: [[-30, 500, 74, 1.0], [1950, 540, 74, -1.0], [-20, 800, 60, 1.15], [1940, 820, 60, -1.15], [330, 560, 48, 0.2], [1590, 580, 48, -0.2]],
  },
];
