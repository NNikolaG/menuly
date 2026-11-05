import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from './auth-store';
import { tokenPair } from './auth.testing';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    const login = TestBed.inject(AuthStore).login({ email: 'a@b.rs', password: 'secret123' });
    http.expectOne('/api/v1/auth/login').flush(tokenPair());
    await login;
  });

  afterEach(() => localStorage.clear());

  /** The interceptor awaits the token before sending, so let that microtask run. */
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  it('adds the bearer token to API calls', async () => {
    const response = firstValueFrom(client.get('/api/v1/venues'));
    await tick();
    const request = http.expectOne('/api/v1/venues');
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    request.flush({ items: [] });
    await expect(response).resolves.toEqual({ items: [] });
  });

  it('leaves non-API and anonymous auth calls alone', () => {
    client.get('/assets/x.json').subscribe();
    client.post('/api/v1/auth/refresh', {}).subscribe();
    expect(http.expectOne('/assets/x.json').request.headers.has('Authorization')).toBe(false);
    expect(http.expectOne('/api/v1/auth/refresh').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const response = firstValueFrom(client.get('/api/v1/venues/1'));
    await tick();
    http.expectOne('/api/v1/venues/1').flush(null, { status: 401, statusText: 'Unauthorized' });
    await tick();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush(tokenPair({ access_token: 'access-2', refresh_token: 'refresh-2' }));
    await tick();
    const retry = http.expectOne('/api/v1/venues/1');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
    retry.flush({ ok: true });
    await expect(response).resolves.toEqual({ ok: true });
  });
});
