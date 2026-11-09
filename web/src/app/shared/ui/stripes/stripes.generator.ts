import { hashSeed, mulberry32 } from '../pattern/pattern.generator';

/** Same brand colors as the Bauhaus pattern; `null` leaves a paper gap. */
const COLORS: (string | null)[] = [
  'var(--color-brand-ink)',
  'var(--color-brand-orange)',
  'var(--color-brand-amber)',
  'var(--color-brand-periwinkle)',
  'var(--color-brand-cobalt)',
  'var(--color-brand-pink)',
];

export interface Stripes {
  cols: number;
  rows: number;
  /** Column-major: `cells[col][row]` is a color or null (gap). */
  cells: (string | null)[][];
}

/**
 * "Trake": a band of narrow color bars, split into segments, seeded so a venue always gets the same
 * band. A segment never repeats the color right above it, about one in ten is left blank.
 */
export function generateStripes(seed: string, cols = 28, rows = 4): Stripes {
  const rnd = mulberry32(hashSeed(`trake:${seed}`));
  const cells: (string | null)[][] = [];
  for (let c = 0; c < cols; c++) {
    const column: (string | null)[] = [];
    for (let r = 0; r < rows; r++) {
      let color: string | null;
      do {
        color = rnd() < 0.1 ? null : COLORS[Math.floor(rnd() * COLORS.length)];
      } while (r > 0 && color !== null && color === column[r - 1]);
      column.push(color);
    }
    cells.push(column);
  }
  return { cols, rows, cells };
}
