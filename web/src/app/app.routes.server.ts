import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * Only guest pages on a tenant subdomain are rendered on the server (SEO, link previews, AI crawlers).
 * Everything on the app host stays a client-side SPA; nginx never sends those hosts to the SSR server.
 * The app-host paths are listed so `ng serve` behaves the same as production.
 */
export const serverRoutes: ServerRoute[] = [
  ...[
    '',
    'prijava',
    'registracija',
    'zaboravljena-lozinka',
    'reset-password',
    'invite',
    'design/**',
    'pregled/**',
    'objekti/**',
    'uvoz/**',
    'meniji/**',
    'tim',
    'admin',
  ].map((path): ServerRoute => ({ path, renderMode: RenderMode.Client })),
  { path: '**', renderMode: RenderMode.Server },
];
