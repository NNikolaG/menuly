import { filterMenu, fold, NO_FILTER } from './menu-filter';
import { publicItem, publicMenuFixture } from './public-menu.testing';
import type { PublicCategory } from './public-menu';

const categories: PublicCategory[] = [
  {
    id: 'c1',
    name: 'Roštilj',
    description: '',
    items: [
      publicItem({ id: 'a', name: 'Ćevapi', allergens: ['gluten'] }),
      publicItem({ id: 'b', name: 'Grilovano povrće', tags: ['vegan', 'bez glutena'] }),
      publicItem({ id: 'c', name: 'Pljeskavica', allergens: ['mleko'], is_available: false }),
    ],
  },
  {
    id: 'c2',
    name: 'Pića',
    description: '',
    items: [publicItem({ id: 'd', name: 'Đus od pomorandže', tags: ['vegan'] })],
  },
];

const ids = (result: PublicCategory[]) => result.flatMap((c) => c.items.map((i) => i.id));

describe('menu filter', () => {
  it('folds diacritics and đ', () => {
    expect(fold('Ćevapi Đorđe')).toBe('cevapi dorde');
    expect(fold('djordje')).toBe('dorde');
  });

  it('returns the menu unchanged without filters', () => {
    expect(filterMenu(categories, NO_FILTER)).toBe(categories);
  });

  it('finds items without diacritics and drops empty categories', () => {
    const result = filterMenu(categories, { ...NO_FILTER, query: 'cevap' });
    expect(ids(result)).toEqual(['a']);
    expect(result.map((c) => c.id)).toEqual(['c1']);
    expect(ids(filterMenu(categories, { ...NO_FILTER, query: 'dus' }))).toEqual(['d']);
  });

  it('keeps a whole category when the query names it', () => {
    expect(ids(filterMenu(categories, { ...NO_FILTER, query: 'rostilj' }))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('needs every diet tag and none of the excluded allergens', () => {
    expect(ids(filterMenu(categories, { ...NO_FILTER, diets: ['vegan', 'bez glutena'] }))).toEqual([
      'b',
    ]);
    expect(
      ids(filterMenu(categories, { ...NO_FILTER, withoutAllergens: ['gluten', 'mleko'] })),
    ).toEqual(['b', 'd']);
  });

  it('hides sold-out items on request', () => {
    expect(ids(filterMenu(categories, { ...NO_FILTER, availableOnly: true }))).toEqual([
      'a',
      'b',
      'd',
    ]);
  });

  it('works on the shared fixture', () => {
    expect(
      ids(filterMenu(publicMenuFixture().menu.categories, { ...NO_FILTER, query: 'kapucino' })),
    ).toEqual(['i2']);
  });
});
