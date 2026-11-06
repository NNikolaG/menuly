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
  '/v1/auth/forgot-password',
  '/v1/auth/reset-password',
];

/** What an invitation link is for (`GET /v1/public/invitations/{token}`). */
export interface InvitationInfo {
  email: string;
  role: 'manager' | 'staff';
  tenant_name: string;
  expires_at: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  /** Ask the person to sign in (true) or to pick a name and password (false). */
  has_account: boolean;
}

export interface AcceptInviteRequest {
  token: string;
  /** New account only. */
  name?: string;
  password?: string;
}

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

  /** Always 204, whether or not the email has an account. */
  forgotPassword(email: string): Observable<void> {
    return this.api.post('/v1/auth/forgot-password', { email });
  }

  /** 204; signs the user out everywhere. */
  resetPassword(token: string, password: string): Observable<void> {
    return this.api.post('/v1/auth/reset-password', { token, password });
  }

  invitationResource(token: () => string | undefined) {
    return this.api.resource<InvitationInfo>(() => {
      const value = token();
      return value ? `/v1/public/invitations/${encodeURIComponent(value)}` : undefined;
    });
  }

  /** Signed in: sends the bearer token and joins with that account. Otherwise `name` and `password` create one. */
  acceptInvite(request: AcceptInviteRequest): Observable<TokenPair & { user: User }> {
    return this.api.post('/v1/auth/accept-invite', request);
  }

  /** Loads while `tenantId()` is set and reloads when it changes (tenant switch). */
  meResource(tenantId: () => string | null) {
    return this.api.resource<Me>(() => (tenantId() ? '/v1/me' : undefined));
  }
}
