import { booleanAttribute, Directive, input } from '@angular/core';

export type AppButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'danger';
export type AppButtonSize = 'sm' | 'md' | 'lg';

@Directive({
  selector: 'button[appButton], a[appButton]',
  host: {
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.data-loading]': 'loading() ? "" : null',
    '[attr.aria-busy]': 'loading() || null',
  },
})
export class AppButton {
  readonly variant = input<AppButtonVariant>('primary');
  readonly size = input<AppButtonSize>('md');
  /** Spinner over the label while work runs; the label keeps the button's width. Keep `[disabled]` too. */
  readonly loading = input(false, { transform: booleanAttribute });
}
