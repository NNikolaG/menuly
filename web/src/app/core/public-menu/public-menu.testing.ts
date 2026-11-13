import type { PublicItem, PublicMenu } from './public-menu';

export function publicItem(overrides: Partial<PublicItem> = {}): PublicItem {
  return {
    id: 'i1',
    name: 'Espreso',
    description: '',
    tags: [],
    allergens: [],
    image_url: '',
    is_available: true,
    variants: [{ id: 'p1', label: '', price_minor: 18000 }],
    ...overrides,
  };
}

export function publicMenuFixture(): PublicMenu {
  return {
    lang: 'sr',
    tenant: { name: 'Zora', slug: 'zora' },
    venue: {
      name: 'Kafana Zora',
      slug: 'centar',
      address: 'Knez Mihailova 1',
      type: 'other',
      city: '',
      postal_code: '',
      country: 'RS',
      latitude: null,
      longitude: null,
      cuisine: [],
      description: '',
      phone: '',
      currency: 'RSD',
      timezone: 'Europe/Belgrade',
    },
    menu: {
      id: 'm1',
      name: 'Glavni meni',
      published_at: '2026-11-05T10:00:00Z',
      categories: [
        {
          id: 'c1',
          name: 'Topli napici',
          description: '',
          items: [
            publicItem({ id: 'i3', name: 'Topla čokolada', is_available: false }),
            publicItem({ description: 'Dupli espreso.', allergens: ['A7'] }),
            publicItem({
              id: 'i2',
              name: 'Kapućino',
              variants: [
                { id: 'p2', label: 'malo', price_minor: 22000 },
                { id: 'p3', label: 'veliko', price_minor: 28000 },
              ],
            }),
          ],
        },
        {
          id: 'c2',
          name: 'Pivo',
          description: 'Točeno i flaširano.',
          items: [publicItem({ id: 'i4', name: 'Jelen' })],
        },
      ],
    },
  };
}
