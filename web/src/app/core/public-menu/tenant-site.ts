import { DEMO_TENANT_SLUG, menuUrl } from './menu-url';
import type { PublicTenant } from './public-tenant';

/** `robots.txt` of a tenant subdomain: everything may be read, and here is the sitemap. */
export function robotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
}

/**
 * `sitemap.xml` of a tenant subdomain: every published menu in each of its languages, with the
 * other languages as alternates (the same links the page's `hreflang` tags state).
 * The demo tenant's pages are `noindex`, so its sitemap is empty.
 */
export function sitemapXml(tenant: PublicTenant, origin: string): string {
  const venues = tenant.tenant.slug === DEMO_TENANT_SLUG ? [] : tenant.venues;
  const urls = venues.flatMap((venue) => {
    const alternates =
      venue.languages.length > 1
        ? [
            ...venue.languages.map((lang) => alternate(lang, menuUrl(origin, venue.slug, lang))),
            alternate('x-default', menuUrl(origin, venue.slug, 'sr')),
          ]
        : [];
    return venue.languages.map((lang) =>
      [
        '  <url>',
        `    <loc>${escapeXml(menuUrl(origin, venue.slug, lang))}</loc>`,
        `    <lastmod>${escapeXml(venue.updated_at)}</lastmod>`,
        ...alternates,
        '  </url>',
      ].join('\n'),
    );
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function alternate(hreflang: string, href: string): string {
  return `    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
