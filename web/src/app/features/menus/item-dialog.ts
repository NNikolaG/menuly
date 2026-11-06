import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  applyEach,
  form,
  FormField,
  maxLength,
  min,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { LucidePlus, LucideX } from '@lucide/angular';
import type { ItemWithVariants } from '../../core/menus/menu';
import { ALLERGENS, DIET_TAGS, HIGHLIGHT_TAGS, labelOf } from '../../core/menus/menu-labels';
import { AppButton, AppDialog, AppField, AppInput } from '../../shared/ui';
import { toMajor } from './price';

export interface ItemDialogData {
  currency: string;
  item?: ItemWithVariants;
}

export interface VariantRow {
  /** Existing variant; absent for a new one. */
  id?: string;
  label: string;
  price: number | null;
}

export interface ItemDialogResult {
  name: string;
  description: string;
  image_url: string;
  tags: string[];
  allergens: string[];
  variants: VariantRow[];
}

/** Add or edit an item: name, description and one price, or several sizes with their prices. */
@Component({
  selector: 'app-item-dialog',
  imports: [FormField, AppDialog, AppButton, AppField, AppInput, LucidePlus, LucideX],
  template: `
    <form novalidate (submit)="onSubmit($event)">
      <app-dialog [title]="title">
        <div class="stack" data-gap="4">
          <app-field
            i18n-label="@@item.field.name"
            label="Naziv"
            controlId="item-name"
            [field]="form.name"
          >
            <input appInput id="item-name" [formField]="form.name" />
          </app-field>
          <app-field
            i18n-label="@@item.field.description"
            label="Opis (opciono)"
            controlId="item-description"
            [field]="form.description"
          >
            <textarea
              appInput
              id="item-description"
              rows="2"
              [formField]="form.description"
            ></textarea>
          </app-field>

          <app-field
            i18n-label="@@item.field.image"
            label="Slika (URL, opciono)"
            controlId="item-image"
            i18n-hint="@@item.field.imageHint"
            hint="Gost je vidi u detalju stavke i u šablonu Galerija."
            [field]="form.image_url"
          >
            <input appInput id="item-image" type="url" [formField]="form.image_url" />
          </app-field>

          @for (row of model().variants; track $index; let i = $index) {
            <div class="variant" [attr.data-multi]="model().variants.length > 1 ? '' : null">
              @if (model().variants.length > 1) {
                <app-field
                  i18n-label="@@item.field.variantLabel"
                  label="Veličina"
                  [controlId]="'item-variant-label-' + i"
                  [field]="form.variants[i].label"
                >
                  <input
                    appInput
                    [id]="'item-variant-label-' + i"
                    i18n-placeholder="@@item.field.variantLabelPlaceholder"
                    placeholder="npr. 0,5 l"
                    [formField]="form.variants[i].label"
                  />
                </app-field>
              }
              <app-field
                i18n-label="@@item.field.price"
                label="Cena"
                [controlId]="'item-variant-price-' + i"
                [suffix]="data.currency"
                [field]="form.variants[i].price"
              >
                <input
                  appInput
                  variant="price"
                  type="number"
                  step="any"
                  inputmode="decimal"
                  [id]="'item-variant-price-' + i"
                  [formField]="form.variants[i].price"
                />
              </app-field>
              @if (model().variants.length > 1) {
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  i18n-aria-label="@@item.removeVariant"
                  aria-label="Ukloni veličinu"
                  (click)="removeVariant(i)"
                >
                  <svg lucideX aria-hidden="true"></svg>
                </button>
              }
            </div>
          }
          <div>
            <button appButton variant="ghost" size="sm" type="button" (click)="addVariant()">
              <svg lucidePlus aria-hidden="true"></svg>
              <ng-container i18n="@@item.addVariant">Dodaj veličinu</ng-container>
            </button>
          </div>

          <fieldset class="stack" data-gap="2">
            <legend class="label" i18n="@@item.field.tags">Oznake</legend>
            <div class="row" data-gap="2">
              @for (option of tagOptions(); track option.key) {
                <button
                  type="button"
                  class="chip"
                  data-size="sm"
                  [attr.aria-pressed]="model().tags.includes(option.key)"
                  (click)="toggle('tags', option.key)"
                >
                  {{ option.label }}
                </button>
              }
            </div>
          </fieldset>
          <fieldset class="stack" data-gap="2">
            <legend class="label" i18n="@@item.field.allergens">Alergeni</legend>
            <div class="row" data-gap="2">
              @for (option of allergenOptions(); track option.key) {
                <button
                  type="button"
                  class="chip"
                  data-size="sm"
                  [attr.aria-pressed]="model().allergens.includes(option.key)"
                  (click)="toggle('allergens', option.key)"
                >
                  {{ option.label }}
                </button>
              }
            </div>
          </fieldset>
        </div>
        <button
          dialog-actions
          appButton
          variant="secondary"
          type="button"
          (click)="ref.close()"
          i18n="@@common.cancel"
        >
          Otkaži
        </button>
        <button dialog-actions appButton type="submit" i18n="@@common.save">Sačuvaj</button>
      </app-dialog>
    </form>
  `,
  styles: `
    fieldset {
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .label {
      padding: 0 0 var(--space-2);
      font: var(--type-label);
      color: var(--color-text);
    }

    .chip[data-size='sm'] {
      block-size: var(--control-sm);
      padding-inline: var(--space-3);
      font: var(--type-label);
    }

    /* Subgrid lines up label, control and message rows across the fields, errors or not. */
    .variant {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: repeat(3, auto);
      gap: var(--space-2) var(--space-3);
    }

    .variant[data-multi] {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    }

    .variant app-field {
      grid-row: span 3;
      grid-template-rows: subgrid;
      min-inline-size: 0;
    }

    .variant > button {
      grid-row: 2;
      grid-column: 3;
    }
  `,
})
export class ItemDialog {
  protected readonly ref = inject<DialogRef<ItemDialogResult>>(DialogRef);
  protected readonly data = inject<ItemDialogData>(DIALOG_DATA);

  protected readonly title = this.data.item
    ? $localize`:@@item.editTitle:Izmeni stavku`
    : $localize`:@@item.newTitle:Nova stavka`;

  protected readonly model = signal<ItemDialogResult>({
    name: this.data.item?.name ?? '',
    description: this.data.item?.description ?? '',
    image_url: this.data.item?.image_url ?? '',
    tags: this.data.item?.tags ?? [],
    allergens: this.data.item?.allergens ?? [],
    variants: this.data.item?.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      price: toMajor(variant.price_minor),
    })) ?? [{ label: '', price: null }],
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 200);
    pattern(path.image_url, /^(https?:\/\/\S+)?$/, {
      message: $localize`:@@menuDesign.urlInvalid:Unesi link koji počinje sa https://`,
    });
    applyEach(path.variants, (variant) => {
      maxLength(variant.label, 100);
      required(variant.price, {
        message: $localize`:@@item.field.priceRequired:Unesi cenu, npr. 250.`,
      });
      min(variant.price, 0);
    });
  });

  /** Known labels first; ones typed elsewhere (OCR, API) stay selectable so they aren't lost. */
  protected readonly tagOptions = computed(() =>
    withExtra([...DIET_TAGS, ...HIGHLIGHT_TAGS], this.data.item?.tags ?? []),
  );
  protected readonly allergenOptions = computed(() =>
    withExtra(ALLERGENS, this.data.item?.allergens ?? []),
  );

  protected toggle(key: 'tags' | 'allergens', value: string): void {
    this.model.update((model) => ({
      ...model,
      [key]: model[key].includes(value)
        ? model[key].filter((v) => v !== value)
        : [...model[key], value],
    }));
  }

  protected addVariant(): void {
    this.model.update((value) => ({
      ...value,
      variants: [...value.variants, { label: '', price: null }],
    }));
  }

  protected removeVariant(index: number): void {
    this.model.update((value) => ({
      ...value,
      variants: value.variants.filter((_, i) => i !== index),
    }));
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async (field) => {
      this.ref.close(field().value());
      return undefined;
    });
  }
}

function withExtra(
  known: readonly { key: string; label: string }[],
  current: string[],
): { key: string; label: string }[] {
  const extra = current
    .filter((value) => !known.some((option) => option.key === value))
    .map((value) => ({ key: value, label: labelOf(value) }));
  return [...known, ...extra];
}
