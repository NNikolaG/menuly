import type { TokenPair } from '../api/api-types';

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
