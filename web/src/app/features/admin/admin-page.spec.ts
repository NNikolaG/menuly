import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import AdminPage from './admin-page';

describe('AdminPage', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists businesses, opens one and changes a venue import limit', async () => {
    const fixture = TestBed.createComponent(AdminPage);
    fixture.detectChanges();
    await tick();
    http
      .match('/api/v1/admin/ocr-usage?days=30')
      .forEach((req) => req.flush({ items: [], total_cost_micros: 0 }));
    http.expectOne('/api/v1/admin/tenants').flush({
      items: [
        {
          id: 't1',
          name: 'Kafana Zora',
          slug: 'zora',
          status: 'active',
          plan: 'free',
          created_at: '2026-10-01T10:00:00Z',
          venues: 1,
          members: 2,
          imports: 3,
          ocr_cost_micros: 184300,
          views_30d: 1342,
        },
      ],
    });
    await tick();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Kafana Zora');
    expect(root.textContent).toMatch(/0,18\sUS\$/);

    (root.querySelector('button[aria-expanded]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/admin/tenants/t1').flush({
      tenant: {},
      owners: [{ id: 'u1', name: 'Nikola', email: 'n@zora.rs' }],
      venues: [
        {
          id: 'v1',
          name: 'Centar',
          slug: 'centar',
          ocr_import_limit: 3,
          imports_used: 3,
          created_at: '',
        },
      ],
    });
    await tick();
    fixture.detectChanges();
    const limit = root.querySelector('#limit-v1') as HTMLInputElement;
    limit.value = '10';
    (limit.nextElementSibling as HTMLButtonElement).click();
    await tick();
    const patch = http.expectOne('/api/v1/admin/venues/v1');
    expect(patch.request.body).toEqual({ ocr_import_limit: 10 });
    patch.flush({});
    await tick();
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/admin/tenants/t1').flush({ tenant: {}, owners: [], venues: [] });
  });
});
