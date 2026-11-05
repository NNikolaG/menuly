import { computed, Directive, inject, input } from '@angular/core';
import { AppField } from '../field/field';

export type AppInputVariant = 'text' | 'price';

/** Native text input or textarea; inside `app-field` it is linked to the field's hint and error. */
@Directive({
  selector: 'input[appInput], textarea[appInput]',
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.aria-invalid]': 'field?.showErrors() || null',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class AppInput {
  readonly variant = input<AppInputVariant>('text');

  protected readonly field = inject(AppField, { optional: true });
  protected readonly describedBy = computed(() => {
    if (this.field?.showErrors()) return this.field.errorId();
    return this.field?.hint() ? this.field.hintId() : null;
  });
}
