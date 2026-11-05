import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppMenu, type AppMenuItem } from './menu';

@Component({
  imports: [AppMenu],
  template: `<app-menu label="Nalog" [items]="items" (selected)="selected.set($event)" />`,
})
class Host {
  readonly items: AppMenuItem[] = [
    { value: 'a', label: 'Prva' },
    { value: 'b', label: 'Druga' },
  ];
  readonly selected = signal('');
}

describe('AppMenu', () => {
  it('opens from the trigger and emits the chosen item', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.click();
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent?.trim())).toEqual(['Prva', 'Druga']);

    items[1].click();
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('b');
  });
});
