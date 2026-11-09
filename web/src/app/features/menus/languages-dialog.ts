import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { LucidePlus, LucideX } from '@lucide/angular';
import type { MenuLanguage } from '../../core/menus/menu';
import { BASE_LANGUAGE, COMMON_LANGUAGES, LANGUAGE_CODE } from '../../core/menus/menu-languages';
import { AppButton, AppDialog, AppField, AppInput } from '../../shared/ui';

/** Same limit as the API. */
const MAX_LANGUAGES = 10;

/**
 * Languages a menu offers besides Serbian. Guests get a language picker only when there is more
 * than one; the dialog closes with the new list.
 */
@Component({
  selector: 'app-languages-dialog',
  imports: [FormField, AppDialog, AppButton, AppField, AppInput, LucidePlus, LucideX],
  template: `
    <form novalidate (submit)="save($event)">
      <app-dialog [title]="title">
        <div class="stack" data-gap="6">
          <p class="meta" i18n="@@languages.intro">
            Srpski je osnovni jezik menija. Za svaki dodat jezik upisuješ prevode u kategorijama,
            stavkama i kombo ponudama. Gost bira jezik samo kad meni ima više od jednog.
          </p>

          <ul class="list" role="list">
            <li class="row" data-justify="between">
              <span class="row" data-gap="2">
                <strong>{{ base.name }}</strong>
                <span class="meta">{{ base.code }}</span>
              </span>
              <span class="badge" i18n="@@languages.base">Osnovni</span>
            </li>
            @for (language of languages(); track language.code) {
              <li class="row" data-justify="between">
                <span class="row" data-gap="2">
                  <strong>{{ language.name }}</strong>
                  <span class="meta">{{ language.code }}</span>
                </span>
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  [attr.aria-label]="removeLabel(language.name)"
                  (click)="remove(language.code)"
                >
                  <svg lucideX aria-hidden="true"></svg>
                </button>
              </li>
            }
          </ul>

          @if (full()) {
            <p class="meta" i18n="@@languages.full">Meni može imati najviše 10 dodatnih jezika.</p>
          } @else {
            @if (suggestions().length) {
              <div class="stack" data-gap="2">
                <span class="label" i18n="@@languages.quickAdd">Dodaj jezik</span>
                <div class="row wrap" data-gap="2">
                  @for (language of suggestions(); track language.code) {
                    <button
                      appButton
                      variant="secondary"
                      size="sm"
                      type="button"
                      (click)="add(language)"
                    >
                      <svg lucidePlus aria-hidden="true"></svg>
                      {{ language.name }}
                    </button>
                  }
                </div>
              </div>
            }

            <fieldset class="stack" data-gap="2">
              <legend class="label" i18n="@@languages.custom">Drugi jezik</legend>
              <div class="custom">
                <app-field
                  i18n-label="@@languages.field.name"
                  label="Naziv za goste"
                  controlId="language-name"
                  [field]="customForm.name"
                >
                  <input
                    appInput
                    id="language-name"
                    i18n-placeholder="@@languages.field.namePlaceholder"
                    placeholder="npr. Português"
                    [formField]="customForm.name"
                  />
                </app-field>
                <app-field
                  i18n-label="@@languages.field.code"
                  label="Kod"
                  controlId="language-code"
                  [field]="customForm.code"
                >
                  <input
                    appInput
                    id="language-code"
                    i18n-placeholder="@@languages.field.codePlaceholder"
                    placeholder="npr. pt"
                    autocapitalize="off"
                    [formField]="customForm.code"
                  />
                </app-field>
                <button appButton variant="secondary" type="button" (click)="addCustom()">
                  <svg lucidePlus aria-hidden="true"></svg>
                  <ng-container i18n="@@languages.add">Dodaj</ng-container>
                </button>
              </div>
              <p class="meta" i18n="@@languages.codeHint">
                Kod od 2–3 mala slova (en, de, pt), po potrebi sa regionom: pt-br.
              </p>
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
      padding: 0;
      font: var(--type-label);
      color: var(--color-text);
    }

    .list {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .list li {
      min-block-size: 2.5rem;
      border-block-end: 1px solid var(--color-border);
    }

    .wrap {
      flex-wrap: wrap;
    }

    /* Subgrid keeps both inputs and the button on one line, errors or not. */
    .custom {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
      grid-template-rows: repeat(3, auto);
      gap: var(--space-2) var(--space-3);
    }

    .custom app-field {
      grid-row: span 3;
      grid-template-rows: subgrid;
      min-inline-size: 0;
    }

    .custom > button {
      grid-row: 2;
      grid-column: 3;
    }
  `,
})
export class LanguagesDialog {
  protected readonly ref = inject<DialogRef<MenuLanguage[]>>(DialogRef);
  protected readonly base = BASE_LANGUAGE;
  protected readonly title = $localize`:@@languages.title:Jezici menija`;

  protected readonly languages = signal<MenuLanguage[]>([...inject<MenuLanguage[]>(DIALOG_DATA)]);
  protected readonly full = computed(() => this.languages().length >= MAX_LANGUAGES);
  protected readonly suggestions = computed(() =>
    COMMON_LANGUAGES.filter((common) => !this.has(common.code)),
  );

  private readonly custom = signal({ name: '', code: '' });
  protected readonly customForm = form(this.custom, (path) => {
    required(path.name);
    maxLength(path.name, 40);
    required(path.code);
    pattern(path.code, LANGUAGE_CODE, {
      message: $localize`:@@languages.codeInvalid:Kod je 2–3 mala slova, npr. pt ili pt-br.`,
    });
    validate(path.code, ({ value }) =>
      this.has(value()) || value() === BASE_LANGUAGE.code
        ? {
            kind: 'taken',
            message: $localize`:@@languages.codeTaken:Ovaj jezik je već dodat.`,
          }
        : undefined,
    );
  });

  protected removeLabel(name: string): string {
    return $localize`:@@languages.remove:Ukloni ${name}:name:`;
  }

  protected add(language: MenuLanguage): void {
    if (this.full() || this.has(language.code)) return;
    this.languages.update((list) => [...list, language]);
  }

  protected remove(code: string): void {
    this.languages.update((list) => list.filter((language) => language.code !== code));
  }

  protected async addCustom(): Promise<void> {
    this.custom.update((value) => ({
      name: value.name.trim(),
      code: value.code.trim().toLowerCase(),
    }));
    await submit(this.customForm, async (field) => {
      this.add(field().value());
      this.customForm().reset({ name: '', code: '' });
      return undefined;
    });
  }

  protected save(event: Event): void {
    event.preventDefault();
    this.ref.close(this.languages());
  }

  private has(code: string): boolean {
    return this.languages().some((language) => language.code === code);
  }
}
