import { Listbox, Option } from '@angular/aria/listbox';
import { Component, computed, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

export interface AppSegmentedOption {
  value: string;
  label: string;
}

/** One choice out of a few, shown side by side. Arrow keys move the selection (`@angular/aria` listbox). */
@Component({
  selector: 'app-segmented',
  imports: [Listbox, Option],
  template: `
    <div
      ngListbox
      orientation="horizontal"
      selectionMode="follow"
      [attr.aria-label]="label()"
      [value]="selection()"
      (valueChange)="value.set($event[0] ?? value())"
    >
      @for (option of options(); track option.value) {
        <div ngOption [value]="option.value" [label]="option.label">{{ option.label }}</div>
      }
    </div>
  `,
  styles: `
    [ngListbox] {
      display: inline-flex;
      gap: var(--space-half);
      padding: calc(var(--space-1) - var(--stroke-hairline));
      background: var(--color-surface-sunken);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-sm);
    }

    [ngOption] {
      display: inline-flex;
      align-items: center;
      block-size: var(--size-segment);
      padding-inline: var(--space-3);
      border-radius: var(--radius-sm-inner);
      color: var(--color-text-muted);
      font: var(--type-segment);
      cursor: pointer;
      user-select: none;
    }

    [ngOption][aria-selected='true'] {
      background: var(--color-surface);
      color: var(--color-text);
      box-shadow:
        var(--shadow-sm),
        inset 0 0 0 var(--stroke-hairline) var(--color-border);
    }
  `,
})
export class AppSegmented implements FormValueControl<string> {
  readonly label = input.required<string>();
  readonly options = input.required<readonly AppSegmentedOption[]>();
  readonly value = model('');

  protected readonly selection = computed(() => [this.value()]);
}
