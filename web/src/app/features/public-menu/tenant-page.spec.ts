import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_HOST } from '../../core/host/app-host';
import type { PublicTenant } from '../../core/public-menu/public-tenant';
import TenantPage from './tenant-page';

describe('TenantPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: APP_HOST, useValue: { kind: 'tenant', tenantSlug: 'zora' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function venue(slug: string, name: string): PublicTenant['venues'][number] {
    return {
      slug,
      name,
      type: 'restaurant',
      address: 'Knez Mihailova 1',
      city: 'Beograd',
      languages: ['sr'],
      updated_at: '2026-11-05T10:00:00Z',
    };
  }

  async function render(venues: PublicTenant['venues']) {
    const fixture = TestBed.createComponent(TenantPage);
    fixture.detectChanges();
    http
      .expectOne('/api/v1/public/tenants/zora')
      .flush({ tenant: { name: 'Zora d.o.o.', slug: 'zora' }, venues });
    await fixture.whenStable();
    return fixture;
  }

  it('lists the venues with links to their menus', async () => {
    const fixture = await render([venue('centar', 'Zora Centar'), venue('dorcol', 'Zora Dorćol')]);
    const links = [...fixture.nativeElement.querySelectorAll('a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/centar', '/dorcol']);
    expect(links[0].textContent).toContain('Zora Centar');
    expect(links[0].textContent).toContain('Knez Mihailova 1, Beograd');
  });

  it('goes straight to the menu of a single venue', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await render([venue('centar', 'Zora Centar')]);
    expect(navigate).toHaveBeenCalledWith(['/', 'centar'], { replaceUrl: true });
  });
});
