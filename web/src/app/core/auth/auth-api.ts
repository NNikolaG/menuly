import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { Me, Tenant, TokenPair, User } from '../api/api-types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  business_name: string;
  tenant_slug?: string;
  locale?: string;
}

/** Paths that must go out without a bearer token. */
export const ANONYMOUS_AUTH_PATHS = [
  '/v1/auth/login',
  '/v1/auth/register',
  '/v1/auth/refresh',
  '/v1/auth/logout',
];

/** `/v1/auth/*` and `/v1/me`. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiClient);

  login(request: LoginRequest): Observable<TokenPair> {
    return this.api.post('/v1/auth/login', request);
  }

  register(request: RegisterRequest): Observable<TokenPair & { user: User; tenant: Tenant }> {
    return this.api.post('/v1/auth/register', request);
  }

  refresh(refreshToken: string): Observable<TokenPair> {
    return this.api.post('/v1/auth/refresh', { refresh_token: refreshToken });
  }

  logout(refreshToken: string): Observable<void> {
    return this.api.post('/v1/auth/logout', { refresh_token: refreshToken });
  }

  switchTenant(tenantId: string): Observable<TokenPair> {
    return this.api.post('/v1/auth/switch-tenant', { tenant_id: tenantId });
  }

  /** Loads while `tenantId()` is set and reloads when it changes (tenant switch). */
  meResource(tenantId: () => string | null) {
    return this.api.resource<Me>(() => (tenantId() ? '/v1/me' : undefined));
  }
}
