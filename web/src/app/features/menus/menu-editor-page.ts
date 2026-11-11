import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { Dialog } from '@angular/cdk/dialog';
import { CurrencyPipe, DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideGripVertical,
  LucideLanguages,
  LucidePalette,
  LucidePencil,
  LucidePercent,
  LucidePlus,
  LucideTrash2,
  LucideUtensils,
} from '@lucide/angular';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { firstValueFrom, type Observable } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth-store';
import type {
  CategoryWithItems,
  ItemWithVariants,
  MenuLanguage,
  MenuTree,
  PriceAdjustment,
} from '../../core/menus/menu';
import { MenusApi } from '../../core/menus/menus-api';
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
import {
  CategoryDialog,
  type CategoryDialogData,
  type CategoryDialogResult,
} from './category-dialog';
import { LanguagesDialog } from './languages-dialog';
import { ItemDialog, type ItemDialogData, type ItemDialogResult } from './item-dialog';
import { PriceAdjustDialog, type PriceAdjustDialogData } from './price-adjust-dialog';
import { toMajor, toMinor } from './price';

/** `/meniji/:menuId`: categories, items, prices and availability of one menu. */
@Component({
  selector: 'app-menu-editor-page',
  imports: [
    LucideUtensils,
    Toolbar,
    ToolbarWidget,
    CurrencyPipe,
    NgTemplateOutlet,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    AppButton,
    AppSearch,
    AppSegmented,
    AppSwitch,
    LucideArrowLeft,
    LucideGripVertical,
    LucideLanguages,
    LucidePalette,
    LucidePencil,
    LucidePercent,
    LucidePlus,
    LucideTrash2,
  ],
  template: `
    <div class="stack" data-gap="8">
      @if (menu.value(); as tree) {
        <div class="stack" data-gap="2">
          <a
            appButton
            variant="ghost"
            size="sm"
            [routerLink]="['/objekti', tree.venue_id]"
            class="back"
          >
            <svg lucideArrowLeft aria-hidden="true"></svg>
            {{ venue.value()?.name }}
          </a>
          <div class="row" data-justify="between">
            <div class="row" data-gap="3">
              <h1>{{ tree.name }}</h1>
              @if (tree.status === 'published') {
                <span class="badge" data-tone="success" i18n="@@menu.status.published"
                  >Objavljen</span
                >
              } @else {
                <span class="badge" data-tone="info" i18n="@@menu.status.draft">Nacrt</span>
              }
            </div>
            <div class="row" data-gap="2">
              @if (canEdit()) {
                <button
                  appButton
                  variant="secondary"
                  type="button"
                  [attr.aria-label]="languagesLabel(tree)"
                  (click)="editLanguages(tree)"
                >
                  <svg lucideLanguages aria-hidden="true"></svg>
                  <ng-container i18n="@@menu.languages">Jezici</ng-container>
                  <span class="meta">{{ languageCodes(tree) }}</span>
                </button>
              }
              <a appButton variant="secondary" [routerLink]="['/meniji', tree.id, 'dizajn']">
                <svg lucidePalette aria-hidden="true"></svg>
                <ng-container i18n="@@menu.design">Dizajn</ng-container>
              </a>
              @if (canEdit()) {
                @if (tree.categories.length) {
                  <button appButton variant="secondary" type="button" (click)="adjustPrices(tree)">
                    <svg lucidePercent aria-hidden="true"></svg>
                    <ng-container i18n="@@prices.open">Promeni cene</ng-container>
                  </button>
                }
                @if (tree.status === 'published') {
                  <button
                    appButton
                    variant="secondary"
                    type="button"
                    [disabled]="busy()"
                    (click)="run(api.unpublish(tree.id))"
                    i18n="@@menu.unpublish"
                  >
                    Vrati u nacrt
                  </button>
                } @else {
                  <button
                    appButton
                    type="button"
                    [disabled]="busy()"
                    (click)="run(api.publish(tree.id))"
                    i18n="@@menu.publishMenu"
                  >
                    Objavi meni
                  </button>
                }
              }
            </div>
          </div>
        </div>

        @if (error()) {
          <p class="alert" role="alert">{{ error() }}</p>
        }
        @if (updated() !== null) {
          <p class="alert" data-tone="success" role="status">
            <span i18n="@@prices.done">{updated(), plural,
              one {Promenjena je {{ updated() }} cena.}
              few {Promenjene su {{ updated() }} cene.}
              other {Promenjeno je {{ updated() }} cena.}
            }</span>
          </p>
        }

        @if (itemCount() > 0) {
          <div class="filters">
            <app-search [label]="searchLabel" [(value)]="query" />
            <app-segmented
              [label]="availabilityLabel"
              [options]="availabilityOptions"
              [(value)]="availability"
            />
            @if (filtering()) {
              <span class="filters__count" i18n="@@common.filterCount"
                >{{ shownItemCount() }} od {{ itemCount() }}</span
              >
            }
          </div>
        }

        <p id="move-hint" class="visually-hidden" i18n="@@menu.moveHint">
          Alt + strelica gore ili dole pomera stavku.
        </p>

        <div
          class="stack"
          data-gap="8"
          cdkDropList
          [cdkDropListDisabled]="!canEdit() || filtering()"
          (cdkDropListDropped)="moveCategory(tree, $event)"
        >
          @for (category of shownCategories(); track category.id) {
            <section
              class="stack category"
              data-gap="3"
              cdkDrag
              [attr.aria-labelledby]="'cat-' + category.id"
            >
              <div class="row" data-justify="between">
                <div class="row" data-gap="2">
                  @if (canEdit()) {
                    <button
                      type="button"
                      class="handle"
                      cdkDragHandle
                      [disabled]="filtering()"
                      [id]="'move-' + category.id"
                      [attr.aria-label]="moveLabel(category.name)"
                      aria-describedby="move-hint"
                      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                      (keydown.alt.arrowup)="nudgeCategory(tree, $index, -1, $event)"
                      (keydown.alt.arrowdown)="nudgeCategory(tree, $index, 1, $event)"
                    >
                      <svg lucideGripVertical aria-hidden="true"></svg>
                    </button>
                  }
                  <h2 [id]="'cat-' + category.id">{{ category.name }}</h2>
                  <span class="meta">{{ category.items.length }}</span>
                </div>
                @if (canEdit()) {
                  <div
                    class="row"
                    data-gap="1"
                    ngToolbar
                    [softDisabled]="false"
                    [attr.aria-label]="actionsLabel(category.name)"
                  >
                    <button
                      appButton
                      ngToolbarWidget
                      variant="secondary"
                      size="sm"
                      type="button"
                      (click)="addItem(category)"
                    >
                      <svg lucidePlus aria-hidden="true"></svg>
                      <ng-container i18n="@@menu.addItem">Dodaj stavku</ng-container>
                    </button>
                    <button
                      appButton
                      ngToolbarWidget
                      variant="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-label]="editLabel(category.name)"
                      (click)="editCategory(category)"
                    >
                      <svg lucidePencil aria-hidden="true"></svg>
                    </button>
                    <button
                      appButton
                      ngToolbarWidget
                      variant="ghost"
                      size="sm"
                      type="button"
                      [attr.aria-label]="deleteLabel(category.name)"
                      (click)="deleteCategory(category)"
                    >
                      <svg lucideTrash2 aria-hidden="true"></svg>
                    </button>
                  </div>
                }
              </div>
              @if (category.description) {
                <p class="card__body">{{ category.description }}</p>
              }

              @if (category.items.length) {
                <table class="table">
                  <thead>
                    <tr>
                      @if (canEdit()) {
                        <th>
                          <span class="visually-hidden" i18n="@@menu.col.order">Redosled</span>
                        </th>
                      }
                      <th i18n="@@menu.col.item">Stavka</th>
                      <th i18n="@@menu.col.available">Dostupno</th>
                      <th data-num class="wide-only" i18n="@@menu.col.price">Cena</th>
                      @if (canEdit()) {
                        <th><span class="visually-hidden" i18n="@@common.actions">Akcije</span></th>
                      }
                    </tr>
                  </thead>
                  <tbody
                    cdkDropList
                    [cdkDropListDisabled]="!canEdit() || filtering()"
                    (cdkDropListDropped)="moveItem(category, $event)"
                  >
                    @for (item of category.items; track item.id) {
                      <tr cdkDrag [attr.data-status]="item.is_available ? null : 'unavailable'">
                        @if (canEdit()) {
                          <td class="handle-cell">
                            <button
                              type="button"
                              class="handle"
                              cdkDragHandle
                              [disabled]="filtering()"
                              [id]="'move-' + item.id"
                              [attr.aria-label]="moveLabel(item.name)"
                              aria-describedby="move-hint"
                              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                              (keydown.alt.arrowup)="nudgeItem(category, $index, -1, $event)"
                              (keydown.alt.arrowdown)="nudgeItem(category, $index, 1, $event)"
                            >
                              <svg lucideGripVertical aria-hidden="true"></svg>
                            </button>
                          </td>
                        }
                        <td>
                          <strong>{{ item.name }}</strong>
                          @if (item.description) {
                            <span class="table__sub">{{ item.description }}</span>
                          }
                          <span class="table__sub narrow-only">
                            <ng-container
                              *ngTemplateOutlet="prices; context: { $implicit: item }"
                            />
                          </span>
                        </td>
                        <td>
                          <label class="row" data-gap="2">
                            <input
                              type="checkbox"
                              appSwitch
                              [checked]="item.is_available"
                              (change)="toggleAvailable(item, $any($event.target).checked)"
                            />
                            @if (item.is_available) {
                              <span
                                class="badge wide-only"
                                data-tone="success"
                                i18n="@@item.available"
                                >Dostupno</span
                              >
                            } @else {
                              <span
                                class="badge wide-only"
                                data-tone="danger"
                                i18n="@@item.unavailable"
                                >Nema</span
                              >
                            }
                          </label>
                        </td>
                        <td data-num class="wide-only">
                          <ng-container *ngTemplateOutlet="prices; context: { $implicit: item }" />
                        </td>
                        @if (canEdit()) {
                          <td data-num>
                            <div
                              class="row actions"
                              data-gap="1"
                              ngToolbar
                              [softDisabled]="false"
                              [attr.aria-label]="actionsLabel(item.name)"
                            >
                              <button
                                appButton
                                ngToolbarWidget
                                variant="ghost"
                                size="sm"
                                type="button"
                                [attr.aria-label]="editLabel(item.name)"
                                (click)="editItem(item)"
                              >
                                <svg lucidePencil aria-hidden="true"></svg>
                              </button>
                              <button
                                appButton
                                ngToolbarWidget
                                variant="ghost"
                                size="sm"
                                type="button"
                                [attr.aria-label]="deleteLabel(item.name)"
                                (click)="deleteItem(item)"
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
                <p class="meta" i18n="@@menu.emptyCategory">Kategorija je prazna.</p>
              }
            </section>
          } @empty {
            @if (filtering()) {
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
            } @else {
              <div class="empty-state">
                <svg lucideUtensils aria-hidden="true"></svg>
                <p class="empty-state__title" i18n="@@menu.empty">Meni još nema kategorija.</p>
                <p class="empty-state__body" i18n="@@menu.emptyBody">
                  Dodaj prvu kategoriju, npr. „Topli napici“, pa u nju stavke sa cenama.
                </p>
              </div>
            }
          }
        </div>

        @if (canEdit()) {
          <div>
            <button appButton variant="secondary" type="button" (click)="addCategory(tree)">
              <svg lucidePlus aria-hidden="true"></svg>
              <ng-container i18n="@@menu.addCategory">Dodaj kategoriju</ng-container>
            </button>
          </div>
        }
        <ng-template #prices let-item>
          @for (variant of $any(item).variants; track variant.id) {
            <span class="price-line">
              @if (variant.label) {
                <span class="meta">{{ variant.label }}</span>
              }
              {{ toMajor(variant.price_minor) | currency: currency() : 'code' : '1.0-2' }}
            </span>
          }
        </ng-template>
      } @else if (menu.error()) {
        <p role="alert" i18n="@@menu.notFound">Meni nije pronađen.</p>
      } @else {
        <p class="loading" role="status" i18n="@@common.loading">Učitavanje…</p>
      }
    </div>
  `,
  styles: `
    .back {
      align-self: flex-start;
    }

    .category {
      background: var(--color-bg);
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

    .handle:hover {
      color: var(--color-text);
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

    .narrow-only {
      display: none;
    }

    @container page (max-width: 720px) {
      .wide-only {
        display: none;
      }

      .narrow-only {
        display: block;
      }

      .price-line {
        text-align: start;
      }
    }

    /* Phone: the columns explain themselves; their headers would push the table off screen. */
    @container page (max-width: 400px) {
      thead {
        display: none;
      }

      .handle-cell {
        padding-inline-end: 0;
      }

      td strong {
        overflow-wrap: anywhere;
      }

      td .price-line {
        white-space: normal;
      }
    }

    tr[data-status='unavailable'] strong {
      color: var(--color-text-muted);
    }

    .price-line {
      display: block;
      white-space: nowrap;
    }

    .actions {
      justify-content: flex-end;
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
export default class MenuEditorPage {
  /** Accessible name of a row's action toolbar (arrow keys move between its buttons). */
  protected actionsLabel(name: string): string {
    return $localize`:@@common.actionsFor:Akcije: ${name}:name:`;
  }

  protected readonly api = inject(MenusApi);
  private readonly auth = inject(AuthStore);
  private readonly dialog = inject(Dialog);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  readonly menuId = input.required<string>();

  protected readonly menu = this.api.menuResource(this.menuId);
  protected readonly venue = inject(VenuesApi).venueResource(() => this.menu.value()?.venue_id);
  protected readonly currency = computed(() => this.venue.value()?.currency ?? 'RSD');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Prices changed by the last bulk change, for the status line. */
  protected readonly updated = signal<number | null>(null);
  protected readonly toMajor = toMajor;

  protected readonly canEdit = computed(() => {
    const role = this.auth.role();
    return role === 'owner' || role === 'manager';
  });

  protected readonly searchLabel = $localize`:@@menu.search:Traži stavku`;
  protected readonly availabilityLabel = $localize`:@@menu.col.available:Dostupno`;
  protected readonly availabilityOptions = [
    { value: 'all', label: $localize`:@@common.filter.allItems:Sve` },
    { value: 'available', label: $localize`:@@menu.filter.available:Dostupne` },
    { value: 'unavailable', label: $localize`:@@menu.filter.unavailable:Nedostupne` },
  ];
  protected readonly query = signal('');
  protected readonly availability = signal('all');
  /** While filtering, drag and drop is off: the rows on screen are not the whole category. */
  protected readonly filtering = computed(
    () => this.query().trim() !== '' || this.availability() !== 'all',
  );
  protected readonly itemCount = computed(() =>
    (this.menu.value()?.categories ?? []).reduce((sum, c) => sum + c.items.length, 0),
  );
  /** Categories with the items that pass; a query naming a category keeps all of its items. */
  protected readonly shownCategories = computed(() => {
    const categories = this.menu.value()?.categories ?? [];
    if (!this.filtering()) return categories;
    const query = this.query();
    const availability = this.availability();
    return categories
      .map((category) => {
        const categoryHit = query.trim() !== '' && matchesQuery(query, category.name);
        const items = category.items.filter(
          (item) =>
            (availability === 'all' || item.is_available === (availability === 'available')) &&
            (categoryHit ||
              matchesQuery(
                query,
                item.name,
                item.description,
                ...item.variants.map((variant) => variant.label),
              )),
        );
        return { ...category, items };
      })
      .filter((category) => category.items.length > 0);
  });
  protected readonly shownItemCount = computed(() =>
    this.shownCategories().reduce((sum, c) => sum + c.items.length, 0),
  );

  protected clearFilters(): void {
    this.query.set('');
    this.availability.set('all');
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

  /** Runs one change, then reloads the tree; errors land in the alert. */
  protected async run(action: Observable<unknown>): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await firstValueFrom(action);
    } catch (error) {
      this.error.set(actionError(error));
    } finally {
      this.busy.set(false);
      this.menu.reload();
    }
  }

  protected async adjustPrices(tree: MenuTree): Promise<void> {
    const input = await firstValueFrom(
      this.dialog.open<PriceAdjustment, PriceAdjustDialogData>(PriceAdjustDialog, {
        data: { menu: tree, currency: this.currency() },
      }).closed,
    );
    if (!input) return;
    this.updated.set(null);
    this.error.set('');
    this.busy.set(true);
    try {
      const { updated } = await firstValueFrom(this.api.adjustPrices(tree.id, input));
      this.updated.set(updated);
    } catch (error) {
      this.error.set(actionError(error));
    } finally {
      this.busy.set(false);
      this.menu.reload();
    }
  }

  /** "SR · EN · DE" next to the languages button. */
  protected languageCodes(tree: MenuTree): string {
    return ['sr', ...tree.languages.map((language) => language.code)]
      .map((code) => code.toUpperCase())
      .join(' · ');
  }

  protected languagesLabel(tree: MenuTree): string {
    const names = ['Srpski', ...tree.languages.map((language) => language.name)].join(', ');
    return $localize`:@@menu.languagesLabel:Jezici menija: ${names}:names:`;
  }

  protected async editLanguages(tree: MenuTree): Promise<void> {
    const languages = await firstValueFrom(
      this.dialog.open<MenuLanguage[], MenuLanguage[]>(LanguagesDialog, { data: tree.languages })
        .closed,
    );
    if (languages) await this.run(this.api.setLanguages(tree.id, languages));
  }

  protected async addCategory(tree: MenuTree): Promise<void> {
    const result = await this.openCategoryDialog();
    if (result) await this.run(this.api.createCategory(tree.id, result));
  }

  protected async editCategory(category: CategoryWithItems): Promise<void> {
    const result = await this.openCategoryDialog(category);
    if (result) await this.run(this.api.updateCategory(category.id, result));
  }

  protected async deleteCategory(category: CategoryWithItems): Promise<void> {
    const confirmed = await this.confirm({
      title: $localize`:@@category.delete.title:Obriši kategoriju?`,
      body: $localize`:@@category.delete.body:Kategorija „${category.name}:name:“ se briše sa svim stavkama.`,
      confirm: $localize`:@@category.delete.confirm:Obriši kategoriju`,
    });
    if (confirmed) await this.run(this.api.deleteCategory(category.id));
  }

  protected async addItem(category: CategoryWithItems): Promise<void> {
    const result = await this.openItemDialog({ currency: this.currency() });
    if (!result) return;
    await this.run(
      this.api.createItem(category.id, {
        name: result.name,
        description: result.description,
        translations: result.translations,
        image_url: result.image_url,
        tags: result.tags,
        allergens: result.allergens,
        variants: result.variants.map((row) => ({
          label: row.label,
          translations: row.translations,
          price_minor: toMinor(row.price ?? 0),
        })),
      }),
    );
  }

  protected async editItem(item: ItemWithVariants): Promise<void> {
    const result = await this.openItemDialog({ currency: this.currency(), item });
    if (!result) return;
    this.error.set('');
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.updateItem(item.id, {
          name: result.name,
          description: result.description,
          translations: result.translations,
          image_url: result.image_url,
          tags: result.tags,
          allergens: result.allergens,
        }),
      );
      for (const row of result.variants) {
        const price_minor = toMinor(row.price ?? 0);
        const existing = item.variants.find((variant) => variant.id === row.id);
        const input = { label: row.label, translations: row.translations, price_minor };
        if (!existing) {
          await firstValueFrom(this.api.createVariant(item.id, input));
        } else if (
          existing.label !== row.label ||
          existing.price_minor !== price_minor ||
          JSON.stringify(existing.translations) !== JSON.stringify(row.translations)
        ) {
          await firstValueFrom(this.api.updateVariant(existing.id, input));
        }
      }
      // Deletes last, so the item never drops to zero variants (the API refuses that).
      const kept = new Set(result.variants.map((row) => row.id));
      for (const variant of item.variants.filter((v) => !kept.has(v.id))) {
        await firstValueFrom(this.api.deleteVariant(variant.id));
      }
    } catch (error) {
      this.error.set(actionError(error));
    } finally {
      this.busy.set(false);
      this.menu.reload();
    }
  }

  protected async deleteItem(item: ItemWithVariants): Promise<void> {
    const confirmed = await this.confirm({
      title: $localize`:@@item.delete.title:Obriši stavku?`,
      body: $localize`:@@item.delete.body:Stavka „${item.name}:name:“ se briše iz menija.`,
      confirm: $localize`:@@item.delete.confirm:Obriši stavku`,
    });
    if (confirmed) await this.run(this.api.deleteItem(item.id));
  }

  /** Optimistic: the switch flips at once and rolls back if the API refuses. */
  protected async toggleAvailable(item: ItemWithVariants, isAvailable: boolean): Promise<void> {
    this.patchItem(item.id, { is_available: isAvailable });
    this.error.set('');
    try {
      await firstValueFrom(this.api.setItemStatus(item.id, { is_available: isAvailable }));
    } catch (error) {
      this.patchItem(item.id, { is_available: !isAvailable });
      this.error.set(actionError(error));
    }
  }

  protected async moveCategory(tree: MenuTree, event: CdkDragDrop<unknown>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const categories = [...tree.categories];
    moveItemInArray(categories, event.previousIndex, event.currentIndex);
    this.menu.update((value) => value && { ...value, categories });
    await this.run(
      this.api.reorderCategories(
        tree.id,
        categories.map((category) => category.id),
      ),
    );
  }

  protected async moveItem(
    category: CategoryWithItems,
    event: CdkDragDrop<unknown>,
  ): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const items = [...category.items];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.menu.update(
      (value) =>
        value && {
          ...value,
          categories: value.categories.map((c) => (c.id === category.id ? { ...c, items } : c)),
        },
    );
    await this.run(
      this.api.reorderItems(
        category.id,
        items.map((item) => item.id),
      ),
    );
  }

  /** Keyboard alternative to dragging: Alt+ArrowUp/Down on a handle moves one place. */
  protected nudgeCategory(tree: MenuTree, index: number, step: -1 | 1, event: Event): void {
    const target = index + step;
    if (target < 0 || target >= tree.categories.length) return;
    event.preventDefault();
    void this.moveCategory(tree, {
      previousIndex: index,
      currentIndex: target,
    } as CdkDragDrop<unknown>);
    this.refocus(`move-${tree.categories[index].id}`);
  }

  protected nudgeItem(
    category: CategoryWithItems,
    index: number,
    step: -1 | 1,
    event: Event,
  ): void {
    const target = index + step;
    if (target < 0 || target >= category.items.length) return;
    event.preventDefault();
    void this.moveItem(category, {
      previousIndex: index,
      currentIndex: target,
    } as CdkDragDrop<unknown>);
    this.refocus(`move-${category.items[index].id}`);
  }

  /** The moved row is re-inserted in the DOM, which drops focus; put it back on its handle. */
  private refocus(id: string): void {
    afterNextRender(() => this.document.getElementById(id)?.focus({ preventScroll: false }), {
      injector: this.injector,
    });
  }

  private patchItem(itemId: string, patch: Partial<ItemWithVariants>): void {
    this.menu.update(
      (value) =>
        value && {
          ...value,
          categories: value.categories.map((category) => ({
            ...category,
            items: category.items.map((item) =>
              item.id === itemId ? { ...item, ...patch } : item,
            ),
          })),
        },
    );
  }

  private languages(): MenuLanguage[] {
    return this.menu.value()?.languages ?? [];
  }

  private openCategoryDialog(
    category?: CategoryWithItems,
  ): Promise<CategoryDialogResult | undefined> {
    return firstValueFrom(
      this.dialog.open<CategoryDialogResult, CategoryDialogData>(CategoryDialog, {
        data: { category, languages: this.languages() },
      }).closed,
    );
  }

  private openItemDialog(
    data: Omit<ItemDialogData, 'languages'>,
  ): Promise<ItemDialogResult | undefined> {
    return firstValueFrom(
      this.dialog.open<ItemDialogResult, ItemDialogData>(ItemDialog, {
        data: { ...data, languages: this.languages() },
      }).closed,
    );
  }

  private async confirm(data: ConfirmDialogData): Promise<boolean> {
    return (
      (await firstValueFrom(
        this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, { data }).closed,
      )) === true
    );
  }
}

function actionError(error: unknown): string {
  return toApiError(error).code === 'forbidden'
    ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
    : $localize`:@@menu.saveError:Izmena nije sačuvana. Pokušaj ponovo.`;
}
