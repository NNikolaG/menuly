import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { LanguagesDialog } from './languages-dialog';

describe('LanguagesDialog', () => {
  const close = vi.fn();

  function render() {
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: [{ code: 'en', name: 'English' }] },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(LanguagesDialog);
    fixture.detectChanges();
    return fixture;
  }

  function type(root: HTMLElement, id: string, value: string) {
    const input = root.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('adds a quick pick and a custom language, refuses a bad code, and saves the list', async () => {
    const fixture = render();
    const root: HTMLElement = fixture.nativeElement;
    const button = (text: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent!.trim() === text)!;

    button('Deutsch').click();
    await fixture.whenStable();

    type(root, 'language-name', 'Português');
    type(root, 'language-code', 'Portuguese');
    button('Dodaj').click();
    await fixture.whenStable();
    expect(root.textContent).toContain('Kod je 2–3 mala slova');

    type(root, 'language-code', ' PT-BR ');
    button('Dodaj').click();
    await fixture.whenStable();

    root.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(close).toHaveBeenCalledWith([
      { code: 'en', name: 'English' },
      { code: 'de', name: 'Deutsch' },
      { code: 'pt-br', name: 'Português' },
    ]);
  });
});
