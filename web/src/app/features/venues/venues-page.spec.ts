import { Dialog } from '@angular/cdk/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { Role } from '../../core/api/api-types';
import { AuthStore } from '../../core/auth/auth-store';
import { tokenPair } from '../../core/auth/auth.testing';
import { venueFixture } from '../../core/venues/venue.testing';
import VenuesPage from './venues-page';

describe('VenuesPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  async function signIn(role: Role): Promise<void> {
    const done = TestBed.inject(AuthStore).login({ email: 'a@b.rs', password: 'secret123' });
    http.expectOne('/api/v1/auth/login').flush(tokenPair({ role }));
    await done;
    TestBed.tick();
    http.expectOne('/api/v1/me').flush({
      user: { id: 'u1', email: 'a@b.rs', name: 'Ana', locale: 'sr-Latn' },
      tenant: { id: 'tenant-1', name: 'Zora', slug: 'zora', plan: 'free', status: 'active' },
      role,
      memberships: [],
    });
  }

  async function render(respond: () => void) {
    const fixture = TestBed.createComponent(VenuesPage);
    fixture.detectChanges();
    respond();
    await fixture.whenStable();
    return fixture;
  }

  const list = (items = [venueFixture()]) => http.expectOne('/api/v1/venues').flush({ items });

  it('shows a few venues as cards', async () => {
    const fixture = await render(() => list());
    const card = fixture.nativeElement.querySelector('.venue-card');
    expect(card.textContent).toContain('Kafana Zora');
    expect(card.querySelector('a').getAttribute('href')).toBe('/v1');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('switches to the list once there are many venues, and remembers the pick', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      venueFixture({ id: `v${i}`, name: `Objekat ${i}` }),
    );
    const fixture = await render(() => list(many));
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(9);

    const cards = [...fixture.nativeElement.querySelectorAll('[role="option"]')].find(
      (option: HTMLElement) => option.textContent?.includes('Kartice'),
    ) as HTMLElement;
    cards.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.venue-card').length).toBe(9);
    expect(localStorage.getItem('menuly.venues.view')).toBe('cards');
  });

  it('filters by name or address without diacritics', async () => {
    const fixture = await render(() =>
      list([venueFixture(), venueFixture({ id: 'v2', name: 'Bašta', address: 'Dorćol' })]),
    );
    const search: HTMLInputElement = fixture.nativeElement.querySelector('app-search input');
    search.value = 'dorcol';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const names = [...fixture.nativeElement.querySelectorAll('.venue-card .ticket__title')].map(
      (el: HTMLElement) => el.textContent?.trim(),
    );
    expect(names).toEqual(['Bašta']);
    expect(fixture.nativeElement.textContent).toContain('1 od 2');
  });

  it('lists the venues with their public link', async () => {
    localStorage.setItem('menuly.venues.view', 'list');
    const fixture = await render(() => list());
    const row = fixture.nativeElement.querySelector('tbody tr');
    expect(row.textContent).toContain('Kafana Zora');
    expect(row.textContent).toContain('Knez Mihailova 1');
    expect(row.textContent).toContain('.menuly.app/centar');
  });

  it('builds the public link from the tenant subdomain', async () => {
    await signIn('owner');
    localStorage.setItem('menuly.venues.view', 'list');
    const fixture = await render(() => list());
    expect(fixture.nativeElement.querySelector('tbody tr').textContent).toContain(
      'zora.menuly.app/centar',
    );
  });

  it('says when there are none', async () => {
    const fixture = await render(() => list([]));
    expect(fixture.nativeElement.textContent).toContain('Još nema objekata.');
  });

  it('shows an error with a retry', async () => {
    const fixture = await render(() =>
      http
        .expectOne('/api/v1/venues')
        .flush({ error: { code: 'internal', message: '' } }, { status: 500, statusText: 'Error' }),
    );
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Objekti nisu učitani.',
    );
  });

  it('lets only owners add and delete', async () => {
    await signIn('manager');
    const fixture = await render(() => list());
    expect(fixture.nativeElement.textContent).not.toContain('Dodaj objekat');
    expect(fixture.nativeElement.querySelector('button[aria-label^="Obriši"]')).toBeNull();
  });

  it('deletes after confirmation and reloads the list', async () => {
    await signIn('owner');
    vi.spyOn(TestBed.inject(Dialog), 'open').mockReturnValue({ closed: of(true) } as never);
    const fixture = await render(() => list());

    fixture.nativeElement.querySelector('button[aria-label="Obriši Kafana Zora"]').click();
    await tick();
    const request = http.expectOne('/api/v1/venues/v1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    await tick();
    TestBed.tick();
    await tick();
    list([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Još nema objekata.');
  });

  it('keeps the venue when the dialog is cancelled', async () => {
    await signIn('owner');
    vi.spyOn(TestBed.inject(Dialog), 'open').mockReturnValue({ closed: of(false) } as never);
    const fixture = await render(() => list());
    fixture.nativeElement.querySelector('button[aria-label="Obriši Kafana Zora"]').click();
    await tick();
    http.expectNone('/api/v1/venues/v1');
  });
});
