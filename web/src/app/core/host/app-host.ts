import { DOCUMENT, inject, InjectionToken } from '@angular/core';
import { configuredBaseDomain } from '../config/base-domain';

/** `app`: admin and auth pages. `tenant`: a tenant's public subdomain, `{tenant}.menuly.app`
 * (or `{tenant}.{BASE_DOMAIN}` on a server set up for another domain). */
export type AppHost = { kind: 'app' } | { kind: 'tenant'; tenantSlug: string };

const RESERVED = new Set([
  'www',
  'api',
  'app',
  'admin',
  'mail',
  'static',
  'cdn',
  'docs',
  'help',
  'support',
  'status',
  'blog',
]);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseHost(hostname: string, baseDomain = configuredBaseDomain()): AppHost {
  const host = hostname.toLowerCase();
  for (const base of [baseDomain, 'localhost']) {
    if (!host.endsWith(`.${base}`)) continue;
    const label = host.slice(0, -base.length - 1);
    if (SLUG.test(label) && !RESERVED.has(label)) return { kind: 'tenant', tenantSlug: label };
  }
  return { kind: 'app' };
}

export const APP_HOST = new InjectionToken<AppHost>('APP_HOST', {
  factory: () => parseHost(inject(DOCUMENT).location.hostname),
});
