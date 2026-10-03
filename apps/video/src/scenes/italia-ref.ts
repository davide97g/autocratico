// Real imagery for `italia` (public/ref/, see CREDITS.md): ISTAT's Italy outline and the 7,896 comuni
// centroids (pre-projected into the SVG's viewBox), and the graded photos of offices, archives and
// queues. Loaded once; the map is pre-rendered (unlit and lit) for cheap per-frame drawing.
import { loadImage } from './_motifs';
import { offscreen } from './inbox-kit';

export const MAP_VB = { w: 1000, h: 1305.9 };
/** Rome in the SVG space (svg-projection.json: Web Mercator). */
const PROJ = { X0: 0.11042523644442924, Y1: 0.9416876136790285, k: 4586.597783628109 };
export function project(lon: number, lat: number) {
  const r = Math.PI / 180;
  return { x: (lon * r - PROJ.X0) * PROJ.k, y: (PROJ.Y1 - Math.log(Math.tan(Math.PI / 4 + (lat * r) / 2))) * PROJ.k };
}

export interface ItalyMap {
  outline: Path2D;
  pts: Float32Array; // x, y pairs in viewBox units
  n: number;
}

export async function loadMap(): Promise<ItalyMap> {
  const [svg, pj] = await Promise.all([
    fetch('ref/geo/italia-outline.svg').then((r) => r.text()),
    fetch('ref/geo/italia-comuni-punti-svg.json').then((r) => r.json()),
  ]);
  const outline = new Path2D();
  for (const m of svg.matchAll(/\sd="([^"]+)"/g)) outline.addPath(new Path2D(m[1]!));
  const P = pj.points as [number, number][];
  const pts = new Float32Array(P.length * 2);
  P.forEach(([x, y], i) => { pts[i * 2] = x; pts[i * 2 + 1] = y; });
  return { outline, pts, n: P.length };
}

/** The map pre-rendered at `scale` px per viewBox unit: land + dots, unlit (dim) or lit. */
export function renderMap(m: ItalyMap, scale: number, lit: boolean) {
  const o = offscreen(Math.ceil(MAP_VB.w * scale), Math.ceil(MAP_VB.h * scale));
  const c = o.c;
  c.save();
  c.scale(scale, scale);
  c.fillStyle = lit ? '#141414' : '#121212';
  c.fill(m.outline);
  c.strokeStyle = lit ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
  c.lineWidth = 1 / scale;
  c.stroke(m.outline);
  c.restore();
  c.fillStyle = lit ? '#f2f2f2' : 'rgba(255,255,255,0.13)';
  c.beginPath();
  const d = lit ? 2.1 : 1.6;
  for (let i = 0; i < m.n; i++) c.rect(m.pts[i * 2]! * scale - d / 2, m.pts[i * 2 + 1]! * scale - d / 2, d, d);
  c.fill();
  return o;
}

export interface Photo { img: ImageBitmap; crop: [number, number, number, number] }
/** The graded photos (crop = x, y, w, h fractions: scans with black borders are trimmed). */
export async function loadPhotos(): Promise<Record<string, Photo>> {
  const defs: [string, string, [number, number, number, number]][] = [
    ['sala', 'archivio-palermo-sala-grey.jpg', [0, 0, 1, 1]],
    ['registri', 'archivio-palermo-registri-grey.jpg', [0, 0, 1, 1]],
    ['ufficio', 'ufficio-monti-1963-grey.jpg', [0.08, 0.06, 0.84, 0.86]],
    ['corridoio', 'ufficio-monti-corridoio-grey.jpg', [0.04, 0.02, 0.92, 0.96]],
    ['posta', 'posta-ostia-storica-grey.jpg', [0.01, 0.01, 0.98, 0.98]],
    ['fila', 'fila-napoli-1973-grey.jpg', [0, 0, 1, 1]],
  ];
  const ims = await Promise.all(defs.map(([, f]) => loadImage(`ref/${f}`)));
  const out: Record<string, Photo> = {};
  defs.forEach(([k, , crop], i) => (out[k] = { img: ims[i]!, crop }));
  return out;
}
