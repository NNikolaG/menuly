import type { Routes } from '@angular/router';

export default [
  {
    path: '',
    title: $localize`:@@design.pageTitle:Dizajn sistem`,
    loadComponent: () => import('./design-page'),
  },
] satisfies Routes;
