import { inject, Injector } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { waitForMe } from '../auth/auth.guards';
import { AuthStore } from '../auth/auth-store';
import { VenuesStore } from './venues-store';

/**
 * `/objekti/:venueId/**`: a member limited to some venues (`venue_ids`) only opens those; any other goes back
 * to the venue list, which shows (or opens) theirs. The API answers 404 for the others anyway.
 */
export const venueAccessGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const venueId = route.paramMap.get('venueId');
  await waitForMe(auth, inject(Injector));
  return !venueId || auth.canAccessVenue(venueId) ? true : router.createUrlTree(['/objekti']);
};

/** Venue list: with exactly one venue there is nothing to pick, so it opens that venue. */
export const singleVenueGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const items = await inject(VenuesStore).items();
  return items?.length === 1 ? router.createUrlTree(['/objekti', items[0].id]) : true;
};
