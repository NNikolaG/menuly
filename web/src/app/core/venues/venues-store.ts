import { effect, inject, Injectable, Injector } from '@angular/core';
import { ApiClient } from '../api/api-client';
import { AuthStore } from '../auth/auth-store';
import type { Venue, VenueList } from './venue';

/**
 * The current tenant's venues, loaded once and shared by every page (dashboard, list, guards),
 * so moving between pages doesn't wait for the list again. Reload it after a venue is created, renamed or deleted.
 */
@Injectable({ providedIn: 'root' })
export class VenuesStore {
  private readonly auth = inject(AuthStore);
  private readonly injector = inject(Injector);

  readonly list = inject(ApiClient).resource<VenueList>(() => ({
    path: '/v1/venues',
    key: this.auth.tenantId(),
  }));

  /** The venues once loaded (cached value right away); undefined when the list failed. */
  items(): Promise<Venue[] | undefined> {
    const current = () => (this.list.hasValue() ? this.list.value()?.items : undefined);
    if (this.list.hasValue() || !this.list.isLoading()) return Promise.resolve(current());
    return new Promise((resolve) => {
      const ref = effect(
        () => {
          if (this.list.isLoading()) return;
          resolve(current());
          ref.destroy();
        },
        { injector: this.injector },
      );
    });
  }
}
