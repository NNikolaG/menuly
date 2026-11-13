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
