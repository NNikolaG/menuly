import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppSelect, type AppSelectOption } from './select';

@Component({
  imports: [AppSelect],
  template: `<app-select label="Valuta" [options]="options" [(value)]="value" />`,
})
class Host {
  readonly options: AppSelectOption[] = [
    { value: 'RSD', label: 'RSD', hint: 'srpski dinar' },
    { value: 'EUR', label: 'EUR', hint: 'evro' },
    { value: 'BAM', label: 'BAM' },
  ];
  readonly value = signal('RSD');
}

describe('AppSelect', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const trigger = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLElement;
    return { fixture, trigger };
  }

  const key = (el: HTMLElement, k: string) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('is a named combobox showing the selected label', async () => {
    const { trigger } = await render();
    expect(trigger.getAttribute('aria-label')).toBe('Valuta');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('RSD');
  });

  it('opens with the keyboard, moves without selecting, and picks on Enter', async () => {
    const { fixture, trigger } = await render();
    trigger.focus();
    key(trigger, 'ArrowDown');
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelectorAll('[role="option"]').length).toBe(3);

    key(trigger, 'ArrowDown');
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('RSD');

    key(trigger, 'Enter');
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('EUR');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('EUR');
  });

  it('picks with a click and closes', async () => {
    const { fixture, trigger } = await render();
    trigger.click();
    await fixture.whenStable();
    const bam = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent!.includes('BAM'),
    )!;
    bam.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    bam.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('BAM');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
