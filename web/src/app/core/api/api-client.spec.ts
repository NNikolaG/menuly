import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, ApiClient } from './api-client';
import { ApiError } from './api-error';

describe('ApiClient', () => {
  let api: ApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test' },
      ],
    });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  it('prefixes paths with the base URL and drops empty query values', async () => {
    const response = firstValueFrom(
      api.get('/v1/venues', { q: 'zora', page: 2, tag: null, sort: undefined }),
    );
    const request = http.expectOne((req) => req.url === 'https://api.test/v1/venues');
    expect(request.request.params.keys()).toEqual(['q', 'page']);
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ items: [] });
    await expect(response).resolves.toEqual({ items: [] });
  });

  it('fails writes with ApiError carrying the API code', async () => {
    const response = firstValueFrom(api.post('/v1/venues', { name: 'Zora' }));
    http
      .expectOne('https://api.test/v1/venues')
      .flush(
        { error: { code: 'slug_taken', message: 'slug taken' } },
        { status: 409, statusText: 'Conflict' },
      );
    const error = await response.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'slug_taken' });
  });

  it('maps a request that never got an answer to the network code', async () => {
    const response = firstValueFrom(api.delete('/v1/venues/1'));
    http.expectOne('https://api.test/v1/venues/1').error(new ProgressEvent('error'));
    await expect(response).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('resource stays idle without a request and reloads when its signals change', async () => {
    const id = signal<string | undefined>(undefined);
    const resource = runInInjectionContext(TestBed.inject(Injector), () =>
      api.resource<{ id: string }>(() => (id() ? `/v1/venues/${id()}` : undefined)),
    );
    TestBed.tick();
    http.expectNone(() => true);

    id.set('a');
    TestBed.tick();
    http.expectOne('https://api.test/v1/venues/a').flush({ id: 'a' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toEqual({ id: 'a' });

    id.set('b');
    TestBed.tick();
    http.expectOne('https://api.test/v1/venues/b').flush({ id: 'b' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toEqual({ id: 'b' });
  });

  it('resource does not refetch when its signals change but the request stays the same', async () => {
    const parent = signal({ venueId: 'a', name: 'Meni' });
    runInInjectionContext(TestBed.inject(Injector), () =>
      api.resource(() => ({ path: `/v1/venues/${parent().venueId}`, query: { page: 1 } })),
    );
    TestBed.tick();
    http.expectOne('https://api.test/v1/venues/a?page=1').flush({});
    await TestBed.inject(ApplicationRef).whenStable();

    parent.set({ venueId: 'a', name: 'Drugi meni' });
    TestBed.tick();
    http.expectNone(() => true);
  });
});
