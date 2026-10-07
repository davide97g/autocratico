// Output resolution multiplier and frame shape, read once from the page URL.
// `?scale=2` renders at 2x the logical canvas; `?aspect=9x16` turns the logical canvas upright
// (1080x1920, for Instagram Reels and YouTube Shorts). Scenes lay out in logical px and read the
// shape from W/H (gl.ts) or VERTICAL; the engine renders at SCALE x that.
// Kept in its own module so glsl/common.ts can use it without an import cycle through gl.ts.
const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

function readScale() {
  const s = Math.round(Number(params.get('scale') ?? '1'));
  return Number.isFinite(s) && s >= 1 ? Math.min(s, 4) : 1;
}

/** Physical pixels per logical pixel of the output (integer 1..4, default 1). */
export const SCALE = readScale();

/** The upright cut (`?aspect=9x16`): logical canvas 1080x1920 instead of 1920x1080. */
export const VERTICAL = params.get('aspect') === '9x16';
