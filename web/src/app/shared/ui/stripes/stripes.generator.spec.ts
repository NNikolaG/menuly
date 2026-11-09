import { generateStripes } from './stripes.generator';

describe('generateStripes', () => {
  it('is the same for the same seed and differs between venues', () => {
    expect(generateStripes('Kafana Mornar')).toEqual(generateStripes('Kafana Mornar'));
    expect(generateStripes('Kafana Mornar')).not.toEqual(generateStripes('Bašta'));
  });

  it('never repeats a color right above itself', () => {
    const { cells, cols, rows } = generateStripes('Bistro 12', 40, 6);
    expect(cells.length).toBe(cols);
    for (const column of cells) {
      expect(column.length).toBe(rows);
      column.forEach((color, r) => {
        if (r > 0 && color !== null) expect(color).not.toBe(column[r - 1]);
      });
    }
  });
});
