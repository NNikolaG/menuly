import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { menuHead, menuJsonLd, MenuSeo, menuUrl } from './menu-seo';
import type { PublicMenu } from './public-menu';
import { publicItem, publicMenuFixture } from './public-menu.testing';

const ORIGIN = 'https://zora.menuly.app';

function twoLanguages(): PublicMenu {
  const menu = publicMenuFixture();
  menu.languages = [
    { code: 'sr', name: 'Srpski' },
    { code: 'en', name: 'English' },
    { code: 'de', name: 'Deutsch' },
  ];
  return menu;
}

describe('menuUrl', () => {
  it('puts Serbian at the root, English under /en/ and other languages on ?lang', () => {
    expect(menuUrl(ORIGIN, 'centar', 'sr')).toBe('https://zora.menuly.app/centar');
    expect(menuUrl(ORIGIN, 'centar', 'en')).toBe('https://zora.menuly.app/en/centar');
    expect(menuUrl(ORIGIN, 'centar', 'de')).toBe('https://zora.menuly.app/en/centar?lang=de');
  });
});

describe('menuHead', () => {
  it('derives title and description from the venue and its categories', () => {
    const head = menuHead(publicMenuFixture(), ORIGIN);
    expect(head.title).toBe('Kafana Zora · meni i cene');
    expect(head.description).toBe(
      'Meni Kafana Zora: Topli napici, Pivo. Cene u RSD, radno vreme i adresa: Knez Mihailova 1.',
    );
    expect(head.canonical).toBe('https://zora.menuly.app/centar');
    expect(head.alternates).toEqual([]);
    expect(head.indexable).toBe(true);
  });

  it('keeps the description short when the menu has many categories', () => {
    const menu = publicMenuFixture();
    menu.menu.categories = Array.from({ length: 30 }, (_, i) => ({
      id: `c${i}`,
      name: `Kategorija ${i}`,
      description: '',
      items: [],
    }));
    const { description } = menuHead(menu, ORIGIN);
    expect(description.length).toBeLessThanOrEqual(155);
    expect(description).toContain('Kategorija 0');
    expect(description).toContain('Knez Mihailova 1');
  });

  it('links every menu language and points the canonical at the served one', () => {
    const menu = twoLanguages();
    menu.lang = 'de';
    const head = menuHead(menu, ORIGIN);
    expect(head.canonical).toBe('https://zora.menuly.app/en/centar?lang=de');
    expect(head.alternates).toEqual([
      { hreflang: 'sr', href: 'https://zora.menuly.app/centar' },
      { hreflang: 'en', href: 'https://zora.menuly.app/en/centar' },
      { hreflang: 'de', href: 'https://zora.menuly.app/en/centar?lang=de' },
      { hreflang: 'x-default', href: 'https://zora.menuly.app/centar' },
    ]);
  });

  it('uses the cover, else the first item photo, else the app icon as the preview image', () => {
    const menu = publicMenuFixture();
    expect(menuHead(menu, ORIGIN).image).toBe('https://zora.menuly.app/icon-512.png');
    menu.menu.categories[1].items[0].image_url = 'https://cdn.test/jelen.jpg';
    expect(menuHead(menu, ORIGIN).image).toBe('https://cdn.test/jelen.jpg');
  });

  it('keeps the demo tenant out of search engines', () => {
    const menu = publicMenuFixture();
    menu.tenant.slug = 'demo';
    expect(menuHead(menu, ORIGIN).indexable).toBe(false);
  });
});

describe('menuJsonLd', () => {
  it('states the venue type, city, coordinates and cuisine the owner filled in', () => {
    const menu = publicMenuFixture();
    Object.assign(menu.venue, {
      type: 'restaurant',
      city: 'Beograd',
      postal_code: '11000',
      latitude: 44.8176,
      longitude: 20.4569,
      cuisine: ['Roštilj'],
      description: 'Domaća kuhinja u centru.',
    });
    const [venue] = menuJsonLd(menu, ORIGIN)['@graph'] as Record<string, unknown>[];
    expect(venue).toMatchObject({
      '@type': 'Restaurant',
      description: 'Domaća kuhinja u centru.',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Knez Mihailova 1',
        addressLocality: 'Beograd',
        postalCode: '11000',
        addressCountry: 'RS',
      },
      geo: { '@type': 'GeoCoordinates', latitude: 44.8176, longitude: 20.4569 },
      servesCuisine: ['Roštilj'],
    });
    const head = menuHead(menu, ORIGIN);
    expect(head.title).toBe('Kafana Zora, Beograd · meni i cene');
    expect(head.description).toContain('adresa: Knez Mihailova 1, Beograd.');

    menu.lang = 'en';
    const [english] = menuJsonLd(menu, ORIGIN)['@graph'] as Record<string, unknown>[];
    expect(english['description']).toBeUndefined();
  });

  it('describes the venue with its opening hours and links it to the menu', () => {
    const menu = publicMenuFixture();
    menu.venue.phone = '+381 11 123';
    menu.venue.opening_hours = { mon: [['08:00', '23:00']], fri: [['08:00', '01:00']] };
    const [venue] = menuJsonLd(menu, ORIGIN)['@graph'] as Record<string, unknown>[];
    expect(venue).toMatchObject({
      '@type': 'FoodEstablishment',
      '@id': 'https://zora.menuly.app/centar#venue',
      name: 'Kafana Zora',
      telephone: '+381 11 123',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Knez Mihailova 1',
        addressCountry: 'RS',
      },
      currenciesAccepted: 'RSD',
      hasMenu: { '@id': 'https://zora.menuly.app/centar#menu' },
    });
    expect(venue['openingHoursSpecification']).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Monday',
        opens: '08:00',
        closes: '23:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Friday',
        opens: '08:00',
        closes: '01:00',
      },
    ]);
  });

  it('lists sections and items with prices, variants, availability, diets and allergens', () => {
    const menu = publicMenuFixture();
    menu.menu.categories[1].items = [
      publicItem({ id: 'i9', name: 'Salata', tags: ['Vegan', 'novo'], allergens: ['senf'] }),
    ];
    const graph = menuJsonLd(menu, ORIGIN)['@graph'] as Record<string, unknown>[];
    const sections = graph[1]['hasMenuSection'] as Record<string, unknown>[];
    expect(sections.map((section) => section['name'])).toEqual(['Topli napici', 'Pivo']);

    const [chocolate, espresso, cappuccino] = sections[0]['hasMenuItem'] as Record<
      string,
      unknown
    >[];
    expect(chocolate['offers']).toMatchObject({ availability: 'https://schema.org/OutOfStock' });
    expect(espresso).toEqual({
      '@type': 'MenuItem',
      name: 'Espreso',
      description: 'Dupli espreso. Alergeni: A7.',
      offers: {
        '@type': 'Offer',
        price: '180.00',
        priceCurrency: 'RSD',
        availability: 'https://schema.org/InStock',
      },
    });
    expect(cappuccino['offers']).toEqual([
      expect.objectContaining({ name: 'malo', price: '220.00' }),
      expect.objectContaining({ name: 'veliko', price: '280.00' }),
    ]);

    const [salad] = sections[1]['hasMenuItem'] as Record<string, unknown>[];
    expect(salad['suitableForDiet']).toEqual(['https://schema.org/VeganDiet']);
    expect(salad['description']).toBe('Alergeni: Senf.');
  });

  it('puts combos first as their own section', () => {
    const menu = publicMenuFixture();
    menu.promotions = [
      {
        id: 'k1',
        name: 'Doručak kombo',
        description: '',
        image_url: '',
        price_minor: 45000,
        regular_price_minor: 52000,
        savings_minor: 7000,
        ends_at: '2026-12-31T22:59:59Z',
        is_featured: true,
        is_available: true,
        slots: [
          { label: 'Kafa', quantity: 2, options: [] },
          { label: 'Kroasan', quantity: 1, options: [] },
        ],
      },
    ];
    const graph = menuJsonLd(menu, ORIGIN)['@graph'] as Record<string, unknown>[];
    const [combos] = graph[1]['hasMenuSection'] as Record<string, unknown>[];
    expect(combos['name']).toBe('Kombo ponude');
    expect(combos['hasMenuItem']).toEqual([
      {
        '@type': 'MenuItem',
        name: 'Doručak kombo',
        description: '2× Kafa + Kroasan',
        offers: {
          '@type': 'Offer',
          price: '450.00',
          priceCurrency: 'RSD',
          priceValidUntil: '2026-12-31T22:59:59Z',
          availability: 'https://schema.org/InStock',
        },
      },
    ]);
  });
});

describe('MenuSeo', () => {
  function head(): HTMLHeadElement {
    return TestBed.inject(DOCUMENT).head;
  }
  function links(rel: string): string[] {
    return [...head().querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"][data-seo]`)].map(
      (link) => `${link.getAttribute('hreflang') ?? ''} ${link.getAttribute('href')}`.trim(),
    );
  }

  afterEach(() => {
    head()
      .querySelectorAll('link[data-seo], #menu-jsonld, meta[name], meta[property]')
      .forEach((node) => node.remove());
    TestBed.inject(DOCUMENT).documentElement.removeAttribute('lang');
  });

  it('writes the head and replaces it when the menu changes', () => {
    const seo = TestBed.inject(MenuSeo);
    const meta = TestBed.inject(Meta);
    const origin = TestBed.inject(DOCUMENT).location.origin;

    seo.apply(twoLanguages());
    expect(TestBed.inject(Title).getTitle()).toBe('Kafana Zora · meni i cene');
    expect(meta.getTag('name="description"')!.content).toContain('Meni Kafana Zora');
    expect(meta.getTag('name="robots"')!.content).toBe('index, follow');
    expect(meta.getTag('property="og:url"')!.content).toBe(`${origin}/centar`);
    expect(meta.getTag('property="og:locale"')!.content).toBe('sr_RS');
    expect(links('canonical')).toEqual([`${origin}/centar`]);
    expect(links('alternate')).toHaveLength(4);
    const jsonLd = JSON.parse(head().querySelector('#menu-jsonld')!.textContent!);
    expect(jsonLd['@graph'][1]['@type']).toBe('Menu');

    const german = twoLanguages();
    german.lang = 'de';
    seo.apply(german);
    expect(links('canonical')).toEqual([`${origin}/en/centar?lang=de`]);
    expect(links('alternate')).toHaveLength(4);
    expect(meta.getTag('property="og:locale"')).toBeNull();
    expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('de');
    expect(head().querySelectorAll('#menu-jsonld')).toHaveLength(1);
  });

  it('cannot be broken out of by a menu text', () => {
    const menu = publicMenuFixture();
    menu.venue.name = '</script><script>alert(1)</script>';
    TestBed.inject(MenuSeo).apply(menu);
    const script = head().querySelector('#menu-jsonld')!;
    expect(script.textContent).not.toContain('</script>');
    expect(JSON.parse(script.textContent!)['@graph'][0].name).toBe(menu.venue.name);
  });

  it('asks search engines to drop a page without a menu', () => {
    const seo = TestBed.inject(MenuSeo);
    seo.apply(twoLanguages());
    seo.noindex();
    expect(TestBed.inject(Meta).getTag('name="robots"')!.content).toBe('noindex, nofollow');
    expect(links('canonical')).toEqual([]);
    expect(links('alternate')).toEqual([]);
    expect(head().querySelector('#menu-jsonld')).toBeNull();
  });
});
