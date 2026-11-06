import { inject, Injectable } from '@angular/core';
import type { PreloadingStrategy, Route } from '@angular/router';
import { of, type Observable } from 'rxjs';
import { APP_HOST } from './app-host';

/**
 * After the first page, loads every other lazy page in the background so later navigations are instant.
 * Guests on a tenant subdomain only ever see the public menu, so nothing is preloaded there;
 * a route with `data: { preload: false }` is skipped too.
 */
@Injectable({ providedIn: 'root' })
export class AppPreloading implements PreloadingStrategy {
  private readonly host = inject(APP_HOST);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (this.host.kind === 'tenant' || route.data?.['preload'] === false) return of(null);
    return load();
  }
}
