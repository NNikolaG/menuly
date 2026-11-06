import type { Routes } from '@angular/router';
import { roleGuard } from '../../core/auth/auth.guards';

export default [
  {
    path: '',
    title: $localize`:@@venues.pageTitle:Objekti`,
    loadComponent: () => import('./venues-page'),
  },
  {
    path: 'novi',
    title: $localize`:@@venues.newPageTitle:Novi objekat`,
    canActivate: [roleGuard('owner')],
    loadComponent: () => import('./venue-form-page'),
  },
  {
    path: ':venueId',
    title: $localize`:@@venue.pageTitle:Objekat`,
    loadComponent: () => import('./venue-page'),
  },
  {
    path: ':venueId/izmena',
    title: $localize`:@@venues.editPageTitle:Izmena objekta`,
    canActivate: [roleGuard('owner', 'manager')],
    loadComponent: () => import('./venue-form-page'),
  },
] satisfies Routes;
