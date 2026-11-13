import type { Routes } from '@angular/router';
import { authGuard, guestGuard, platformAdminGuard, roleGuard } from './core/auth/auth.guards';
import { tenantHostGuard } from './core/host/host.guards';
import { venueAccessGuard } from './core/venues/venue.guards';
import { AdminShell } from './core/layout/admin-shell';
import PublicMenuPage from './features/public-menu/public-menu-page';

export const routes: Routes = [
  // Tenant subdomain: only the public menu, no sign-in.
  {
    path: '',
    canMatch: [tenantHostGuard],
    data: { preload: false },
    // Guest menu ships in the initial bundle: no lazy chunk chain before the menu on 3G (decision #40).
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/public-menu/tenant-page'),
      },
      {
        path: ':venueSlug',
        title: $localize`:@@publicMenu.pageTitle:Meni`,
        component: PublicMenuPage,
      },
      {
        path: '**',
        title: $localize`:@@notFound.pageTitle:Stranica nije pronađena`,
        loadComponent: () => import('./core/layout/not-found-page'),
      },
    ],
  },
  {
    path: 'prijava',
    title: $localize`:@@auth.login.pageTitle:Prijava`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page'),
  },
  {
    path: 'registracija',
    title: $localize`:@@auth.register.pageTitle:Registracija`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register-page'),
  },
  {
    path: 'zaboravljena-lozinka',
    title: $localize`:@@auth.forgot.heading:Zaboravljena lozinka`,
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password-page'),
  },
  // Paths of the emailed links (backend APP_URL), so they stay English.
  {
    path: 'reset-password',
    title: $localize`:@@auth.reset.heading:Nova lozinka`,
    loadComponent: () => import('./features/auth/reset-password-page'),
  },
  {
    path: 'invite',
    title: $localize`:@@invite.heading:Poziv u tim`,
    loadComponent: () => import('./features/auth/invite-page'),
  },
  {
    path: 'design',
    data: { preload: false },
    loadChildren: () => import('./features/design/design.routes'),
  },
  {
    path: '',
    component: AdminShell,
    canMatch: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pregled' },
      { path: 'pregled', loadChildren: () => import('./features/dashboard/dashboard.routes') },
      // Venue sub-pages owned by other features; full paths so `:venueId` binds to their inputs.
      {
        path: 'objekti/:venueId/kombo',
        title: $localize`:@@promo.pageTitle:Kombo ponude`,
        canActivate: [venueAccessGuard],
        loadComponent: () => import('./features/promotions/promotions-page'),
      },
      {
        path: 'objekti/:venueId/kombo/novi',
        title: $localize`:@@promo.newTitle:Nova kombo ponuda`,
        canActivate: [roleGuard('owner', 'manager'), venueAccessGuard],
        loadComponent: () => import('./features/promotions/promotion-form-page'),
      },
      {
        path: 'objekti/:venueId/kombo/:promotionId',
        title: $localize`:@@promo.editTitle:Izmena kombo ponude`,
        canActivate: [roleGuard('owner', 'manager'), venueAccessGuard],
        loadComponent: () => import('./features/promotions/promotion-form-page'),
      },
      {
        path: 'objekti/:venueId/uvoz',
        title: $localize`:@@import.pageTitle:Uvoz menija sa slike`,
        canActivate: [roleGuard('owner', 'manager'), venueAccessGuard],
        loadComponent: () => import('./features/imports/import-upload-page'),
      },
      {
        path: 'uvoz/:importId',
        title: $localize`:@@import.reviewTitle:Pregled uvoza`,
        canActivate: [roleGuard('owner', 'manager')],
        loadComponent: () => import('./features/imports/import-review-page'),
      },
      { path: 'objekti', loadChildren: () => import('./features/venues/venues.routes') },
      {
        path: 'tim',
        title: $localize`:@@team.heading:Tim`,
        canActivate: [roleGuard('owner', 'manager')],
        loadComponent: () => import('./features/team/team-page'),
      },
      {
        path: 'admin',
        title: $localize`:@@admin.heading:Administracija`,
        canActivate: [platformAdminGuard],
        loadComponent: () => import('./features/admin/admin-page'),
      },
      { path: 'meniji', loadChildren: () => import('./features/menus/menus.routes') },
      {
        path: '**',
        title: $localize`:@@notFound.pageTitle:Stranica nije pronađena`,
        loadComponent: () => import('./core/layout/not-found-page'),
      },
    ],
  },
];
