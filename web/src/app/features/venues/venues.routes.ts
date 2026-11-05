import type { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: $localize`:@@venues.pageTitle:Objekti`,
    loadComponent: () => import('./venues-page'),
  },
] satisfies Routes;
