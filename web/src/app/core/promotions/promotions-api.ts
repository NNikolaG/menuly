import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { Promotion, PromotionInput } from './promotion';

const id = encodeURIComponent;

/** Combo offers of a venue (`/v1/venues/{id}/promotions`, `/v1/promotions/{id}`). */
@Injectable({ providedIn: 'root' })
export class PromotionsApi {
  private readonly api = inject(ApiClient);

  /** In display order; idle while `venueId()` is undefined. */
  listResource(venueId: () => string | undefined) {
    return this.api.resource<{ items: Promotion[] }>(() => {
      const venue = venueId();
      return venue ? `/v1/venues/${id(venue)}/promotions` : undefined;
    });
  }

  promotionResource(promotionId: () => string | undefined) {
    return this.api.resource<Promotion>(() => {
      const promotion = promotionId();
      return promotion ? `/v1/promotions/${id(promotion)}` : undefined;
    });
  }

  /** `name`, `price_minor` and `slots` are required. */
  create(venueId: string, input: PromotionInput): Observable<Promotion> {
    return this.api.post(`/v1/venues/${id(venueId)}/promotions`, input);
  }

  update(promotionId: string, input: PromotionInput): Observable<Promotion> {
    return this.api.patch(`/v1/promotions/${id(promotionId)}`, input);
  }

  remove(promotionId: string): Observable<void> {
    return this.api.delete(`/v1/promotions/${id(promotionId)}`);
  }

  reorder(venueId: string, ids: string[]): Observable<{ items: Promotion[] }> {
    return this.api.put(`/v1/venues/${id(venueId)}/promotions/order`, { ids });
  }
}
