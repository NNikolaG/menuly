import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { tokenPair } from '../../core/auth/auth.testing';
import type { Menu } from '../../core/menus/menu';
import { menuTreeFixture } from '../../core/menus/menu.testing';
import { venueFixture } from '../../core/venues/venue.testing';
import VenuePage from './venue-page';

describe('VenuePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  async function signInAsOwner(): Promise<void> {
    const done = TestBed.inject(AuthStore).login({ email: 'a@b.rs', password: 'secret123' });
    http.expectOne('/api/v1/auth/login').flush(tokenPair({ role: 'owner' }));
    await done;
    TestBed.tick();
    http.expectOne('/api/v1/me').flush({
      user: { id: 'u1', email: 'a@b.rs', name: 'Ana', locale: 'sr-Latn' },
      tenant: { id: 'tenant-1', name: 'Zora', slug: 'zora', plan: 'free', status: 'active' },
      role: 'owner',
      memberships: [],
    });
  }

  async function render(menus: Menu[]) {
    const fixture = TestBed.createComponent(VenuePage);
    fixture.componentRef.setInput('venueId', 'v1');
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/venues/v1').flush(venueFixture());
    http.expectOne('/api/v1/venues/v1/menus').flush({ items: menus });
    await fixture.whenStable();
    return fixture;
  }

  it('shows the public link and the menus with their status', async () => {
    await signInAsOwner();
    const { categories: _, ...menu } = menuTreeFixture();
    const fixture = await render([menu]);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('zora.menuly.app/centar');
    expect(text).toContain('Glavni meni');
    expect(text).toContain('Nacrt');
  });

  it('creates a menu and opens it in the editor', async () => {
    await signInAsOwner();
    const fixture = await render([]);
    expect(fixture.nativeElement.textContent).toContain('Ovaj objekat još nema meni.');
    const input = fixture.nativeElement.querySelector('#new-menu-name') as HTMLInputElement;
    input.value = 'Letnji meni';
    input.dispatchEvent(new Event('input'));
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    await tick();

    const request = http.expectOne('/api/v1/venues/v1/menus');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Letnji meni' });
    request.flush({ ...menuTreeFixture(), id: 'm9' });
    await tick();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/meniji', 'm9']);
  });
});
