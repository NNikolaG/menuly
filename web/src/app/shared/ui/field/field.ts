import { Component, computed, input } from '@angular/core';
import type { FieldTree, ValidationError } from '@angular/forms/signals';

/** Label, control, hint and validation message for one Signal Forms field. Put the control inside. */
@Component({
  selector: 'app-field',
  template: `
    <label [for]="controlId()" [id]="controlId() + '-label'">{{ label() }}</label>
    <div class="control" [attr.data-suffix]="suffix() ? '' : null">
      <ng-content />
      @if (suffix()) {
        <span class="suffix" aria-hidden="true">{{ suffix() }}</span>
      }
    </div>
    @if (showErrors()) {
      <p class="message" [id]="errorId()" data-tone="danger">{{ message() }}</p>
    } @else if (hint()) {
      <p class="message" [id]="hintId()">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
      min-inline-size: var(--field-min-width);
    }

    label {
      font: var(--type-label);
      color: var(--color-text);
    }

    .control {
      position: relative;
      display: flex;
      align-items: center;
    }

    .control[data-suffix] {
      --suffix-space: var(--space-12);
    }

    .suffix {
      position: absolute;
      inset-inline-end: var(--space-3);
      font: var(--type-meta);
      letter-spacing: var(--tracking-mono);
      color: var(--color-text-subtle);
      pointer-events: none;
    }

    .message {
      font: var(--type-body-sm);
      color: var(--color-text-muted);
    }

    .message[data-tone='danger'] {
      color: var(--color-danger);
    }
  `,
})
export class AppField {
  readonly label = input.required<string>();
  readonly controlId = input.required<string>();
  readonly field = input.required<FieldTree<unknown>>();
  readonly hint = input<string>();
  /** Unit shown inside the control's end, e.g. `RSD` for a price. */
  readonly suffix = input<string>();

  readonly errorId = computed(() => `${this.controlId()}-error`);
  readonly hintId = computed(() => `${this.controlId()}-hint`);
  readonly showErrors = computed(() => {
    const state = this.field()();
    return state.touched() && state.invalid();
  });
  protected readonly message = computed(() => errorMessage(this.field()().errors()[0]));
}

function errorMessage(error: ValidationError | undefined): string {
  if (!error) return '';
  if (error.message) return error.message;
  switch (error.kind) {
    case 'required':
      return $localize`:@@ui.field.required:Obavezno polje.`;
    case 'email':
      return $localize`:@@ui.field.email:Unesite ispravnu email adresu.`;
    case 'minLength': {
      const count = (error as ValidationError & { minLength: number }).minLength;
      return $localize`:@@ui.field.minLength:Unesite najmanje ${count}:count: karaktera.`;
    }
    default:
      return $localize`:@@ui.field.invalid:Neispravna vrednost.`;
  }
}
