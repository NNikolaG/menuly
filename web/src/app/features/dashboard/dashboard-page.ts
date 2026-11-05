import { Component, inject } from '@angular/core';
import { AuthStore } from '../../core/auth/auth-store';

@Component({
  selector: 'app-dashboard-page',
  template: `
    <h1 i18n="@@dashboard.heading">Pregled</h1>
    @if (auth.me.value(); as me) {
      <p i18n="@@dashboard.welcome">Dobro došli, {{ me.user.name }}.</p>
    }
  `,
})
export default class DashboardPage {
  protected readonly auth = inject(AuthStore);
}
