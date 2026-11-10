import { mosaicFrame, valueNoise } from './mosaic.generator';

describe('mosaic generator', () => {
  const noise = valueNoise('Kafana Mornar');

  it('is the same for the same seed and moment', () => {
    expect(mosaicFrame(valueNoise('Kafana Mornar'), 30, 12, 1.5)).toEqual(
      mosaicFrame(noise, 30, 12, 1.5),
    );
  });

  it('is dense top-left and sparse bottom-right', () => {
    const cols = 30;
    const rows = 12;
    const frame = mosaicFrame(noise, cols, rows, 0);
    const filled = (x0: number, y0: number) => {
      let n = 0;
      for (let y = y0; y < y0 + 4; y++)
        for (let x = x0; x < x0 + 8; x++) if (frame[y * cols + x]) n++;
      return n;
    };
    expect(filled(0, 0)).toBeGreaterThan(filled(cols - 8, rows - 4) + 16);
  });

  it('moves over time without replacing everything at once', () => {
    const a = mosaicFrame(noise, 30, 12, 0);
    const b = mosaicFrame(noise, 30, 12, 0.08);
    const changed = a.filter((tile, i) => JSON.stringify(tile) !== JSON.stringify(b[i])).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(a.length / 3);
  });
});
