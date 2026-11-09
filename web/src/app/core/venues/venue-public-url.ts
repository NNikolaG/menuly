import { configuredBaseDomain } from '../config/base-domain';

/** Guest URL of a venue's menu, without the scheme: `{tenant}.menuly.app/{venue}`. */
export function venuePublicUrl(
  tenantSlug: string,
  venueSlug: string,
  baseDomain = configuredBaseDomain(),
): string {
  return `${tenantSlug}.${baseDomain}/${venueSlug}`;
}
