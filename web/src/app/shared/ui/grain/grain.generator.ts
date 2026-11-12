import { hashSeed, mulberry32 } from '../pattern/pattern.generator';

/** Cool: blue, red, lilac and green waves. Warm: blue, pink, yellow and orange, with dark spots. */
export type GrainMood = 'cool' | 'warm';

/**
 * One shape of sprayed dots. A wave is a band across the width; a blob is a round cloud.
 * Positions and sizes are fractions of the band; `color` indexes `--color-grain-<mood>-1..6`.
 */
export interface GrainLayer {
  kind: 'wave' | 'blob';
  color: number;
  /** Center line (wave) or center (blob), 0 = top. */
  y: number;
  /** Blob center, 0 = left. */
  x: number;
  /** Wave height or blob radius. */
  size: number;
  /** Wave swing up and down. */
  amp: number;
  /** Share of all dots. */
  share: number;
}

const wave = (color: number, y: number, size: number, amp: number, share: number): GrainLayer => ({
  kind: 'wave',
  color,
  y,
  x: 0,
  size,
  amp,
  share,
});
const blob = (color: number, x: number, y: number, size: number, share: number): GrainLayer => ({
  kind: 'blob',
  color,
  y,
  x,
  size,
  amp: 0,
  share,
});

/** Back to front: later layers paint over earlier ones. */
export const GRAIN_LAYERS: Record<GrainMood, readonly GrainLayer[]> = {
  cool: [
    blob(4, 0.1, 0.1, 0.32, 0.07),
    wave(0, 0.3, 0.23, 0.1, 0.23),
    wave(1, 0.5, 0.22, 0.09, 0.24),
    wave(2, 0.7, 0.2, 0.08, 0.22),
    wave(3, 0.97, 0.2, 0.06, 0.2),
    blob(5, 0.6, 0.47, 0.03, 0.008),
  ],
  warm: [
    blob(0, 0.86, 0.3, 0.38, 0.17),
    wave(1, 0.55, 0.24, 0.12, 0.24),
    wave(2, 0.8, 0.22, 0.09, 0.24),
    wave(3, 0.99, 0.2, 0.06, 0.22),
    blob(4, 0.16, 0.42, 0.08, 0.03),
    blob(4, 0.33, 0.85, 0.065, 0.025),
    blob(4, 0.78, 0.6, 0.075, 0.028),
    blob(4, 0.92, 0.75, 0.075, 0.028),
    blob(5, 0.48, 0.42, 0.045, 0.012),
  ],
};

/** A dot: which layer, where along it (0..1), how far off its center line, and its own phase. */
export interface GrainDot {
  layer: number;
  u: number;
  v: number;
  phase: number;
}

/** Roughly normal in about [-1.5, 1.5]: dense in the middle of a band, sparse at its edges. */
const spread = (rnd: () => number) => rnd() + rnd() + rnd() - 1.5;

/** The same dots for the same seed, so a venue's band never changes between visits. */
export function grainDots(seed: string, mood: GrainMood, count: number): GrainDot[] {
  const rnd = mulberry32(hashSeed(`zrno:${mood}:${seed}`));
  const layers = GRAIN_LAYERS[mood];
  const total = layers.reduce((sum, layer) => sum + layer.share, 0);
  const dots: GrainDot[] = [];
  layers.forEach((layer, index) => {
    const n = Math.round((count * layer.share) / total);
    for (let i = 0; i < n; i++) {
      dots.push({
        layer: index,
        u: layer.kind === 'wave' ? rnd() : rnd() * Math.PI * 2,
        v: layer.kind === 'wave' ? spread(rnd) : Math.abs(spread(rnd)),
        phase: rnd() * Math.PI * 2,
      });
    }
  });
  return dots;
}

/** Per-venue offsets for the wave swing, so two venues never breathe in step. */
export function grainPhases(seed: string, mood: GrainMood): number[] {
  const rnd = mulberry32(hashSeed(`zrno-phase:${mood}:${seed}`));
  return GRAIN_LAYERS[mood].map(() => rnd() * Math.PI * 2);
}

/**
 * Where a dot is at time `t` (seconds), in the same units as `width` and `height`. Waves roll
 * slowly sideways and swell; blobs drift on a small circle. Every dot also trembles a little.
 */
export function grainPoint(
  layer: GrainLayer,
  dot: GrainDot,
  phase: number,
  t: number,
  width: number,
  height: number,
): [number, number] {
  const tremble = Math.sin(t * 3 + dot.phase) * 0.6;
  if (layer.kind === 'wave') {
    const a = dot.u * Math.PI * 2;
    const swing =
      Math.sin(a * 1.1 + phase + t * 0.35) * layer.amp +
      Math.sin(a * 2.3 - phase * 0.7 - t * 0.22) * layer.amp * 0.45;
    const swell = 1 + 0.25 * Math.sin(a * 1.7 + phase + t * 0.5);
    const x = dot.u * width;
    const y = (layer.y + swing + dot.v * layer.size * swell * 0.5) * height;
    return [x + tremble, y + Math.cos(t * 2.6 + dot.phase) * 0.6];
  }
  const cx = layer.x * width + Math.sin(t * 0.3 + phase) * width * 0.03;
  const cy = layer.y * height + Math.cos(t * 0.25 + phase) * height * 0.05;
  const r = dot.v * layer.size * Math.min(width, height * 2) * 0.6;
  return [cx + Math.cos(dot.u) * r + tremble, cy + Math.sin(dot.u) * r * 0.8];
}
