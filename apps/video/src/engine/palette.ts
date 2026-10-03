import { hexToLinear } from './util';

// autocratico's palette, from apps/web/src/index.css (OKLCH tokens converted to sRGB): a grey
// studio, white cards, near-black ink, and the four status colours. Colour means time left:
// nothing else in the film is ever coloured. See docs/TREATMENT.md.
export const HEX = {
  ink: '#0A0A0A', // the dark plates (--background, dark theme)
  ink2: '#171717', // raised night: dark cards, the "Prossimo adempimento" card
  graphite: '#525252', // dim lines, secondary text
  faint: '#A1A1A1', // mid grey, rules and labels (--ring)
  bezel: '#DEDEDE', // borders (--border)
  paper: '#E6E6E6', // the studio grey everything sits on (--background)
  sheet: '#FDFDFD', // cards (--card)
  pen: '#0F0F0F', // ink on paper (--primary)
  muted: '#737373', // --muted-foreground
  overdue: '#DC2627', // Scaduta
  urgent: '#E95C12', // Urgente
  soon: '#EFA810', // In arrivo
  done: '#2A9754', // Fatta
  // engine aliases: "live" is the signal colour (red), used by the shared GLSL helpers
  live: '#DC2627',
  liveHot: '#FF4A3D',
  liveDeep: '#7A1112',
} as const;

export type PaletteKey = keyof typeof HEX;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
