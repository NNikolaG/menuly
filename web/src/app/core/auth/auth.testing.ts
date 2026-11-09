import type { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Role, TokenPair, User } from '../api/api-types';
import { AuthStore } from './auth-store';

/** A valid token pair for tests; access token lives 15 minutes. */
export function tokenPair(overrides: Partial<TokenPair> = {}): TokenPair {
  const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
  return {
    token_type: 'Bearer',
    access_token: 'access-1',
    access_token_expires_at: inMs(15 * 60_000),
    refresh_token: 'refresh-1',
    refresh_token_expires_at: inMs(30 * 24 * 3600_000),
    tenant_id: 'tenant-1',
    role: 'owner',
    ...overrides,
  };
}

/** Signs in through the store and answers `/v1/me`, so pages see a role and a user. */
export async function signInAs(
  http: HttpTestingController,
  role: Role,
  user: Partial<User> = {},
  venueIds: string[] = [],
): Promise<void> {
  const done = TestBed.inject(AuthStore).login({ email: 'a@b.rs', password: 'secret123' });
  http.expectOne('/api/v1/auth/login').flush(tokenPair({ role }));
  await done;
  TestBed.tick();
  http.expectOne('/api/v1/me').flush({
    user: { id: 'u1', email: 'a@b.rs', name: 'Ana', locale: 'sr-Latn', ...user },
    tenant: { id: 'tenant-1', name: 'Zora', slug: 'zora', plan: 'free', status: 'active' },
    role,
    venue_ids: venueIds,
    memberships: [],
  });
}
