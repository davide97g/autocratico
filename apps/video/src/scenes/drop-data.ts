// drop: the demo register's deadlines.toml (var/video/appdata, made up: Maria Rossi's Bollo auto,
// Multa ZTL…) as the blocks typed on ink, and the Panoramica's bento cards they slam into
// (rects in px of the 2880×1800 desktop-overview capture). Days left are counted from the capture's
// date, 3 ottobre 2026.

export type CardId = 'cal' | 'next' | 'watch' | 'load' | 'dates' | 'sidebar';

export const CARDS: Record<CardId, { rect: [number, number, number, number]; hit: 0 | 1 | 2; dark?: boolean }> = {
  cal: { rect: [640, 256, 1414, 994], hit: 0 }, // Calendario
  next: { rect: [2102, 256, 682, 994], hit: 0, dark: true }, // Prossimo adempimento
  watch: { rect: [640, 1298, 682, 502], hit: 1 }, // Da tenere d'occhio
  load: { rect: [1370, 1298, 684, 502], hit: 1 }, // Carico dell'anno
  dates: { rect: [2102, 1298, 682, 502], hit: 1 }, // Date da inserire
  sidebar: { rect: [96, 96, 480, 1608], hit: 0 },
};

export interface Block {
  lines: string[];
  /** Days left on 2026-10-03 (null: no date yet). */
  days: number | null;
  severity: 'high' | 'medium' | 'low';
  card: CardId;
}

const block = (id: string, title: string, area: string, severity: Block['severity'], date: string, last: string): string[] => [
  '[[deadline]]',
  `id = "${id}"`,
  `title = "${title}"`,
  `area = "${area}"`,
  `severity = "${severity}"`,
  `date = ${date}`,
  last,
];

/** Top row, then bottom row (4 columns). */
export const BLOCKS: Block[] = [
  { lines: block('condo-fee', 'Rata condominio', 'home', 'medium', '2026-10-15', 'amount = 180.00'), days: 12, severity: 'medium', card: 'cal' },
  { lines: block('bollo-auto', 'Bollo auto', 'vehicles', 'high', '2026-10-06', 'amount = 245.00'), days: 3, severity: 'high', card: 'next' },
  { lines: block('imu-balance', 'IMU, saldo', 'home', 'high', '2026-12-16', 'repeat = "yearly"'), days: 74, severity: 'high', card: 'cal' },
  { lines: block('winter-tyres', 'Gomme invernali', 'vehicles', 'low', '2026-11-15', 'repeat = "yearly"'), days: 43, severity: 'low', card: 'cal' },
  { lines: block('multa-ztl', 'Multa ZTL, pagamento ridotto', 'vehicles', 'high', '2026-10-01', 'amount = 83.30'), days: -2, severity: 'high', card: 'watch' },
  { lines: block('boiler-service', 'Manutenzione caldaia', 'home', 'medium', '2026-10-31', 'repeat = "yearly"'), days: 28, severity: 'medium', card: 'cal' },
  { lines: block('second-irpef-advance', 'Secondo acconto IRPEF', 'tax', 'high', '2026-11-30', 'amount = 320.00'), days: 58, severity: 'high', card: 'load' },
  { lines: block('tari', 'TARI', 'home', 'medium', '"TODO"', 'notes = "Le date dipendono dal Comune"'), days: null, severity: 'medium', card: 'dates' },
];
