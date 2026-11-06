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

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  async function render(items: ReturnType<typeof venueFixture>[]): Promise<HTMLElement> {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    http.expectOne('/api/v1/venues').flush({ items });
    await tick();
    fixture.detectChanges();
    if (items.length) {
      http.expectOne(`/api/v1/venues/${items[0].id}/stats?days=30`).flush({
        days: [
          { date: '2026-11-05', views: 3 },
          { date: '2026-11-06', views: 9 },
        ],
        total: 12,
      });
    }
    await fixture.whenStable();
    http.verify();
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
    // Menu opens of the first venue: total, one bar per day and the same numbers in a hidden table.
    expect(page.querySelectorAll('.stat__value')[1]?.textContent).toBe('12');
    expect(page.querySelectorAll('app-views-chart .bar')).toHaveLength(2);
    expect(page.querySelector('app-views-chart table')?.textContent).toContain('9');
  });
});
