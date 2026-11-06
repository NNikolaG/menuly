import { CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Dialog } from '@angular/cdk/dialog';
import { CurrencyPipe, DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideGripVertical,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import type { Promotion, PromotionStatus } from '../../core/promotions/promotion';
import { PromotionsApi } from '../../core/promotions/promotions-api';
import { VenuesApi } from '../../core/venues/venues-api';
import {
  AppButton,
  AppSearch,
  AppSegmented,
  AppSwitch,
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/ui';
import { matchesQuery } from '../../shared/text/fold';
import { STATUS } from './promotion-labels';

/** `/objekti/:venueId/kombo`: the venue's combo offers, in the order guests see them. */
@Component({
  selector: 'app-promotions-page',
  imports: [
    CurrencyPipe,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Toolbar,
    ToolbarWidget,
    AppButton,
    AppSearch,
    AppSegmented,
    AppSwitch,
    LucideArrowLeft,
    LucideGripVertical,
    LucidePencil,
    LucidePlus,
    LucideTrash2,
  ],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="2">
        <a appButton variant="ghost" size="sm" [routerLink]="['/objekti', venueId()]" class="back">
          <svg lucideArrowLeft aria-hidden="true"></svg>
          {{ venue.value()?.name }}
        </a>
        <div class="row" data-justify="between">
          <h1 i18n="@@promo.pageTitle">Kombo ponude</h1>
          @if (canEdit()) {
            <a appButton routerLink="novi">
              <svg lucidePlus aria-hidden="true"></svg>
              <ng-container i18n="@@promo.new">Nova kombo ponuda</ng-container>
            </a>
          }
        </div>
        <p class="meta" i18n="@@promo.intro">
          Npr. „Burger + pomfrit + piće po izboru“ po povoljnijoj ceni. Gost vidi samo aktivne
          ponude, istaknute kao baner.
        </p>
      </div>

      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
      <p id="promo-move-hint" class="visually-hidden" i18n="@@menu.moveHint">
        Alt + strelica gore ili dole pomera stavku.
      </p>

      @if (list(); as items) {
        @if (items.length) {
          <div class="filters">
            <app-search [label]="searchLabel" [(value)]="query" />
            <app-segmented
              [label]="statusLabel"
              [options]="statusOptions"
              [(value)]="statusFilter"
            />
          </div>
        }
        @if (items.length && !shown().length) {
          <div class="row" data-gap="3">
            <p class="meta" i18n="@@common.noFilterMatches">Ništa ne odgovara filterima.</p>
            <button
              appButton
              variant="ghost"
              size="sm"
              type="button"
              (click)="clearFilters()"
              i18n="@@common.clearFilters"
            >
              Poništi filtere
            </button>
          </div>
        } @else if (items.length) {
          <table class="table">
            <thead>
              <tr>
                @if (canEdit()) {
                  <th><span class="visually-hidden" i18n="@@menu.col.order">Redosled</span></th>
                }
                <th i18n="@@promo.col.name">Ponuda</th>
                <th i18n="@@venue.col.status">Status</th>
                <th data-num i18n="@@menu.col.price">Cena</th>
                @if (canEdit()) {
                  <th i18n="@@promo.col.active">Uključena</th>
                  <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                }
              </tr>
            </thead>
            <tbody
              cdkDropList
              [cdkDropListDisabled]="!canEdit() || filtering()"
              (cdkDropListDropped)="move($event.previousIndex, $event.currentIndex)"
            >
              @for (promo of shown(); track promo.id) {
                <tr cdkDrag>
                  @if (canEdit()) {
                    <td class="handle-cell">
                      <button
                        type="button"
                        class="handle"
                        cdkDragHandle
                        [disabled]="filtering()"
                        [id]="'move-' + promo.id"
                        [attr.aria-label]="moveLabel(promo.name)"
                        aria-describedby="promo-move-hint"
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                        (keydown.alt.arrowup)="nudge($index, -1, $event)"
                        (keydown.alt.arrowdown)="nudge($index, 1, $event)"
                      >
                        <svg lucideGripVertical aria-hidden="true"></svg>
                      </button>
                    </td>
                  }
                  <td>
                    <a class="name" [routerLink]="promo.id">
                      <strong>{{ promo.name }}</strong>
                    </a>
                    @if (promo.is_featured) {
                      <span class="badge" data-tone="accent" i18n="@@promo.featured"
                        >Istaknuta</span
                      >
                    }
                    <span class="table__sub">{{ summary(promo) }}</span>
                  </td>
                  <td>
                    <span class="badge" [attr.data-tone]="status[promo.status].tone">{{
                      status[promo.status].label
                    }}</span>
                  </td>
                  <td data-num>
                    <strong>{{
                      promo.price_minor / 100 | currency: currency() : 'code' : '1.0-2'
                    }}</strong>
                    @if (promo.savings_minor > 0) {
                      <span class="table__sub">
                        <s>{{
                          promo.regular_price_minor / 100 | currency: currency() : 'code' : '1.0-2'
                        }}</s>
                        ·
                        <ng-container i18n="@@promo.savings"
                          >ušteda
                          {{
                            promo.savings_minor / 100 | currency: currency() : 'code' : '1.0-2'
                          }}</ng-container
                        >
                      </span>
                    }
                  </td>
                  @if (canEdit()) {
                    <td>
                      <input
                        type="checkbox"
                        appSwitch
                        [attr.aria-label]="activeLabel(promo.name)"
                        [checked]="promo.is_active"
                        (change)="toggle(promo, $any($event.target).checked)"
                      />
                    </td>
                    <td data-num>
                      <div
                        class="row actions"
                        data-gap="1"
                        ngToolbar
                        [softDisabled]="false"
                        [attr.aria-label]="actionsLabel(promo.name)"
                      >
                        <a
                          appButton
                          ngToolbarWidget
                          variant="ghost"
                          size="sm"
                          [routerLink]="promo.id"
                          [attr.aria-label]="editLabel(promo.name)"
                        >
                          <svg lucidePencil aria-hidden="true"></svg>
                        </a>
                        <button
                          appButton
                          ngToolbarWidget
                          variant="ghost"
                          size="sm"
                          type="button"
                          [attr.aria-label]="deleteLabel(promo.name)"
                          (click)="remove(promo)"
                        >
                          <svg lucideTrash2 aria-hidden="true"></svg>
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="card stack" data-gap="2">
            <p class="card__title" i18n="@@promo.empty">Još nema kombo ponuda.</p>
            <p class="card__body" i18n="@@promo.emptyBody">
              Napravi ponudu od stavki iz menija: fiksne stavke ili izbor (npr. bilo koje piće), uz
              jednu cenu.
            </p>
          </div>
        }
      } @else if (promotions.error()) {
        <p role="alert" i18n="@@promo.loadError">Ponude nisu učitane.</p>
      } @else {
        <p class="meta" i18n="@@common.loading">Učitavanje…</p>
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

    .name {
      color: inherit;
      text-decoration: none;
      margin-inline-end: var(--space-2);
    }

    .name:hover {
      text-decoration: underline;
    }

    s {
      color: var(--color-text-subtle);
    }

    .actions {
      justify-content: flex-end;
    }

    .handle {
      display: grid;
      place-items: center;
      padding: var(--space-1);
      border: 0;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--color-text-subtle);
      cursor: grab;
    }

    .handle > svg {
      flex: none;
      max-inline-size: none;
      inline-size: 1.125rem;
      block-size: 1.125rem;
    }

    .handle-cell {
      inline-size: 1px;
    }

    .cdk-drag-preview {
      box-shadow: var(--shadow-lg);
      background: var(--color-surface);
    }

    .cdk-drag-placeholder {
      opacity: 0.4;
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
export default class PromotionsPage {
  private readonly api = inject(PromotionsApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(Dialog);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  readonly venueId = input.required<string>();

  protected readonly venue = inject(VenuesApi).venueResource(this.venueId);
  protected readonly promotions = this.api.listResource(this.venueId);
  protected readonly list = computed(() =>
    this.promotions.hasValue() ? this.promotions.value()?.items : undefined,
  );
  protected readonly currency = computed(() => this.venue.value()?.currency ?? 'RSD');
  protected readonly error = signal('');
  protected readonly status = STATUS;

  protected readonly searchLabel = $localize`:@@promo.search:Traži ponudu ili stavku`;
  protected readonly statusLabel = $localize`:@@venue.col.status:Status`;
  protected readonly statusOptions = [
    { value: 'all', label: $localize`:@@common.filter.allItems:Sve` },
    ...(Object.keys(STATUS) as PromotionStatus[]).map((key) => ({
      value: key,
      label: STATUS[key].label,
    })),
  ];
  protected readonly query = signal('');
  protected readonly statusFilter = signal('all');
  /** While filtering, reordering is off: the rows on screen are not the whole list. */
  protected readonly filtering = computed(
    () => this.query().trim() !== '' || this.statusFilter() !== 'all',
  );
  protected readonly shown = computed(() =>
    (this.list() ?? []).filter(
      (promo) =>
        (this.statusFilter() === 'all' || promo.status === this.statusFilter()) &&
        matchesQuery(
          this.query(),
          promo.name,
          promo.description,
          ...promo.slots.flatMap((slot) => [
            slot.label,
            ...slot.options.map((option) => option.item_name),
          ]),
        ),
    ),
  );

  protected clearFilters(): void {
    this.query.set('');
    this.statusFilter.set('all');
  }

  protected readonly canEdit = computed(() => {
    const role = this.auth.role();
    return role === 'owner' || role === 'manager';
  });

  /** "Burger · 2× Pivo ili Sok" */
  protected summary(promo: Promotion): string {
    const or = $localize`:@@promo.or: ili `;
    return promo.slots
      .map((slot) => {
        const names = slot.options.map((option) =>
          option.variant_label ? `${option.item_name} ${option.variant_label}` : option.item_name,
        );
        const text = slot.label || names.join(or);
        return slot.quantity > 1 ? `${slot.quantity}× ${text}` : text;
      })
      .join(' · ');
  }

  protected actionsLabel(name: string): string {
    return $localize`:@@common.actionsFor:Akcije: ${name}:name:`;
  }

  protected moveLabel(name: string): string {
    return $localize`:@@menu.moveLabel:Premesti ${name}:name:`;
  }

  protected editLabel(name: string): string {
    return $localize`:@@menu.editLabel:Izmeni ${name}:name:`;
  }

  protected deleteLabel(name: string): string {
    return $localize`:@@menu.deleteItemLabel:Obriši ${name}:name:`;
  }

  protected activeLabel(name: string): string {
    return $localize`:@@promo.activeLabel:Uključena: ${name}:name:`;
  }

  /** Optimistic: the switch flips at once and rolls back if the API refuses. */
  protected async toggle(promo: Promotion, isActive: boolean): Promise<void> {
    this.error.set('');
    this.patch(promo.id, { is_active: isActive });
    try {
      const saved = await firstValueFrom(this.api.update(promo.id, { is_active: isActive }));
      this.patch(promo.id, saved);
    } catch (error) {
      this.patch(promo.id, { is_active: !isActive });
      this.error.set(actionError(error));
    }
  }

  protected async remove(promo: Promotion): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
        data: {
          title: $localize`:@@promo.delete.title:Obriši kombo ponudu?`,
          body: $localize`:@@promo.delete.body:Ponuda „${promo.name}:name:“ se briše. Stavke u meniju ostaju.`,
          confirm: $localize`:@@promo.delete.confirm:Obriši ponudu`,
        },
      }).closed,
    );
    if (!confirmed) return;
    this.error.set('');
    try {
      await firstValueFrom(this.api.remove(promo.id));
    } catch (error) {
      this.error.set(actionError(error));
    }
    this.promotions.reload();
  }

  protected async move(from: number, to: number): Promise<void> {
    const items = [...(this.list() ?? [])];
    if (from === to || !items.length) return;
    moveItemInArray(items, from, to);
    this.promotions.set({ items });
    this.error.set('');
    try {
      const saved = await firstValueFrom(
        this.api.reorder(
          this.venueId(),
          items.map((item) => item.id),
        ),
      );
      this.promotions.set(saved);
    } catch (error) {
      this.error.set(actionError(error));
      this.promotions.reload();
    }
  }

  /** Keyboard alternative to dragging: Alt+ArrowUp/Down on a handle moves one place. */
  protected nudge(index: number, step: -1 | 1, event: Event): void {
    const items = this.list() ?? [];
    const target = index + step;
    if (target < 0 || target >= items.length) return;
    event.preventDefault();
    const id = items[index].id;
    void this.move(index, target);
    afterNextRender(() => this.document.getElementById(`move-${id}`)?.focus(), {
      injector: this.injector,
    });
  }

  private patch(id: string, patch: Partial<Promotion>): void {
    this.promotions.update(
      (value) =>
        value && {
          items: value.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        },
    );
  }
}

function actionError(error: unknown): string {
  return toApiError(error).code === 'forbidden'
    ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
    : $localize`:@@menu.saveError:Izmena nije sačuvana. Pokušaj ponovo.`;
}
