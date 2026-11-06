import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppChipGroup } from './chip-group';

@Component({
  imports: [AppChipGroup],
  template: `<app-chip-group label="Alergeni" [options]="options" [(value)]="value" />`,
})
class Host {
  readonly options = [
    { key: 'gluten', label: 'Gluten' },
    { key: 'jaja', label: 'Jaja' },
    { key: 'riba', label: 'Riba' },
  ];
  readonly value = signal<readonly string[]>(['jaja']);
}

describe('AppChipGroup', () => {
  it('is a named multi-select listbox reflecting the value', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const listbox = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox.getAttribute('aria-label')).toBe('Alergeni');
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true');
    const selected = [...listbox.querySelectorAll('[aria-selected="true"]')].map((option) =>
      option.textContent!.trim(),
    );
    expect(selected).toEqual(['Jaja']);
  });

  it('toggles options on click without dropping the others', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const options = [...fixture.nativeElement.querySelectorAll('[role="option"]')] as HTMLElement[];
    for (const index of [2, 1]) {
      options[index].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      options[index].click();
      await fixture.whenStable();
    }
    expect(fixture.componentInstance.value()).toEqual(['riba']);
  });
});
