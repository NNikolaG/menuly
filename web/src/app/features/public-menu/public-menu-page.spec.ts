import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { APP_HOST } from '../../core/host/app-host';
import { registerSerbianLatinPlurals } from '../../core/i18n/sr-latn-plurals';
import PublicMenuPage from './public-menu-page';
import { publicMenuFixture } from './public-menu.testing';

describe('PublicMenuPage', () => {
  // main.ts does this for the app.
  beforeAll(() => registerSerbianLatinPlurals());

  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_HOST, useValue: { kind: 'tenant', tenantSlug: 'zora' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(respond: (url: string) => void) {
    const fixture = TestBed.createComponent(PublicMenuPage);
    fixture.componentRef.setInput('venueSlug', 'centar');
    fixture.detectChanges();
    respond('/api/v1/public/menus/zora/centar');
    await fixture.whenStable();
    return fixture;
  }

  it('shows the venue, its categories and prices, unavailable items last', async () => {
    const fixture = await render((url) => http.expectOne(url).flush(publicMenuFixture()));
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')!.textContent).toContain('Kafana Zora');
    expect([...root.querySelectorAll('.chip')].map((chip) => chip.textContent!.trim())).toEqual([
      'Topli napici',
      'Pivo',
    ]);
    const names = [...root.querySelectorAll('section')[0].querySelectorAll('.menu-item__name')];
    expect(names.map((name) => name.textContent)).toEqual([
      'Espreso',
      'Kapućino',
      'Topla čokolada',
    ]);
    const last = root.querySelectorAll('section')[0].querySelectorAll('.menu-item')[2];
    expect(last.getAttribute('data-status')).toBe('unavailable');
    expect(last.textContent).toContain('Nema danas');
    // CurrencyPipe puts a no-break space before the code.
    expect(root.textContent).toMatch(/180\sRSD/);
    expect(root.textContent).toContain('veliko');
    expect(root.textContent).toContain('A7');
    expect(TestBed.inject(Title).getTitle()).toBe('Kafana Zora · Menuly');
  });

  it('counts items with the Serbian plural forms', async () => {
    const fixture = await render((url) => http.expectOne(url).flush(publicMenuFixture()));
    const counts = [...fixture.nativeElement.querySelectorAll('.menu-cat__count')].map(
      (count: Element) => count.textContent!.trim(),
    );
    expect(counts).toEqual(['3 stavke', '1 stavka']);
  });

  it('says the menu is not available on 404', async () => {
    const fixture = await render((url) =>
      http
        .expectOne(url)
        .flush(
          { error: { code: 'not_found', message: '' } },
          { status: 404, statusText: 'Not Found' },
        ),
    );
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Meni nije dostupan',
    );
  });
});
