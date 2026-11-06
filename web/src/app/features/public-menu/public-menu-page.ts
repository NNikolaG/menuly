import { Component, computed, effect, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { toApiError } from '../../core/api/api-error';
import { APP_HOST } from '../../core/host/app-host';
import { PublicMenuApi } from './public-menu-api';
import { PublicMenuView } from '../../core/public-menu/public-menu-view';

/** Guest view of a venue's published menu at `{tenant}.menuly.app/{venue}`. */
@Component({
  selector: 'app-public-menu-page',
  imports: [PublicMenuView],
  template: `
    @if (data(); as data) {
      <app-public-menu-view [menu]="data" />
    } @else {
      <main class="page">
        @if (menu.error()) {
          <div class="stack missing" data-gap="2" role="alert">
            @if (notFound()) {
              <h1 i18n="@@publicMenu.notFound">Meni nije dostupan</h1>
              <p class="meta" i18n="@@publicMenu.notFoundBody">
                Proveri adresu ili pitaj osoblje za novi QR kod.
              </p>
            } @else {
              <h1 i18n="@@publicMenu.loadError">Meni nije učitan</h1>
              <button class="chip" type="button" (click)="menu.reload()" i18n="@@common.retry">
                Pokušaj ponovo
              </button>
            }
          </div>
        } @else {
          <p class="meta" i18n="@@common.loading">Učitavanje…</p>
        }
      </main>
    }
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 100dvh;
      background: var(--color-bg);
    }

    app-public-menu-view {
      min-block-size: 100dvh;
    }

    .page {
      inline-size: 100%;
      max-inline-size: var(--menu-max-width);
      margin-inline: auto;
      padding: var(--space-4) var(--space-4) var(--space-12);
    }

    .missing {
      padding-block: var(--space-16);
    }
  `,
})
export default class PublicMenuPage {
  private readonly host = inject(APP_HOST);
  private readonly title = inject(Title);

  readonly venueSlug = input.required<string>();

  protected readonly menu = inject(PublicMenuApi).menuResource(
    () => (this.host.kind === 'tenant' ? this.host.tenantSlug : undefined),
    this.venueSlug,
  );

  /** Undefined while loading or failed (reading `value()` of a failed resource throws). */
  protected readonly data = computed(() => (this.menu.hasValue() ? this.menu.value() : undefined));
  protected readonly notFound = computed(() => toApiError(this.menu.error()).status === 404);

  constructor() {
    effect(() => {
      const venue = this.data()?.venue.name;
      if (venue) this.title.setTitle(`${venue} · Menuly`);
    });
  }
}
