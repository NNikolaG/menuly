import type { Routes } from '@angular/router';

export default [
  {
    path: ':menuId',
    title: $localize`:@@menu.pageTitle:Meni`,
    loadComponent: () => import('./menu-editor-page'),
  },
] satisfies Routes;
