import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { VenuesStore } from './venues-store';

/** Venue list: with exactly one venue there is nothing to pick, so it opens that venue. */
export const singleVenueGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const items = await inject(VenuesStore).items();
  return items?.length === 1 ? router.createUrlTree(['/objekti', items[0].id]) : true;
};
