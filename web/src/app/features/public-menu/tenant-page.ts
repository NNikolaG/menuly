import { Component, computed, effect, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { APP_HOST } from '../../core/host/app-host';
import { PublicMenuApi } from './public-menu-api';

/**
 * A tenant's own address, `{tenant}.menuly.app/`: its venues with a published menu.
 * A tenant with one venue never shows it: the guest goes straight to that menu.
 */
@Component({
  selector: 'app-tenant-page',
  imports: [RouterLink],
  template: `
    <main class="page stack" data-gap="6">
      @if (data(); as data) {
        @if (data.venues.length) {
          <h1>{{ data.tenant.name }}</h1>
          <ul class="venues" role="list">
            @for (venue of data.venues; track venue.slug) {
              <li>
                <a class="card stack" data-gap="1" [routerLink]="['/', venue.slug]">
                  <span class="card__title">{{ venue.name }}</span>
                  @if (venue.address || venue.city) {
                    <span class="meta">{{ place(venue) }}</span>
                  }
                </a>
              </li>
            }
          </ul>
        } @else {
          <h1 i18n="@@publicMenu.notFound">Meni nije dostupan</h1>
        }
      } @else if (tenant.error()) {
        <h1 i18n="@@publicMenu.notFound">Meni nije dostupan</h1>
        <p class="meta" i18n="@@publicMenu.notFoundBody">
          Proveri adresu ili pitaj osoblje za novi QR kod.
        </p>
      } @else {
        <p class="loading" role="status" i18n="@@common.loading">Učitavanje…</p>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 100dvh;
      background: var(--color-bg);
    }

    .page {
      inline-size: 100%;
      max-inline-size: var(--menu-max-width);
      margin-inline: auto;
      padding: var(--space-12) var(--space-4);
    }

    .venues {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .venues a {
      color: inherit;
      text-decoration: none;
    }
  `,
})
export default class TenantPage {
  private readonly host = inject(APP_HOST);
  private readonly router = inject(Router);

  protected readonly tenant = inject(PublicMenuApi).tenantResource(() =>
    this.host.kind === 'tenant' ? this.host.tenantSlug : undefined,
  );
  protected readonly data = computed(() =>
    this.tenant.hasValue() ? this.tenant.value() : undefined,
  );

  constructor() {
    const title = inject(Title);
    // A list of links, not content: search engines should keep the menus, which the sitemap names.
    inject(Meta).updateTag({ name: 'robots', content: 'noindex, follow' });
    effect(() => {
      const data = this.data();
      if (!data) return;
      title.setTitle(data.tenant.name);
      if (data.venues.length === 1) {
        void this.router.navigate(['/', data.venues[0].slug], { replaceUrl: true });
      }
    });
  }

  protected place(venue: { address: string; city: string }): string {
    return [venue.address, venue.city].filter(Boolean).join(', ');
  }
}
