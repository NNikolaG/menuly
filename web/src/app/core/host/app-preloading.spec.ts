import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { APP_HOST, type AppHost } from './app-host';
import { AppPreloading } from './app-preloading';

function strategy(host: AppHost): AppPreloading {
  TestBed.configureTestingModule({ providers: [{ provide: APP_HOST, useValue: host }] });
  return TestBed.inject(AppPreloading);
}

describe('AppPreloading', () => {
  it('preloads every route on the app host except opted-out ones', async () => {
    const preloading = strategy({ kind: 'app' });
    const load = vi.fn(() => of('loaded'));
    expect(await firstValueFrom(preloading.preload({ path: 'tim' }, load))).toBe('loaded');
    expect(
      await firstValueFrom(preloading.preload({ path: 'design', data: { preload: false } }, load)),
    ).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('preloads nothing on a tenant subdomain', async () => {
    const preloading = strategy({ kind: 'tenant', tenantSlug: 'kafana' });
    const load = vi.fn(() => of('loaded'));
    expect(await firstValueFrom(preloading.preload({ path: 'tim' }, load))).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
