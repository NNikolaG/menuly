import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppMenu, type AppMenuItem } from '../../shared/ui';
import { AuthStore } from '../auth/auth-store';

const LOGOUT = 'logout';

/** Frame of every signed-in page: header with tenant and account menu, page below. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppMenu],
  template: `
    <header>
      <a routerLink="/" i18n="@@shell.brand">Menuly</a>
      @if (auth.me.value(); as me) {
        <span>{{ me.tenant.name }}</span>
        <app-menu
          [label]="me.user.name"
          [items]="accountItems()"
          (selected)="onAccountAction($event)"
        />
      }
    </header>
    <nav i18n-aria-label="@@shell.nav" aria-label="Glavna navigacija">
      <a
        routerLink="/pregled"
        routerLinkActive
        #overview="routerLinkActive"
        [attr.aria-current]="overview.isActive ? 'page' : null"
        i18n="@@shell.nav.overview"
        >Pregled</a
      >
      <a
        routerLink="/objekti"
        routerLinkActive
        #venues="routerLinkActive"
        [attr.aria-current]="venues.isActive ? 'page' : null"
        i18n="@@shell.nav.venues"
        >Objekti</a
      >
    </nav>
    <main>
      <router-outlet />
    </main>
  `,
})
export class AdminShell {
  protected readonly auth = inject(AuthStore);

  protected readonly accountItems = computed<AppMenuItem[]>(() => {
    const me = this.auth.me.value();
    const otherTenants = (me?.memberships ?? []).filter(
      (membership) =>
        membership.tenant_id !== me?.tenant.id && membership.tenant_status === 'active',
    );
    return [
      ...otherTenants.map((membership) => ({
        value: membership.tenant_id,
        label: $localize`:@@shell.switchTenant:Pređi na ${membership.tenant_name}:tenant:`,
      })),
      { value: LOGOUT, label: $localize`:@@shell.logout:Odjava` },
    ];
  });

  protected onAccountAction(value: string): void {
    void (value === LOGOUT ? this.auth.logout() : this.auth.switchTenant(value));
  }
}
