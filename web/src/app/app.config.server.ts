import { FetchBackend, HttpBackend, type HttpRequest } from '@angular/common/http';
import { DOCUMENT, inject, mergeApplicationConfig, type ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { API_BASE_URL } from './core/api/api-client';
import { apiInternalUrl } from './core/api/api-internal-url';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Rewritten in the backend, after the transfer cache, so its keys stay `/api/...` like in the browser.
    {
      provide: HttpBackend,
      useFactory: (): HttpBackend => {
        const fetch = inject(FetchBackend);
        const base = inject(API_BASE_URL);
        const origin = inject(DOCUMENT).location.origin;
        return {
          // Angular has already made the URL absolute against the page: `https://{host}/api/...`.
          handle: (req: HttpRequest<unknown>) => {
            const url = new URL(req.url, origin);
            if (url.origin !== origin || !url.pathname.startsWith(`${base}/`))
              return fetch.handle(req);
            const path = url.pathname.slice(base.length) + url.search;
            return fetch.handle(req.clone({ url: apiInternalUrl + path }));
          },
        };
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
