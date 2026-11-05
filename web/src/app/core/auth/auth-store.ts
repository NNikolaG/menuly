import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { Me, Role, Tenant, TokenPair, User } from '../api/api-types';

interface Session {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  tenantId: string;
  role: Role;
}

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

const STORAGE_KEY = 'menuly.session';
/** Refresh this long before the access token expires, so a request never leaves with a dying token. */
const EXPIRY_MARGIN_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readSession());
  private refreshing: Promise<string | null> | null = null;

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly role = computed(() => this.session()?.role ?? null);
  readonly tenantId = computed(() => this.session()?.tenantId ?? null);

  /** Current user, tenant and memberships; reloads when the tenant changes. */
  readonly me = httpResource<Me>(() => (this.tenantId() ? { url: '/api/v1/me' } : undefined));

  async login(request: LoginRequest): Promise<void> {
    this.setSession(await firstValueFrom(this.http.post<TokenPair>('/api/v1/auth/login', request)));
  }

  async register(request: RegisterRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TokenPair & { user: User; tenant: Tenant }>('/api/v1/auth/register', request),
    );
    this.setSession(response);
  }

  async switchTenant(tenantId: string): Promise<void> {
    this.setSession(
      await firstValueFrom(
        this.http.post<TokenPair>('/api/v1/auth/switch-tenant', { tenant_id: tenantId }),
      ),
    );
    await this.router.navigateByUrl('/');
  }

  async logout(): Promise<void> {
    const refreshToken = this.session()?.refreshToken;
    this.setSession(null);
    if (refreshToken) {
      await firstValueFrom(
        this.http.post('/api/v1/auth/logout', { refresh_token: refreshToken }),
      ).catch(() => undefined);
    }
    await this.router.navigateByUrl('/prijava');
  }

  /** A usable access token, refreshing first when it is about to expire; null when signed out. */
  accessToken(): Promise<string | null> {
    const session = this.session();
    if (!session) return Promise.resolve(null);
    if (session.accessExpiresAt - Date.now() > EXPIRY_MARGIN_MS)
      return Promise.resolve(session.accessToken);
    return this.refresh();
  }

  /** Rotates the refresh token. Concurrent callers share one request, since each refresh token works once. */
  refresh(): Promise<string | null> {
    this.refreshing ??= this.rotate().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async rotate(): Promise<string | null> {
    const session = this.session();
    if (!session) return null;
    try {
      const pair = await firstValueFrom(
        this.http.post<TokenPair>('/api/v1/auth/refresh', { refresh_token: session.refreshToken }),
      );
      this.setSession(pair);
      return pair.access_token;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.setSession(null);
        await this.router.navigate(['/prijava'], { queryParams: { returnUrl: this.router.url } });
      }
      return null;
    }
  }

  private setSession(pair: TokenPair | null): void {
    const session = pair && toSession(pair);
    this.session.set(session);
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode); the session then lasts only for this page.
    }
  }
}

function toSession(pair: TokenPair): Session {
  return {
    accessToken: pair.access_token,
    accessExpiresAt: Date.parse(pair.access_token_expires_at),
    refreshToken: pair.refresh_token,
    refreshExpiresAt: Date.parse(pair.refresh_token_expires_at),
    tenantId: pair.tenant_id,
    role: pair.role,
  };
}

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    return session && session.refreshExpiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}
