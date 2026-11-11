import { artKindFor } from './category-art';

describe('artKindFor', () => {
  it('reads the category name in Serbian and English, with or without diacritics', () => {
    expect(artKindFor('Topli napici')).toBe('cup');
    expect(artKindFor('Kafa i čaj')).toBe('cup');
    expect(artKindFor('Bezalkoholna pića')).toBe('juice');
    expect(artKindFor('Pivo i vino')).toBe('beer');
    expect(artKindFor('Vina')).toBe('wine');
    expect(artKindFor('Kokteli')).toBe('cocktail');
    expect(artKindFor('Doručak')).toBe('pan');
    expect(artKindFor('Deserti')).toBe('cake');
    expect(artKindFor('Sladoled')).toBe('cone');
    expect(artKindFor('Pice')).toBe('pizza');
    expect(artKindFor('Burgeri')).toBe('burger');
    expect(artKindFor('Salate')).toBe('salad');
    expect(artKindFor('Riba')).toBe('fish');
    expect(artKindFor('Čorbe')).toBe('bowl');
    expect(artKindFor('Hot drinks')).toBe('cup');
    expect(artKindFor('Desserts')).toBe('cake');
  });

  it('falls back to a plate', () => {
    expect(artKindFor('Glavna jela')).toBe('plate');
    expect(artKindFor('Specijaliteti')).toBe('plate');
  });
});
