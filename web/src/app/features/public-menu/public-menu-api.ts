import { inject, Injectable, LOCALE_ID } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import type { PublicMenu } from '../../core/public-menu/public-menu';

@Injectable({ providedIn: 'root' })
export class PublicMenuApi {
  private readonly api = inject(ApiClient);
  /** Source locale is sr-Latn (the API default); other builds ask for their language. */
  private readonly localeLang = inject(LOCALE_ID).startsWith('sr') ? undefined : inject(LOCALE_ID);

  /**
   * The venue's published menu; 404 (`not_found`) when the venue or a published menu is missing.
   * `lang` (from `?lang=`) asks for one of the menu's own languages, else the build's language.
   */
  menuResource(
    tenantSlug: () => string | undefined,
    venueSlug: () => string | undefined,
    lang: () => string | undefined = () => undefined,
  ) {
    return this.api.resource<PublicMenu>(() => {
      const tenant = tenantSlug();
      const venue = venueSlug();
      if (!tenant || !venue) return undefined;
      return {
        path: `/v1/public/menus/${encodeURIComponent(tenant)}/${encodeURIComponent(venue)}`,
        query: { lang: lang() || this.localeLang },
      };
    });
  }

  /** Counts one menu open for the venue's stats (no auth, 204). */
  countView(tenantSlug: string, venueSlug: string): Observable<void> {
    return this.api.post(
      `/v1/public/menus/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(venueSlug)}/views`,
    );
  }
}
