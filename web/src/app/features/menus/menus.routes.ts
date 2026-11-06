import type { Routes } from '@angular/router';

export default [
  {
    path: ':menuId',
    title: $localize`:@@menu.pageTitle:Meni`,
    loadComponent: () => import('./menu-editor-page'),
  },
  {
    path: ':menuId/dizajn',
    title: $localize`:@@menuDesign.pageTitle:Dizajn menija`,
    loadComponent: () => import('./menu-design-page'),
  },
] satisfies Routes;
