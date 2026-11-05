import type { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: $localize`:@@dashboard.pageTitle:Pregled`,
    loadComponent: () => import('./dashboard-page'),
  },
] satisfies Routes;
