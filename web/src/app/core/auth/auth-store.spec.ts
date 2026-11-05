import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { tokenPair } from './auth.testing';

describe('AuthStore', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => localStorage.clear());

  async function signIn(pair = tokenPair()): Promise<void> {
    const done = store.login({ email: 'a@b.rs', password: 'secret123' });
    http.expectOne('/api/v1/auth/login').flush(pair);
    await done;
  }

  it('stores and persists the session on login', async () => {
    await signIn();
    expect(store.isAuthenticated()).toBe(true);
    expect(store.role()).toBe('owner');
    expect(JSON.parse(localStorage.getItem('menuly.session') ?? '{}').refreshToken).toBe(
      'refresh-1',
    );
  });

  it('returns the current access token while it is fresh', async () => {
    await signIn();
    await expect(store.accessToken()).resolves.toBe('access-1');
  });

  it('refreshes an expiring access token once for concurrent callers', async () => {
    await signIn(
      tokenPair({ access_token_expires_at: new Date(Date.now() + 1_000).toISOString() }),
    );
    const first = store.accessToken();
    const second = store.accessToken();
    const request = http.expectOne('/api/v1/auth/refresh');
    expect(request.request.body).toEqual({ refresh_token: 'refresh-1' });
    request.flush(tokenPair({ access_token: 'access-2', refresh_token: 'refresh-2' }));
    await expect(first).resolves.toBe('access-2');
    await expect(second).resolves.toBe('access-2');
  });

  it('signs out and sends the user to login when the refresh token is rejected', async () => {
    await signIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const result = store.refresh();
    http
      .expectOne('/api/v1/auth/refresh')
      .flush(
        { error: { code: 'invalid_refresh_token', message: '' } },
        { status: 401, statusText: 'Unauthorized' },
      );
    await expect(result).resolves.toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('menuly.session')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/prijava'], { queryParams: { returnUrl: '/' } });
  });

  it('revokes the refresh token on logout', async () => {
    await signIn();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const done = store.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await done;
    expect(store.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/prijava');
  });
});
