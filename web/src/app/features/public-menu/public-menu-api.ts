import { inject, Injectable, LOCALE_ID } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import type { PublicMenu } from '../../core/public-menu/public-menu';

@Injectable({ providedIn: 'root' })
export class PublicMenuApi {
  private readonly api = inject(ApiClient);
  /** Source locale is sr-Latn (the API default); other builds ask for their language. */
  private readonly lang = inject(LOCALE_ID).startsWith('sr') ? undefined : inject(LOCALE_ID);

  /** The venue's published menu; 404 (`not_found`) when the venue or a published menu is missing. */
  menuResource(tenantSlug: () => string | undefined, venueSlug: () => string | undefined) {
    return this.api.resource<PublicMenu>(() => {
      const tenant = tenantSlug();
      const venue = venueSlug();
      if (!tenant || !venue) return undefined;
      return {
        path: `/v1/public/menus/${encodeURIComponent(tenant)}/${encodeURIComponent(venue)}`,
        query: { lang: this.lang },
      };
    });
  }
}
