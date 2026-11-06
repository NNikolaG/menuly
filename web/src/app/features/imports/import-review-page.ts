import { Dialog } from '@angular/cdk/dialog';
import { Tab, TabContent, TabList, TabPanel, Tabs } from '@angular/aria/tabs';
import { Toolbar, ToolbarWidget } from '@angular/aria/toolbar';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  maxLength,
  min,
  required,
  submit,
} from '@angular/forms/signals';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCamera,
  LucideCheck,
  LucideImagePlus,
  LucidePlus,
  LucideRotateCw,
  LucideTrash2,
  LucideX,
} from '@lucide/angular';
import { firstValueFrom, type Observable } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import type { ImportPage, MenuImport } from '../../core/imports/import';
import { ImportsApi } from '../../core/imports/imports-api';
import { MenusApi } from '../../core/menus/menus-api';
import { VenuesApi } from '../../core/venues/venues-api';
import {
  AppButton,
  AppField,
  AppInput,
  AppSelect,
  ConfirmDialog,
  type ConfirmDialogData,
} from '../../shared/ui';
import { summarize, toDraft, toEdit, type EditDraft, type EditItem } from './import-draft';
import {
  ACCEPT,
  ACCEPT_PHOTO,
  IMPORT_STATUS,
  importError,
  ISSUE,
  PAGE_ERROR,
  PAGE_STATUS,
  QUALITY,
  UNCERTAIN,
} from './import-labels';
import { PageOriginal } from './page-original';

/** Poll interval while pages are being read. */
const POLL_MS = 2000;

/**
 * `/uvoz/:importId`: follow the reading page by page, retake bad photos, then compare each original with what was
 * read, fix it and import it into a menu.
 */
@Component({
  selector: 'app-import-review-page',
  imports: [
    FormField,
    NgTemplateOutlet,
    RouterLink,
    Tabs,
    TabList,
    Tab,
    TabPanel,
    TabContent,
    Toolbar,
    ToolbarWidget,
    AppButton,
    AppField,
    AppInput,
    AppSelect,
    PageOriginal,
    LucideArrowLeft,
    LucideCamera,
    LucideCheck,
    LucideImagePlus,
    LucidePlus,
    LucideRotateCw,
    LucideTrash2,
    LucideX,
  ],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="stack" data-gap="6">
      @if (data(); as imp) {
        <div class="stack" data-gap="2">
          <a
            appButton
            variant="ghost"
            size="sm"
            [routerLink]="['/objekti', imp.venue_id, 'uvoz']"
            class="back"
          >
            <svg lucideArrowLeft aria-hidden="true"></svg>
            <ng-container i18n="@@import.pageTitle">Uvoz menija sa slike</ng-container>
          </a>
          <div class="row" data-justify="between">
            <div class="row" data-gap="3">
              <h1 i18n="@@import.reviewTitle">Pregled uvoza</h1>
              <span class="badge" [attr.data-tone]="importStatus[imp.status].tone">{{
                importStatus[imp.status].label
              }}</span>
            </div>
            @if (imp.status === 'ready_for_review' || imp.status === 'failed') {
              <label appButton data-variant="secondary" [attr.aria-disabled]="busy() || null">
                <svg lucideImagePlus aria-hidden="true"></svg>
                <ng-container i18n="@@import.addPages">Dodaj stranice</ng-container>
                <input
                  type="file"
                  class="visually-hidden"
                  multiple
                  [accept]="accept"
                  [disabled]="busy()"
                  (change)="addPages($event)"
                />
              </label>
            }
          </div>
          @if (imp.error) {
            <p class="meta">{{ imp.error }}</p>
          }
        </div>

        @if (problem()) {
          <p class="alert" role="alert">{{ problem() }}</p>
        }

        @if (reading()) {
          <section class="card stack" data-gap="3" aria-labelledby="progress-heading">
            <h2 id="progress-heading" class="card__title" i18n="@@import.reading">Čitamo meni…</h2>
            <!-- No value until the first page is done: an indeterminate bar shows it is working. -->
            <progress [attr.value]="progress().done || null" [max]="progress().total"></progress>
            <p class="meta" aria-live="polite" i18n="@@import.progress">
              Pročitano {{ progress().done }} od {{ progress().total }}. Možeš da napustiš stranicu,
              nastavljamo u pozadini.
            </p>
          </section>
        }

        @if (imp.status === 'committed') {
          <div class="card stack" data-gap="2">
            <p class="card__title" i18n="@@import.committed">Meni je uvezen.</p>
            @if (imp.committed_menu_id) {
              <div>
                <a
                  appButton
                  [routerLink]="['/meniji', imp.committed_menu_id]"
                  i18n="@@import.openMenu"
                  >Otvori meni</a
                >
              </div>
            }
          </div>
        } @else if (reviewable()) {
          <div class="layout">
            <div ngTabs class="stack" data-gap="4">
              <div ngTabList class="tabs" [(selectedTab)]="tab" [attr.aria-label]="pagesLabel">
                @for (page of pages(); track page.id) {
                  <div ngTab class="tab" [value]="page.id">
                    {{ pageLabel(page) }}
                    @if (page.status === 'failed' || page.photo_quality === 'poor') {
                      <span class="dot" data-tone="danger" aria-hidden="true"></span>
                    } @else if (toCheckOn(page.page_index)) {
                      <span class="dot" data-tone="warning" aria-hidden="true"></span>
                    }
                  </div>
                }
              </div>

              @for (page of pages(); track page.id) {
                <div ngTabPanel [value]="page.id">
                  <ng-template ngTabContent>
                    <ng-container
                      [ngTemplateOutlet]="pagePanel"
                      [ngTemplateOutletContext]="{ $implicit: page, imp }"
                    />
                  </ng-template>
                </div>
              }
            </div>

            <aside class="stack side" data-gap="4">
              <section class="card stack" data-gap="3" aria-labelledby="summary-heading">
                <h2 id="summary-heading" class="card__title" i18n="@@import.summary">Pročitano</h2>
                <dl class="sum">
                  <div>
                    <dt i18n="@@import.sum.categories">Kategorije</dt>
                    <dd>{{ summary().categories }}</dd>
                  </div>
                  <div>
                    <dt i18n="@@import.sum.items">Stavke</dt>
                    <dd>{{ summary().items }}</dd>
                  </div>
                  <div [attr.data-tone]="summary().toCheck ? 'warning' : null">
                    <dt i18n="@@import.sum.toCheck">Za proveru</dt>
                    <dd>{{ summary().toCheck }}</dd>
                  </div>
                  <div [attr.data-tone]="summary().missingPrices ? 'danger' : null">
                    <dt i18n="@@import.sum.missingPrices">Bez cene</dt>
                    <dd>{{ summary().missingPrices }}</dd>
                  </div>
                </dl>
                <div class="row" data-gap="2">
                  <button
                    appButton
                    variant="secondary"
                    size="sm"
                    type="button"
                    [disabled]="!dirty() || busy()"
                    (click)="save()"
                    i18n="@@import.saveDraft"
                  >
                    Sačuvaj izmene
                  </button>
                  <span class="meta" aria-live="polite">
                    @if (dirty()) {
                      <ng-container i18n="@@import.unsaved">Nesačuvano</ng-container>
                    } @else {
                      <ng-container i18n="@@import.saved">Sačuvano</ng-container>
                    }
                  </span>
                </div>
              </section>

              <form
                class="card stack"
                data-gap="4"
                novalidate
                (submit)="commitImport($event)"
                aria-labelledby="commit-heading"
              >
                <h2 id="commit-heading" class="card__title" i18n="@@import.commitTitle">
                  Uvezi u meni
                </h2>
                <app-field
                  i18n-label="@@import.target"
                  label="Gde"
                  controlId="import-target"
                  [field]="target.menu"
                >
                  <app-select
                    controlId="import-target"
                    [options]="targets()"
                    [formField]="target.menu"
                  />
                </app-field>
                @if (!targetModel().menu) {
                  <app-field
                    i18n-label="@@import.menuName"
                    label="Naziv novog menija"
                    controlId="import-menu-name"
                    [field]="target.name"
                  >
                    <input appInput id="import-menu-name" [formField]="target.name" />
                  </app-field>
                } @else {
                  <p class="meta" i18n="@@import.mergeHint">
                    Kategorije istog naziva dobijaju nove stavke na kraju; ostale se dodaju.
                  </p>
                }
                @if (commitProblem()) {
                  <p class="alert" role="alert">{{ commitProblem() }}</p>
                }
                <button appButton type="submit" [disabled]="busy()" i18n="@@import.commit">
                  Uvezi
                </button>
              </form>
            </aside>
          </div>
        } @else {
          <!-- Still reading, or failed: the pages with their state and fixes. -->
          <ul class="pages">
            @for (page of pages(); track page.id) {
              <li class="card">
                <ng-container
                  [ngTemplateOutlet]="pageHead"
                  [ngTemplateOutletContext]="{ $implicit: page, imp }"
                />
              </li>
            }
          </ul>
        }

        <ng-template #pagePanel let-page let-imp="imp">
          <div class="stack" data-gap="4">
            <ng-container
              [ngTemplateOutlet]="pageHead"
              [ngTemplateOutletContext]="{ $implicit: page, imp }"
            />
            <div class="compare">
              <div class="original">
                <app-page-original [importId]="imp.id" [page]="page" />
              </div>
              <div class="stack" data-gap="4">
                @for (category of model().categories; track $index; let c = $index) {
                  @if (hasItemsOn(category.items, page.page_index)) {
                    <section class="stack cat" data-gap="3">
                      <input
                        appInput
                        class="cat__name"
                        [id]="'cat-' + c"
                        [attr.aria-label]="categoryLabel"
                        [formField]="draft.categories[c].name"
                      />
                      @for (item of category.items; track $index; let i = $index) {
                        @if (item.page_index === page.page_index) {
                          <div
                            class="item"
                            [attr.data-uncertain]="item.uncertain.length ? '' : null"
                          >
                            @if (item.uncertain.length) {
                              <div class="row" data-gap="1">
                                @for (flag of item.uncertain; track flag) {
                                  <span class="badge" data-tone="warning">{{
                                    uncertain[flag]
                                  }}</span>
                                }
                                <button
                                  appButton
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  (click)="markChecked(c, i)"
                                >
                                  <svg lucideCheck aria-hidden="true"></svg>
                                  <ng-container i18n="@@import.checked">U redu</ng-container>
                                </button>
                              </div>
                            }
                            <div class="item__head">
                              <input
                                appInput
                                [attr.aria-label]="itemNameLabel"
                                [attr.data-missing]="!item.name.trim() ? '' : null"
                                [formField]="draft.categories[c].items[i].name"
                              />
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                [attr.aria-label]="removeItemLabel(item.name)"
                                (click)="removeItem(c, i)"
                              >
                                <svg lucideTrash2 aria-hidden="true"></svg>
                              </button>
                            </div>
                            <input
                              appInput
                              class="desc"
                              [attr.aria-label]="descriptionLabel"
                              [placeholder]="descriptionLabel"
                              [formField]="draft.categories[c].items[i].description"
                            />
                            @for (variant of item.variants; track $index; let v = $index) {
                              <div class="variant">
                                <input
                                  appInput
                                  [attr.aria-label]="sizeLabel"
                                  [placeholder]="sizeLabel"
                                  [formField]="draft.categories[c].items[i].variants[v].label"
                                />
                                <div class="price">
                                  <input
                                    appInput
                                    variant="price"
                                    type="number"
                                    step="any"
                                    inputmode="decimal"
                                    [attr.aria-label]="priceLabel"
                                    [attr.data-missing]="variant.price === null ? '' : null"
                                    [formField]="draft.categories[c].items[i].variants[v].price"
                                  />
                                  <span class="meta">{{ currency() }}</span>
                                </div>
                                @if (item.variants.length > 1) {
                                  <button
                                    appButton
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    [attr.aria-label]="removeSizeLabel"
                                    (click)="removeVariant(c, i, v)"
                                  >
                                    <svg lucideX aria-hidden="true"></svg>
                                  </button>
                                }
                                @if (variant.price_text) {
                                  <span class="printed" i18n="@@import.printed"
                                    >Na slici: {{ variant.price_text }}</span
                                  >
                                }
                              </div>
                            }
                            <div>
                              <button
                                appButton
                                variant="ghost"
                                size="sm"
                                type="button"
                                (click)="addVariant(c, i)"
                              >
                                <svg lucidePlus aria-hidden="true"></svg>
                                <ng-container i18n="@@item.addVariant">Dodaj veličinu</ng-container>
                              </button>
                            </div>
                          </div>
                        }
                      }
                      <div>
                        <button
                          appButton
                          variant="secondary"
                          size="sm"
                          type="button"
                          (click)="addItem(c, page.page_index)"
                        >
                          <svg lucidePlus aria-hidden="true"></svg>
                          <ng-container i18n="@@menu.addItem">Dodaj stavku</ng-container>
                        </button>
                      </div>
                    </section>
                  }
                }
                @if (!itemsOn(page.page_index)) {
                  <p class="meta" i18n="@@import.pageEmpty">
                    Sa ove stranice nije pročitana nijedna stavka.
                  </p>
                }
                <div>
                  <button
                    appButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    (click)="addCategory(page.page_index)"
                  >
                    <svg lucidePlus aria-hidden="true"></svg>
                    <ng-container i18n="@@menu.addCategory">Dodaj kategoriju</ng-container>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ng-template>

        <ng-template #pageHead let-page let-imp="imp">
          <div class="page-head">
            <div class="stack" data-gap="1">
              <div class="row" data-gap="2">
                <strong>{{ pageLabel(page) }}</strong>
                <span class="meta">{{ page.filename }}</span>
                <span class="badge" [attr.data-tone]="pageBadge(page).tone">{{
                  pageBadge(page).label
                }}</span>
                @if (qualityBadge(page); as q) {
                  <span class="badge" [attr.data-tone]="q.tone">{{ q.label }}</span>
                }
              </div>
              @if (page.photo_issues?.length) {
                <p class="meta">{{ issuesText(page) }}</p>
              }
              @if (page.error_code) {
                <p
                  class="meta"
                  [attr.data-tone]="page.error_code === 'temporary' ? null : 'danger'"
                >
                  {{ errorText(page) }}
                </p>
              }
              @if (suggestRetake(page)) {
                <p class="meta" i18n="@@import.retakeHint">
                  Slikaj ponovo: bliže, oštrije, bez odsjaja.
                </p>
              }
            </div>
            @if (page.status !== 'processing' && page.status !== 'queued') {
              <!-- capture opens the back camera on phones; elsewhere a file picker. -->
              <input
                #photo
                type="file"
                hidden
                capture="environment"
                [accept]="acceptPhoto"
                (change)="retake(imp, page, $event)"
              />
              <div
                class="row"
                data-gap="1"
                ngToolbar
                [softDisabled]="false"
                [attr.aria-label]="pageActionsLabel(page)"
              >
                <button
                  appButton
                  ngToolbarWidget
                  size="sm"
                  type="button"
                  [variant]="suggestRetake(page) ? 'primary' : 'secondary'"
                  [disabled]="busy()"
                  (click)="photo.click()"
                >
                  <svg lucideCamera aria-hidden="true"></svg>
                  <ng-container i18n="@@import.retake">Slikaj ponovo</ng-container>
                </button>
                @if (page.status === 'failed') {
                  <button
                    appButton
                    ngToolbarWidget
                    variant="secondary"
                    size="sm"
                    type="button"
                    [disabled]="busy()"
                    (click)="retry(imp, page)"
                  >
                    <svg lucideRotateCw aria-hidden="true"></svg>
                    <ng-container i18n="@@import.retry">Pokušaj ponovo</ng-container>
                  </button>
                }
                @if (pages().length > 1) {
                  <button
                    appButton
                    ngToolbarWidget
                    variant="ghost"
                    size="sm"
                    type="button"
                    [disabled]="busy()"
                    [attr.aria-label]="deletePageLabel(page)"
                    (click)="deletePage(imp, page)"
                  >
                    <svg lucideTrash2 aria-hidden="true"></svg>
                  </button>
                }
              </div>
            }
          </div>
        </ng-template>
      } @else if (importRes.error()) {
        <p role="alert" i18n="@@import.notFound">Uvoz nije pronađen.</p>
      } @else {
        <p class="loading" role="status" i18n="@@common.loading">Učitavanje…</p>
      }
    </div>
  `,
  styles: `
    .back {
      align-self: flex-start;
    }

    .error,
    [data-tone='danger'].meta {
      color: var(--color-danger);
    }

    progress {
      inline-size: 100%;
      block-size: var(--space-2);
      accent-color: var(--color-accent);
    }

    label[appButton] {
      cursor: pointer;
    }

    label[aria-disabled='true'] {
      opacity: 0.5;
      pointer-events: none;
    }

    label:has(input:focus-visible),
    label[appButton]:focus-visible {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem);
      align-items: start;
      gap: var(--space-6);
    }

    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .side {
      position: sticky;
      inset-block-start: var(--space-4);
    }

    .tabs {
      flex-wrap: wrap;
    }

    .dot {
      inline-size: 0.5rem;
      block-size: 0.5rem;
      border-radius: 50%;
      background: var(--color-warning);
    }

    .dot[data-tone='danger'] {
      background: var(--color-danger);
    }

    .pages {
      display: grid;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .page-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .compare {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
      align-items: start;
      gap: var(--space-5);
    }

    @media (max-width: 720px) {
      .compare {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .original {
      position: sticky;
      inset-block-start: var(--space-4);
    }

    .cat__name {
      font: var(--type-label);
      font-weight: 600;
    }

    .item {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }

    .item[data-uncertain] {
      border-color: var(--color-warning);
      box-shadow: inset 3px 0 0 var(--color-warning);
    }

    .item__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2);
    }

    input[data-missing] {
      border-color: var(--color-danger);
    }

    .desc {
      font: var(--type-meta);
    }

    .variant {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 9rem) auto;
      align-items: center;
      gap: var(--space-2);
    }

    .price {
      display: flex;
      align-items: center;
      gap: var(--space-1);
    }

    .printed {
      grid-column: 1 / -1;
      font: var(--type-meta);
      color: var(--color-text-muted);
    }

    .sum {
      display: grid;
      gap: var(--space-2);
      margin: 0;
    }

    .sum > div {
      display: flex;
      justify-content: space-between;
      font-variant-numeric: tabular-nums;
    }

    .sum dt {
      color: var(--color-text-muted);
    }

    .sum dd {
      margin: 0;
      font-weight: 600;
    }

    .sum [data-tone='warning'] dd {
      color: var(--color-warning);
    }

    .sum [data-tone='danger'] dd {
      color: var(--color-danger);
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
export default class ImportReviewPage {
  private readonly api = inject(ImportsApi);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);

  readonly importId = input.required<string>();

  protected readonly accept = ACCEPT;
  protected readonly acceptPhoto = ACCEPT_PHOTO;
  protected readonly importStatus = IMPORT_STATUS;
  protected readonly uncertain = UNCERTAIN;
  protected readonly pagesLabel = $localize`:@@import.pages:Stranice`;
  protected readonly categoryLabel = $localize`:@@category.field.name:Naziv kategorije`;
  protected readonly itemNameLabel = $localize`:@@item.field.name:Naziv`;
  protected readonly descriptionLabel = $localize`:@@item.field.description:Opis (opciono)`;
  protected readonly sizeLabel = $localize`:@@item.field.variantLabel:Veličina`;
  protected readonly priceLabel = $localize`:@@item.field.price:Cena`;
  protected readonly removeSizeLabel = $localize`:@@item.removeVariant:Ukloni veličinu`;

  protected readonly importRes = this.api.importResource(this.importId);
  protected readonly data = computed(() =>
    this.importRes.hasValue() ? this.importRes.value() : undefined,
  );
  protected readonly pages = computed(() =>
    [...(this.data()?.pages ?? [])].sort((a, b) => a.page_index - b.page_index),
  );
  protected readonly reading = computed(() => {
    const imp = this.data();
    return (
      !!imp &&
      (imp.status === 'processing' ||
        (imp.pages ?? []).some((page) => page.status === 'queued' || page.status === 'processing'))
    );
  });
  protected readonly reviewable = computed(
    () => this.data()?.status === 'ready_for_review' && !this.reading(),
  );
  protected readonly progress = computed(() => {
    const pages = this.pages();
    return {
      done: pages.filter((page) => page.status === 'done' || page.status === 'failed').length,
      total: pages.length || 1,
    };
  });

  private readonly venueId = computed(() => this.data()?.venue_id);
  private readonly venue = inject(VenuesApi).venueResource(this.venueId);
  private readonly menus = inject(MenusApi).venueMenusResource(this.venueId);
  protected readonly currency = computed(
    () => this.data()?.draft?.currency || this.venue.value()?.currency || 'RSD',
  );

  /** Selected page tab; the first page until the user picks another. */
  protected readonly tab = linkedSignal<ImportPage[], string | undefined>({
    source: this.pages,
    computation: (pages, previous) =>
      previous?.value && pages.some((page) => page.id === previous.value)
        ? previous.value
        : pages[0]?.id,
  });

  /** Local edits; reset whenever the server's draft changes (save, retake, poll). */
  protected readonly model = linkedSignal<EditDraft>(() => toEdit(this.data()?.draft));
  protected readonly draft = form(this.model, (path) => {
    applyEach(path.categories, (category) => {
      required(category.name);
      maxLength(category.name, 200);
      applyEach(category.items, (item) => {
        required(item.name);
        maxLength(item.name, 200);
        applyEach(item.variants, (variant) => {
          maxLength(variant.label, 100);
          required(variant.price);
          min(variant.price, 0);
        });
      });
    });
  });
  protected readonly summary = computed(() => summarize(this.model()));
  protected readonly dirty = computed(
    () =>
      JSON.stringify(toDraft(this.model())) !== JSON.stringify(toDraft(toEdit(this.data()?.draft))),
  );

  protected readonly targets = computed(() => [
    { value: '', label: $localize`:@@import.target.new:Novi meni (nacrt)` },
    ...(this.menus.value()?.items ?? []).map((menu) => ({ value: menu.id, label: menu.name })),
  ]);
  protected readonly targetModel = signal({
    menu: '',
    name: $localize`:@@import.defaultMenuName:Uvezeni meni`,
  });
  protected readonly target = form(this.targetModel, (path) => {
    required(path.name, { when: ({ valueOf }) => !valueOf(path.menu) });
    maxLength(path.name, 200);
  });

  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly commitProblem = signal('');

  constructor() {
    // Poll while anything is being read; stops by itself once every page is done or failed.
    effect((onCleanup) => {
      if (!this.reading()) return;
      this.data();
      const timer = setTimeout(() => this.importRes.reload(), POLL_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty()) event.preventDefault();
  }

  protected pageLabel(page: ImportPage): string {
    const n = page.page_index + 1;
    return $localize`:@@import.pageN:Stranica ${n}:number:`;
  }

  protected pageActionsLabel(page: ImportPage): string {
    const name = this.pageLabel(page);
    return $localize`:@@common.actionsFor:Akcije: ${name}:name:`;
  }

  protected deletePageLabel(page: ImportPage): string {
    const name = this.pageLabel(page);
    return $localize`:@@import.deletePage:Obriši ${name}:name:`;
  }

  protected removeItemLabel(name: string): string {
    return $localize`:@@menu.deleteItemLabel:Obriši ${name}:name:`;
  }

  protected pageBadge(page: ImportPage): { label: string; tone: string } {
    return PAGE_STATUS[page.status];
  }

  protected qualityBadge(page: ImportPage): { label: string; tone: string } | undefined {
    return page.photo_quality ? QUALITY[page.photo_quality] : undefined;
  }

  protected errorText(page: ImportPage): string {
    return page.error_code ? PAGE_ERROR[page.error_code] : '';
  }

  protected issuesText(page: ImportPage): string {
    return page.photo_issues.map((issue) => ISSUE[issue]).join(', ');
  }

  /** Partial/poor photo, or a failure that a new photo fixes. */
  protected suggestRetake(page: ImportPage): boolean {
    return (
      page.photo_quality === 'partial' ||
      page.photo_quality === 'poor' ||
      ['not_a_menu', 'no_items', 'unreadable'].includes(page.error_code)
    );
  }

  protected hasItemsOn(items: readonly EditItem[], pageIndex: number): boolean {
    return items.some((item) => item.page_index === pageIndex);
  }

  protected itemsOn(pageIndex: number): number {
    return this.model().categories.reduce(
      (sum, category) =>
        sum + category.items.filter((item) => item.page_index === pageIndex).length,
      0,
    );
  }

  protected toCheckOn(pageIndex: number): boolean {
    return this.model().categories.some((category) =>
      category.items.some(
        (item) =>
          item.page_index === pageIndex &&
          (item.uncertain.length > 0 || item.variants.some((variant) => variant.price === null)),
      ),
    );
  }

  protected markChecked(c: number, i: number): void {
    this.updateItem(c, i, (item) => ({ ...item, uncertain: [] }));
  }

  protected addItem(c: number, pageIndex: number): void {
    this.updateCategory(c, (category) => ({
      ...category,
      items: [...category.items, newItem(pageIndex)],
    }));
  }

  protected removeItem(c: number, i: number): void {
    this.updateCategory(c, (category) => ({
      ...category,
      items: category.items.filter((_, index) => index !== i),
    }));
  }

  protected addVariant(c: number, i: number): void {
    this.updateItem(c, i, (item) => ({
      ...item,
      variants: [...item.variants, { label: '', price: null, price_text: '' }],
    }));
  }

  protected removeVariant(c: number, i: number, v: number): void {
    this.updateItem(c, i, (item) => ({
      ...item,
      variants: item.variants.filter((_, index) => index !== v),
    }));
  }

  protected addCategory(pageIndex: number): void {
    this.model.update((draft) => ({
      ...draft,
      categories: [...draft.categories, { name: '', description: '', items: [newItem(pageIndex)] }],
    }));
  }

  protected async save(): Promise<boolean> {
    const imp = this.data();
    if (!imp) return false;
    return this.run(this.api.saveDraft(imp.id, toDraft(this.model())));
  }

  protected async retake(imp: MenuImport, page: ImportPage, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !(await this.saveIfDirty())) return;
    await this.run(this.api.replacePage(imp.id, page.id, file));
  }

  protected async retry(imp: MenuImport, page: ImportPage): Promise<void> {
    if (await this.saveIfDirty()) await this.run(this.api.retryPage(imp.id, page.id));
  }

  protected async deletePage(imp: MenuImport, page: ImportPage): Promise<void> {
    const name = this.pageLabel(page);
    const confirmed = await firstValueFrom(
      this.dialog.open<boolean, ConfirmDialogData>(ConfirmDialog, {
        data: {
          title: $localize`:@@import.deletePage.title:Obriši stranicu?`,
          body: $localize`:@@import.deletePage.body:${name}:name: se uklanja iz uvoza zajedno sa stavkama pročitanim sa nje.`,
          confirm: $localize`:@@import.deletePage.confirm:Obriši stranicu`,
        },
      }).closed,
    );
    if (confirmed && (await this.saveIfDirty())) {
      await this.run(this.api.deletePage(imp.id, page.id));
    }
  }

  protected async addPages(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    const imp = this.data();
    if (!imp || !files.length || !(await this.saveIfDirty())) return;
    await this.run(this.api.addPages(imp.id, files));
  }

  protected async commitImport(event: Event): Promise<void> {
    event.preventDefault();
    this.commitProblem.set('');
    const summary = this.summary();
    if (summary.missingPrices || summary.missingNames) {
      // Touch every field so the empty ones show up red.
      await submit(this.draft, async () => undefined);
      this.commitProblem.set(
        $localize`:@@import.commitBlocked:Pre uvoza popuni sve nazive i cene (označene crveno, na stranicama sa tačkom).`,
      );
      return;
    }
    await submit(this.target, async (field) => {
      const imp = this.data();
      if (!imp) return undefined;
      const { menu, name } = field().value();
      this.busy.set(true);
      try {
        if (this.dirty()) {
          this.importRes.set(
            await firstValueFrom(this.api.saveDraft(imp.id, toDraft(this.model()))),
          );
        }
        const result = await firstValueFrom(
          this.api.commit(imp.id, menu ? { menu_id: menu } : { menu_name: name.trim() }),
        );
        await this.router.navigate(['/meniji', result.menu_id]);
      } catch (error) {
        const apiError = toApiError(error);
        this.commitProblem.set(
          apiError.code === 'draft_invalid'
            ? `${$localize`:@@import.draftInvalid:Nacrt još nije spreman:`} ${apiError.message}`
            : importError(apiError.code),
        );
      } finally {
        this.busy.set(false);
      }
      return undefined;
    });
  }

  private async saveIfDirty(): Promise<boolean> {
    return this.dirty() && this.data()?.status === 'ready_for_review' ? this.save() : true;
  }

  /** Runs one change that answers with the import, and shows the new state (polling resumes if needed). */
  private async run(action: Observable<MenuImport>): Promise<boolean> {
    this.problem.set('');
    this.busy.set(true);
    try {
      this.importRes.set(await firstValueFrom(action));
      return true;
    } catch (error) {
      this.problem.set(importError(toApiError(error).code));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private updateCategory(
    c: number,
    change: (category: EditDraft['categories'][number]) => EditDraft['categories'][number],
  ): void {
    this.model.update((draft) => ({
      ...draft,
      categories: draft.categories.map((category, index) =>
        index === c ? change(category) : category,
      ),
    }));
  }

  private updateItem(c: number, i: number, change: (item: EditItem) => EditItem): void {
    this.updateCategory(c, (category) => ({
      ...category,
      items: category.items.map((item, index) => (index === i ? change(item) : item)),
    }));
  }
}

function newItem(pageIndex: number): EditItem {
  return {
    name: '',
    description: '',
    page_index: pageIndex,
    uncertain: [],
    variants: [{ label: '', price: null, price_text: '' }],
  };
}
