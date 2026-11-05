import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { Venue, VenueInput, VenueList } from './venue';

/**
 * `/v1/venues`. Template for every feature API: `xxxResource()` for reads (signals, call in a field initializer),
 * plain methods returning Observables for writes.
 */
@Injectable({ providedIn: 'root' })
export class VenuesApi {
  private readonly api = inject(ApiClient);

  listResource() {
    return this.api.resource<VenueList>(() => '/v1/venues');
  }

  /** Idle while `id()` is undefined; reloads when it changes. */
  venueResource(id: () => string | undefined) {
    return this.api.resource<Venue>(() => {
      const venueId = id();
      return venueId ? `/v1/venues/${encodeURIComponent(venueId)}` : undefined;
    });
  }

  create(input: VenueInput & Pick<Venue, 'name'>): Observable<Venue> {
    return this.api.post('/v1/venues', input);
  }

  update(id: string, input: VenueInput): Observable<Venue> {
    return this.api.patch(`/v1/venues/${encodeURIComponent(id)}`, input);
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/v1/venues/${encodeURIComponent(id)}`);
  }
}
