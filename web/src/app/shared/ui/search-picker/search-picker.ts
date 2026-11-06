import { Combobox, ComboboxPopup, ComboboxWidget } from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, input, output, signal } from '@angular/core';
import { LucideSearch } from '@lucide/angular';
import { matchesQuery } from '../../text/fold';
import type { AppSelectOption } from '../select/select';

/** Shows at most this many matches; typing narrows the list. */
const LIMIT = 50;

/**
 * Type to find, Enter or click to add: an `@angular/aria` editable combobox (`<input>`) with a filtered listbox
 * popup. Emits `picked` with the option's value and clears the text, so it can add one thing after another
 * (e.g. items to a combo slot). For a single stored value use `AppSelect`.
 */
@Component({
  selector: 'app-search-picker',
  imports: [
    Combobox,
    ComboboxPopup,
    ComboboxWidget,
    Listbox,
    Option,
    CdkConnectedOverlay,
    LucideSearch,
  ],
  template: `
    <div class="control" #origin>
      <svg lucideSearch class="icon" aria-hidden="true"></svg>
      <input
        ngCombobox
        #combobox="ngCombobox"
        class="input"
        [id]="controlId() || null"
        [attr.aria-label]="label()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [(value)]="query"
        [(expanded)]="open"
      />
    </div>
    <ng-template ngComboboxPopup [combobox]="combobox">
      <ng-template
        [cdkConnectedOverlay]="{ origin, usePopover: 'inline' }"
        [cdkConnectedOverlayOpen]="true"
        [cdkConnectedOverlayPositions]="positions"
        cdkConnectedOverlayTransformOriginOn=".popover"
        [cdkConnectedOverlayMinWidth]="width()"
        (attach)="width.set(origin.getBoundingClientRect().width)"
      >
        <div
          ngComboboxWidget
          ngListbox
          #listbox="ngListbox"
          class="panel popover"
          focusMode="activedescendant"
          selectionMode="explicit"
          [activeDescendant]="listbox.activeDescendant()"
          [value]="[]"
          (valueChange)="pick($event[0])"
        >
          @for (option of matches(); track option.value) {
            <div ngOption class="option" [value]="option.value" [label]="option.label">
              <span>{{ option.label }}</span>
              @if (option.hint) {
                <span class="hint">{{ option.hint }}</span>
              }
            </div>
          } @empty {
            <p class="empty">{{ emptyText() }}</p>
          }
        </div>
      </ng-template>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      min-inline-size: var(--field-min-width);
    }

    .control {
      position: relative;
      display: flex;
      align-items: center;
    }

    .icon {
      position: absolute;
      inset-inline-start: var(--space-3);
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
      color: var(--color-text-subtle);
      pointer-events: none;
    }

    .input {
      inline-size: 100%;
      block-size: var(--control-md);
      padding-inline: calc(var(--space-3) * 2 + var(--size-icon-sm)) var(--space-3);
      border: var(--stroke-hairline) solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      font: var(--type-body);
    }

    .input:focus-visible {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .input::placeholder {
      color: var(--color-text-subtle);
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-half);
      max-block-size: 18rem;
      overflow-y: auto;
      padding: var(--space-1);
    }

    .option {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      min-block-size: var(--size-nav-item);
      padding-inline: var(--space-3);
      border-radius: var(--radius-sm);
      font: var(--type-body);
      cursor: pointer;
    }

    .option:hover,
    .option[data-active='true'] {
      background: var(--color-surface-hover);
    }

    .hint {
      margin-inline-start: auto;
      font: var(--type-meta);
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .empty {
      padding: var(--space-2) var(--space-3);
      font: var(--type-meta);
      color: var(--color-text-muted);
    }
  `,
})
export class AppSearchPicker {
  readonly options = input.required<readonly AppSelectOption[]>();
  /** Accessible name; there is no visible label inside. */
  readonly label = input.required<string>();
  readonly controlId = input('');
  readonly placeholder = input('');
  readonly emptyText = input($localize`:@@common.noMatches:Nema rezultata.`);
  readonly disabled = input(false);
  readonly picked = output<string>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly width = signal(0);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  /** Case- and diacritic-insensitive match on every word ("cev" finds "Ćevapi"). */
  protected readonly matches = computed(() => {
    const query = this.query();
    const found = this.options().filter((option) => matchesQuery(query, option.label, option.hint));
    return found.slice(0, LIMIT);
  });

  protected pick(value: string | undefined): void {
    if (value === undefined) return;
    this.picked.emit(value);
    this.query.set('');
    this.open.set(false);
  }
}
