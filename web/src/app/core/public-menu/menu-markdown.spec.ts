import { llmsTxt, menuMarkdown } from './menu-markdown';
import { publicMenuFixture } from './public-menu.testing';

const ORIGIN = 'https://zora.menuly.app';

describe('menuMarkdown', () => {
  it('states the venue, hours, items with prices, allergens and availability', () => {
    const menu = publicMenuFixture();
    menu.venue.city = 'Beograd';
    menu.venue.opening_hours = { mon: [['08:00', '23:00']] };
    const md = menuMarkdown(menu, ORIGIN);
    expect(md).toMatch(/^# Kafana Zora\n/);
    expect(md).toContain('- Adresa: Knez Mihailova 1, Beograd');
    expect(md).toContain('- Cene su u RSD.');
    expect(md).toContain('## Radno vreme (Europe/Belgrade)');
    expect(md).toContain('- Ponedeljak: 08:00–23:00');
    expect(md).toContain('## Topli napici');
    expect(md).toContain(': 180 RSD');
    expect(md).toContain('Alergeni: A7');
    expect(md).toContain('**Topla čokolada**: 180 RSD (trenutno nema)');
    expect(md).toContain('- Meni kao JSON: https://zora.menuly.app/api/v1/public/menus/');
  });

  it('uses English labels for a menu served in another language', () => {
    const menu = publicMenuFixture();
    menu.lang = 'en';
    const md = menuMarkdown(menu, ORIGIN);
    expect(md).toContain('- Prices are in RSD.');
    expect(md).toContain('- Menu page: https://zora.menuly.app/en/centar');
  });
});

describe('llmsTxt', () => {
  it('links every menu language as Markdown and the JSON form', () => {
    const txt = llmsTxt(
      {
        tenant: { name: 'Zora d.o.o.', slug: 'zora' },
        venues: [
          {
            name: 'Kafana Zora',
            slug: 'centar',
            type: 'restaurant',
            address: 'Knez Mihailova 1',
            city: 'Beograd',
            languages: ['sr', 'en'],
            updated_at: '2026-11-05T10:00:00Z',
          },
        ],
      },
      ORIGIN,
    );
    expect(txt).toMatch(/^# Zora d\.o\.o\.\n\n> /);
    expect(txt).toContain(
      '- [Kafana Zora (sr)](https://zora.menuly.app/centar.md): Knez Mihailova 1, Beograd',
    );
    expect(txt).toContain('- [Kafana Zora (en)](https://zora.menuly.app/en/centar.md)');
    expect(txt).toContain('(https://zora.menuly.app/api/v1/public/menus/zora/centar)');
  });
});
