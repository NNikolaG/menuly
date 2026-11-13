import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { labelOf } from '../menus/menu-labels';
import { DEMO_TENANT_SLUG, menuUrl } from './menu-url';
import { type VenueType, WEEKDAYS, type Weekday } from '../venues/venue';
import type { PublicItem, PublicMenu, PublicPromotion } from './public-menu';

const DESCRIPTION_MAX = 155;
const JSON_LD_ID = 'menu-jsonld';

const SCHEMA_DAYS: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Diet tags (Serbian keys of `DIET_TAGS`) that schema.org has a value for. */
const SCHEMA_DIETS: Record<string, string> = {
  vegan: 'VeganDiet',
  vegetarijansko: 'VegetarianDiet',
  'bez glutena': 'GlutenFreeDiet',
  'bez laktoze': 'LowLactoseDiet',
};

/** The most specific schema.org type per venue type; schema.org has none for a pastry shop. */
const SCHEMA_VENUES: Record<VenueType, string> = {
  restaurant: 'Restaurant',
  cafe: 'CafeOrCoffeeShop',
  bar: 'BarOrPub',
  fast_food: 'FastFoodRestaurant',
  bakery: 'Bakery',
  pastry_shop: 'Bakery',
  other: 'FoodEstablishment',
};

const OG_LOCALES: Record<string, string> = { sr: 'sr_RS', en: 'en_US' };

export { menuUrl };

export interface MenuHead {
  title: string;
  description: string;
  canonical: string;
  /** One per menu language plus `x-default`; empty when the menu has a single language. */
  alternates: { hreflang: string; href: string }[];
  image: string;
  /** False for the demo tenant. */
  indexable: boolean;
}

/** Title, description and links of a guest menu page, all derived from the menu itself. */
export function menuHead(menu: PublicMenu, origin: string): MenuHead {
  const { venue } = menu;
  const languages = menu.languages?.length ? menu.languages.map((l) => l.code) : [menu.lang];
  const alternates =
    languages.length > 1
      ? [
          ...languages.map((code) => ({
            hreflang: code,
            href: menuUrl(origin, venue.slug, code),
          })),
          { hreflang: 'x-default', href: menuUrl(origin, venue.slug, 'sr') },
        ]
      : [];
  return {
    title: venue.city
      ? $localize`:@@seo.menu.titleCity:${venue.name}:venue:, ${venue.city}:city: · meni i cene`
      : $localize`:@@seo.menu.title:${venue.name}:venue: · meni i cene`,
    description: describe(menu),
    canonical: menuUrl(origin, venue.slug, menu.lang),
    alternates,
    image: menu.theme?.cover_url || firstImage(menu) || `${origin}/icon-512.png`,
    indexable: menu.tenant.slug !== DEMO_TENANT_SLUG,
  };
}

function describe(menu: PublicMenu): string {
  const { venue } = menu;
  const categories = menu.menu.categories.map((category) => category.name).filter(Boolean);
  const lead = $localize`:@@seo.menu.descriptionLead:Meni ${venue.name}:venue:`;
  const address = [venue.address, venue.city].filter(Boolean).join(', ');
  const tail = address
    ? $localize`:@@seo.menu.descriptionTail:Cene u ${venue.currency}:currency:, radno vreme i adresa: ${address}:address:.`
    : $localize`:@@seo.menu.descriptionTailNoAddress:Cene u ${venue.currency}:currency: i radno vreme.`;
  // As many category names as fit; the venue and the closing sentence always stay.
  let list = '';
  for (const name of categories) {
    const next = list ? `${list}, ${name}` : name;
    if (`${lead}: ${next}. ${tail}`.length > DESCRIPTION_MAX) break;
    list = next;
  }
  return list ? `${lead}: ${list}. ${tail}` : `${lead}. ${tail}`;
}

function firstImage(menu: PublicMenu): string {
  for (const category of menu.menu.categories) {
    for (const item of category.items) if (item.image_url) return item.image_url;
  }
  return '';
}

/**
 * schema.org description of the venue and its whole menu (`Restaurant` or another venue type → `Menu` →
 * `MenuSection` → `MenuItem` → `Offer`), for search engines and AI agents.
 */
export function menuJsonLd(menu: PublicMenu, origin: string): Record<string, unknown> {
  const { venue } = menu;
  const venueUrl = menuUrl(origin, venue.slug, 'sr');
  const pageUrl = menuUrl(origin, venue.slug, menu.lang);
  const head = menuHead(menu, origin);

  const sections = menu.menu.categories.map((category) =>
    compact({
      '@type': 'MenuSection',
      name: category.name,
      description: category.description,
      hasMenuItem: category.items.map((item) => menuItem(item, venue.currency)),
    }),
  );
  const combos = (menu.promotions ?? []).map((promotion) => combo(promotion, venue.currency));
  if (combos.length) {
    sections.unshift({
      '@type': 'MenuSection',
      name: $localize`:@@seo.menu.combos:Kombo ponude`,
      hasMenuItem: combos,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      compact({
        '@type': SCHEMA_VENUES[venue.type] ?? 'FoodEstablishment',
        '@id': `${venueUrl}#venue`,
        name: venue.name,
        // Written by the venue in Serbian, so only the Serbian page states it.
        description: menu.lang === 'sr' ? venue.description : '',
        url: venueUrl,
        telephone: venue.phone,
        address: postalAddress(menu),
        geo:
          venue.latitude !== null && venue.longitude !== null
            ? { '@type': 'GeoCoordinates', latitude: venue.latitude, longitude: venue.longitude }
            : null,
        servesCuisine: venue.cuisine,
        image: head.image,
        logo: menu.theme?.logo_url,
        currenciesAccepted: venue.currency,
        openingHoursSpecification: openingHours(menu),
        parentOrganization: { '@type': 'Organization', name: menu.tenant.name },
        hasMenu: { '@id': `${pageUrl}#menu` },
      }),
      compact({
        '@type': 'Menu',
        '@id': `${pageUrl}#menu`,
        name: menu.menu.name,
        url: pageUrl,
        inLanguage: menu.lang,
        dateModified: menu.menu.published_at,
        hasMenuSection: sections,
      }),
    ],
  };
}

/** Without a street or city there is no address to state, only a country. */
function postalAddress(menu: PublicMenu): Record<string, unknown> | null {
  const { venue } = menu;
  if (!venue.address && !venue.city) return null;
  return compact({
    '@type': 'PostalAddress',
    streetAddress: venue.address,
    addressLocality: venue.city,
    postalCode: venue.postal_code,
    addressCountry: venue.country,
  });
}

function openingHours(menu: PublicMenu): unknown[] {
  const hours = menu.venue.opening_hours ?? {};
  return WEEKDAYS.flatMap((day) =>
    (hours[day] ?? []).map(([opens, closes]) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAYS[day]}`,
      opens,
      // A close at or before the open time is the next day, which is also how schema.org reads it.
      closes,
    })),
  );
}

function menuItem(item: PublicItem, currency: string): Record<string, unknown> {
  const availability = `https://schema.org/${item.is_available ? 'InStock' : 'OutOfStock'}`;
  const offers = item.variants.map((variant) =>
    compact({
      '@type': 'Offer',
      name: variant.label,
      price: price(variant.price_minor),
      priceCurrency: currency,
      availability,
    }),
  );
  // schema.org has no allergen property on MenuItem, so they go into the text agents read.
  const allergens = item.allergens.length
    ? $localize`:@@seo.menu.allergens:Alergeni: ${item.allergens.map(labelOf).join(', ')}:allergens:.`
    : '';
  return compact({
    '@type': 'MenuItem',
    name: item.name,
    description: [item.description, allergens].filter(Boolean).join(' '),
    image: item.image_url,
    suitableForDiet: item.tags
      .map((tag) => SCHEMA_DIETS[tag.toLowerCase()])
      .filter(Boolean)
      .map((diet) => `https://schema.org/${diet}`),
    offers: offers.length === 1 ? offers[0] : offers,
  });
}

function combo(promotion: PublicPromotion, currency: string): Record<string, unknown> {
  const parts = promotion.slots
    .map((slot) => (slot.quantity > 1 ? `${slot.quantity}× ${slot.label}` : slot.label))
    .filter(Boolean)
    .join(' + ');
  return compact({
    '@type': 'MenuItem',
    name: promotion.name,
    description: [promotion.description, parts].filter(Boolean).join(' '),
    image: promotion.image_url,
    offers: compact({
      '@type': 'Offer',
      price: price(promotion.price_minor),
      priceCurrency: currency,
      priceValidUntil: promotion.ends_at,
      availability: `https://schema.org/${promotion.is_available ? 'InStock' : 'OutOfStock'}`,
    }),
  });
}

/** Minor units to a schema.org price: `52000` → `"520.00"`. */
function price(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Drops empty strings, nulls and empty lists, so the JSON-LD only states what the venue filled in. */
function compact(node: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).filter(
      ([, value]) =>
        value !== '' &&
        value !== null &&
        value !== undefined &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
}

/**
 * Writes a guest menu page's `<head>`: title, description, canonical and hreflang links,
 * Open Graph and the JSON-LD menu. Runs in the server render (what crawlers read) and again
 * in the browser, where it updates the same tags.
 */
@Injectable({ providedIn: 'root' })
export class MenuSeo {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  apply(menu: PublicMenu): void {
    const origin = this.document.location.origin;
    const head = menuHead(menu, origin);

    this.title.setTitle(head.title);
    this.meta.updateTag({ name: 'description', content: head.description });
    this.meta.updateTag({
      name: 'robots',
      content: head.indexable ? 'index, follow' : 'noindex, nofollow',
    });
    this.property('og:type', 'website');
    this.property('og:site_name', 'Menuly');
    this.property('og:title', head.title);
    this.property('og:description', head.description);
    this.property('og:url', head.canonical);
    this.property('og:image', head.image);
    const locale = OG_LOCALES[menu.lang];
    if (locale) this.property('og:locale', locale);
    else this.meta.removeTag('property="og:locale"');
    this.meta.updateTag({
      name: 'twitter:card',
      content: menu.theme?.cover_url ? 'summary_large_image' : 'summary',
    });

    this.links('canonical', [{ href: head.canonical }]);
    this.links('alternate', head.alternates);
    // The English build also serves menu languages it has no texts for (`?lang=de`).
    if (menu.lang !== 'sr' && menu.lang !== 'en') {
      this.document.documentElement.setAttribute('lang', menu.lang);
    }

    this.jsonLd(menuJsonLd(menu, origin));
  }

  /** A missing menu or a failed load: nothing here for a search engine to keep. */
  noindex(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.links('canonical', []);
    this.links('alternate', []);
    this.document.getElementById(JSON_LD_ID)?.remove();
  }

  private property(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property="${property}"`);
  }

  /** Replaces this service's `<link rel>` tags of one kind. */
  private links(rel: string, links: { href: string; hreflang?: string }[]): void {
    const head = this.document.head;
    head.querySelectorAll(`link[rel="${rel}"][data-seo]`).forEach((link) => link.remove());
    for (const { href, hreflang } of links) {
      // Attributes, not properties: the server's DOM has no `dataset` or `hreflang`.
      const link = this.document.createElement('link');
      link.setAttribute('rel', rel);
      if (hreflang) link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', href);
      link.setAttribute('data-seo', '');
      head.appendChild(link);
    }
  }

  private jsonLd(data: Record<string, unknown>): void {
    let script = this.document.getElementById(JSON_LD_ID);
    if (!script) {
      script = this.document.createElement('script');
      script.id = JSON_LD_ID;
      script.setAttribute('type', 'application/ld+json');
      this.document.head.appendChild(script);
    }
    // `<` escaped so a menu text can never close the script element.
    script.textContent = JSON.stringify(data).replaceAll('<', '\\u003c');
  }
}
