import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { tokenPair } from '../../core/auth/auth.testing';
import { registerSerbianLatinPlurals } from '../../core/i18n/sr-latn-plurals';
import { itemFixture, menuTreeFixture } from '../../core/menus/menu.testing';
import { DEFAULT_MENU_THEME } from '../../core/menus/menu-theme';
import { venueFixture } from '../../core/venues/venue.testing';
import MenuDesignPage, { toPublicMenu } from './menu-design-page';

describe('toPublicMenu', () => {
  it('keeps only what guests see', () => {
    const tree = menuTreeFixture();
    tree.categories[0].items.push(itemFixture({ id: 'hidden', is_visible: false }));
    tree.categories.push({ ...tree.categories[0], id: 'c2', is_visible: false });
    const menu = toPublicMenu(tree, venueFixture());
    expect(menu.menu.categories.map((c) => c.id)).toEqual(['c1']);
    expect(menu.menu.categories[0].items.map((i) => i.id)).not.toContain('hidden');
  });
});

describe('MenuDesignPage', () => {
  beforeAll(() => registerSerbianLatinPlurals());
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  async function signIn(): Promise<void> {
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

  it('previews the draft and saves it', async () => {
    localStorage.clear();
    await signIn();
    const fixture = TestBed.createComponent(MenuDesignPage);
    fixture.componentRef.setInput('menuId', 'm1');
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/menus/m1').flush(menuTreeFixture());
    http.expectOne('/api/v1/menus/m1/theme').flush(DEFAULT_MENU_THEME);
    await tick();
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/venues/v1').flush(venueFixture());
    await fixture.whenStable();

    const root: HTMLElement = fixture.nativeElement;
    const view = root.querySelector('app-public-menu-view')!;
    expect(view.getAttribute('data-template')).toBe('racun');

    (root.querySelector('input[name="template"][value="tabla"]') as HTMLInputElement).click();
    await fixture.whenStable();
    expect(view.getAttribute('data-template')).toBe('tabla');
    // The board defaults an "auto" menu to dark.
    expect(view.getAttribute('data-theme')).toBe('dark');

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await tick();
    const req = http.expectOne('/api/v1/menus/m1/theme');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ template: 'tabla', color_mode: 'dark' });
    req.flush({ ...DEFAULT_MENU_THEME, template: 'tabla', color_mode: 'dark' });
    await tick();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.textContent).toContain('Sačuvano');
  });
});
