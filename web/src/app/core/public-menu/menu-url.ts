// No `$localize` here or in what this imports: `server.ts` loads it before the app.

/** The seeded demo tenant (backend `seed.TenantSlug`): made-up venues, kept out of search engines. */
export const DEMO_TENANT_SLUG = 'demo';

/**
 * Address of a venue's menu in one of its languages: Serbian at the root, English under `/en/`,
 * any other menu language on the English build with `?lang=` (same rule as the language picker).
 */
export function menuUrl(origin: string, venueSlug: string, lang: string): string {
  const slug = encodeURIComponent(venueSlug);
  if (lang === 'sr') return `${origin}/${slug}`;
  return lang === 'en'
    ? `${origin}/en/${slug}`
    : `${origin}/en/${slug}?lang=${encodeURIComponent(lang)}`;
}

/** The same menu as Markdown, for AI agents: `/{venue}.md`, same language rule as `menuUrl`. */
export function menuMarkdownUrl(origin: string, venueSlug: string, lang: string): string {
  const [path, query] = menuUrl(origin, venueSlug, lang).split('?');
  return query ? `${path}.md?${query}` : `${path}.md`;
}

/** The menu as JSON, straight from the public API (CORS open, cached 30 s). */
export function menuJsonUrl(origin: string, tenantSlug: string, venueSlug: string, lang: string) {
  const url = `${origin}/api/v1/public/menus/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(venueSlug)}`;
  return lang === 'sr' ? url : `${url}?lang=${encodeURIComponent(lang)}`;
}
