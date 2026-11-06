import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { tenantHostGuard } from './core/host/host.guards';
import { AdminShell } from './core/layout/admin-shell';

export const routes: Routes = [
  // Tenant subdomain: only the public menu, no sign-in.
  {
    path: '',
    canMatch: [tenantHostGuard],
    loadChildren: () => import('./features/public-menu/public-menu.routes'),
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
    path: 'design',
    loadChildren: () => import('./features/design/design.routes'),
  },
  {
    path: '',
    component: AdminShell,
    canMatch: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pregled' },
      { path: 'pregled', loadChildren: () => import('./features/dashboard/dashboard.routes') },
      { path: 'objekti', loadChildren: () => import('./features/venues/venues.routes') },
      { path: 'meniji', loadChildren: () => import('./features/menus/menus.routes') },
      {
        path: '**',
        title: $localize`:@@notFound.pageTitle:Stranica nije pronađena`,
        loadComponent: () => import('./core/layout/not-found-page'),
      },
    ],
  },
];
