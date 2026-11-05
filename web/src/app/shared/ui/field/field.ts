import { Component, computed, input } from '@angular/core';
import type { FieldTree, ValidationError } from '@angular/forms/signals';

/** Label, control and validation message for one Signal Forms field. Put the control inside. */
@Component({
  selector: 'app-field',
  template: `
    <label [for]="controlId()">{{ label() }}</label>
    <ng-content />
    @if (showErrors()) {
      <p [id]="errorId()">{{ message() }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
    }
  `,
})
export class AppField {
  readonly label = input.required<string>();
  readonly controlId = input.required<string>();
  readonly field = input.required<FieldTree<unknown>>();

  readonly errorId = computed(() => `${this.controlId()}-error`);
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
