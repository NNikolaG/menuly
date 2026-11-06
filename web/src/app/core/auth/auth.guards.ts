import { effect, inject, Injector } from '@angular/core';
import { Router, type CanActivateFn, type CanMatchFn } from '@angular/router';
import type { Role } from '../api/api-types';
import { AuthStore } from './auth-store';

/** Signed-in users only; others go to the login page and come back afterwards. */
export const authGuard: CanMatchFn = (_route, segments) => {
  if (inject(AuthStore).isAuthenticated()) return true;
  const returnUrl = `/${segments.map((segment) => segment.path).join('/')}`;
  return inject(Router).createUrlTree(
    ['/prijava'],
    returnUrl === '/' ? {} : { queryParams: { returnUrl } },
  );
};

/** Login and registration: signed-in users go straight to the app. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthStore).isAuthenticated() ? inject(Router).createUrlTree(['/']) : true;

/** Only the given roles in the current tenant. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const role = inject(AuthStore).role();
    return role !== null && roles.includes(role) ? true : inject(Router).createUrlTree(['/']);
  };
}

/** Platform admins only (`user.is_platform_admin` from `/v1/me`); waits for `/v1/me` on a fresh load. */
export const platformAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const me = await waitForMe(auth, inject(Injector));
  return me?.user.is_platform_admin ? true : router.createUrlTree(['/']);
};

function waitForMe(auth: AuthStore, injector: Injector) {
  if (!auth.me.isLoading())
    return Promise.resolve(auth.me.hasValue() ? auth.me.value() : undefined);
  return new Promise<ReturnType<typeof auth.me.value>>((resolve) => {
    const ref = effect(
      () => {
        if (auth.me.isLoading()) return;
        resolve(auth.me.hasValue() ? auth.me.value() : undefined);
        ref.destroy();
      },
      { injector },
    );
  });
}
