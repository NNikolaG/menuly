import type { Routes } from '@angular/router';

export default [
  {
    path: ':venueSlug',
    title: $localize`:@@publicMenu.pageTitle:Meni`,
    loadComponent: () => import('./public-menu-page'),
  },
  {
    path: '**',
    title: $localize`:@@notFound.pageTitle:Stranica nije pronađena`,
    loadComponent: () => import('../../core/layout/not-found-page'),
  },
] satisfies Routes;
