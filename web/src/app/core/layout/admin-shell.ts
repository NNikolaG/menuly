import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LucideArrowLeftRight, LucideLogOut } from '@lucide/angular';
import { AppMenu, type AppMenuItem } from '../../shared/ui/menu/menu';
import { AuthStore } from '../auth/auth-store';

const LOGOUT = 'logout';

/** Frame of every signed-in page: header with tenant and account menu, page below. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, AppMenu],
  template: `
    <header>
      <a class="brand" routerLink="/" i18n="@@shell.brand">Menuly</a>
      @if (auth.me.value(); as me) {
        <span class="tenant">{{ me.tenant.name }}</span>
        <app-menu
          [label]="me.user.name"
          [items]="accountItems()"
          (selected)="onAccountAction($event)"
        />
      }
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      block-size: var(--topbar-height);
      padding-inline: var(--space-4);
      background: var(--color-surface);
      border-block-end: var(--stroke-hairline) solid var(--color-border);
    }

    .brand {
      color: var(--color-text);
      font: var(--type-h4);
      text-decoration: none;
    }

    .tenant {
      margin-inline-start: auto;
      color: var(--color-text-muted);
    }

    main {
      padding: var(--space-6) var(--space-4);
    }
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
        icon: LucideArrowLeftRight,
      })),
      { value: LOGOUT, label: $localize`:@@shell.logout:Odjava`, icon: LucideLogOut },
    ];
  });

  protected onAccountAction(value: string): void {
    void (value === LOGOUT ? this.auth.logout() : this.auth.switchTenant(value));
  }
}
