import { Component, signal } from '@angular/core';
import { form, FormField, minLength, required } from '@angular/forms/signals';
import { AppButton, AppField, AppInput, AppMenu, type AppMenuItem } from '../../shared/ui';

/** Every token, pattern and primitive variant. A primitive is done only when it is shown here. */
@Component({
  selector: 'app-design-page',
  imports: [FormField, AppButton, AppField, AppInput, AppMenu],
  template: `
    <h1 i18n="@@design.heading">Dizajn sistem</h1>

    <section>
      <h2>AppButton</h2>
      <button appButton type="button">Primary</button>
      <button appButton variant="secondary" type="button">Secondary</button>
      <button appButton type="button" disabled>Disabled</button>
      <a appButton variant="secondary" href="#">Link</a>
    </section>

    <section>
      <h2>AppField + AppInput</h2>
      <app-field label="Valid" controlId="design-valid" [field]="sample.valid">
        <input appInput id="design-valid" [formField]="sample.valid" />
      </app-field>
      <app-field label="Invalid (touched)" controlId="design-invalid" [field]="sample.invalid">
        <input appInput id="design-invalid" [formField]="sample.invalid" />
      </app-field>
    </section>

    <section>
      <h2>AppMenu</h2>
      <app-menu label="Open menu" [items]="menuItems" (selected)="lastSelected.set($event)" />
      <p>Selected: {{ lastSelected() }}</p>
    </section>
  `,
})
export default class DesignPage {
  protected readonly sample = form(signal({ valid: 'Kafana Zora', invalid: 'ab' }), (path) => {
    required(path.valid);
    minLength(path.invalid, 8);
  });
  protected readonly menuItems: AppMenuItem[] = [
    { value: 'one', label: 'First action' },
    { value: 'two', label: 'Second action' },
  ];
  protected readonly lastSelected = signal('');

  constructor() {
    this.sample.invalid().markAsTouched();
  }
}
