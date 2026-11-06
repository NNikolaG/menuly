import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucidePencil, LucidePlus, LucideStore, LucideTrash2 } from '@lucide/angular';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import {
  AppButton,
  AppPattern,
  AppSearch,
  AppSegmented,
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/ui';
import { matchesQuery } from '../../shared/text/fold';
import type { Venue } from '../../core/venues/venue';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';
import { VenuesStore } from '../../core/venues/venues-store';

@Component({
  selector: 'app-venues-page',
  imports: [
    LucideStore,
    Toolbar,
    ToolbarWidget,
    RouterLink,
    AppButton,
    AppPattern,
    AppSearch,
    AppSegmented,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
  ],
  template: `
    <div class="stack" data-gap="6">
      <div class="row" data-justify="between">
        <h1 i18n="@@venues.heading">Objekti</h1>
        @if (canManage()) {
          <a appButton routerLink="novi">
            <svg lucidePlus aria-hidden="true"></svg>
            <ng-container i18n="@@venues.add">Dodaj objekat</ng-container>
          </a>
        }
      </div>

      @if (error()) {
        <p role="alert" class="badge" data-tone="danger">{{ error() }}</p>
      }

      @if (venues.isLoading() && !venues.hasValue()) {
        <p class="loading" role="status" i18n="@@common.loading">Učitavanje…</p>
      } @else if (venues.error()) {
        <div class="card stack" data-gap="3">
          <p role="alert" i18n="@@venues.loadError">Objekti nisu učitani.</p>
          <div>
            <button
              appButton
              variant="secondary"
              type="button"
              (click)="venues.reload()"
              i18n="@@common.retry"
            >
              Pokušaj ponovo
            </button>
          </div>
        </div>
      } @else if (venues.value()?.items; as items) {
        @if (items.length) {
          <div class="filters">
            <app-search [label]="searchLabel" [(value)]="query" />
            <app-segmented
              [label]="viewLabel"
              [options]="viewOptions"
              [value]="view()"
              (valueChange)="pickView($event)"
            />
            @if (query()) {
              <span class="filters__count" i18n="@@common.filterCount"
                >{{ shown().length }} od {{ items.length }}</span
              >
            }
          </div>

          @if (!shown().length) {
            <div class="row" data-gap="3">
              <p class="meta" i18n="@@common.noFilterMatches">Ništa ne odgovara filterima.</p>
              <button
                appButton
                variant="ghost"
                size="sm"
                type="button"
                (click)="query.set('')"
                i18n="@@common.clearFilters"
              >
                Poništi filtere
              </button>
            </div>
          } @else if (view() === 'cards') {
            <ul class="cards" role="list">
              @for (venue of shown(); track venue.id) {
                <li class="ticket venue-card" data-theme="light">
                  <div class="ticket__art">
                    <app-pattern [seed]="venue.name" [cols]="4" [rows]="2" [fluid]="true" />
                  </div>
                  <div class="ticket__body">
                    <div class="ticket__top">
                      <a class="ticket__title venue-card__link" [routerLink]="venue.id">{{
                        venue.name
                      }}</a>
                      <span class="ticket__id">/{{ venue.slug }}</span>
                    </div>
                    <hr class="ticket__rule" />
                    @if (venue.address) {
                      <div class="ticket__meta">
                        <span i18n="@@venues.field.address">Adresa</span
                        ><span class="value">{{ venue.address }}</span>
                      </div>
                    }
                    <div class="ticket__meta">
                      <span i18n="@@venues.field.currency">Valuta</span
                      ><span>{{ venue.currency }}</span>
                    </div>
                    <div class="ticket__meta">
                      <span i18n="@@venues.col.link">Javni link</span
                      ><span class="value">{{ publicUrl(venue) }}</span>
                    </div>
                    <div
                      class="row venue-card__actions"
                      data-gap="1"
                      ngToolbar
                      [softDisabled]="false"
                      [attr.aria-label]="actionsLabel(venue.name)"
                    >
                      <a
                        appButton
                        ngToolbarWidget
                        variant="ghost"
                        size="sm"
                        [routerLink]="[venue.id, 'izmena']"
                        [attr.aria-label]="editLabel(venue)"
                      >
                        <svg lucidePencil aria-hidden="true"></svg>
                      </a>
                      @if (canDelete()) {
                        <button
                          appButton
                          ngToolbarWidget
                          variant="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="deleteLabel(venue)"
                          [disabled]="deleting() === venue.id"
                          (click)="confirmDelete(venue)"
                        >
                          <svg lucideTrash2 aria-hidden="true"></svg>
                        </button>
                      }
                    </div>
                  </div>
                </li>
              }
            </ul>
          } @else {
            <table class="table">
              <thead>
                <tr>
                  <th i18n="@@venues.col.name">Objekat</th>
                  <th class="wide-only" i18n="@@venues.col.link">Javni link</th>
                  <th class="wide-only" i18n="@@venues.col.currency">Valuta</th>
                  <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                </tr>
              </thead>
              <tbody>
                @for (venue of shown(); track venue.id) {
                  <tr>
                    <td>
                      <a class="venue-link" [routerLink]="venue.id"
                        ><strong>{{ venue.name }}</strong></a
                      >
                      @if (venue.address) {
                        <span class="table__sub">{{ venue.address }}</span>
                      }
                      <span class="table__sub meta narrow-only">{{ publicUrl(venue) }}</span>
                    </td>
                    <td class="meta wide-only">{{ publicUrl(venue) }}</td>
                    <td class="meta wide-only">{{ venue.currency }}</td>
                    <td data-num>
                      <div
                        class="row"
                        data-gap="1"
                        ngToolbar
                        [softDisabled]="false"
                        [attr.aria-label]="actionsLabel(venue.name)"
                      >
                        <a
                          appButton
                          ngToolbarWidget
                          variant="ghost"
                          size="sm"
                          [routerLink]="[venue.id, 'izmena']"
                          [attr.aria-label]="editLabel(venue)"
                        >
                          <svg lucidePencil aria-hidden="true"></svg>
                        </a>
                        @if (canDelete()) {
                          <button
                            appButton
                            ngToolbarWidget
                            variant="ghost"
                            size="sm"
                            type="button"
                            [attr.aria-label]="deleteLabel(venue)"
                            [disabled]="deleting() === venue.id"
                            (click)="confirmDelete(venue)"
                          >
                            <svg lucideTrash2 aria-hidden="true"></svg>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        } @else {
          <div class="empty-state">
            <svg lucideStore aria-hidden="true"></svg>
            <p class="empty-state__title" i18n="@@venues.empty">Još nema objekata.</p>
            <p class="empty-state__body" i18n="@@venues.emptyBody">
              Dodaj prvi objekat, pa mu uvezi ili napravi meni.
            </p>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .narrow-only {
      display: none;
    }

    @media (max-width: 720px) {
      .wide-only {
        display: none;
      }

      .narrow-only {
        display: block;
      }
    }

    .venue-link {
      color: inherit;
      text-decoration: none;
    }

    .venue-link:hover {
      text-decoration: underline;
    }

    td[data-num] .row {
      justify-content: flex-end;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
      gap: var(--space-4);
      padding: 0;
      list-style: none;
    }

    .venue-card {
      inline-size: auto;
      transition:
        translate var(--duration-base) var(--ease-out),
        box-shadow var(--duration-base) var(--ease-out);
    }

    @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
      .venue-card:hover {
        translate: 0 calc(-1 * var(--space-1));
        box-shadow: var(--shadow-md);
      }
    }

    .venue-card:active {
      translate: 0 0;
    }

    .venue-card__link {
      color: inherit;
      text-decoration: none;
    }

    /* The whole ticket opens the venue; the action buttons sit above that link. */
    .venue-card__link::after {
      content: '';
      position: absolute;
      inset: 0;
    }

    .venue-card__link:focus-visible {
      outline: none;
    }

    .venue-card:has(.venue-card__link:focus-visible) {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .venue-card .ticket__id,
    .venue-card .ticket__meta > :first-child {
      flex: none;
      white-space: nowrap;
    }

    .venue-card .value {
      overflow: hidden;
      text-align: end;
      text-overflow: ellipsis;
      text-transform: none;
      white-space: nowrap;
    }

    .venue-card__actions {
      position: relative;
      justify-content: flex-end;
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
export default class VenuesPage {
  /** Accessible name of a row's action toolbar (arrow keys move between its buttons). */
  protected actionsLabel(name: string): string {
    return $localize`:@@common.actionsFor:Akcije: ${name}:name:`;
  }

  private readonly api = inject(VenuesApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(Dialog);

  protected readonly venues = inject(VenuesStore).list;

  protected readonly searchLabel = $localize`:@@venues.search:Traži objekat ili adresu`;
  protected readonly viewLabel = $localize`:@@venues.view:Prikaz`;
  protected readonly viewOptions = [
    { value: 'cards', label: $localize`:@@venues.view.cards:Kartice` },
    { value: 'list', label: $localize`:@@venues.view.list:Lista` },
  ];
  protected readonly query = signal('');
  /** Cards while there are few venues, a table once there are many; the user's pick is remembered. */
  protected readonly view = linkedSignal<string>(
    () => readView() ?? ((this.venues.value()?.items.length ?? 0) > CARDS_UP_TO ? 'list' : 'cards'),
  );
  protected readonly shown = computed(() =>
    (this.venues.value()?.items ?? []).filter((venue) =>
      matchesQuery(this.query(), venue.name, venue.address, venue.slug),
    ),
  );
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal('');

  constructor() {
    // The list is shared and cached; refresh it in the background on every visit.
    this.venues.reload();
  }

  protected pickView(view: string): void {
    this.view.set(view);
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Storage can be unavailable (private mode); the pick then lasts only for this page.
    }
  }

  /** Mirrors the API: owners create and delete, owners and managers edit. */
  protected readonly canManage = computed(() => this.auth.role() === 'owner');
  protected readonly canDelete = this.canManage;

  protected publicUrl(venue: Venue): string {
    return venuePublicUrl(this.auth.me.value()?.tenant.slug ?? '…', venue.slug);
  }

  protected editLabel(venue: Venue): string {
    return $localize`:@@venues.editLabel:Izmeni ${venue.name}:name:`;
  }

  protected deleteLabel(venue: Venue): string {
    return $localize`:@@venues.deleteLabel:Obriši ${venue.name}:name:`;
  }

  protected async confirmDelete(venue: Venue): Promise<void> {
    const ref = this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      data: {
        title: $localize`:@@venues.delete.title:Obriši objekat?`,
        body: $localize`:@@venues.delete.body:Objekat „${venue.name}:name:“ i njegovi meniji se brišu. Gosti više neće moći da otvore njegov meni.`,
        confirm: $localize`:@@venues.delete.confirm:Obriši objekat`,
      },
    });
    if (!(await firstValueFrom(ref.closed))) return;
    this.error.set('');
    this.deleting.set(venue.id);
    try {
      await firstValueFrom(this.api.remove(venue.id));
      this.venues.reload();
    } catch (error) {
      this.error.set(
        toApiError(error).code === 'forbidden'
          ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
          : $localize`:@@venues.deleteError:Objekat nije obrisan. Pokušaj ponovo.`,
      );
    } finally {
      this.deleting.set(null);
    }
  }
}

/** Up to this many venues the list opens as cards. */
const CARDS_UP_TO = 8;
const VIEW_KEY = 'menuly.venues.view';

function readView(): 'cards' | 'list' | null {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    return stored === 'cards' || stored === 'list' ? stored : null;
  } catch {
    return null;
  }
}
