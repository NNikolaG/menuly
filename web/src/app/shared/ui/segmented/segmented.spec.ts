import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppSegmented, type AppSegmentedOption } from './segmented';

@Component({
  imports: [AppSegmented],
  template: `<app-segmented label="Prikaz" [options]="options" [(value)]="value" />`,
})
class Host {
  readonly options: AppSegmentedOption[] = [
    { value: 'day', label: 'Dan' },
    { value: 'week', label: 'Nedelja' },
    { value: 'month', label: 'Mesec' },
  ];
  readonly value = signal('week');
}

describe('AppSegmented', () => {
  it('marks the current value and follows arrow keys', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const listbox: HTMLElement = fixture.nativeElement.querySelector('[role="listbox"]');
    expect(listbox.getAttribute('aria-label')).toBe('Prikaz');
    expect(listbox.getAttribute('aria-orientation')).toBe('horizontal');
    const selected = () =>
      fixture.nativeElement.querySelector('[role="option"][aria-selected="true"]')?.textContent;
    expect(selected()).toBe('Nedelja');

    fixture.nativeElement.querySelector('[role="option"][aria-selected="true"]').focus();
    listbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('month');
    expect(selected()).toBe('Mesec');
  });
});
