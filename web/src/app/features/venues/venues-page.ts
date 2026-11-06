import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucidePencil, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import { AppButton, ConfirmDialog, type ConfirmDialogData } from '../../shared/ui';
import type { Venue } from '../../core/venues/venue';
import { venuePublicUrl } from '../../core/venues/venue-public-url';
import { VenuesApi } from '../../core/venues/venues-api';

@Component({
  selector: 'app-venues-page',
  imports: [Toolbar, ToolbarWidget, RouterLink, AppButton, LucidePlus, LucidePencil, LucideTrash2],
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
        <p class="meta" i18n="@@common.loading">Učitavanje…</p>
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
              @for (venue of items; track venue.id) {
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
        } @else {
          <div class="card stack" data-gap="3">
            <p class="card__title" i18n="@@venues.empty">Još nema objekata.</p>
            <p class="card__body" i18n="@@venues.emptyBody">
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

  protected readonly venues = this.api.listResource();
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal('');

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
