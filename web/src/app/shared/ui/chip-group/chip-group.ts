import { Listbox, Option } from '@angular/aria/listbox';
import { Component, computed, input, model } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

/** Same shape as the menu label lists (`core/menus/menu-labels.ts`). */
export interface AppChipOption {
  key: string;
  label: string;
}

/**
 * Pick any number of options shown as chips (tags, allergens, filters). A multi-select
 * `@angular/aria` listbox: one tab stop, arrow keys move, Space or click toggles.
 */
@Component({
  selector: 'app-chip-group',
  imports: [Listbox, Option],
  template: `
    <div
      ngListbox
      class="group"
      orientation="horizontal"
      selectionMode="explicit"
      [multi]="true"
      [wrap]="true"
      [attr.aria-label]="label()"
      [value]="selection()"
      (valueChange)="value.set($event)"
    >
      @for (option of options(); track option.key) {
        <div
          ngOption
          class="chip"
          [attr.data-size]="size() === 'md' ? null : size()"
          [value]="option.key"
          [label]="option.label"
        >
          {{ option.label }}
        </div>
      }
    </div>
  `,
  styles: `
    .group {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    /* The focused chip shows the ring, not the whole group. */
    .group:focus-visible {
      outline: none;
    }

    .chip {
      user-select: none;
    }

    .chip[data-size='sm'] {
      block-size: var(--control-sm);
      padding-inline: var(--space-3);
      font: var(--type-label);
    }

    .chip[data-size='lg'] {
      block-size: var(--control-lg);
    }

    .chip[aria-selected='true'] {
      background: var(--color-accent);
      color: var(--color-on-accent);
      border-color: var(--color-accent);
    }

    .chip[data-active='true'] {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .group:not(:focus-within) .chip[data-active='true'] {
      outline: none;
    }
  `,
})
export class AppChipGroup implements FormValueControl<readonly string[]> {
  readonly label = input.required<string>();
  readonly options = input.required<readonly AppChipOption[]>();
  /** sm in forms and dialogs, lg for touch (public menu). */
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly value = model<readonly string[]>([]);

  protected readonly selection = computed(() => [...this.value()]);
}
