import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

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

export const reqHandler = createNodeRequestHandler(handle);

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] || 4000);
  createServer((req, res) => void handle(req, res)).listen(port, () =>
    console.log(`SSR listening on :${port}`),
  );
}
