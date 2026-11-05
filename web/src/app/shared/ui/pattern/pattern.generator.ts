// Port of `design-system/receipt/components/Pattern/bauhaus-pattern.js`. Keep hash, rnd() call order and
// weights identical: the same seed must look the same on web, POS, print and native.

export type PatternKind = 'qtr' | 'half' | 'circle' | 'tri' | 'dots' | 'bars' | 'solid';

export interface PatternCell {
  x: number;
  y: number;
  span: 1 | 2;
  kind: PatternKind;
  rot: 0 | 1 | 2 | 3;
  bg: string;
  fg: string;
}

export interface PatternOptions {
  cols?: number;
  rows?: number;
  big?: boolean;
}

export interface Pattern {
  cols: number;
  rows: number;
  cells: PatternCell[];
}

const INK = 'var(--color-brand-ink)';
const PAPER = 'var(--color-brand-paper)';
const ACCENTS = [
  'var(--color-brand-orange)',
  'var(--color-brand-amber)',
  'var(--color-brand-periwinkle)',
  'var(--color-brand-cobalt)',
  'var(--color-brand-pink)',
];
const KINDS: [PatternKind, number][] = [
  ['qtr', 3],
  ['half', 2.5],
  ['circle', 2],
  ['tri', 1.2],
  ['dots', 0.8],
  ['bars', 0.8],
  ['solid', 1],
];
const BIG_KINDS: PatternKind[] = ['qtr', 'half', 'circle', 'qtr'];

/** FNV-1a over UTF-16 code units. */
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T>(rnd: () => number, pairs: [T, number][]): T {
  let r = rnd() * pairs.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of pairs) {
    r -= weight;
    if (r <= 0) return value;
  }
  return pairs[0][0];
}

export function generatePattern(seed: string, opts: PatternOptions = {}): Pattern {
  const cols = Math.max(1, opts.cols || 8);
  const rows = Math.max(1, opts.rows || 4);
  const allowBig = opts.big !== false;
  const rnd = mulberry32(hashSeed(seed));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  // Each seed picks its own 3 of 5 accents (Fisher–Yates).
  const shuffled = [...ACCENTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const acc = shuffled.slice(0, 3);
  const bgPool: [string, number][] = [
    [INK, 4],
    [PAPER, 1.5],
    [acc[0], 2],
    [acc[1], 1.5],
    [acc[2], 1],
  ];
  const fgFor = (bg: string) => pick([INK, PAPER, ...acc].filter((color) => color !== bg));

  const occ = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const cells: PatternCell[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (occ[y][x]) continue;
      let span: 1 | 2 = 1;
      if (
        allowBig &&
        x + 1 < cols &&
        y + 1 < rows &&
        !occ[y][x + 1] &&
        !occ[y + 1][x] &&
        !occ[y + 1][x + 1] &&
        rnd() < 0.14
      ) {
        span = 2;
      }
      for (let dy = 0; dy < span; dy++)
        for (let dx = 0; dx < span; dx++) occ[y + dy][x + dx] = true;
      const bg = weighted(rnd, bgPool);
      const fg = fgFor(bg);
      const kind = span === 2 ? pick(BIG_KINDS) : weighted(rnd, KINDS);
      const rot = Math.floor(rnd() * 4) as PatternCell['rot'];
      cells.push({ x, y, span, kind, rot, bg, fg });
    }
  }
  return { cols, rows, cells };
}
