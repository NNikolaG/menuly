import { itemFixture, menuTreeFixture, variantFixture } from '../../core/menus/menu.testing';
import { buildCatalog } from './promotion-form-page';

describe('buildCatalog', () => {
  it('lists one entry per item, or per size, the active menu first and without repeats', () => {
    const draft = menuTreeFixture({ id: 'm2', name: 'Leto' });
    draft.categories[0].items = [itemFixture({ id: 'i9', name: 'Limunada' })];
    const active = menuTreeFixture();
    active.categories[0].items = [
      itemFixture(),
      itemFixture({
        id: 'i2',
        name: 'Pivo',
        variants: [
          variantFixture({ id: 'p2', label: '0,33 l', price_minor: 25000 }),
          variantFixture({ id: 'p3', label: '0,5 l', price_minor: 32000 }),
        ],
      }),
    ];
    const entries = buildCatalog([draft, active, active], 'm1');
    expect(entries.map((entry) => [entry.key, entry.label])).toEqual([
      ['i1|', 'Espreso'],
      ['i2|p2', 'Pivo 0,33 l'],
      ['i2|p3', 'Pivo 0,5 l'],
      ['i9|', 'Limunada'],
    ]);
  });
});
