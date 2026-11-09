/** Set by `/app-config.js`, which nginx fills from the container env before the app starts. */
interface MenulyConfig {
  baseDomain?: string;
}

const DEFAULT_BASE_DOMAIN = 'menuly.app';

/**
 * Domain tenant subdomains hang off, e.g. `menuly.app` or `1.2.3.4.nip.io` on a
 * demo server: `{tenant}.{baseDomain}/{venue}`.
 */
export function configuredBaseDomain(
  config: MenulyConfig | undefined = (globalThis as { menulyConfig?: MenulyConfig }).menulyConfig,
): string {
  const domain = config?.baseDomain?.trim().toLowerCase();
  return domain || DEFAULT_BASE_DOMAIN;
}
