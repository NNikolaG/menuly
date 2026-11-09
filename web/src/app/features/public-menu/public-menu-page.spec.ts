import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { APP_HOST } from '../../core/host/app-host';
import { registerSerbianLatinPlurals } from '../../core/i18n/sr-latn-plurals';
import PublicMenuPage from './public-menu-page';
import { publicMenuFixture } from '../../core/public-menu/public-menu.testing';
import { DEFAULT_MENU_THEME } from '../../core/menus/menu-theme';

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
    sessionStorage.clear();
  });

  afterEach(() => {
    // Menu opens are counted once per tab session; tests that care check it themselves.
    http.match((req) => req.url.endsWith('/views')).forEach((req) => req.flush(null));
    http.verify();
    sessionStorage.clear();
  });

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
    expect([...root.querySelectorAll('nav .chip')].map((chip) => chip.textContent!.trim())).toEqual(
      ['Topli napici', 'Pivo'],
    );
    const names = [...root.querySelectorAll('section')[0].querySelectorAll('.menu-item__name')];
    expect(names.map((name) => name.textContent!.trim())).toEqual([
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

  it('applies the theme and filters with search', async () => {
    const menu = publicMenuFixture();
    menu.theme = { ...DEFAULT_MENU_THEME, template: 'tabla', accent: 'bordo', color_mode: 'dark' };
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    const view = root.querySelector('app-public-menu-view')!;
    expect(view.getAttribute('data-template')).toBe('tabla');
    expect(view.getAttribute('data-tenant')).toBe('bordo');
    expect(view.getAttribute('data-theme')).toBe('dark');

    const search: HTMLInputElement = root.querySelector('input[type="search"]')!;
    search.value = 'kapucino';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(
      [...root.querySelectorAll('.menu-item__name')].map((n) => n.textContent!.trim()),
    ).toEqual(['Kapućino']);
    expect(root.querySelector('nav')).toBeNull();

    // Guest switches to light.
    (root.querySelector('button[aria-pressed]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(view.getAttribute('data-theme')).toBe('light');
  });

  it('draws "etiketa" labels with codes that survive search', async () => {
    const menu = publicMenuFixture();
    menu.theme = { ...DEFAULT_MENU_THEME, template: 'etiketa' };
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    const sections = [...root.querySelectorAll<HTMLElement>('section.category')];
    expect(sections.map((s) => s.dataset['stripe'])).toEqual(
      sections.map((_, i) => String((i % 4) + 1)),
    );
    const codeOf = (name: string) =>
      [...root.querySelectorAll('.menu-item')]
        .find((item) => item.querySelector('.menu-item__name')!.textContent!.includes(name))!
        .querySelector('.menu-item__code')!
        .textContent!.trim();
    const before = codeOf('Kapućino');
    expect(before).toMatch(/^№ \d{2}\.\d{2}$/);

    const search: HTMLInputElement = root.querySelector('input[type="search"]')!;
    search.value = 'kapucino';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(codeOf('Kapućino')).toBe(before);
  });

  it('filters out sold-out items and allergens', async () => {
    const fixture = await render((url) => http.expectOne(url).flush(publicMenuFixture()));
    const root: HTMLElement = fixture.nativeElement;
    (root.querySelector('button[aria-controls="menu-filters"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    const chips = [...root.querySelectorAll<HTMLButtonElement>('#menu-filters .chip')];
    chips.find((chip) => chip.textContent!.includes('A7'))!.click();
    chips.find((chip) => chip.textContent!.includes('Samo dostupno'))!.click();
    await fixture.whenStable();
    expect(
      [...root.querySelectorAll('.menu-item__name')].map((n) => n.textContent!.trim()),
    ).toEqual(['Kapućino', 'Jelen']);
    expect(root.textContent).toContain('2 stavke');
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

  it('counts one menu open per tab session', async () => {
    const first = await render((url) => http.expectOne(url).flush(publicMenuFixture()));
    first.detectChanges();
    const count = http.expectOne('/api/v1/public/menus/zora/centar/views');
    expect(count.request.method).toBe('POST');
    count.flush(null);
    first.destroy();

    const again = await render((url) => http.expectOne(url).flush(publicMenuFixture()));
    again.detectChanges();
    http.expectNone('/api/v1/public/menus/zora/centar/views');
  });
});
