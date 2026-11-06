import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  applyEach,
  form,
  FormField,
  max,
  maxLength,
  min,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucidePlus, LucideX } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api/api-error';
import type { MenuTree } from '../../core/menus/menu';
import { MenusApi } from '../../core/menus/menus-api';
import type { Promotion, PromotionInput } from '../../core/promotions/promotion';
import { PromotionsApi } from '../../core/promotions/promotions-api';
import { VenuesApi } from '../../core/venues/venues-api';
import { AppImageField } from '../../core/media/image-field';
import {
  AppButton,
  AppField,
  AppInput,
  AppSearchPicker,
  AppSwitch,
  type AppSelectOption,
} from '../../shared/ui';
import { STATUS } from './promotion-labels';

/** One item (or one size of it) that a slot can offer. */
export interface CatalogEntry {
  /** `itemId|variantId` (variant empty: the item's cheapest size counts). */
  key: string;
  item_id: string;
  variant_id: string | null;
  label: string;
  price_minor: number;
}

interface SlotModel {
  label: string;
  quantity: number;
  /** Catalog keys. */
  options: string[];
}

interface PromotionModel {
  name: string;
  description: string;
  image_url: string;
  price: number | null;
  /** `datetime-local` values, '' = no limit. */
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  is_featured: boolean;
  slots: SlotModel[];
}

const MAX_SLOTS = 10;
const MAX_OPTIONS = 20;

/** `/objekti/:venueId/kombo/novi` and `/objekti/:venueId/kombo/:promotionId`: build a combo from menu items. */
@Component({
  selector: 'app-promotion-form-page',
  imports: [
    CurrencyPipe,
    FormField,
    RouterLink,
    AppButton,
    AppField,
    AppImageField,
    AppInput,
    AppSearchPicker,
    AppSwitch,
    LucideArrowLeft,
    LucidePlus,
    LucideX,
  ],
  template: `
    <div class="stack" data-gap="6">
      <div class="stack" data-gap="2">
        <a appButton variant="ghost" size="sm" routerLink=".." class="back">
          <svg lucideArrowLeft aria-hidden="true"></svg>
          <ng-container i18n="@@promo.pageTitle">Kombo ponude</ng-container>
        </a>
        <div class="row" data-gap="3">
          <h1>{{ promotionId() ? editTitle : newTitle }}</h1>
          @if (promotion.value(); as p) {
            <span class="badge" [attr.data-tone]="status[p.status].tone">{{
              status[p.status].label
            }}</span>
          }
        </div>
      </div>

      @if (promotionId() && promotion.error()) {
        <p role="alert" i18n="@@promo.notFound">Ponuda nije pronađena.</p>
      } @else if (promotionId() && !promotion.hasValue()) {
        <p class="meta" i18n="@@common.loading">Učitavanje…</p>
      } @else {
        <form class="layout" novalidate (submit)="onSubmit($event)">
          <div class="stack" data-gap="6">
            <section class="card stack" data-gap="4" aria-labelledby="promo-basics">
              <h2 id="promo-basics" class="card__title" i18n="@@promo.basics">Osnovno</h2>
              <app-field
                i18n-label="@@promo.field.name"
                label="Naziv"
                controlId="promo-name"
                [field]="form.name"
              >
                <input
                  appInput
                  id="promo-name"
                  i18n-placeholder="@@promo.field.namePlaceholder"
                  placeholder="npr. Burger meni"
                  [formField]="form.name"
                />
              </app-field>
              <app-field
                i18n-label="@@item.field.description"
                label="Opis (opciono)"
                controlId="promo-description"
                [field]="form.description"
              >
                <textarea
                  appInput
                  id="promo-description"
                  rows="2"
                  [formField]="form.description"
                ></textarea>
              </app-field>
              <app-field
                i18n-label="@@item.field.photo"
                label="Slika (opciono)"
                controlId="promo-image"
                [field]="form.image_url"
              >
                <app-image-field
                  controlId="promo-image"
                  purpose="promotion"
                  [formField]="form.image_url"
                />
              </app-field>
            </section>

            <section class="stack" data-gap="4" aria-labelledby="promo-slots">
              <div class="stack" data-gap="1">
                <h2 id="promo-slots" i18n="@@promo.slots">Šta ulazi u ponudu</h2>
                <p class="meta" i18n="@@promo.slotsHint">
                  Svaki deo je jedna stavka ili izbor između više njih (npr. „Piće po izboru“).
                </p>
              </div>

              @if (catalog.error()) {
                <p role="alert" class="error" i18n="@@promo.catalogError">
                  Stavke menija nisu učitane.
                </p>
              }

              @for (slot of model().slots; track $index; let i = $index) {
                <fieldset class="card stack slot" data-gap="3">
                  <legend class="visually-hidden">{{ slotTitle(i) }}</legend>
                  <div class="slot__head">
                    <app-field
                      i18n-label="@@promo.field.slotLabel"
                      label="Naziv dela (opciono)"
                      [controlId]="'slot-label-' + i"
                      [field]="form.slots[i].label"
                    >
                      <input
                        appInput
                        [id]="'slot-label-' + i"
                        i18n-placeholder="@@promo.field.slotLabelPlaceholder"
                        placeholder="npr. Piće po izboru"
                        [formField]="form.slots[i].label"
                      />
                    </app-field>
                    <app-field
                      i18n-label="@@promo.field.quantity"
                      label="Komada"
                      [controlId]="'slot-qty-' + i"
                      [field]="form.slots[i].quantity"
                    >
                      <input
                        appInput
                        type="number"
                        inputmode="numeric"
                        [id]="'slot-qty-' + i"
                        [formField]="form.slots[i].quantity"
                      />
                    </app-field>
                    @if (model().slots.length > 1) {
                      <button
                        appButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        [attr.aria-label]="removeSlotLabel(i)"
                        (click)="removeSlot(i)"
                      >
                        <svg lucideX aria-hidden="true"></svg>
                      </button>
                    }
                  </div>

                  @if (slot.options.length) {
                    <ul class="options" [attr.aria-label]="slotTitle(i)">
                      @for (key of slot.options; track key) {
                        <li class="row" data-justify="between">
                          <span>
                            @if (!$first) {
                              <span class="meta" i18n="@@promo.orPrefix">ili</span>
                            }
                            {{ labelOf(key) }}
                          </span>
                          <span class="row" data-gap="2">
                            @if (priceOf(key); as price) {
                              <span class="meta">{{
                                price / 100 | currency: currency() : 'code' : '1.0-2'
                              }}</span>
                            }
                            <button
                              appButton
                              variant="ghost"
                              size="sm"
                              type="button"
                              [attr.aria-label]="removeOptionLabel(key)"
                              (click)="removeOption(i, key)"
                            >
                              <svg lucideX aria-hidden="true"></svg>
                            </button>
                          </span>
                        </li>
                      }
                    </ul>
                  } @else if (submitted()) {
                    <p class="error" role="alert" i18n="@@promo.slotEmpty">
                      Dodaj bar jednu stavku.
                    </p>
                  }

                  @if (slot.options.length < maxOptions) {
                    <app-search-picker
                      [controlId]="'slot-pick-' + i"
                      [label]="addOptionLabel(i)"
                      [placeholder]="
                        slot.options.length ? addChoicePlaceholder : addItemPlaceholder
                      "
                      [options]="available(slot.options)"
                      (picked)="addOption(i, $event)"
                    />
                  }
                </fieldset>
              }

              @if (model().slots.length < maxSlots) {
                <div>
                  <button appButton variant="secondary" type="button" (click)="addSlot()">
                    <svg lucidePlus aria-hidden="true"></svg>
                    <ng-container i18n="@@promo.addSlot">Dodaj deo</ng-container>
                  </button>
                </div>
              }
            </section>
          </div>

          <aside class="stack side" data-gap="4">
            <section class="card stack" data-gap="4" aria-labelledby="promo-price">
              <h2 id="promo-price" class="card__title" i18n="@@menu.col.price">Cena</h2>
              <app-field
                i18n-label="@@promo.field.price"
                label="Cena ponude"
                controlId="promo-price-input"
                [suffix]="currency()"
                [field]="form.price"
              >
                <input
                  appInput
                  variant="price"
                  type="number"
                  step="any"
                  inputmode="decimal"
                  id="promo-price-input"
                  [formField]="form.price"
                />
              </app-field>
              <dl class="sum">
                <div>
                  <dt i18n="@@promo.regular">Pojedinačno</dt>
                  <dd>{{ regular() / 100 | currency: currency() : 'code' : '1.0-2' }}</dd>
                </div>
                <div [attr.data-tone]="savings() < 0 ? 'danger' : null">
                  <dt i18n="@@promo.savingsLabel">Ušteda za gosta</dt>
                  <dd>{{ savings() / 100 | currency: currency() : 'code' : '1.0-2' }}</dd>
                </div>
              </dl>
              @if (savings() < 0) {
                <p class="meta" role="status" i18n="@@promo.pricier">
                  Ponuda je skuplja nego kad se stavke kupe pojedinačno.
                </p>
              }
              <p class="meta" i18n="@@promo.regularHint">Za izbor se računa najjeftinija stavka.</p>
            </section>

            <section class="card stack" data-gap="4" aria-labelledby="promo-when">
              <h2 id="promo-when" class="card__title" i18n="@@promo.when">Kada važi</h2>
              <app-field
                i18n-label="@@promo.field.startsAt"
                label="Od (opciono)"
                controlId="promo-starts"
                [field]="form.starts_at"
              >
                <input
                  appInput
                  type="datetime-local"
                  id="promo-starts"
                  [formField]="form.starts_at"
                />
              </app-field>
              <app-field
                i18n-label="@@promo.field.endsAt"
                label="Do (opciono)"
                controlId="promo-ends"
                [field]="form.ends_at"
              >
                <input appInput type="datetime-local" id="promo-ends" [formField]="form.ends_at" />
              </app-field>
              <label class="row" data-gap="2">
                <input type="checkbox" appSwitch [formField]="form.is_active" />
                <span i18n="@@promo.field.active">Uključena</span>
              </label>
              <label class="row" data-gap="2">
                <input type="checkbox" appSwitch [formField]="form.is_featured" />
                <span i18n="@@promo.field.featured">Istakni kao baner na meniju</span>
              </label>
            </section>

            @if (error()) {
              <p role="alert" class="error">{{ error() }}</p>
            }
            <div class="row" data-gap="2">
              <button appButton type="submit" [disabled]="form().submitting()">
                <ng-container i18n="@@common.save">Sačuvaj</ng-container>
              </button>
              <a appButton variant="secondary" routerLink=".." i18n="@@common.cancel">Otkaži</a>
            </div>
          </aside>
        </form>
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

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
      align-items: start;
      gap: var(--space-8);
    }

    @media (max-width: 960px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    .side {
      position: sticky;
      inset-block-start: var(--space-4);
    }

    fieldset {
      min-inline-size: 0;
      margin: 0;
    }

    .slot__head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 6rem auto;
      align-items: end;
      gap: var(--space-3);
    }

    .slot__head app-field {
      min-inline-size: 0;
    }

    .slot__head > button {
      grid-column: 3;
      margin-block-end: var(--space-1);
    }

    .options {
      display: grid;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .options li {
      padding-block: var(--space-1);
      border-block-end: var(--stroke-hairline) dashed var(--color-border);
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
export default class PromotionFormPage {
  private readonly api = inject(PromotionsApi);
  private readonly menusApi = inject(MenusApi);
  private readonly router = inject(Router);

  readonly venueId = input.required<string>();
  /** Absent on `novi`. */
  readonly promotionId = input<string>();

  protected readonly newTitle = $localize`:@@promo.newTitle:Nova kombo ponuda`;
  protected readonly editTitle = $localize`:@@promo.editTitle:Izmena kombo ponude`;
  protected readonly addItemPlaceholder = $localize`:@@promo.addItemPlaceholder:Potraži stavku iz menija…`;
  protected readonly addChoicePlaceholder = $localize`:@@promo.addChoicePlaceholder:Dodaj još jednu za izbor…`;
  protected readonly maxSlots = MAX_SLOTS;
  protected readonly maxOptions = MAX_OPTIONS;
  protected readonly status = STATUS;

  private readonly venue = inject(VenuesApi).venueResource(this.venueId);
  protected readonly currency = computed(() => this.venue.value()?.currency ?? 'RSD');
  protected readonly promotion = this.api.promotionResource(this.promotionId);

  /** Every item of every menu of the venue, the active menu first. */
  protected readonly catalog = rxResource({
    params: () => this.venueId(),
    stream: ({ params }) => this.menusApi.venueTrees(params),
  });
  private readonly entries = computed(() =>
    buildCatalog(
      this.catalog.hasValue() ? (this.catalog.value() ?? []) : [],
      this.venue.value()?.active_menu_id ?? null,
    ),
  );
  /** Catalog plus options of the loaded combo (an item may since have left the menus). */
  private readonly byKey = computed(() => {
    const map = new Map<string, CatalogEntry>();
    const promo = this.promotion.hasValue() ? this.promotion.value() : undefined;
    for (const slot of promo?.slots ?? []) {
      for (const option of slot.options) {
        const key = keyOf(option.item_id, option.variant_id);
        map.set(key, {
          key,
          item_id: option.item_id,
          variant_id: option.variant_id,
          label: option.variant_label
            ? `${option.item_name} ${option.variant_label}`
            : option.item_name,
          price_minor: option.price_minor,
        });
      }
    }
    for (const entry of this.entries()) map.set(entry.key, entry);
    return map;
  });

  protected readonly model = linkedSignal<PromotionModel>(() =>
    toModel(this.promotion.hasValue() ? this.promotion.value() : undefined),
  );
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 200);
    maxLength(path.description, 2000);
    pattern(path.image_url, /^(https?:\/\/\S+)?$/, {
      message: $localize`:@@menuDesign.urlInvalid:Unesi link koji počinje sa https://`,
    });
    required(path.price, { message: $localize`:@@item.field.priceRequired:Unesi cenu, npr. 250.` });
    min(path.price, 0);
    validate(path.ends_at, ({ value, valueOf }) => {
      const start = valueOf(path.starts_at);
      return value() && start && value() <= start
        ? {
            kind: 'order',
            message: $localize`:@@promo.field.endsAfter:Kraj mora biti posle početka.`,
          }
        : undefined;
    });
    applyEach(path.slots, (slot) => {
      maxLength(slot.label, 100);
      required(slot.quantity);
      min(slot.quantity, 1);
      max(slot.quantity, 20);
      validate(slot.options, ({ value }) =>
        value().length ? undefined : { kind: 'empty', message: '' },
      );
    });
  });
  protected readonly submitted = signal(false);
  protected readonly error = signal('');

  /** What the slots cost bought one by one (cheapest option of a choice), as the server counts it. */
  protected readonly regular = computed(() =>
    this.model().slots.reduce((sum, slot) => {
      const prices = slot.options
        .map((key) => this.byKey().get(key)?.price_minor)
        .filter((price): price is number => price !== undefined);
      return sum + (prices.length ? Math.min(...prices) * (slot.quantity || 1) : 0);
    }, 0),
  );
  protected readonly savings = computed(() =>
    Math.round(this.regular() - (this.model().price ?? 0) * 100),
  );

  protected labelOf(key: string): string {
    return this.byKey().get(key)?.label ?? '…';
  }

  protected priceOf(key: string): number | undefined {
    return this.byKey().get(key)?.price_minor;
  }

  /** Picker options: the catalog minus what the slot already has. */
  protected available(taken: readonly string[]): AppSelectOption[] {
    const currency = this.currency();
    const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    return this.entries()
      .filter((entry) => !taken.includes(entry.key))
      .map((entry) => ({
        value: entry.key,
        label: entry.label,
        hint: `${format.format(entry.price_minor / 100)} ${currency}`,
      }));
  }

  protected slotTitle(index: number): string {
    return $localize`:@@promo.slotTitle:Deo ${index + 1}:number:`;
  }

  protected addOptionLabel(index: number): string {
    return $localize`:@@promo.addOptionLabel:Dodaj stavku u deo ${index + 1}:number:`;
  }

  protected removeSlotLabel(index: number): string {
    return $localize`:@@promo.removeSlot:Ukloni deo ${index + 1}:number:`;
  }

  protected removeOptionLabel(key: string): string {
    const name = this.labelOf(key);
    return $localize`:@@promo.removeOption:Ukloni ${name}:name:`;
  }

  protected addSlot(): void {
    this.model.update((value) => ({ ...value, slots: [...value.slots, emptySlot()] }));
  }

  protected removeSlot(index: number): void {
    this.model.update((value) => ({ ...value, slots: value.slots.filter((_, i) => i !== index) }));
  }

  protected addOption(index: number, key: string): void {
    this.updateSlot(index, (slot) =>
      slot.options.includes(key) ? slot : { ...slot, options: [...slot.options, key] },
    );
  }

  protected removeOption(index: number, key: string): void {
    this.updateSlot(index, (slot) => ({
      ...slot,
      options: slot.options.filter((option) => option !== key),
    }));
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    this.error.set('');
    await submit(this.form, async (field) => {
      const input = this.toInput(field().value());
      const id = this.promotionId();
      try {
        await firstValueFrom(
          id ? this.api.update(id, input) : this.api.create(this.venueId(), input),
        );
        await this.router.navigate(['/objekti', this.venueId(), 'kombo']);
      } catch (error) {
        const code = toApiError(error).code;
        this.error.set(
          code === 'forbidden'
            ? $localize`:@@common.forbidden:Nemaš dozvolu za ovu radnju.`
            : code === 'validation_failed'
              ? $localize`:@@promo.invalid:Proveri stavke: neka više nije u meniju.`
              : $localize`:@@menu.saveError:Izmena nije sačuvana. Pokušaj ponovo.`,
        );
      }
      return undefined;
    });
  }

  private updateSlot(index: number, change: (slot: SlotModel) => SlotModel): void {
    this.model.update((value) => ({
      ...value,
      slots: value.slots.map((slot, i) => (i === index ? change(slot) : slot)),
    }));
  }

  private toInput(model: PromotionModel): PromotionInput {
    return {
      name: model.name.trim(),
      description: model.description.trim(),
      image_url: model.image_url.trim(),
      price_minor: Math.round((model.price ?? 0) * 100),
      starts_at: model.starts_at ? new Date(model.starts_at).toISOString() : null,
      ends_at: model.ends_at ? new Date(model.ends_at).toISOString() : null,
      is_active: model.is_active,
      is_featured: model.is_featured,
      slots: model.slots.map((slot) => ({
        label: slot.label.trim(),
        quantity: slot.quantity,
        options: slot.options.map((key) => {
          const [item_id, variant] = key.split('|');
          return { item_id, variant_id: variant || null };
        }),
      })),
    };
  }
}

export function keyOf(itemId: string, variantId: string | null): string {
  return `${itemId}|${variantId ?? ''}`;
}

/** One entry per item, or per size when an item has several; the active menu first, no duplicates. */
export function buildCatalog(
  trees: readonly MenuTree[],
  activeMenuId: string | null,
): CatalogEntry[] {
  const ordered = [...trees].sort(
    (a, b) => Number(b.id === activeMenuId) - Number(a.id === activeMenuId),
  );
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];
  const add = (entry: CatalogEntry) => {
    if (seen.has(entry.key)) return;
    seen.add(entry.key);
    entries.push(entry);
  };
  for (const tree of ordered) {
    for (const category of tree.categories) {
      for (const item of category.items) {
        if (item.variants.length <= 1) {
          add({
            key: keyOf(item.id, null),
            item_id: item.id,
            variant_id: null,
            label: item.name,
            price_minor: item.variants[0]?.price_minor ?? 0,
          });
          continue;
        }
        for (const variant of item.variants) {
          add({
            key: keyOf(item.id, variant.id),
            item_id: item.id,
            variant_id: variant.id,
            label: `${item.name} ${variant.label}`.trim(),
            price_minor: variant.price_minor,
          });
        }
      }
    }
  }
  return entries;
}

function emptySlot(): SlotModel {
  return { label: '', quantity: 1, options: [] };
}

function toModel(promo: Promotion | undefined): PromotionModel {
  return {
    name: promo?.name ?? '',
    description: promo?.description ?? '',
    image_url: promo?.image_url ?? '',
    price: promo ? promo.price_minor / 100 : null,
    starts_at: toLocalInput(promo?.starts_at ?? null),
    ends_at: toLocalInput(promo?.ends_at ?? null),
    is_active: promo?.is_active ?? true,
    is_featured: promo?.is_featured ?? false,
    slots: promo?.slots.length
      ? promo.slots.map((slot) => ({
          label: slot.label,
          quantity: slot.quantity,
          options: slot.options.map((option) => keyOf(option.item_id, option.variant_id)),
        }))
      : [emptySlot(), emptySlot()],
  };
}

/** ISO time → `datetime-local` value in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
