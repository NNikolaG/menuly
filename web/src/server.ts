import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { apiInternalUrl } from './app/core/api/api-internal-url';
import { parseHost } from './app/core/host/app-host';
import type { PublicTenant } from './app/core/public-menu/public-tenant';
import { robotsTxt, sitemapXml } from './app/core/public-menu/tenant-site';

// The browser reads the base domain from /app-config.js; on the server it comes from the env.
(globalThis as { menulyConfig?: { baseDomain?: string } }).menulyConfig = {
  baseDomain: process.env['BASE_DOMAIN'],
};

// Allowed hosts and trusted proxy headers come from NG_ALLOWED_HOSTS and NG_TRUST_PROXY_HEADERS.
const angularApp = new AngularNodeAppEngine();

/**
 * Renders guest pages only: nginx serves the static files and the app host itself and sends
 * tenant-subdomain pages here. `ng serve` uses the same handler.
 */
async function handle(req: IncomingMessage, res: ServerResponse, next?: () => void) {
  try {
    if (await tenantSite(req, res)) return;
    const response = await angularApp.handle(req);
    if (response) return writeResponseToNodeResponse(response, res);
    if (next) return next();
    res.statusCode = 404;
    res.end();
  } catch (error) {
    console.error(error);
    res.statusCode = 503;
    res.setHeader('Retry-After', '30');
    res.end();
  }
}

/**
 * What a tenant subdomain serves besides its pages: `robots.txt`, `sitemap.xml`, and the root,
 * which goes straight to the menu when the tenant has a single venue. True when answered.
 */
async function tenantSite(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const root = /^\/(en\/?)?$/.exec(url.pathname);
  if (!root && url.pathname !== '/robots.txt' && url.pathname !== '/sitemap.xml') return false;
  const hostname = (req.headers.host ?? '').replace(/:\d+$/, '');
  const host = parseHost(hostname);
  if (host.kind !== 'tenant') return false;

  const proto = String(req.headers['x-forwarded-proto'] ?? 'http')
    .split(',')[0]
    .trim();
  const origin = `${proto}://${req.headers.host}`;
  const send = (status: number, type: string, body: string) => {
    res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
    return true;
  };
  if (url.pathname === '/robots.txt') return send(200, 'text/plain', robotsTxt(origin));

  const response = await fetch(`${apiInternalUrl}/v1/public/tenants/${host.tenantSlug}`);
  if (root) {
    // Several venues, none, or no such tenant: the tenant page (or its "not found") handles it.
    if (!response.ok) return false;
    const { venues } = (await response.json()) as PublicTenant;
    if (venues.length !== 1) return false;
    res.writeHead(302, { Location: `/${root[1] ? 'en/' : ''}${venues[0].slug}` }).end();
    return true;
  }
  if (response.status === 404) return send(404, 'text/plain', 'Not found\n');
  if (!response.ok) throw new Error(`tenant ${host.tenantSlug}: API answered ${response.status}`);
  return send(200, 'application/xml', sitemapXml((await response.json()) as PublicTenant, origin));
}

export const reqHandler = createNodeRequestHandler(handle);

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] || 4000);
  createServer((req, res) => void handle(req, res)).listen(port, () =>
    console.log(`SSR listening on :${port}`),
  );
}
