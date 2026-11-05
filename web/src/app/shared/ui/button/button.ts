import { Directive, input } from '@angular/core';

export type AppButtonVariant = 'primary' | 'secondary';

@Directive({
  selector: 'button[appButton], a[appButton]',
  host: { '[attr.data-variant]': 'variant()' },
})
export class AppButton {
  readonly variant = input<AppButtonVariant>('primary');
}
