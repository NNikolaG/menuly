import { computed, Directive, inject } from '@angular/core';
import { AppField } from '../field/field';

/** Native text input; inside `app-field` it is linked to the field's error message. */
@Directive({
  selector: 'input[appInput]',
  host: {
    '[attr.aria-invalid]': 'field?.showErrors() || null',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class AppInput {
  protected readonly field = inject(AppField, { optional: true });
  protected readonly describedBy = computed(() =>
    this.field?.showErrors() ? this.field.errorId() : null,
  );
}
