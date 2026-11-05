import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideArrowLeftRight,
  LucideDynamicIcon,
  LucideLayoutGrid,
  LucideLogOut,
  LucideMonitor,
  LucideMoon,
  LucideStore,
  LucideSun,
  type LucideIcon,
} from '@lucide/angular';
import { AppMenu, type AppMenuItem } from '../../shared/ui/menu/menu';
import { AppPattern } from '../../shared/ui/pattern/pattern';
import { AuthStore } from '../auth/auth-store';
import { ThemeStore, type ThemePreference } from '../theme/theme-store';

const LOGOUT = 'logout';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar entries; a new admin feature adds one here next to its route. */
const NAV: NavItem[] = [
  {
    path: '/pregled',
    label: $localize`:@@shell.nav.overview:Pregled`,
    icon: LucideLayoutGrid,
  },
  {
    path: '/objekti',
    label: $localize`:@@shell.nav.venues:Objekti`,
    icon: LucideStore,
  },
];

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

/** Frame of every signed-in page: sidebar with venue and navigation, top bar with theme and account menu. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppMenu, AppPattern, LucideDynamicIcon],
  template: `
    <nav class="sidebar" i18n-aria-label="@@shell.nav" aria-label="Glavna navigacija">
      <a class="sidebar__venue" routerLink="/">
        @if (auth.me.value()?.tenant?.name; as venue) {
          <app-pattern class="sidebar__mark" [seed]="venue" [cols]="2" [rows]="2" [big]="false" />
        } @else {
          <span class="sidebar__mark" aria-hidden="true">{{ initial() }}</span>
        }
        <span>
          <span class="sidebar__venue-name">{{ auth.me.value()?.tenant?.name ?? brand }}</span>
          <span class="sidebar__venue-plan">{{ auth.me.value()?.tenant?.plan }}</span>
        </span>
      </a>
      @for (item of nav; track item.path) {
        <a class="nav-item" [routerLink]="item.path" routerLinkActive ariaCurrentWhenActive="page">
          <svg [lucideIcon]="item.icon"></svg>
          {{ item.label }}
        </a>
      }
    </nav>
    <div class="content">
      <header class="topbar">
        <button
          type="button"
          class="icon-button"
          [attr.aria-label]="themeLabel()"
          [title]="themeLabel()"
          (click)="cycleTheme()"
        >
          <svg [lucideIcon]="themeIcon()"></svg>
        </button>
        @if (auth.me.value(); as me) {
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
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
      min-block-size: 100dvh;
    }

    .sidebar {
      position: sticky;
      inset-block-start: 0;
      block-size: 100dvh;
      overflow-y: auto;
    }

    .sidebar__venue {
      color: inherit;
      text-decoration: none;
    }

    .sidebar__venue-name,
    .sidebar__venue-plan {
      display: block;
    }

    .sidebar__venue-plan {
      text-transform: uppercase;
    }

    .content {
      display: flex;
      flex-direction: column;
      min-inline-size: 0;
    }

    .topbar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--z-sticky);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-2);
      block-size: var(--topbar-height);
      padding-inline: var(--space-6);
      background: var(--color-bg);
      border-block-end: var(--stroke-hairline) solid var(--color-border);
    }

    .icon-button {
      display: grid;
      place-items: center;
      inline-size: var(--control-md);
      block-size: var(--control-md);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
    }

    .icon-button:hover {
      background: var(--color-surface-hover);
      color: var(--color-text);
    }

    main {
      inline-size: 100%;
      max-inline-size: var(--content-max-width);
      padding: var(--space-8) var(--space-6);
    }

    @media (max-width: 720px) {
      :host {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto 1fr;
      }

      .sidebar {
        position: static;
        flex-direction: row;
        align-items: center;
        inline-size: auto;
        block-size: auto;
        min-block-size: 0;
        overflow-x: auto;
        border-inline-end: 0;
        border-block-end: var(--stroke-hairline) solid var(--color-border);
      }

      .sidebar__venue {
        padding-block-end: var(--space-2);
      }

      .sidebar__venue > span:not(.sidebar__mark) {
        display: none;
      }

      .topbar {
        padding-inline: var(--space-4);
      }

      main {
        padding: var(--space-6) var(--space-4);
      }
    }
  `,
})
export class AdminShell {
  protected readonly auth = inject(AuthStore);
  private readonly theme = inject(ThemeStore);

  protected readonly nav = NAV;
  protected readonly brand = 'Menuly';

  protected readonly initial = computed(() =>
    (this.auth.me.value()?.tenant.name ?? this.brand).charAt(0).toUpperCase(),
  );

  protected readonly themeIcon = computed(
    () => ({ system: LucideMonitor, light: LucideSun, dark: LucideMoon })[this.theme.preference()],
  );
  protected readonly themeLabel = computed(() => {
    switch (this.theme.preference()) {
      case 'light':
        return $localize`:@@shell.theme.light:Tema: svetla`;
      case 'dark':
        return $localize`:@@shell.theme.dark:Tema: tamna`;
      default:
        return $localize`:@@shell.theme.system:Tema: kao sistem`;
    }
  });

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

  protected cycleTheme(): void {
    this.theme.preference.update((current) => NEXT_THEME[current]);
  }

  protected onAccountAction(value: string): void {
    void (value === LOGOUT ? this.auth.logout() : this.auth.switchTenant(value));
  }
}
