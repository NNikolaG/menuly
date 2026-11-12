import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID, RESPONSE_INIT, type Provider } from '@angular/core';
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

  /** `extra`: what a server render adds (RESPONSE_INIT, the server PLATFORM_ID). */
  function setup(extra: Provider[] = []) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_HOST, useValue: { kind: 'tenant', tenantSlug: 'zora' } },
        ...extra,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    setup();
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

  it('draws "plakat" with numbered heads, the accent dot and the "trake" band', async () => {
    const menu = publicMenuFixture();
    menu.theme = { ...DEFAULT_MENU_THEME, template: 'plakat', pattern: 'trake' };
    menu.menu.categories[0].items[0].tags = ['preporuka'];
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    const numbers = [...root.querySelectorAll('.menu-cat__num')].map((n) => n.textContent!.trim());
    expect(numbers).toEqual(menu.menu.categories.map((_, i) => String(i + 1).padStart(2, '0')));
    expect(root.querySelectorAll('.menu-item[data-highlight]').length).toBe(1);
    expect(root.querySelector('app-stripes')).not.toBeNull();
    expect(root.querySelector('app-pattern')).toBeNull();
  });

  it('draws the "mozaik" band and turns only the featured combo into a mosaic card', async () => {
    const menu = publicMenuFixture();
    menu.theme = { ...DEFAULT_MENU_THEME, template: 'plakat', pattern: 'mozaik' };
    const promo = {
      id: 'p1',
      name: 'Doručak za dvoje',
      description: '',
      image_url: '',
      price_minor: 69000,
      regular_price_minor: 84000,
      savings_minor: 15000,
      ends_at: null,
      is_featured: true,
      is_available: true,
      slots: [],
    };
    menu.promotions = [promo, { ...promo, id: 'p2', is_featured: false }];
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.art app-mosaic')).not.toBeNull();
    const cards = [...root.querySelectorAll<HTMLElement>('.promo')];
    expect(cards.map((card) => card.hasAttribute('data-mosaic'))).toEqual([true, false]);
    expect(cards[0].querySelector('.promo__pill')!.textContent!.trim()).toBe('Kombo');
  });

  it('signs the "racun" receipt with a stamp of the venue name', async () => {
    const menu = publicMenuFixture();
    menu.theme = { ...DEFAULT_MENU_THEME, template: 'racun' };
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    const ring = root.querySelector('.stamp textPath')!;
    expect(ring.textContent).toContain(menu.venue.name.toUpperCase());
    expect(root.querySelector(ring.getAttribute('href')!)).not.toBeNull();

    menu.theme = { ...menu.theme, template: 'galerija' };
    const other = await render((url) => http.expectOne(url).flush(menu));
    expect((other.nativeElement as HTMLElement).querySelector('.stamp')).toBeNull();
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

  it('draws a geometric illustration per category only when the theme asks', async () => {
    const menu = publicMenuFixture();
    menu.theme = { ...DEFAULT_MENU_THEME, show_illustrations: true };
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('section.category .menu-cat app-category-art svg').length).toBe(
      menu.menu.categories.length,
    );

    menu.theme = { ...menu.theme, show_illustrations: false };
    const off = await render((url) => http.expectOne(url).flush(menu));
    expect((off.nativeElement as HTMLElement).querySelector('app-category-art')).toBeNull();
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

  it('gives a server render the right status: 404 for a missing menu, 503 for a failed API', async () => {
    const response: ResponseInit = {};
    setup([{ provide: RESPONSE_INIT, useValue: response }]);
    await render((url) =>
      http
        .expectOne(url)
        .flush(
          { error: { code: 'not_found', message: '' } },
          { status: 404, statusText: 'Not Found' },
        ),
    );
    expect(response.status).toBe(404);
  });

  it('asks crawlers to come back when the API fails during a server render', async () => {
    const response: ResponseInit = {};
    setup([{ provide: RESPONSE_INIT, useValue: response }]);
    await render((url) =>
      http.expectOne(url).flush(null, { status: 502, statusText: 'Bad Gateway' }),
    );
    expect(response.status).toBe(503);
    expect(response.headers).toEqual({ 'Retry-After': '30' });
  });

  it('does not count a server render as a menu open', async () => {
    setup([{ provide: PLATFORM_ID, useValue: 'server' }]);
    const fixture = await render((url) => http.expectOne(url).flush(publicMenuFixture()));
    fixture.detectChanges();
    http.expectNone('/api/v1/public/menus/zora/centar/views');
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

  it('hides the language picker when the menu has one language', async () => {
    const menu = { ...publicMenuFixture(), languages: [{ code: 'sr', name: 'Srpski' }] };
    const fixture = await render((url) => http.expectOne(url).flush(menu));
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[hreflang]')).toBeNull();
    expect(root.querySelector('.lang-pick')).toBeNull();
  });

  it('links to the other language when there are two, and offers a list for more', async () => {
    const two = {
      ...publicMenuFixture(),
      languages: [
        { code: 'sr', name: 'Srpski' },
        { code: 'de', name: 'Deutsch' },
      ],
    };
    let fixture = await render((url) => http.expectOne(url).flush(two));
    const pill = fixture.nativeElement.querySelector('.tools a[hreflang]') as HTMLAnchorElement;
    expect(pill.textContent!.trim()).toBe('DE');
    expect(pill.getAttribute('href')).toMatch(/^\/en\/.*\?lang=de$/);

    fixture.destroy();
    const three = {
      ...two,
      languages: [...two.languages, { code: 'en', name: 'English' }],
    };
    fixture = await render((url) => http.expectOne(url).flush(three));
    const options = [...fixture.nativeElement.querySelectorAll('.lang-pick option')];
    expect(options.map((option) => option.textContent.trim())).toEqual([
      'Srpski',
      'Deutsch',
      'English',
    ]);
    expect(fixture.nativeElement.querySelector('.lang-pick span').textContent).toBe('SR');
  });

  it('asks the API for the language in ?lang', async () => {
    const fixture = TestBed.createComponent(PublicMenuPage);
    fixture.componentRef.setInput('venueSlug', 'centar');
    fixture.componentRef.setInput('lang', 'de');
    fixture.detectChanges();
    http
      .expectOne(
        (req) => req.url === '/api/v1/public/menus/zora/centar' && req.params.get('lang') === 'de',
      )
      .flush({ ...publicMenuFixture(), lang: 'de' });
    await fixture.whenStable();
  });
});
