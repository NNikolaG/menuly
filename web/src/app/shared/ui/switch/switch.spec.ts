import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { AppSwitch } from './switch';

@Component({
  imports: [AppSwitch, FormField],
  template: `<label
    ><input type="checkbox" appSwitch [formField]="form.available" /> Dostupno</label
  >`,
})
class Host {
  readonly form = form(signal({ available: false }));
}

describe('AppSwitch', () => {
  it('is a switch that toggles the bound boolean', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.getAttribute('role')).toBe('switch');

    input.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.form.available().value()).toBe(true);
  });
});
