// Bollo's choreography for the upright cut (?aspect=9x16, 1080x1920): the same acts on the same words as
// bollo-choreo.ts (scream, bite, gaze… keep their anchors exactly), restaged for a phone screen. The
// platform covers the bottom 470 px (caption) and the right 160 px below y 900 (buttons), so he lives
// in the free pockets each plate leaves: the lower right of SAFE, beside a left-aligned lyric, the upper
// band, or leaning in from the left edge. Bigger than in the wide cut (s 80 ≈ 340 px wide, 415 tall).
// Fields as in _bollo-choreo.ts: x, y = head centre in frame px; s = px per 100 head units (the head
// is ≈ 420 × 520 units with the ears).
import type { Crowd, Cue } from './_bollo-choreo';

const W = (line: string, word = 0, dt = 0, nth = 0) => ({ line, word, dt, nth });
const E = (line: string, word = 0, dt = 0, nth = 0) => ({ line, word, dt, nth, end: true });
const B = (bar: number, beat = 0, dt = 0) => ({ bar, beat, dt });

export const CUES_V: Cue[] = [
  // ---------------------------------------------------------------- open: the summons (0 – 10.72)
  // stamps fill the width (RACCOMANDATA y 535–745, PEC 360–795, F24 780–1300, SCADENZA 660–890)
  { at: W('Raccomandata'), from: { x: 600, y: 1160, s: 0 }, x: 600, y: 1160, s: 95, move: 'zoom', dur: 0.15, show: true, act: 'scream', actDur: 1.55, look: 'camera', note: 'pops on under the first stamp (a slam\'s 1.75× would cover it on its hit)' },
  { at: E('Raccomandata', 0, 0.06), look: [480, 640], act: 'smug', actDur: 0.9 },
  { at: B(0, 1), x: 330, y: 1090, s: 80, move: 'hop', dur: 0.55, arc: 110, look: [560, 560], note: 'trots left, watching the globe' },
  { at: B(0, 3), look: 'camera' },
  { at: W('PEC', 0, -0.26), x: 700, y: 1110, s: 78, move: 'fly', dur: 0.26, arc: 130, note: 'leaps under the PEC stamp' },
  { at: W('PEC'), act: 'scream', actDur: 0.5 },
  { at: E('PEC', 0, 0.05), look: [460, 1040] },
  { at: W('F24', 0, -0.2), x: 700, y: 560, s: 80, move: 'spring', dur: 0.32, look: 'camera', note: 'up above where F24 lands' },
  { at: W('F24'), act: 'scream', actDur: 0.62 },
  { at: B(1, 3, -0.2), look: [470, 1040], act: 'bite', actDur: 0.6, note: 'bites down at the F24 stamp' },
  { at: B(2), x: 700, y: -320, move: 'smooth', dur: 0.45, show: false, note: 'ducks out over the top' },
  { at: W('Scadenza'), from: { x: 660, y: 1700, s: 85 }, x: 660, y: 1225, s: 85, move: 'spring', dur: 0.35, show: true, act: 'scream', actDur: 1.71, look: 'camera', note: 'up under the SCADENZA bar' },
  { at: B(2, 2), x: 540, y: 240, s: 140, move: 'zoom', dur: 0.4, rot: -0.05, note: 'into the lens, looming from the top edge over the bar' },
  { at: B(3), x: 300, y: 470, s: 50, rot: 0, move: 'zoom', dur: 0.45, look: [520, 0], act: 'shiver', actDur: 1.2, note: 'back off, above the bar: paper raining on him' },
  { at: B(3, 2), x: 330, y: 560, s: 34, move: 'smooth', dur: 0.5, show: false, note: 'buried' },

  // ---------------------------------------------------------------- pile: gerontocrazia (10.72 – 20.36)
  { at: W('La burocrazia'), from: { x: 640, y: 1750 }, x: 640, y: 1230, s: 82, rot: -0.12, move: 'spring', dur: 0.5, show: true, look: [400, 300], note: 'peeks up at the register' },
  { at: W('La burocrazia', 5), look: [500, 650], act: 'glare', actDur: 0.9 },
  { at: W('La burocrazia', 6, -0.3), x: 780, y: 1320, s: 56, rot: 0.06, move: 'hop', dur: 0.25, arc: 30, note: 'settles under where GERONTOCRAZIA lands' },
  { at: W('La burocrazia', 6), look: [500, 1060], act: 'shake', actDur: 0.75, note: 'no no: gerontocrazia' },
  { at: W('sei portali', 0, -0.16), x: 280, y: 400, s: 46, rot: 0, move: 'hop', dur: 0.2, arc: 70, look: [280, 600], note: 'perches on each portal as it slams in' },
  { at: W('sei portali', 1, -0.16), x: 790, y: 330, move: 'hop', dur: 0.2, arc: 60, look: [790, 540] },
  { at: W('sei portali', 2, -0.16), x: 280, y: 800, move: 'hop', dur: 0.17, arc: 60, look: [280, 1000] },
  { at: W('sei portali', 3, -0.16), x: 790, y: 780, move: 'hop', dur: 0.17, arc: 60, look: [790, 960] },
  { at: W('sei portali', 4, -0.16), x: 540, y: 1010, move: 'hop', dur: 0.16, arc: 50, look: [280, 1450] },
  { at: W('sei portali', 5, -0.16), x: 790, y: 1200, move: 'hop', dur: 0.2, arc: 50, look: [790, 1400] },
  { at: W('sei portali', 6), x: 740, y: 1240, s: 66, move: 'hop', dur: 0.3, arc: 80, look: 'camera' },
  { at: W('sei portali', 7), act: 'shake', actDur: 0.6, note: 'nobody warns you' },
  { at: W('IMU', 0, -0.12), x: 800, y: 470, s: 56, move: 'hop', dur: 0.2, arc: 60, look: [360, 650], note: 'up right of the IMU stamp' },
  { at: W('IMU'), act: 'startle', actDur: 0.45 },
  { at: W('IMU', 1), look: [600, 920], act: 'gasp', actDur: 0.3 },
  { at: W('IMU', 2), s: 66, move: 'spring', dur: 0.3, look: 'camera', act: 'wink', actDur: 0.65, note: '"bollo": that is me' },
  { at: W('IMU', 3), x: 880, y: 520, s: 52, move: 'hop', dur: 0.25, arc: 70, look: [500, 745], note: 'over the inbox, above the PEC row' },
  { at: W('IMU', 5, -0.17), look: [560, 745], act: 'bite', actDur: 0.5, note: 'snaps at the PEC row' },
  { at: W('IMU', 6, 0.05), look: [300, 1300] },
  { at: W('IMU', 7, -0.12), x: 760, y: 990, s: 60, move: 'hop', dur: 0.25, arc: 80, look: [650, 1205], note: 'glares down at the Spam tab' },
  { at: W('IMU', 7), act: 'glare', actDur: 0.5 },
  { at: W('evado'), x: -280, y: 1150, move: 'smooth', dur: 0.7, look: 'camera', act: 'smug', actDur: 0.7, note: '"evado": off the left edge' },
  { at: W('evado', 4), from: { x: -240, y: 1200, rot: 0.7 }, x: 40, y: 1230, s: 80, rot: 0.5, move: 'spring', dur: 0.4, look: [500, 850], note: 'peeks back in under the line' },
  { at: W('evado', 6), look: [560, 1300], act: 'gasp', actDur: 0.7 },
  { at: W('evado', 7, 0.3), x: -300, y: 1260, move: 'smooth', dur: 0.3, note: 'ducks back out' },
  { at: W('evado', 8, -0.13), from: { x: 1200, y: 150, rot: 0.5 }, x: 930, y: 320, s: 78, rot: 0.1, move: 'spring', dur: 0.14, look: [880, 640], note: 'onto the cartella\'s corner, clear of BAM' },
  { at: W('evado', 8, -0.21), act: 'bite', actDur: 0.6, note: 'bites the cartella: bam!' },

  // ---------------------------------------------------------------- queue: torni martedì alle tre (20.36 – 29.68)
  { at: W('Busta verde'), x: 730, y: 1120, s: 72, rot: -0.08, move: 'cut', look: [560, 800], note: 'on the doormat under the envelope' },
  { at: W('Busta verde', 1), x: 700, y: 1100, move: 'drift', dur: 1.0, look: [600, 760] },
  { at: W('Busta verde', 3), look: [500, 1500], note: 'zerbino: looks down at the mat' },
  { at: W('Busta verde', 4), look: 'camera', act: 'glare', actDur: 0.9 },
  { at: W('Busta verde', 6), act: 'shake', actDur: 0.6 },
  { at: W('fila'), x: 230, y: 590, s: 48, rot: 0, move: 'cut', look: [230, 330], note: 'down the stack: under FILA' },
  { at: W('fila', 1, -0.05), x: 270, y: 1030, move: 'hop', dur: 0.12, arc: 50, look: [690, 850], note: 'under TIMBRO' },
  { at: W('fila', 1, 0.06), act: 'startle', actDur: 0.35, note: 'the stamp makes him jump' },
  { at: W('fila', 2, -0.08), x: 330, y: 1150, s: 44, move: 'hop', dur: 0.16, arc: 60, look: [850, 1250], note: 'above NUMERINO' },
  { at: W('fila', 3), x: 1040, y: 340, s: 60, rot: -0.55, move: 'hop', dur: 0.4, arc: 120, look: [520, 520], note: 'leans in from the right edge to read the ticket' },
  { at: W('fila', 4), look: [450, 1150], act: 'gasp', actDur: 0.4 },
  { at: W('fila', 5), look: 'camera', act: 'glare', actDur: 0.8, note: 'martedì alle tre?!' },
  { at: W('fila', 6), act: 'shake', actDur: 0.5 },
  { at: W('fila', 6, 0.12), x: 1260, y: 260, move: 'smooth', dur: 0.3, note: 'slides off as the ticket fills the frame' },
  { at: W('scadenze sparse'), from: { x: 600, y: -280, rot: Math.PI }, x: 600, y: 330, s: 66, rot: Math.PI, move: 'spring', dur: 0.45, look: [540, 900], note: 'hangs upside down from the top edge' },
  { at: B(10, 0), look: [250, 1000] },
  { at: B(10, 1), look: [850, 900] },
  { at: B(10, 2), look: [400, 1300], act: 'shiver', actDur: 0.5 },
  { at: W('te le ricordano'), x: 45, y: 680, s: 64, rot: Math.PI * 2 + 0.45, move: 'fly', dur: 0.45, arc: -80, look: [500, 700], note: 'swings round to the left edge, clear of the amounts' },
  { at: W('te le ricordano', 5), look: [430, 420], act: 'gasp', actDur: 0.45, note: 'the costs' },
  { at: W('te le ricordano', 7), look: [450, 1000], act: 'chomp', actDur: 0.55, note: 'eats the amounts as they black out' },

  // ---------------------------------------------------------------- follia: the manifesto (29.68 – 41.53)
  { at: W('La multa'), x: 700, y: 1180, s: 82, rot: 0, move: 'cut', look: [400, 500], note: 'in the notice\'s empty lower half, reading' },
  { at: W('La multa', 3), look: [400, 700], act: 'glare', actDur: 2.0 },
  { at: W('La multa', 5), look: 'camera', note: 'Stato? — glares at us' },
  { at: W('Follia!', 0, -0.06, 0), x: 540, y: 150, s: 100, move: 'zoom', dur: 0.2, act: 'scream', actDur: 0.62, look: 'camera', note: 'bursts in from the top edge, the stamp below' },
  { at: W('Credere'), from: { x: 1250, y: 310, rot: -0.7 }, x: 940, y: 310, s: 74, rot: -0.45, move: 'spring', dur: 0.45, look: [400, 650], note: 'leans in from the right edge, above the text' },
  { at: W('Credere', 3), look: [450, 780] },
  { at: W('Credere', 7), look: 'camera', act: 'shake', actDur: 0.7, note: 'a qualcuno? no' },
  { at: W('Carte perse'), x: 720, y: 1190, s: 72, rot: 0, move: 'hop', dur: 0.3, arc: 90, look: [200, 1300], note: 'carte perse: searching' },
  { at: W('Carte perse', 1), look: [950, 300] },
  { at: W('Carte perse', 1, 0.25), look: [700, 1500] },
  { at: W('Carte perse', 2), look: [450, 600] },
  { at: W('Carte perse', 3), look: 'camera', act: 'glare', actDur: 0.5 },
  { at: W('Follia!', 0, -0.05, 1), x: 540, y: 110, s: 150, move: 'zoom', dur: 0.25, act: 'scream', actDur: 0.6, look: 'camera', note: 'FOLLIA! into the lens from the top, the stamp clear below' },
  { at: W('devono'), x: 780, y: 450, s: 66, move: 'zoom', dur: 0.35, look: [420, 760], note: 'above the manifesto' },
  { at: W('devono', 4), x: 760, y: 430, s: 74, move: 'spring', dur: 0.3, act: 'scream', actDur: 0.85, look: 'camera' },
  { at: W('devono', 4, 0.26), act: 'hold', actDur: 0.42, note: 'visibili!: everything freezes, him too' },
  { at: W('devono', 5, -0.16), x: 760, y: 560, s: 66, move: 'hop', dur: 0.3, arc: 60, act: 'gasp', actDur: 0.3, look: [492, 845] },
  { at: W('devono', 5, 0.3), x: 492, y: 845, s: 1.5, rot: Math.PI * 5, move: 'suck', dur: 1.1, act: 'scream', actDur: 1.1, note: 'Centralizzate!: pulled into the point, spinning' },
  { at: W('devono', 5, 1.32), show: false, move: 'cut' },

  // ---------------------------------------------------------------- drop: il futuro è automatico (41.53 – 46.88)
  { at: W('Il futuro', 4, -0.05, 0), from: { x: 620, y: 1300, s: 0, rot: 0 }, x: 620, y: 1300, s: 64, rot: 0, move: 'zoom', dur: 0.2, show: true, act: 'scream', actDur: 0.62, look: 'camera', note: 'back with a pop under AUTO CRATICO (a slam\'s 1.75× would cover the word)' },
  { at: E('Il futuro', 4, 0, 0), look: [500, 840], act: 'smug', actDur: 0.4 },
  { at: W('Pratico', 0, 0.01), x: 800, y: 570, s: 52, move: 'hop', dur: 0.22, arc: 80, look: [260, 300], note: 'up under the line' },
  { at: W('Pratico', 1, -0.08), x: 300, y: 570, move: 'zoom', dur: 0.16, look: [700, 300], note: 'rapido: a whip' },
  { at: W('Pratico', 2, -0.12), x: 870, y: 720, s: 60, move: 'hop', dur: 0.2, arc: 60, look: 'camera', note: 'beside the phone' },
  { at: W('Pratico', 2), act: 'scream', actDur: 0.8 },

  // ---------------------------------------------------------------- inbox: mandagli tutto (46.88 – 51.48)
  { at: W('Mandagli'), x: 110, y: 1240, s: 76, rot: 0.2, move: 'cut', look: 'camera', note: 'leaning in from the left edge, over the rows\' icons' },
  { at: W('Mandagli', 1), look: [520, 900], act: 'smug', actDur: 0.4 },
  { at: W('Mandagli', 2), look: 'camera', act: 'wink', actDur: 0.45, note: '"lui": that is me' },
  { at: W('Mandagli', 3), look: [520, 800] },
  { at: W('Mandagli', 3, 0.15), look: [520, 1000] },
  { at: W('Mandagli', 5), look: [560, 1100], act: 'nod', actDur: 0.8, note: 'archivia' },
  { at: W('rosso'), x: 100, y: 1330, s: 78, rot: 0.2, move: 'cut', look: [300, 960], act: 'glare', actDur: 0.6 },
  { at: W('rosso', 3, 0.1), look: [980, 960], act: 'startle', actDur: 0.55, note: 'the badge goes off' },
  { at: W('rosso', 5), look: 'camera', act: 'smug', actDur: 0.35 },
  { at: W('rosso', 6, -0.05), x: -330, y: 1250, rot: -0.4, move: 'smooth', dur: 0.35, note: '"e via": gone, out of the left edge' },

  // ---------------------------------------------------------------- hero: the next task (51.48 – 54.21)
  { at: W('Il futuro', 0, 0, 1), from: { x: -200, y: 900, rot: 0.6 }, x: 70, y: 770, s: 82, rot: 0.35, move: 'spring', dur: 0.5, show: true, look: [480, 760], act: 'awe', actDur: 1.05, note: 'a cat and a shiny ball, from the left edge' },
  { at: W('Il futuro', 1, 0.1, 1), act: 'shiver', actDur: 0.35, note: 'the wiggle before the pounce' },
  { at: W('Il futuro', 3, 0.05, 1), x: 750, y: 760, s: 70, rot: 0.05, move: 'fly', dur: 0.28, arc: 40, look: [480, 760], note: 'below automatico, beside the orb' },
  { at: W('Il futuro', 3, 0.15, 1), act: 'bite', actDur: 0.55, note: 'bites the orb' },
  { at: W('Il futuro', 4, -0.22, 1), x: 700, y: 1255, s: 80, move: 'hop', dur: 0.22, arc: 30, look: 'camera', note: 'right of the phone, under the desktop' },
  { at: W('Il futuro', 4, 0, 1), act: 'scream', actDur: 0.85 },

  // ---------------------------------------------------------------- italia: l'Italia lenta e pallosa (54.21 – 61.45)
  { at: W('In un attimo'), x: 520, y: 1200, s: 56, move: 'slam', look: 'camera', note: 'in un attimo: in Rome on the map' },
  { at: W('In un attimo', 2), look: [300, 420] },
  { at: W('In un attimo', 3, -0.12), x: 760, y: 410, s: 88, move: 'hop', dur: 0.2, arc: 80, look: 'camera', note: 'above RIVOLU-ZIONIAMO' },
  { at: W('In un attimo', 3), act: 'scream', actDur: 1.6, note: 'rivoluzioniamo!' },
  { at: W("l'Italia"), x: 330, y: 1240, s: 76, move: 'cut', look: [300, 300], act: 'bored', actDur: 1.3 },
  { at: W("l'Italia", 1), x: 720, y: 1240, move: 'drift', dur: 2.4, act: 'bored', actDur: 1.0, note: 'lenta: a slow drift across the bottom' },
  { at: W("l'Italia", 3, 0.05), look: 'camera', act: 'yawn', actDur: 1.25, note: 'pallosa: the long yawn' },
  { at: W("l'Italia", 3, 1.15), act: 'sleep', actDur: 1.2, note: 'nods off' },
  { at: W('Autocratico!', 0, -0.02, 3), act: 'startle', actDur: 0.5, look: [480, 860], note: 'the black stamp wakes him' },
  { at: W('Autocratico!', 0, 0.18, 3), act: 'scream', actDur: 0.75 },

  // ---------------------------------------------------------------- phone: the examples (61.45 – 71.88)
  // the lyric is set top left and ragged right: he sits in the pocket to its right, above the phone
  { at: W('Inoltro'), move: 'cut', show: false, note: 'a beat of quiet after the shout' },
  { at: W('Inoltro', 1, -0.04), from: { x: 930, y: 540, s: 0 }, x: 930, y: 540, s: 58, rot: 0.08, move: 'spring', dur: 0.35, show: true, look: 'camera', act: 'smug', actDur: 0.5, note: 'scatto: pops in to pose for the photo' },
  { at: W('Inoltro', 1, 0.12), act: 'wink', actDur: 0.38 },
  { at: W('Inoltro', 3), look: [470, 1000] },
  { at: W('Inoltro', 4), look: [190, 1215], note: 'in un minuto: eyes on the ring' },
  { at: W('Inoltro', 8), look: [190, 1215], act: 'nod', actDur: 0.55, note: 'archiviato' },
  { at: W('falso'), x: 880, y: 745, s: 62, rot: -0.12, move: 'cut', look: [400, 1000], act: 'glare', actDur: 0.7, note: 'suspicious of the sender' },
  { at: W('falso', 2), look: [450, 1050], act: 'gasp', actDur: 0.75, note: '«paga subito»?' },
  { at: W('falso', 4, -0.1), x: 850, y: 765, s: 70, move: 'spring', dur: 0.3, look: [480, 1225], act: 'bite', actDur: 0.45, note: 'Phishing: he snaps at the warning' },
  { at: W('falso', 5, 0.05), look: [500, 1225], act: 'nod', actDur: 0.5, note: 'segnalato' },
  { at: W('falso', 5, 0.4), look: 'camera', act: 'smug', actDur: 0.35 },
  { at: W('Telegram'), x: 985, y: 560, s: 54, rot: -0.12, move: 'cut', look: [480, 1050], note: 'in the pocket right of the lyric, above the phone' },
  { at: W('Telegram', 2), look: [210, 877], note: '08:30' },
  { at: W('Telegram', 5), look: [460, 1150] },
  { at: W('Telegram', 8, -0.14), x: 990, y: 560, s: 58, rot: -0.1, move: 'hop', dur: 0.2, arc: 50, look: 'camera' },
  { at: W('Telegram', 8), act: 'scream', actDur: 0.42, note: 'Fatto!' },
  { at: W('Telegram', 8, 0.42), look: [460, 1270], act: 'laugh', actDur: 0.55 },
  { at: W('non paga'), x: 970, y: 430, s: 64, rot: -0.12, move: 'cut', look: [490, 1020], note: 'the Paga button, never pressed' },
  { at: W('non paga', 2), act: 'shake', actDur: 0.55 },
  { at: W('non paga', 7), look: [500, 1350], act: 'nod', actDur: 0.4 },
  { at: W('non paga', 8), look: 'camera', act: 'smug', actDur: 1.3, note: 'non un ricatto (the kit drops out: he keeps still)' },

  // ---------------------------------------------------------------- chant: futuro autocratico (71.88 – 76.55)
  // FUTURO y 290–490, the AUTOCRATICO bar y 1140–1275: he stays between them
  { at: E('non paga', 10), move: 'cut', show: false, note: 'off for the cut, back from the right edge' },
  { at: W('futuro autocratico', 0, -0.1, 0), from: { x: 1300, y: 790, rot: -0.6 }, x: 830, y: 790, s: 74, rot: -0.15, move: 'spring', dur: 0.4, show: true, look: 'camera' },
  { at: W('futuro autocratico', 0, 0, 0), act: 'scream', actDur: 0.9 },
  { at: W('futuro autocratico', 1, -0.14, 0), x: 190, y: 830, s: 86, rot: 0.12, move: 'fly', dur: 0.24, arc: 30 },
  { at: W('futuro autocratico', 1, 0, 0), act: 'scream', actDur: 0.8 },
  { at: W('futuro autocratico', 0, -0.05, 1), x: 540, y: 880, s: 100, rot: 0, move: 'zoom', dur: 0.3, act: 'scream', actDur: 1.55, note: 'the crowd chants with him' },
  { at: B(30, 3), x: 540, y: 560, s: 170, move: 'zoom', dur: 0.3, act: 'scream', actDur: 0.62, note: 'AUTOCRATICO into the lens, above the bar' },

  // ---------------------------------------------------------------- outro: the close (76.55 – 83.6)
  { at: B(31), x: 800, y: 720, s: 68, rot: 0, move: 'cut', look: [260, 1100], act: 'smug', actDur: 1.2, note: 'calm now, over the browser' },
  { at: B(31, 2), look: [796, 1229] },
  { at: B(32, 0, -0.32), x: 796, y: 1075, s: 58, move: 'hop', dur: 0.32, arc: 150, note: 'he presses P' },
  { at: B(32, 0, 0.2), look: [550, 500], act: 'smug', actDur: 1.0, note: 'privacy: the numbers become bars' },
  { at: B(32, 2), look: 'camera' },
  { at: W('Il futuro', 0, -0.3, 2), x: 640, y: 470, s: 80, move: 'hop', dur: 0.3, arc: 110, look: 'camera', note: 'sings the last line above it' },
  { at: W('Il futuro', 3, 0.2, 2), look: [540, 880] },
  { at: 81.658, move: 'cut', show: false, note: 'hard black' },
  { at: 81.95, from: { x: 790, y: -160, rot: 0.4 }, x: 790, y: 520, s: 56, rot: 0.08, move: 'spring', dur: 0.5, zeta: 0.45, show: true, look: [500, 523], note: 'lands beside the icon' },
  { at: 82.5, look: 'camera', act: 'smug', actDur: 1.4 },
  { at: 82.7, act: 'wink', actDur: 0.62 },
];

export const CROWDS_V: Crowd[] = [
  {
    at: W('Follia!', 0, -0.04, 0), dur: 0.44, note: 'FOLLIA!: Bollos from the edges, clear of the stamp (y 870–1290)',
    spots: [[-20, 650, 62, 0.95], [-20, 1530, 64, 0.7], [1100, 600, 58, -0.95], [130, -10, 50, Math.PI - 0.15], [950, -20, 50, Math.PI + 0.2]],
  },
  {
    at: W('futuro autocratico', 0, -0.03, 1), dur: 1.56, note: 'the second chant: a crowd from the edges, clear of FUTURO',
    spots: [[-30, 820, 74, 1.0], [1110, 680, 74, -1.0], [-20, 1000, 60, 1.15], [250, 1010, 48, 0.2], [815, 1010, 48, -0.2]],
  },
];
