import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppDialog } from './dialog';

@Component({
  imports: [AppDialog],
  template: `
    <app-dialog title="Obriši stavku">
      Stavka se uklanja iz svih menija.
      <button dialog-actions type="button">Obriši</button>
    </app-dialog>
  `,
})
class Content {}

describe('AppDialog', () => {
  it('is labelled by its title and closes on Escape', async () => {
    const ref = TestBed.inject(Dialog).open(Content);
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const title = dialog.querySelector('h2')!;
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.textContent).toBe('Obriši stavku');

    const closed = vi.fn();
    ref.closed.subscribe(closed);
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    expect(closed).toHaveBeenCalled();
  });
});
