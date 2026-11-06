import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppSearch } from './search';

@Component({
  imports: [AppSearch],
  template: `<app-search label="Traži" [(value)]="query" />`,
})
class Host {
  readonly query = signal('');
}

describe('AppSearch', () => {
  it('updates the value as you type and clears on Escape', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.getAttribute('aria-label')).toBe('Traži');
    expect(fixture.nativeElement.querySelector('app-search').getAttribute('role')).toBe('search');

    input.value = 'kafa';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.query()).toBe('kafa');
    await fixture.whenStable();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.query()).toBe('');
    expect(input.value).toBe('');
  });
});
