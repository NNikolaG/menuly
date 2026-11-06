import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { itemFixture, menuTreeFixture, variantFixture } from '../../core/menus/menu.testing';
import { adjust, PriceAdjustDialog } from './price-adjust-dialog';

describe('adjust', () => {
  it('follows the server: change, round to a minor unit, then to the step', () => {
    expect(adjust(18000, 'percent', 10, 1000)).toBe(20000);
    expect(adjust(22000, 'percent', 10, 0)).toBe(24200);
    expect(adjust(25000, 'amount', 30, 0)).toBe(28000);
    expect(adjust(25000, 'amount', -300, 0)).toBe(0);
  });
});

describe('PriceAdjustDialog', () => {
  const close = vi.fn();

  function render() {
    const menu = menuTreeFixture();
    menu.categories[0].items = [
      itemFixture({ variants: [variantFixture({ price_minor: 18000 })] }),
      itemFixture({
        id: 'i2',
        name: 'Čaj',
        variants: [variantFixture({ id: 'p2', price_minor: 15000 })],
      }),
    ];
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: { menu, currency: 'RSD' } },
        { provide: DialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(PriceAdjustDialog);
    fixture.detectChanges();
    return fixture;
  }

  it('previews the change and returns the request for the whole menu', async () => {
    const fixture = render();
    const input = fixture.nativeElement.querySelector('#price-value') as HTMLInputElement;
    input.value = '10';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/Menja se 2 cen/);

    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    // RSD rounds to 10 dinars by default.
    expect(close).toHaveBeenCalledWith({ round_to_minor: 1000, percent: 10 });
  });
});
