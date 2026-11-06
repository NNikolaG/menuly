/** Guest URL of a venue's menu, without the scheme: `{tenant}.menuly.app/{venue}`. */
export function venuePublicUrl(tenantSlug: string, venueSlug: string): string {
  return `${tenantSlug}.menuly.app/${venueSlug}`;
}
