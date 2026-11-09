import type { ItemWithVariants, MenuTree, Variant } from './menu';

export function variantFixture(overrides: Partial<Variant> = {}): Variant {
  return {
    id: 'p1',
    item_id: 'i1',
    label: '',
    translations: {},
    price_minor: 25000,
    position: 0,
    ...overrides,
  };
}

export function itemFixture(overrides: Partial<ItemWithVariants> = {}): ItemWithVariants {
  return {
    id: 'i1',
    category_id: 'c1',
    name: 'Espreso',
    description: '',
    translations: {},
    image_url: '',
    tags: [],
    allergens: [],
    position: 0,
    is_available: true,
    is_visible: true,
    variants: [variantFixture()],
    ...overrides,
  };
}

export function menuTreeFixture(overrides: Partial<MenuTree> = {}): MenuTree {
  return {
    id: 'm1',
    tenant_id: 't1',
    venue_id: 'v1',
    name: 'Glavni meni',
    status: 'draft',
    published_at: null,
    languages: [],
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    categories: [
      {
        id: 'c1',
        menu_id: 'm1',
        name: 'Topli napici',
        description: '',
        translations: {},
        position: 0,
        is_visible: true,
        items: [
          itemFixture(),
          itemFixture({
            id: 'i2',
            name: 'Kapućino',
            position: 1,
            variants: [variantFixture({ id: 'p2', item_id: 'i2' })],
          }),
        ],
      },
    ],
    ...overrides,
  };
}
