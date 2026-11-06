import { Dialog } from '@angular/cdk/dialog';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCamera,
  LucideLayers,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { firstValueFrom, type Observable } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import type { Menu } from '../../core/menus/menu';
import { MenusApi } from '../../core/menus/menus-api';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';
import {
  AppButton,
  AppField,
  AppInput,
  ConfirmDialog,
  type ConfirmDialogData,
  AppPattern,
} from '../../shared/ui';
import { VenueQr } from './venue-qr';

/** `/objekti/:venueId`: the venue's public link and its menus. */
@Component({
  selector: 'app-venue-page',
  imports: [
    Toolbar,
    ToolbarWidget,
    AppPattern,
    DatePipe,
    FormField,
    RouterLink,
    AppButton,
    AppField,
    AppInput,
    LucideArrowLeft,
    LucideCamera,
    LucideLayers,
    LucidePencil,
    LucidePlus,
    LucideTrash2,
    VenueQr,
  ],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="2">
        <a appButton variant="ghost" size="sm" routerLink="/objekti" class="back">
          <svg lucideArrowLeft aria-hidden="true"></svg>
          <ng-container i18n="@@venues.backToList">Objekti</ng-container>
        </a>
        @if (venue.value(); as v) {
          <div class="row" data-justify="between">
            <h1>{{ v.name }}</h1>
            <div class="row" data-gap="2">
              <a appButton variant="secondary" routerLink="kombo">
                <svg lucideLayers aria-hidden="true"></svg>
                <ng-container i18n="@@venue.promotions">Kombo ponude</ng-container>
              </a>
              @if (canEdit()) {
                <a appButton variant="secondary" routerLink="uvoz">
                  <svg lucideCamera aria-hidden="true"></svg>
                  <ng-container i18n="@@venue.import">Uvezi sa slike</ng-container>
                </a>
                <a appButton variant="secondary" routerLink="izmena">
                  <svg lucidePencil aria-hidden="true"></svg>
                  <ng-container i18n="@@venue.edit">Izmeni objekat</ng-container>
                </a>
              }
            </div>
          </div>
        } @else if (venue.error()) {
          <p role="alert" i18n="@@venues.notFound">Objekat nije pronađen.</p>
        }
      </div>

      @if (venue.value(); as v) {
        <div class="layout">
          <!-- Venue profile: the brand Ticket card, art seeded by the venue name (decision #24). -->
          <aside class="brand profile">
            <div class="ticket">
              <div class="ticket__art">
                <app-pattern [seed]="v.name" [cols]="4" [rows]="2" [fluid]="true" />
                <span class="ticket__punch"></span>
              </div>
              <div class="ticket__body">
                <div class="ticket__top">
                  <p class="ticket__title">{{ v.name }}</p>
                  <span class="ticket__id">/{{ v.slug }}</span>
                </div>
                <hr class="ticket__rule" />
                @if (v.address) {
                  <div class="ticket__meta">
                    <span i18n="@@venues.field.address">Adresa</span
                    ><span class="value">{{ v.address }}</span>
                  </div>
                }
                <div class="ticket__meta">
                  <span i18n="@@venues.field.currency">Valuta</span><span>{{ v.currency }}</span>
                </div>
                <div class="ticket__meta">
                  <span i18n="@@venues.col.link">Javni link</span>
                </div>
                <app-venue-qr [venueId]="v.id" [venueSlug]="v.slug" [url]="publicUrl()" />
              </div>
            </div>
          </aside>

          <section class="stack" data-gap="4" aria-labelledby="menus-heading">
            <h2 id="menus-heading" i18n="@@venue.menus">Meniji</h2>

            @if (error()) {
              <p role="alert" class="error">{{ error() }}</p>
            }

            @if (menus.value()?.items; as items) {
              @if (items.length) {
                <table class="table">
                  <thead>
                    <tr>
                      <th i18n="@@venue.col.menu">Meni</th>
                      <th i18n="@@venue.col.status">Status</th>
                      <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (menu of items; track menu.id) {
                      <tr>
                        <td>
                          <a class="menu-link" [routerLink]="['/meniji', menu.id]">
                            <strong>{{ menu.name }}</strong>
                          </a>
                          @if (menu.published_at && menu.status === 'published') {
                            <span class="table__sub" i18n="@@venue.publishedAt"
                              >Objavljen {{ menu.published_at | date: 'dd.MM.y. HH:mm' }}</span
                            >
                          }
                        </td>
                        <td>
                          @if (menu.status === 'published') {
                            <span class="badge" data-tone="success" i18n="@@menu.status.published"
                              >Objavljen</span
                            >
                          } @else {
                            <span class="badge" data-tone="info" i18n="@@menu.status.draft"
                              >Nacrt</span
                            >
                          }
                        </td>
                        <td data-num>
                          @if (canEdit()) {
                            <div
                              class="row actions"
                              data-gap="1"
                              ngToolbar
                              [softDisabled]="false"
                              [attr.aria-label]="actionsLabel(menu.name)"
                            >
                              @if (menu.status === 'published') {
                                <button
                                  appButton
                                  ngToolbarWidget
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  [disabled]="busy() === menu.id"
                                  (click)="unpublish(menu)"
                                  i18n="@@menu.unpublish"
                                >
                                  Vrati u nacrt
                                </button>
                              } @else {
                                <button
                                  appButton
                                  ngToolbarWidget
                                  variant="secondary"
                                  size="sm"
                                  type="button"
                                  [disabled]="busy() === menu.id"
                                  (click)="publish(menu)"
                                  i18n="@@menu.publish"
                                >
                                  Objavi
                                </button>
                              }
                              <button
                                appButton
                                ngToolbarWidget
                                variant="ghost"
                                size="sm"
                                type="button"
                                [attr.aria-label]="deleteLabel(menu)"
                                [disabled]="busy() === menu.id"
                                (click)="confirmDelete(menu)"
                              >
                                <svg lucideTrash2 aria-hidden="true"></svg>
                              </button>
                            </div>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="meta" i18n="@@venue.noMenus">Ovaj objekat još nema meni.</p>
              }
            } @else if (menus.error()) {
              <p role="alert" i18n="@@venue.menusLoadError">Meniji nisu učitani.</p>
            }

            @if (canEdit()) {
              <form class="row new-menu" data-gap="3" novalidate (submit)="createMenu($event)">
                <app-field
                  i18n-label="@@venue.newMenuName"
                  label="Novi meni"
                  controlId="new-menu-name"
                  [field]="newMenu.name"
                >
                  <input
                    appInput
                    id="new-menu-name"
                    i18n-placeholder="@@venue.newMenuPlaceholder"
                    placeholder="npr. Glavni meni"
                    [formField]="newMenu.name"
                  />
                </app-field>
                <button appButton type="submit" [disabled]="newMenu().submitting()">
                  <svg lucidePlus aria-hidden="true"></svg>
                  <ng-container i18n="@@venue.addMenu">Dodaj meni</ng-container>
                </button>
              </form>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .back {
      align-self: flex-start;
    }

    .error {
      color: var(--color-danger);
    }

    .menu-link {
      color: inherit;
      text-decoration: none;
    }

    .menu-link:hover {
      text-decoration: underline;
    }

    .actions {
      justify-content: flex-end;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: var(--space-8);
    }

    .layout > section {
      grid-row: 1;
    }

    .profile {
      display: grid;
      padding: var(--space-5);
      border-radius: var(--radius-lg);
    }

    .ticket .value {
      text-align: end;
      text-transform: none;
    }

    @media (max-width: 960px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }

      .layout > section {
        grid-row: auto;
      }

      .profile {
        justify-items: center;
      }
    }

    .new-menu {
      align-items: flex-end;
    }

    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export default class VenuePage {
  /** Accessible name of a row's action toolbar (arrow keys move between its buttons). */
  protected actionsLabel(name: string): string {
    return $localize`:@@common.actionsFor:Akcije: ${name}:name:`;
  }

  private readonly menusApi = inject(MenusApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

  readonly venueId = input.required<string>();

  private readonly venuesApi = inject(VenuesApi);
  protected readonly venue = this.venuesApi.venueResource(this.venueId);
  private readonly publicLink = this.venuesApi.publicLinkResource(this.venueId);
  protected readonly menus = this.menusApi.venueMenusResource(this.venueId);
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal('');

  protected readonly canEdit = computed(() => {
    const role = this.auth.role();
    return role === 'owner' || role === 'manager';
  });
  /** The server's link when loaded, else built locally (same shape). */
  protected readonly publicUrl = computed(() => {
    const link = this.publicLink.hasValue() ? this.publicLink.value()?.url : undefined;
    if (link) return link.replace(/^https?:\/\//, '');
    const venue = this.venue.value();
    const tenant = this.auth.me.value()?.tenant.slug ?? '…';
    return venue ? venuePublicUrl(tenant, venue.slug) : '';
  });

  protected readonly newMenu = form(signal({ name: '' }), (path) => {
    required(path.name);
    maxLength(path.name, 200);
  });

  protected deleteLabel(menu: Menu): string {
    return $localize`:@@menu.deleteLabel:Obriši meni ${menu.name}:name:`;
  }

  protected async createMenu(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.newMenu, async (field) => {
      try {
        const menu = await firstValueFrom(
          this.menusApi.createMenu(this.venueId(), field.name().value()),
        );
        await this.router.navigate(['/meniji', menu.id]);
      } catch (error) {
        this.error.set(actionError(error));
      }
      return undefined;
    });
  }

  protected publish(menu: Menu): Promise<void> {
    return this.run(menu, () => this.menusApi.publish(menu.id));
  }

  protected unpublish(menu: Menu): Promise<void> {
    return this.run(menu, () => this.menusApi.unpublish(menu.id));
  }

  protected async confirmDelete(menu: Menu): Promise<void> {
    const ref = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: {
        title: $localize`:@@menu.delete.title:Obriši meni?`,
        body: $localize`:@@menu.delete.body:Meni „${menu.name}:name:“ se briše sa svim kategorijama i stavkama.`,
        confirm: $localize`:@@menu.delete.confirm:Obriši meni`,
      },
    });
    if (await firstValueFrom(ref.closed))
      await this.run(menu, () => this.menusApi.deleteMenu(menu.id));
  }

  private async run(menu: Menu, action: () => Observable<unknown>): Promise<void> {
    this.error.set('');
    this.busy.set(menu.id);
    try {
      await firstValueFrom(action());
      this.menus.reload();
    } catch (error) {
      this.error.set(actionError(error));
    } finally {
      this.busy.set(null);
    }
  }
}

function actionError(error: unknown): string {
  return toApiError(error).code === 'forbidden'
    ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
    : $localize`:@@auth.unknownError:Nešto nije u redu. Pokušajte ponovo.`;
}
