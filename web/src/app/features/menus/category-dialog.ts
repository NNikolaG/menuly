import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required, submit } from '@angular/forms/signals';
import type { Category } from '../../core/menus/menu';
import { AppButton, AppDialog, AppField, AppInput } from '../../shared/ui';

export interface CategoryDialogResult {
  name: string;
  description: string;
}

/** Add (no data) or edit (a category) a category's name and description. */
@Component({
  selector: 'app-category-dialog',
  imports: [FormField, AppDialog, AppButton, AppField, AppInput],
  template: `
    <form novalidate (submit)="onSubmit($event)">
      <app-dialog [title]="title">
        <div class="stack" data-gap="4">
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
  private readonly category =
    inject<Category | undefined>(DIALOG_DATA, { optional: true }) ?? undefined;

  protected readonly title = this.category
    ? $localize`:@@category.editTitle:Izmeni kategoriju`
    : $localize`:@@category.newTitle:Nova kategorija`;
  protected readonly form = form(
    signal({ name: this.category?.name ?? '', description: this.category?.description ?? '' }),
    (path) => {
      required(path.name);
      maxLength(path.name, 200);
    },
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.form, async (field) => {
      this.ref.close(field().value());
      return undefined;
    });
  }
}
