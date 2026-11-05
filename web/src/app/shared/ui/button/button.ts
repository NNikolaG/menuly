import { Directive, input } from '@angular/core';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger';
export type AppButtonSize = 'sm' | 'md' | 'lg';

@Directive({
  selector: 'button[appButton], a[appButton]',
  host: { '[attr.data-variant]': 'variant()', '[attr.data-size]': 'size()' },
})
export class AppButton {
  readonly variant = input<AppButtonVariant>('primary');
  readonly size = input<AppButtonSize>('md');
}
