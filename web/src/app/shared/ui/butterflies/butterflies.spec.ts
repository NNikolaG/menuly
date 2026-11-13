import { butterflies } from './butterflies';

describe('butterflies', () => {
  it('flies the same flock for the same venue', () => {
    expect(butterflies('Mornar')).toEqual(butterflies('Mornar'));
    expect(butterflies('Mornar')).not.toEqual(butterflies('Kafana Zora'));
  });

  it('spreads the flock over the band, already mid-flight, in all four colors', () => {
    const flock = butterflies('Mornar');
    expect(flock.every((b) => b.y >= 15 && b.y <= 80)).toBe(true);
    expect(flock.every((b) => b.delay <= 0 && -b.delay <= b.duration)).toBe(true);
    expect(new Set(flock.map((b) => b.color))).toEqual(new Set([1, 2, 3, 4]));
  });
});
