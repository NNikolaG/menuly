import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { applyEach, form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import type { Category, MenuLanguage, Translations } from '../../core/menus/menu';
import { mergeTranslations, translationRows } from '../../core/menus/menu-languages';
import { AppButton, AppDialog, AppField, AppInput } from '../../shared/ui';
import { LanguageTabs, originalHint } from '../../core/menus/language-tabs';

export interface CategoryDialogData {
  /** Absent when adding. */
  category?: Category;
  /** The menu's languages besides Serbian; each gets its own tab of translations. */
  languages: MenuLanguage[];
}

export interface CategoryDialogResult {
  name: string;
  description: string;
  translations: Translations;
}

/** Add or edit a category's name and description, in Serbian and each menu language. */
@Component({
  selector: 'app-category-dialog',
  imports: [FormField, AppDialog, AppButton, AppField, AppInput, LanguageTabs],
  template: `
    <form novalidate (submit)="onSubmit($event)">
      <app-dialog [title]="title">
        <div class="stack" data-gap="4">
          <app-language-tabs [languages]="data.languages" [(value)]="lang" />
          @let i = langIndex();
          @if (i >= 0) {
            <app-field
              [label]="nameLabel"
              controlId="category-name-tr"
              [hint]="originalHint(model().name)"
              [field]="form.translations[i].name"
            >
              <input appInput id="category-name-tr" [formField]="form.translations[i].name" />
            </app-field>
            <app-field
              [label]="descriptionLabel"
              controlId="category-description-tr"
              [hint]="originalHint(model().description)"
              [field]="form.translations[i].description"
            >
              <textarea
                appInput
                id="category-description-tr"
                rows="2"
                [formField]="form.translations[i].description"
              ></textarea>
            </app-field>
          } @else {
            <app-field
              i18n-label="@@category.field.name"
              label="Naziv kategorije"
              controlId="category-name"
              [field]="form.name"
            >
              <input
                appInput
                id="category-name"
                i18n-placeholder="@@category.field.namePlaceholder"
                placeholder="npr. Topli napici"
                [formField]="form.name"
              />
            </app-field>
            <app-field
              i18n-label="@@category.field.description"
              label="Opis (opciono)"
              controlId="category-description"
              [field]="form.description"
            >
              <textarea
                appInput
                id="category-description"
                rows="2"
                [formField]="form.description"
              ></textarea>
            </app-field>
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
})
export class CategoryDialog {
  protected readonly ref = inject<DialogRef<CategoryDialogResult>>(DialogRef);
  protected readonly data = inject<CategoryDialogData>(DIALOG_DATA);
  private readonly category = this.data.category;

  protected readonly nameLabel = $localize`:@@category.field.name:Naziv kategorije`;
  protected readonly descriptionLabel = $localize`:@@category.field.description:Opis (opciono)`;
  protected readonly originalHint = originalHint;
  /** 'sr' or a menu language code. */
  protected readonly lang = signal('sr');
  protected readonly langIndex = computed(() =>
    this.data.languages.findIndex((language) => language.code === this.lang()),
  );

  protected readonly title = this.category
    ? $localize`:@@category.editTitle:Izmeni kategoriju`
    : $localize`:@@category.newTitle:Nova kategorija`;
  protected readonly model = signal({
    name: this.category?.name ?? '',
    description: this.category?.description ?? '',
    translations: translationRows(this.data.languages, this.category?.translations, [
      'name',
      'description',
    ]),
  });
  protected readonly form = form(this.model, (path) => {
    required(path.name);
    maxLength(path.name, 200);
    applyEach(path.translations, (row) => maxLength(row.name, 200));
  });

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.form.name().invalid()) this.lang.set('sr');
    await submit(this.form, async (field) => {
      const value = field().value();
      this.ref.close({
        name: value.name,
        description: value.description,
        translations: mergeTranslations(
          this.category?.translations,
          this.data.languages,
          value.translations,
        ),
      });
      return undefined;
    });
  }
}
