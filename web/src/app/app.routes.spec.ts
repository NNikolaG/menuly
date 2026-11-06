import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { APP_HOST, type AppHost } from './core/host/app-host';

describe('app routes', () => {
  function setup(host: AppHost): void {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes, withComponentInputBinding()),
        { provide: APP_HOST, useValue: host },
      ],
    });
  }

  it('serves the public menu on a tenant subdomain without sign-in', async () => {
    setup({ kind: 'tenant', tenantSlug: 'zora' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/centar');
    expect(TestBed.inject(Router).url).toBe('/centar');
    TestBed.inject(HttpTestingController).expectOne('/api/v1/public/menus/zora/centar');
  });

  it('keeps admin pages behind sign-in on the app host', async () => {
    setup({ kind: 'app' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/pregled');
    expect(TestBed.inject(Router).url).toBe('/prijava?returnUrl=%2Fpregled');
    expect(harness.routeNativeElement?.textContent).toContain('Prijava');
  });

  it('opens login and registration for guests', async () => {
    setup({ kind: 'app' });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/registracija');
    expect(TestBed.inject(Router).url).toBe('/registracija');
  });
});
