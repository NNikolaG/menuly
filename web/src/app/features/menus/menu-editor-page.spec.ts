import { Dialog } from '@angular/cdk/dialog';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { Role } from '../../core/api/api-types';
import { AuthStore } from '../../core/auth/auth-store';
import { tokenPair } from '../../core/auth/auth.testing';
import type { CategoryWithItems, ItemWithVariants, MenuTree } from '../../core/menus/menu';
import { itemFixture, menuTreeFixture, variantFixture } from '../../core/menus/menu.testing';
import { venueFixture } from '../../core/venues/venue.testing';
import MenuEditorPage from './menu-editor-page';

/** The protected handlers the template calls, reached directly where a real drag is impractical. */
interface Handlers {
  moveItem(category: CategoryWithItems, event: Partial<CdkDragDrop<unknown>>): Promise<void>;
  editItem(item: ItemWithVariants): Promise<void>;
}

describe('MenuEditorPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
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

  async function render(tree: MenuTree = menuTreeFixture()) {
    const fixture = TestBed.createComponent(MenuEditorPage);
    fixture.componentRef.setInput('menuId', 'm1');
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/menus/m1').flush(tree);
    await tick();
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/venues/v1').flush(venueFixture());
    await fixture.whenStable();
    return fixture;
  }

  /** Answers the reload every change ends with. */
  async function reload(tree: MenuTree = menuTreeFixture()): Promise<void> {
    await tick();
    TestBed.tick();
    await tick();
    http.expectOne('/api/v1/menus/m1').flush(tree);
  }

  it('filters items by text and availability and turns reordering off meanwhile', async () => {
    await signIn('manager');
    const tree = menuTreeFixture();
    tree.categories[0].items[1] = { ...tree.categories[0].items[1], is_available: false };
    const fixture = await render(tree);
    const root: HTMLElement = fixture.nativeElement;
    const names = () =>
      [...root.querySelectorAll('tbody tr strong')].map((el) => el.textContent?.trim());
    expect(names()).toEqual(['Espreso', 'Kapućino']);

    const search = root.querySelector<HTMLInputElement>('app-search input')!;
    search.value = 'kapucino';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(names()).toEqual(['Kapućino']);
    expect(root.querySelector<HTMLButtonElement>('button.handle')!.disabled).toBe(true);
    expect(root.textContent).toContain('1 od 2');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    const available = [...root.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (option) => option.textContent?.trim() === 'Dostupne',
    )!;
    available.click();
    await fixture.whenStable();
    expect(names()).toEqual(['Espreso']);
  });

  it('lists categories and items with prices in the venue currency', async () => {
    await signIn('manager');
    const fixture = await render();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Topli napici');
    expect(text).toContain('Espreso');
    expect(text).toContain('RSD');
    expect(text).toContain('250');
    expect(text).toContain('Objavi meni');
  });

  it('lets staff toggle availability but not edit', async () => {
    await signIn('staff');
    const fixture = await render();
    expect(fixture.nativeElement.textContent).not.toContain('Dodaj stavku');
    expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it('flips availability at once and rolls it back when the API refuses', async () => {
    await signIn('staff');
    const fixture = await render();
    const toggle = fixture.nativeElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody tr').textContent).toContain('Nema');

    await tick();
    const request = http.expectOne('/api/v1/items/i1/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ is_available: false });
    request.flush(
      { error: { code: 'internal', message: '' } },
      { status: 500, statusText: 'Error' },
    );
    await tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('tbody tr').textContent).toContain('Dostupno');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Izmena nije sačuvana.',
    );
  });

  it('reorders items and saves the new order', async () => {
    await signIn('manager');
    const fixture = await render();
    const page = fixture.componentInstance as unknown as Handlers;
    const category = menuTreeFixture().categories[0];
    const done = page.moveItem(category, { previousIndex: 0, currentIndex: 1 });
    fixture.detectChanges();
    const names = [...fixture.nativeElement.querySelectorAll('tbody strong')].map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['Kapućino', 'Espreso']);

    await tick();
    const request = http.expectOne('/api/v1/categories/c1/items/order');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ ids: ['i2', 'i1'] });
    request.flush(null);
    await reload();
    await done;
  });

  it('saves an edited item: new variants first, removed ones last', async () => {
    await signIn('manager');
    const item = itemFixture({
      variants: [
        variantFixture({ id: 'p1', label: '0,2 l', price_minor: 20000 }),
        variantFixture({ id: 'p3', label: '0,3 l', price_minor: 25000 }),
      ],
    });
    const fixture = await render();
    vi.spyOn(TestBed.inject(Dialog), 'open').mockReturnValue({
      closed: of({
        name: 'Espreso dupli',
        description: '',
        variants: [
          { id: 'p1', label: '0,2 l', price: 220 },
          { label: '0,5 l', price: 300 },
        ],
      }),
    } as never);
    const done = (fixture.componentInstance as unknown as Handlers).editItem(item);

    await tick();
    const patch = http.expectOne('/api/v1/items/i1');
    expect(patch.request.body).toEqual({ name: 'Espreso dupli', description: '' });
    patch.flush(item);
    await tick();
    const update = http.expectOne('/api/v1/variants/p1');
    expect(update.request.body).toEqual({ label: '0,2 l', price_minor: 22000 });
    update.flush(variantFixture());
    await tick();
    const create = http.expectOne('/api/v1/items/i1/variants');
    expect(create.request.body).toEqual({ label: '0,5 l', price_minor: 30000 });
    create.flush(variantFixture());
    await tick();
    const remove = http.expectOne('/api/v1/variants/p3');
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
    await reload();
    await done;
  });

  it('moves an item with Alt+ArrowDown on its handle', async () => {
    await signIn('manager');
    const fixture = await render();
    const handle = fixture.nativeElement.querySelector('#move-i1') as HTMLButtonElement;
    expect(handle.getAttribute('aria-keyshortcuts')).toBe('Alt+ArrowUp Alt+ArrowDown');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true }));
    fixture.detectChanges();

    await tick();
    const request = http.expectOne('/api/v1/categories/c1/items/order');
    expect(request.request.body).toEqual({ ids: ['i2', 'i1'] });
    request.flush(null);
    await reload();
  });

  it('groups row actions in Aria toolbars with one tab stop each', async () => {
    await signIn('manager');
    const fixture = await render();
    const toolbar = fixture.nativeElement.querySelector(
      '[role="toolbar"][aria-label="Akcije: Espreso"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.querySelectorAll('[tabindex="0"]').length).toBe(1);
    expect(toolbar.querySelectorAll('button').length).toBe(2);
  });
});
