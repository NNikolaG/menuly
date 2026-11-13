// No `$localize` here or in what this imports: `server.ts` loads it before the app.
import { WEEKDAYS, type Weekday } from '../venues/venue';
import { DEMO_TENANT_SLUG, menuJsonUrl, menuMarkdownUrl, menuUrl } from './menu-url';
import type { PublicItem, PublicMenu } from './public-menu';
import type { PublicTenant } from './public-tenant';

/** Serbian for a Serbian menu, English for every other language. */
const TEXTS = {
  sr: {
    address: 'Adresa',
    phone: 'Telefon',
    cuisine: 'Kuhinja',
    hours: 'Radno vreme',
    prices: 'Cene su u',
    updated: 'Meni objavljen',
    combos: 'Kombo ponude',
    until: 'važi do',
    unavailable: 'trenutno nema',
    allergens: 'Alergeni',
    tags: 'Oznake',
    page: 'Stranica menija',
    json: 'Meni kao JSON',
    days: ['Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota', 'Nedelja'],
  },
  en: {
    address: 'Address',
    phone: 'Phone',
    cuisine: 'Cuisine',
    hours: 'Opening hours',
    prices: 'Prices are in',
    updated: 'Menu published',
    combos: 'Combo offers',
    until: 'valid until',
    unavailable: 'currently unavailable',
    allergens: 'Allergens',
    tags: 'Tags',
    page: 'Menu page',
    json: 'Menu as JSON',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  },
};

/**
 * The whole menu as one Markdown document: what an AI agent reads instead of the HTML page.
 * Same content as the page and its JSON-LD; allergen and diet tags stay as the venue wrote them
 * (Serbian).
 */
export function menuMarkdown(menu: PublicMenu, origin: string): string {
  const { venue } = menu;
  const t = menu.lang === 'sr' ? TEXTS.sr : TEXTS.en;
  const lines: string[] = [`# ${venue.name}`, ''];
  if (venue.description && menu.lang === 'sr') lines.push(venue.description, '');

  const address = [venue.address, [venue.postal_code, venue.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  if (address) lines.push(`- ${t.address}: ${address}`);
  if (venue.phone) lines.push(`- ${t.phone}: ${venue.phone}`);
  if (venue.cuisine.length) lines.push(`- ${t.cuisine}: ${venue.cuisine.join(', ')}`);
  lines.push(`- ${t.prices} ${venue.currency}.`);
  if (menu.menu.published_at) lines.push(`- ${t.updated}: ${menu.menu.published_at}`);
  lines.push(`- ${t.page}: ${menuUrl(origin, venue.slug, menu.lang)}`);
  lines.push(`- ${t.json}: ${menuJsonUrl(origin, menu.tenant.slug, venue.slug, menu.lang)}`);

  const hours = venue.opening_hours ?? {};
  const days = WEEKDAYS.filter((day) => hours[day]?.length);
  if (days.length) {
    lines.push('', `## ${t.hours} (${venue.timezone})`, '');
    for (const day of days) {
      const intervals = hours[day as Weekday]!.map(([from, to]) => `${from}–${to}`).join(', ');
      lines.push(`- ${t.days[WEEKDAYS.indexOf(day)]}: ${intervals}`);
    }
  }

  const promotions = menu.promotions ?? [];
  if (promotions.length) {
    lines.push('', `## ${t.combos}`, '');
    for (const promo of promotions) {
      const parts = promo.slots
        .map((slot) => (slot.quantity > 1 ? `${slot.quantity}× ${slot.label}` : slot.label))
        .filter(Boolean)
        .join(' + ');
      const notes = [
        promo.ends_at ? `${t.until} ${promo.ends_at}` : '',
        promo.is_available ? '' : t.unavailable,
      ].filter(Boolean);
      lines.push(
        `- **${promo.name}**: ${price(promo.price_minor)} ${venue.currency}` +
          (notes.length ? ` (${notes.join(', ')})` : ''),
      );
      for (const detail of [promo.description, parts]) if (detail) lines.push(`  ${detail}`);
    }
  }

  for (const category of menu.menu.categories) {
    lines.push('', `## ${category.name}`, '');
    if (category.description) lines.push(category.description, '');
    for (const item of category.items) lines.push(...itemLines(item, venue.currency, t));
  }
  return `${lines.join('\n')}\n`;
}

function itemLines(item: PublicItem, currency: string, t: typeof TEXTS.sr): string[] {
  const prices = item.variants
    .map((variant) =>
      [variant.label, `${price(variant.price_minor)} ${currency}`].filter(Boolean).join(' '),
    )
    .join(' / ');
  const lines = [
    `- **${item.name}**${prices ? `: ${prices}` : ''}${item.is_available ? '' : ` (${t.unavailable})`}`,
  ];
  if (item.description) lines.push(`  ${item.description}`);
  if (item.allergens.length) lines.push(`  ${t.allergens}: ${item.allergens.join(', ')}`);
  if (item.tags.length) lines.push(`  ${t.tags}: ${item.tags.join(', ')}`);
  return lines;
}

/** Minor units as a plain number: `52000` → `520`, `52050` → `520.50`. */
function price(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/**
 * `llms.txt` of a tenant subdomain (llmstxt.org): where an AI agent finds each venue's menu
 * as Markdown and JSON, and how to read it.
 */
export function llmsTxt(tenant: PublicTenant, origin: string): string {
  const demo = tenant.tenant.slug === DEMO_TENANT_SLUG;
  const lines = [
    `# ${tenant.tenant.name}`,
    '',
    `> Menus of ${tenant.tenant.name}${demo ? ' (demo data, not a real venue)' : ''}: items, prices, allergens, opening hours and addresses, kept up to date by the venue.`,
    '',
    'Prices are in the currency each menu states. Items marked unavailable are temporarily off the menu. Allergen and diet tags are written in Serbian. Serbian (`sr`) is the original; other languages are translations of the same menu.',
    '',
    '## Menus',
    '',
  ];
  for (const venue of tenant.venues) {
    const place = [venue.address, venue.city].filter(Boolean).join(', ');
    for (const lang of venue.languages) {
      lines.push(
        `- [${venue.name} (${lang})](${menuMarkdownUrl(origin, venue.slug, lang)})` +
          (place ? `: ${place}` : ''),
      );
    }
  }
  lines.push('', '## Optional', '');
  for (const venue of tenant.venues) {
    lines.push(
      `- [${venue.name} as JSON](${menuJsonUrl(origin, tenant.tenant.slug, venue.slug, 'sr')}): the same menu as structured data; add \`?lang=\` for a translation`,
    );
  }
  return `${lines.join('\n')}\n`;
}
