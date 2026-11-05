import { generatePattern, type Pattern } from './pattern.generator';

// Output of the original bauhaus-pattern.js in Node for 'Kafana Mornar', 8×4:
// [x, y, span, kind, rot, bg, fg], colors as `--color-brand-<name>` (the original emits `--brand-<name>`).
const REFERENCE = [
  [0, 0, 1, 'circle', 1, 'pink', 'amber'],
  [1, 0, 1, 'dots', 2, 'ink', 'periwinkle'],
  [2, 0, 1, 'circle', 2, 'pink', 'ink'],
  [3, 0, 1, 'tri', 1, 'pink', 'ink'],
  [4, 0, 1, 'solid', 2, 'paper', 'pink'],
  [5, 0, 1, 'half', 3, 'pink', 'paper'],
  [6, 0, 1, 'half', 2, 'amber', 'periwinkle'],
  [7, 0, 1, 'solid', 2, 'amber', 'periwinkle'],
  [0, 1, 1, 'dots', 1, 'pink', 'ink'],
  [1, 1, 2, 'qtr', 0, 'ink', 'paper'],
  [3, 1, 1, 'solid', 3, 'pink', 'paper'],
  [4, 1, 1, 'circle', 2, 'ink', 'paper'],
  [5, 1, 1, 'solid', 3, 'amber', 'periwinkle'],
  [6, 1, 1, 'half', 0, 'paper', 'ink'],
  [7, 1, 1, 'half', 0, 'ink', 'periwinkle'],
  [0, 2, 1, 'tri', 3, 'ink', 'amber'],
  [3, 2, 1, 'qtr', 0, 'amber', 'paper'],
  [4, 2, 2, 'half', 3, 'paper', 'amber'],
  [6, 2, 1, 'qtr', 2, 'amber', 'paper'],
  [7, 2, 1, 'qtr', 2, 'ink', 'pink'],
  [0, 3, 1, 'dots', 0, 'ink', 'pink'],
  [1, 3, 1, 'qtr', 2, 'ink', 'paper'],
  [2, 3, 1, 'qtr', 2, 'periwinkle', 'ink'],
  [3, 3, 1, 'circle', 3, 'ink', 'periwinkle'],
  [6, 3, 1, 'qtr', 3, 'pink', 'periwinkle'],
  [7, 3, 1, 'bars', 3, 'amber', 'pink'],
].map(([x, y, span, kind, rot, bg, fg]) => ({
  x,
  y,
  span,
  kind,
  rot,
  bg: `var(--color-brand-${bg})`,
  fg: `var(--color-brand-${fg})`,
}));

function coverage({ cols, rows, cells }: Pattern): number[][] {
  const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (const { x, y, span } of cells) {
    for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) grid[y + dy][x + dx]++;
  }
  return grid;
}

describe('generatePattern', () => {
  it('matches the original JS generator for Kafana Mornar 8×4', () => {
    expect(generatePattern('Kafana Mornar', { cols: 8, rows: 4 }).cells).toEqual(REFERENCE);
  });

  it('gives the same output for the same seed', () => {
    expect(generatePattern('Kafana Mornar')).toEqual(generatePattern('Kafana Mornar'));
  });

  it('gives different output for different seeds', () => {
    expect(generatePattern('Kafana Mornar')).not.toEqual(generatePattern('Bar Dva Jelena'));
  });

  it.each([
    [1, 1],
    [2, 2],
    [4, 2],
    [8, 1],
    [8, 4],
    [8, 5],
    [6, 7],
  ])('covers a %i×%i grid exactly once', (cols, rows) => {
    for (const seed of ['Kafana Mornar', 'Bar Dva Jelena', 'Ćevapdžinica Đurđa', '']) {
      const pattern = generatePattern(seed, { cols, rows });
      expect(
        coverage(pattern)
          .flat()
          .every((count) => count === 1),
      ).toBe(true);
    }
  });

  it('never makes a 2×2 cell when big is false', () => {
    for (const seed of ['Kafana Mornar', 'Bar Dva Jelena', '1042', 'Topli napici']) {
      const { cells } = generatePattern(seed, { cols: 8, rows: 4, big: false });
      expect(cells.every((cell) => cell.span === 1)).toBe(true);
    }
  });
});
