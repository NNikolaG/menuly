import { GRAIN_LAYERS, grainDots, grainPhases, grainPoint } from './grain.generator';

describe('grain generator', () => {
  it('gives the same dots for the same venue and different ones for another', () => {
    expect(grainDots('Kafana Zora', 'cool', 500)).toEqual(grainDots('Kafana Zora', 'cool', 500));
    expect(grainDots('Kafana Zora', 'cool', 500)).not.toEqual(grainDots('Mornar', 'cool', 500));
  });

  it('shares the dots between the layers of a mood', () => {
    for (const mood of ['cool', 'warm'] as const) {
      const dots = grainDots('x', mood, 2000);
      expect(Math.abs(dots.length - 2000)).toBeLessThan(GRAIN_LAYERS[mood].length);
      expect(new Set(dots.map((dot) => dot.layer)).size).toBe(GRAIN_LAYERS[mood].length);
    }
  });

  it('keeps most dots inside the band while they move', () => {
    const mood = 'warm';
    const dots = grainDots('Mornar', mood, 3000);
    const phases = grainPhases('Mornar', mood);
    for (const t of [0, 7.5, 60]) {
      const inside = dots.filter((dot) => {
        const [x, y] = grainPoint(
          GRAIN_LAYERS[mood][dot.layer],
          dot,
          phases[dot.layer],
          t,
          400,
          200,
        );
        return x >= -2 && x <= 402 && y >= -40 && y <= 240;
      });
      expect(inside.length / dots.length).toBeGreaterThan(0.95);
    }
  });
});
