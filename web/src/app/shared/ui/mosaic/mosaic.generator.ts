import { hashSeed, mulberry32 } from '../pattern/pattern.generator';

/** What one tile shows; `dash` cells join into bars, `dot` is a lone pixel in the sparse edge. */
export type MosaicGlyph = 'square' | 'ring' | 'cross' | 'diamond' | 'dash' | 'dot';

/** Index into the five mosaic colors (`--color-mosaic-1..5`). */
export interface MosaicTile {
  glyph: MosaicGlyph;
  color: number;
}

/** Row-major, `null` = empty cell. */
export type MosaicFrame = (MosaicTile | null)[];

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Seeded 3D value noise in [0, 1]; z is time, so the field flows instead of blinking. */
export function valueNoise(seed: string): (x: number, y: number, z: number) => number {
  const rnd = mulberry32(hashSeed(`mozaik:${seed}`));
  const table = Float64Array.from({ length: 256 }, () => rnd());
  const perm = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const at = (x: number, y: number, z: number) =>
    table[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const w = smooth(z - zi);
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const plane = (zz: number) =>
      lerp(
        lerp(at(xi, yi, zz), at(xi + 1, yi, zz), u),
        lerp(at(xi, yi + 1, zz), at(xi + 1, yi + 1, zz), u),
        v,
      );
    return lerp(plane(zi), plane(zi + 1), w);
  };
}

/**
 * One frame of the mosaic: dense in the top-left corner, breaking up toward the bottom-right into
 * lone pixels. Two noise fields pick the glyph and move the ragged edge; `t` advances them.
 */
export function mosaicFrame(
  noise: (x: number, y: number, z: number) => number,
  cols: number,
  rows: number,
  t: number,
): MosaicFrame {
  const frame: MosaicFrame = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      // Mixed noise bunches around 0.5; stretch it so every glyph gets its share.
      const mixed =
        noise(x / 3.2, y / 2.6, t) * 0.75 + noise(x * 0.9 + 17, y * 0.9, t * 1.3) * 0.25;
      const kind = Math.min(0.999, Math.max(0, (mixed - 0.5) * 1.9 + 0.5));
      const edge = noise(x / 3 + 40, y / 3 + 40, t * 0.7);
      const density = 1.15 - (x / cols) * 1.1 - (y / rows) * 0.55 + (edge - 0.5) * 0.7;
      if (density > 0.32) frame.push(tileFor(kind, x, y));
      else if (density > 0.05 && noise(x * 1.7 + 90, y * 1.7, t * 1.6) > 0.78)
        frame.push({ glyph: 'dot', color: (x + y) % 5 });
      else frame.push(null);
    }
  }
  return frame;
}

function tileFor(kind: number, x: number, y: number): MosaicTile {
  if (kind < 0.24) return { glyph: 'diamond', color: 4 };
  if (kind < 0.38) return { glyph: 'cross', color: (x * 7 + y * 3) % 5 };
  if (kind < 0.58) return { glyph: 'square', color: 0 };
  if (kind < 0.74) return { glyph: 'ring', color: 1 };
  if (kind < 0.84) return { glyph: 'dash', color: y % 2 ? 4 : 2 };
  return { glyph: 'square', color: (x + y) % 2 ? 2 : 3 };
}
