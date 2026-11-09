import { Component, computed, input, model } from '@angular/core';
import type { MenuLanguage } from './menu';
import { BASE_LANGUAGE } from './menu-languages';
import { AppSegmented } from '../../shared/ui';

/** Which language a form's text fields show: Serbian or one of the menu's languages. Hidden with none. */
@Component({
  selector: 'app-language-tabs',
  imports: [AppSegmented],
  template: `
    @if (languages().length) {
      <app-segmented [label]="label" [options]="options()" [(value)]="value" />
    }
  `,
})
export class LanguageTabs {
  readonly languages = input.required<readonly MenuLanguage[]>();
  /** 'sr' or a language code. */
  readonly value = model('sr');

  protected readonly label = $localize`:@@languages.tabs:Jezik teksta`;
  protected readonly options = computed(() =>
    [BASE_LANGUAGE, ...this.languages()].map((language) => ({
      value: language.code,
      label: language.name,
    })),
  );
}

/** Hint under a translated field: the Serbian text it translates. */
export function originalHint(text: string): string {
  return text.trim() ? $localize`:@@languages.original:Srpski: ${text}:text:` : '';
}
