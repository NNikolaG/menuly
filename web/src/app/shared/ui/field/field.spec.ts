import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';
import { AppInput } from '../input/input';
import { AppField } from './field';

@Component({
  imports: [AppField, AppInput, FormField],
  template: `
    <app-field
      label="Email"
      controlId="email"
      hint="Na ovu adresu stiže račun."
      [field]="form.email"
    >
      <input appInput id="email" [formField]="form.email" />
    </app-field>
  `,
})
class Host {
  readonly form = form(signal({ email: '' }), (path) => required(path.email));
}

describe('AppField', () => {
  it('links the hint, and after the field is touched the error instead', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(fixture.nativeElement.querySelector('label').htmlFor).toBe('email');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBe('email-hint');

    fixture.componentInstance.form.email().markAsTouched();
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('email-error');
    expect(fixture.nativeElement.querySelector('#email-error').textContent).toContain(
      'Obavezno polje.',
    );
    expect(fixture.nativeElement.querySelector('#email-hint')).toBeNull();
  });
});
