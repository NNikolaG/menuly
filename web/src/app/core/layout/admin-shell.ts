import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideArrowLeftRight,
  LucideDynamicIcon,
  LucideLayoutGrid,
  LucideLogOut,
  LucideMonitor,
  LucideMoon,
  LucidePanelLeftClose,
  LucidePanelLeftOpen,
  LucideShieldCheck,
  LucideStore,
  LucideSun,
  LucideUserRound,
  LucideUsers,
  type LucideIcon,
} from '@lucide/angular';
import { AppMenu, type AppMenuItem } from '../../shared/ui/menu/menu';
import { AppPattern } from '../../shared/ui/pattern/pattern';
import { AuthStore } from '../auth/auth-store';
import { ThemeStore, type ThemePreference } from '../theme/theme-store';

const LOGOUT = 'logout';
const SIDEBAR_KEY = 'menuly.sidebar';

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when true for the signed-in user. */
  visible?: (auth: AuthStore) => boolean;
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
  {
    path: '/tim',
    label: $localize`:@@shell.nav.team:Tim`,
    icon: LucideUsers,
    visible: (auth) => auth.role() === 'owner' || auth.role() === 'manager',
  },
  {
    path: '/admin',
    label: $localize`:@@shell.nav.admin:Administracija`,
    icon: LucideShieldCheck,
    visible: (auth) => auth.isPlatformAdmin(),
  },
];

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

/** Frame of every signed-in page: collapsible sidebar with venue, navigation, theme and account menu. */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppMenu, AppPattern, LucideDynamicIcon],
  template: `
    <nav
      class="sidebar"
      [attr.data-collapsed]="collapsed() ? '' : null"
      i18n-aria-label="@@shell.nav"
      aria-label="Glavna navigacija"
    >
      <div class="sidebar__head">
        <a class="sidebar__venue" routerLink="/" [attr.title]="collapsed() ? tenantName() : null">
          @if (auth.me.value()?.tenant?.name; as venue) {
            <app-pattern class="sidebar__mark" [seed]="venue" [cols]="2" [rows]="2" [big]="false" />
          } @else {
            <span class="sidebar__mark" aria-hidden="true">{{ initial() }}</span>
          }
          <span class="expanded-only">
            <span class="sidebar__venue-name">{{ tenantName() }}</span>
            <span class="sidebar__venue-plan">{{ auth.me.value()?.tenant?.plan }}</span>
          </span>
        </a>
        <button
          type="button"
          class="icon-button toggle"
          [attr.aria-label]="toggleLabel()"
          [attr.aria-expanded]="!collapsed()"
          [title]="toggleLabel()"
          (click)="toggleSidebar()"
        >
          <svg [lucideIcon]="collapsed() ? openIcon : closeIcon"></svg>
        </button>
      </div>
      @for (item of nav(); track item.path) {
        <a
          class="nav-item"
          [routerLink]="item.path"
          routerLinkActive
          ariaCurrentWhenActive="page"
          [attr.title]="collapsed() ? item.label : null"
        >
          <svg [lucideIcon]="item.icon" aria-hidden="true"></svg>
          <span class="expanded-only">{{ item.label }}</span>
        </a>
      }
      <div class="sidebar__foot">
        <button
          type="button"
          class="nav-item theme"
          [attr.aria-label]="themeLabel()"
          [title]="themeLabel()"
          (click)="cycleTheme()"
        >
          <svg [lucideIcon]="themeIcon()" aria-hidden="true"></svg>
          <span class="expanded-only" aria-hidden="true">{{ themeLabel() }}</span>
        </button>
        @if (auth.me.value(); as me) {
          <app-menu
            class="account"
            [label]="me.user.name"
            [icon]="userIcon"
            [compact]="collapsed()"
            [above]="true"
            [items]="accountItems()"
            (selected)="onAccountAction($event)"
          />
        }
      </div>
    </nav>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
      min-block-size: 100dvh;
    }

    :host:has(.sidebar[data-collapsed]) {
      grid-template-columns: var(--sidebar-collapsed-width) minmax(0, 1fr);
    }

    .sidebar {
      position: sticky;
      inset-block-start: 0;
      inline-size: auto;
      block-size: 100dvh;
      overflow-y: auto;
    }

    .sidebar__head {
      display: flex;
      align-items: flex-start;
      gap: var(--space-1);
    }

    .sidebar__venue {
      flex: 1;
      min-inline-size: 0;
      color: inherit;
      text-decoration: none;
    }

    .sidebar__venue > span:not(.sidebar__mark) {
      min-inline-size: 0;
    }

    .sidebar__venue-name,
    .sidebar__venue-plan {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sidebar__venue-plan {
      text-transform: uppercase;
    }

    .sidebar__foot {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin-block-start: auto;
      padding-block-start: var(--space-4);
    }

    .theme {
      inline-size: 100%;
      border: 0;
      background: transparent;
      cursor: pointer;
      text-align: start;
    }

    .icon-button {
      display: grid;
      flex: none;
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

    /* Collapsed: icons only, names stay as accessible names and tooltips. */
    .sidebar[data-collapsed] {
      align-items: center;
      padding-inline: var(--space-2);
    }

    .sidebar[data-collapsed] .expanded-only {
      display: none;
    }

    .sidebar[data-collapsed] .sidebar__head {
      flex-direction: column;
      align-items: center;
    }

    .sidebar[data-collapsed] .sidebar__venue {
      padding-block-end: var(--space-2);
    }

    .sidebar[data-collapsed] .nav-item {
      justify-content: center;
      inline-size: var(--control-md);
      padding-inline: 0;
    }

    .sidebar[data-collapsed] .sidebar__foot {
      align-items: center;
    }

    main {
      inline-size: 100%;
      min-inline-size: 0;
      padding: var(--space-8) var(--space-6);
    }

    @media (max-width: 720px) {
      :host,
      :host:has(.sidebar[data-collapsed]) {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto 1fr;
      }

      .sidebar,
      .sidebar[data-collapsed] {
        position: static;
        flex-direction: row;
        align-items: center;
        inline-size: auto;
        block-size: auto;
        min-block-size: 0;
        padding: var(--space-2) var(--space-3);
        overflow-x: auto;
        border-inline-end: 0;
        border-block-end: var(--stroke-hairline) solid var(--color-border);
      }

      .sidebar__venue {
        padding-block-end: var(--space-2);
      }

      .sidebar__venue > span:not(.sidebar__mark),
      .sidebar .theme .expanded-only,
      .toggle {
        display: none;
      }

      .sidebar__foot {
        flex-direction: row;
        align-items: center;
        margin-block-start: 0;
        margin-inline-start: auto;
        padding-block-start: 0;
      }

      .theme {
        inline-size: auto;
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

  protected readonly nav = computed(() =>
    NAV.filter((item) => !item.visible || item.visible(this.auth)),
  );
  protected readonly brand = 'Menuly';
  protected readonly openIcon = LucidePanelLeftOpen;
  protected readonly closeIcon = LucidePanelLeftClose;
  protected readonly userIcon = LucideUserRound;

  /** Remembered per browser. */
  protected readonly collapsed = signal(readCollapsed());
  protected readonly toggleLabel = computed(() =>
    this.collapsed()
      ? $localize`:@@shell.sidebar.expand:Proširi meni`
      : $localize`:@@shell.sidebar.collapse:Skupi meni`,
  );
  protected readonly tenantName = computed(() => this.auth.me.value()?.tenant?.name ?? this.brand);

  protected toggleSidebar(): void {
    this.collapsed.update((value) => !value);
    try {
      if (this.collapsed()) localStorage.setItem(SIDEBAR_KEY, 'collapsed');
      else localStorage.removeItem(SIDEBAR_KEY);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts only for this page.
    }
  }

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

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}
