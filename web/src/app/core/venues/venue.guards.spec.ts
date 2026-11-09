import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signInAs } from '../auth/auth.testing';
import { singleVenueGuard, venueAccessGuard } from './venue.guards';
import { venueFixture } from './venue.testing';

@Component({ template: '' })
class Blank {}

describe('singleVenueGuard', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'objekti', canActivate: [singleVenueGuard], component: Blank },
          { path: 'objekti/:venueId', component: Blank },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve));

  async function open(items: ReturnType<typeof venueFixture>[]): Promise<string> {
    const done = router.navigateByUrl('/objekti');
    await tick();
    TestBed.tick();
    http.expectOne('/api/v1/venues').flush({ items });
    await done;
    return router.url;
  }

  it('opens the only venue straight away', async () => {
    expect(await open([venueFixture()])).toBe('/objekti/v1');
  });

  it('shows the list when there are several or none', async () => {
    expect(await open([venueFixture(), venueFixture({ id: 'v2', name: 'Drugi' })])).toBe(
      '/objekti',
    );
  });

  it('uses the loaded list without asking again', async () => {
    await open([]);
    await router.navigateByUrl('/objekti/v9');
    await router.navigateByUrl('/objekti');
    http.expectNone('/api/v1/venues');
    expect(router.url).toBe('/objekti');
  });
});

describe('venueAccessGuard', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'objekti', component: Blank },
          { path: 'objekti/:venueId', canActivate: [venueAccessGuard], component: Blank },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => localStorage.clear());

  it('lets a limited member open only their venues', async () => {
    await signInAs(http, 'staff', {}, ['v1']);
    await router.navigateByUrl('/objekti/v1');
    expect(router.url).toBe('/objekti/v1');
    await router.navigateByUrl('/objekti/v2');
    expect(router.url).toBe('/objekti');
  });

  it('lets everyone else open any venue', async () => {
    await signInAs(http, 'manager');
    await router.navigateByUrl('/objekti/v2');
    expect(router.url).toBe('/objekti/v2');
  });
});
