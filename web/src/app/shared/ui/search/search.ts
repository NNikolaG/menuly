import { Component, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { LucideSearch } from '@lucide/angular';
import { AppInput } from '../input/input';

/** Search box of a list's filter bar: filters as you type; Escape clears it. */
@Component({
  selector: 'app-search',
  imports: [AppInput, LucideSearch],
  host: { role: 'search' },
  template: `
    <svg lucideSearch aria-hidden="true"></svg>
    <input
      appInput
      type="search"
      autocomplete="off"
      [attr.aria-label]="label()"
      [placeholder]="label()"
      [value]="value()"
      (input)="value.set($any($event.target).value)"
      (keydown.escape)="value.set('')"
    />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      flex: 1 1 14rem;
      max-inline-size: 24rem;
    }

    svg {
      position: absolute;
      inset-inline-start: var(--space-3);
      inset-block-start: 50%;
      translate: 0 -50%;
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
      color: var(--color-text-subtle);
      pointer-events: none;
    }

    input {
      inline-size: 100%;
      padding-inline-start: calc(var(--space-3) * 2 + var(--size-icon-sm));
    }
  `,
})
export class AppSearch implements FormValueControl<string> {
  /** Accessible name and placeholder, e.g. "Traži objekat". */
  readonly label = input.required<string>();
  readonly value = model('');
}
