import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import VenuesPage from './venues-page';
import type { Venue } from './venue';

const venue: Venue = {
  id: 'v1',
  tenant_id: 't1',
  name: 'Kafana Zora',
  slug: 'centar',
  address: 'Knez Mihailova 1',
  phone: '',
  currency: 'RSD',
  timezone: 'Europe/Belgrade',
  opening_hours: {},
  ocr_import_limit: 3,
  created_at: '2026-11-05T10:00:00Z',
  updated_at: '2026-11-05T10:00:00Z',
};

describe('VenuesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function render(respond: (url: string) => void): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(VenuesPage);
    fixture.detectChanges();
    respond('/api/v1/venues');
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('lists the venues', async () => {
    const page = await render((url) => http.expectOne(url).flush({ items: [venue] }));
    expect(page.querySelector('h2')?.textContent).toBe('Kafana Zora');
    expect(page.textContent).toContain('Knez Mihailova 1');
  });

  it('says when there are none', async () => {
    const page = await render((url) => http.expectOne(url).flush({ items: [] }));
    expect(page.textContent).toContain('Još nema objekata.');
  });

  it('shows an error with a retry', async () => {
    const page = await render((url) =>
      http
        .expectOne(url)
        .flush({ error: { code: 'internal', message: '' } }, { status: 500, statusText: 'Error' }),
    );
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Objekti nisu učitani.');
    expect(page.querySelector('button')?.textContent).toContain('Pokušaj ponovo');
  });
});
