import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { venueFixture } from '../../core/venues/venue.testing';
import DashboardPage from './dashboard-page';

describe('DashboardPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  async function render(items: ReturnType<typeof venueFixture>[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/v1/venues').flush({ items });
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('counts venues and suggests adding the first one', async () => {
    const page = await render([]);
    expect(page.querySelector('.stat__value')?.textContent).toBe('0');
    expect(page.textContent).toContain('Dodaj svoj prvi objekat');
  });

  it('shows the first venue once there is one', async () => {
    const page = await render([venueFixture(), venueFixture({ id: 'v2', name: 'Zora 2' })]);
    expect(page.querySelector('.stat__value')?.textContent).toBe('2');
    expect(page.textContent).toContain('Kafana Zora');
    expect(page.textContent).not.toContain('Dodaj svoj prvi objekat');
  });
});
