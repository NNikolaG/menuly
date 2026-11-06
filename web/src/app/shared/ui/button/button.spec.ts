import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppButton } from './button';

@Component({
  imports: [AppButton],
  template: `<button appButton type="submit" [disabled]="busy()" [loading]="busy()">
    Sačuvaj
  </button>`,
})
class Host {
  readonly busy = signal(false);
}

describe('AppButton', () => {
  it('marks itself busy while loading and keeps its label for screen readers', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-busy')).toBeNull();

    fixture.componentInstance.busy.set(true);
    await fixture.whenStable();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.hasAttribute('data-loading')).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Sačuvaj');
  });
});
