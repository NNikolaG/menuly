import { TestBed } from '@angular/core/testing';
import { AppSearchPicker } from './search-picker';

describe('AppSearchPicker', () => {
  it('finds options ignoring case and diacritics, emits the pick and clears the text', async () => {
    const fixture = TestBed.createComponent(AppSearchPicker);
    fixture.componentRef.setInput('label', 'Dodaj stavku');
    fixture.componentRef.setInput('options', [
      { value: 'i1', label: 'Ćevapi', hint: '750 RSD' },
      { value: 'i2', label: 'Đuveč' },
      { value: 'i3', label: 'Pivo' },
    ]);
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((value) => picked.push(value));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.focus();
    input.value = 'cev';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    let options = [...document.querySelectorAll('[role=option]')].map((el) =>
      el.textContent?.trim(),
    );
    expect(options).toEqual(['Ćevapi750 RSD']);

    input.value = 'djuv';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    options = [...document.querySelectorAll('[role=option]')].map((el) => el.textContent?.trim());
    expect(options).toEqual(['Đuveč']);

    (document.querySelector('[role=option]') as HTMLElement).click();
    fixture.detectChanges();
    expect(picked).toEqual(['i2']);
    expect(input.value).toBe('');
  });
});
