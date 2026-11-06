import { Combobox, ComboboxPopup, ComboboxWidget } from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, input, model, signal } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { LucideCheck, LucideChevronDown } from '@lucide/angular';

export interface AppSelectOption {
  value: string;
  label: string;
  /** Short text on the right, e.g. a currency symbol. */
  hint?: string;
}

/**
 * Pick one value from a list. An `@angular/aria` combobox on a non-input host (select-only) with a listbox popup
 * (keyboard, typeahead, `aria-activedescendant`), positioned by the CDK overlay.
 * Works with Signal Forms: `<app-select [formField]="form.currency" … />`.
 */
@Component({
  selector: 'app-select',
  imports: [
    Combobox,
    ComboboxPopup,
    ComboboxWidget,
    Listbox,
    Option,
    CdkConnectedOverlay,
    LucideCheck,
    LucideChevronDown,
  ],
  host: { '(focusout)': 'touched.set(true)' },
  template: `
    <div
      ngCombobox
      #combobox="ngCombobox"
      [(expanded)]="open"
      #origin
      class="trigger"
      [id]="controlId()"
      [disabled]="disabled()"
      [attr.aria-labelledby]="controlId() ? controlId() + '-label' : null"
      [attr.aria-label]="label() || null"
      [attr.aria-invalid]="invalid() || null"
      [attr.data-placeholder]="selected() ? null : ''"
    >
      <span class="text">{{ selected()?.label ?? placeholder() }}</span>
      <svg lucideChevronDown class="chevron" aria-hidden="true"></svg>
    </div>
    <ng-template ngComboboxPopup [combobox]="combobox">
      <ng-template
        [cdkConnectedOverlay]="{ origin, usePopover: 'inline' }"
        [cdkConnectedOverlayOpen]="true"
        [cdkConnectedOverlayPositions]="positions"
        [cdkConnectedOverlayMinWidth]="width()"
        (attach)="width.set(origin.getBoundingClientRect().width)"
      >
        <div
          ngComboboxWidget
          ngListbox
          #listbox="ngListbox"
          class="panel"
          focusMode="activedescendant"
          selectionMode="explicit"
          [activeDescendant]="listbox.activeDescendant()"
          [value]="selection()"
          (valueChange)="pick($event[0])"
        >
          @for (option of options(); track option.value) {
            <div ngOption class="option" [value]="option.value" [label]="option.label">
              <span>{{ option.label }}</span>
              @if (option.hint) {
                <span class="hint">{{ option.hint }}</span>
              }
              <svg lucideCheck class="check" aria-hidden="true"></svg>
            </div>
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

    .trigger {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      block-size: var(--control-md);
      padding-inline: var(--space-3);
      border: var(--stroke-hairline) solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      font: var(--type-body);
      cursor: pointer;
      user-select: none;
    }

    .trigger:focus-visible {
      outline: var(--stroke-focus) solid var(--color-focus);
      outline-offset: var(--stroke-focus);
    }

    .trigger[aria-invalid='true'] {
      border-color: var(--color-danger);
    }

    .trigger[aria-disabled='true'] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .trigger[data-placeholder] .text {
      color: var(--color-text-subtle);
    }

    .text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chevron {
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
      color: var(--color-text-muted);
      transition: rotate var(--duration-base);
    }

    .trigger[aria-expanded='true'] .chevron {
      rotate: 180deg;
    }

    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-half);
      max-block-size: 18rem;
      overflow-y: auto;
      padding: var(--space-1);
      background: var(--color-surface-raised);
      color: var(--color-text);
      border: var(--stroke-hairline) solid var(--color-border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
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
    }

    .check {
      inline-size: var(--size-icon-sm);
      block-size: var(--size-icon-sm);
      visibility: hidden;
    }

    .hint + .check {
      margin-inline-start: 0;
    }

    .option > span:first-child + .check {
      margin-inline-start: auto;
    }

    .option[aria-selected='true'] .check {
      visibility: visible;
    }
  `,
})
export class AppSelect implements FormValueControl<string> {
  readonly options = input.required<readonly AppSelectOption[]>();
  /** Same id as `<app-field controlId>`: the field's label (`{controlId}-label`) names the select. */
  readonly controlId = input<string>();
  /** Accessible name when there is no AppField around it. */
  readonly label = input('');
  readonly placeholder = input('');

  readonly value = model('');
  readonly touched = model(false);
  readonly disabled = input(false);
  readonly invalid = input(false);

  protected readonly selection = computed(() => (this.value() ? [this.value()] : []));
  protected readonly selected = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );
  protected readonly width = signal(0);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  protected readonly open = signal(false);

  protected pick(value: string | undefined): void {
    if (value === undefined) return;
    this.value.set(value);
    this.open.set(false);
  }
}
