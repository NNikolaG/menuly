import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ImportPage, MenuImport } from '../../core/imports/import';
import { venueFixture } from '../../core/venues/venue.testing';
import ImportReviewPage from './import-review-page';

function page(overrides: Partial<ImportPage> = {}): ImportPage {
  return {
    id: 'pg0',
    page_index: 0,
    page_count: 1,
    status: 'done',
    attempts: 1,
    error: '',
    error_code: '',
    filename: 'menu.jpg',
    mime: 'image/jpeg',
    photo_quality: 'good',
    photo_issues: [],
    ...overrides,
  };
}

function importFixture(overrides: Partial<MenuImport> = {}): MenuImport {
  return {
    id: 'im1',
    venue_id: 'v1',
    status: 'ready_for_review',
    error: '',
    draft_edited: false,
    committed_menu_id: null,
    created_at: '2026-11-06T10:00:00Z',
    updated_at: '2026-11-06T10:00:00Z',
    committed_at: null,
    draft: {
      currency: 'RSD',
      categories: [
        {
          name: 'Roštilj',
          description: '',
          items: [
            {
              name: 'Pljeskavica',
              description: '',
              page_index: 0,
              uncertain: ['price'],
              variants: [{ label: '', price_minor: null, price_text: '7?0' }],
            },
          ],
        },
      ],
    },
    pages: [page()],
    ...overrides,
  };
}

describe('ImportReviewPage', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    http.verify();
  });

  async function render(imp: MenuImport) {
    const fixture = TestBed.createComponent(ImportReviewPage);
    fixture.componentRef.setInput('importId', 'im1');
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/v1/imports/im1').flush(imp);
    await tick();
    fixture.detectChanges();
    http.expectOne('/api/v1/venues/v1').flush(venueFixture());
    http.expectOne('/api/v1/venues/v1/menus').flush({ items: [] });
    await tick();
    fixture.detectChanges();
    return fixture;
  }

  it('polls while pages are being read and then shows the review', async () => {
    const fixture = await render(
      importFixture({ status: 'processing', draft: null, pages: [page({ status: 'processing' })] }),
    );
    expect(fixture.nativeElement.textContent).toContain('Prepoznajem stavke i cene');
    // The scanner shows the page being read.
    http
      .expectOne('/api/v1/imports/im1/pages/pg0/file')
      .flush(new Blob(['x'], { type: 'image/jpeg' }));

    // The poll waits 2 s between requests.
    await new Promise((resolve) => setTimeout(resolve, 2100));
    http.expectOne('/api/v1/imports/im1').flush(importFixture());
    await tick();
    fixture.detectChanges();

    // Watched it being read: the receipt stays up, stamped, until the user moves on.
    const go = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLElement) =>
      button.textContent?.includes('Pregledaj i ispravi'),
    ) as HTMLButtonElement;
    expect(go).toBeTruthy();
    go.click();
    await tick();
    fixture.detectChanges();
    await tick();
    fixture.detectChanges();
    http
      .expectOne('/api/v1/imports/im1/pages/pg0/file')
      .flush(new Blob(['x'], { type: 'image/jpeg' }));
    await tick();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Proveri cenu');
    expect(text).toContain('Na slici: 7?0');
    expect(fixture.nativeElement.querySelector('[role=tab]')?.textContent).toContain('Stranica 1');
  });

  it('blocks the import while a price is missing, then saves and commits', async () => {
    const fixture = await render(importFixture());
    http
      .expectOne('/api/v1/imports/im1/pages/pg0/file')
      .flush(new Blob(['x'], { type: 'image/jpeg' }));
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit'));
    await tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form [role=alert]')?.textContent).toContain(
      'popuni sve nazive i cene',
    );

    const price = fixture.nativeElement.querySelector('input[data-missing]') as HTMLInputElement;
    price.value = '790';
    price.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));
    await tick();

    const save = http.expectOne('/api/v1/imports/im1/draft');
    expect(save.request.method).toBe('PUT');
    expect(save.request.body.categories[0].items[0].variants[0].price_minor).toBe(79000);
    save.flush(importFixture());
    await tick();
    const commit = http.expectOne('/api/v1/imports/im1/commit');
    expect(commit.request.body).toEqual({ menu_name: 'Uvezeni meni' });
    commit.flush({
      import: importFixture({ status: 'committed' }),
      menu_id: 'm9',
      items_created: 1,
    });
    await tick();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/meniji', 'm9']);
  });
});
