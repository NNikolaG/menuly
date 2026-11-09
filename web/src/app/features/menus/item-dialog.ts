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
import type { ItemWithVariants, MenuLanguage, Translations } from '../../core/menus/menu';
import { mergeTranslations, translationRows } from '../../core/menus/menu-languages';
import { ALLERGENS, DIET_TAGS, HIGHLIGHT_TAGS, labelOf } from '../../core/menus/menu-labels';
import { AppImageField } from '../../core/media/image-field';
import { AppButton, AppChipGroup, AppDialog, AppField, AppInput } from '../../shared/ui';
import { LanguageTabs, originalHint } from '../../core/menus/language-tabs';
import { toMajor } from './price';

export interface ItemDialogData {
  currency: string;
  /** The menu's languages besides Serbian; each gets its own tab of translations. */
  languages: MenuLanguage[];
  item?: ItemWithVariants;
}

interface VariantRow {
  /** Existing variant; absent for a new one. */
  id?: string;
  label: string;
  price: number | null;
  /** One row per menu language. */
  translations: { label: string }[];
}

interface ItemModel {
  name: string;
  description: string;
  image_url: string;
  tags: string[];
  allergens: string[];
  translations: { name: string; description: string }[];
  variants: VariantRow[];
}

export interface VariantResult {
  id?: string;
  label: string;
  price: number | null;
  translations: Translations;
}

export interface ItemDialogResult {
  name: string;
  description: string;
  image_url: string;
  tags: string[];
  allergens: string[];
  translations: Translations;
  variants: VariantResult[];
}

/** Add or edit an item: name, description and one price, or several sizes with their prices. */
@Component({
  selector: 'app-item-dialog',
  imports: [
    FormField,
    AppDialog,
    AppButton,
    AppChipGroup,
    AppField,
    AppImageField,
    AppInput,
    LanguageTabs,
    LucidePlus,
    LucideX,
  ],
  template: `
    <form novalidate (submit)="onSubmit($event)">
      <app-dialog [title]="title">
        <div class="stack" data-gap="4">
          <app-language-tabs [languages]="data.languages" [(value)]="lang" />
          @let t = langIndex();
          @if (t >= 0) {
            <app-field
              [label]="nameLabel"
              controlId="item-name-tr"
              [hint]="originalHint(model().name)"
              [field]="form.translations[t].name"
            >
              <input appInput id="item-name-tr" [formField]="form.translations[t].name" />
            </app-field>
            <app-field
              [label]="descriptionLabel"
              controlId="item-description-tr"
              [hint]="originalHint(model().description)"
              [field]="form.translations[t].description"
            >
              <textarea
                appInput
                id="item-description-tr"
                rows="2"
                [formField]="form.translations[t].description"
              ></textarea>
            </app-field>
            @if (model().variants.length > 1) {
              @for (row of model().variants; track $index; let i = $index) {
                <app-field
                  [label]="variantLabel"
                  [controlId]="'item-variant-label-tr-' + i"
                  [hint]="originalHint(row.label)"
                  [field]="form.variants[i].translations[t].label"
                >
                  <input
                    appInput
                    [id]="'item-variant-label-tr-' + i"
                    [formField]="form.variants[i].translations[t].label"
                  />
                </app-field>
              }
            }
          } @else {
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
              i18n-label="@@item.field.photo"
              label="Slika (opciono)"
              controlId="item-image"
              i18n-hint="@@item.field.imageHint"
              hint="Gost je vidi u detalju stavke i u šablonu Galerija."
              [field]="form.image_url"
            >
              <app-image-field controlId="item-image" purpose="item" [formField]="form.image_url" />
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
              <app-chip-group
                size="sm"
                [label]="tagsLabel"
                [options]="tagOptions()"
                [value]="model().tags"
                (valueChange)="setList('tags', $event)"
              />
            </fieldset>
            <fieldset class="stack" data-gap="2">
              <legend class="label" i18n="@@item.field.allergens">Alergeni</legend>
              <app-chip-group
                size="sm"
                [label]="allergensLabel"
                [options]="allergenOptions()"
                [value]="model().allergens"
                (valueChange)="setList('allergens', $event)"
              />
            </fieldset>
          }
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

  protected readonly originalHint = originalHint;
  protected readonly nameLabel = $localize`:@@item.field.name:Naziv`;
  protected readonly descriptionLabel = $localize`:@@item.field.description:Opis (opciono)`;
  protected readonly variantLabel = $localize`:@@item.field.variantLabel:Veličina`;
  /** 'sr' or a menu language code. */
  protected readonly lang = signal('sr');
  protected readonly langIndex = computed(() =>
    this.data.languages.findIndex((language) => language.code === this.lang()),
  );

  protected readonly model = signal<ItemModel>({
    name: this.data.item?.name ?? '',
    description: this.data.item?.description ?? '',
    image_url: this.data.item?.image_url ?? '',
    tags: this.data.item?.tags ?? [],
    allergens: this.data.item?.allergens ?? [],
    translations: translationRows(this.data.languages, this.data.item?.translations, [
      'name',
      'description',
    ]),
    variants: this.data.item?.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      price: toMajor(variant.price_minor),
      translations: translationRows(this.data.languages, variant.translations, ['label']),
    })) ?? [this.emptyVariant()],
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 200);
    pattern(path.image_url, /^(https?:\/\/\S+)?$/, {
      message: $localize`:@@menuDesign.urlInvalid:Unesi link koji počinje sa https://`,
    });
    applyEach(path.translations, (row) => maxLength(row.name, 200));
    applyEach(path.variants, (variant) => {
      maxLength(variant.label, 100);
      applyEach(variant.translations, (row) => maxLength(row.label, 100));
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

  protected setList(key: 'tags' | 'allergens', values: readonly string[]): void {
    this.model.update((model) => ({ ...model, [key]: [...values] }));
  }

  protected readonly tagsLabel = $localize`:@@item.field.tags:Oznake`;
  protected readonly allergensLabel = $localize`:@@item.field.allergens:Alergeni`;

  protected addVariant(): void {
    this.model.update((value) => ({
      ...value,
      variants: [...value.variants, this.emptyVariant()],
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
    // Errors live on the Serbian tab (name, prices); show it so they are visible.
    if (this.form.name().invalid() || this.form.variants().invalid()) this.lang.set('sr');
    await submit(this.form, async (field) => {
      const { translations, variants, ...value } = field().value();
      const languages = this.data.languages;
      this.ref.close({
        ...value,
        translations: mergeTranslations(this.data.item?.translations, languages, translations),
        variants: variants.map((row) => ({
          id: row.id,
          label: row.label,
          price: row.price,
          translations: mergeTranslations(
            this.data.item?.variants.find((variant) => variant.id === row.id)?.translations,
            languages,
            row.translations,
          ),
        })),
      });
      return undefined;
    });
  }

  private emptyVariant(): VariantRow {
    return {
      label: '',
      price: null,
      translations: translationRows(this.data.languages, {}, ['label']),
    };
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
