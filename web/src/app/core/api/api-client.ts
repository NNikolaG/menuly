import { HttpClient, httpResource, type HttpResourceRef } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { catchError, throwError, type Observable } from 'rxjs';
import { toApiError } from './api-error';

/** Prefix of every API path, from `environment.apiBaseUrl`. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', { factory: () => '/api' });

type QueryValue = string | number | boolean;
/** Query parameters; `null` and `undefined` are left out. */
export type Query = Record<string, QueryValue | readonly QueryValue[] | null | undefined>;

/** A read: API path (`/v1/venues`) plus optional query. */
export interface ApiRequest {
  path: string;
  query?: Query;
}

/**
 * The only way features talk to the API. Paths are API paths (`/v1/...`); the base URL comes from the environment.
 * Reads are signal resources, writes are Observables that fail with `ApiError`.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /**
   * Signal resource that loads `request()` and reloads whenever the signals it reads change.
   * Returning `undefined` keeps it idle. Call it in an injection context (a field initializer).
   */
  resource<T>(request: () => string | ApiRequest | undefined): HttpResourceRef<T | undefined> {
    return httpResource<T>(() => {
      const next = request();
      if (next === undefined) return undefined;
      const { path, query } = typeof next === 'string' ? { path: next, query: undefined } : next;
      return { url: this.url(path), params: clean(query) };
    });
  }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: clean(query) }).pipe(catchError(rethrow));
  }

  post<T>(path: string, body: unknown = null): Observable<T> {
    return this.http.post<T>(this.url(path), body).pipe(catchError(rethrow));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body).pipe(catchError(rethrow));
  }

  delete(path: string): Observable<void> {
    return this.http.delete<void>(this.url(path)).pipe(catchError(rethrow));
  }
}

function rethrow(error: unknown): Observable<never> {
  return throwError(() => toApiError(error));
}

function clean(
  query: Query | undefined,
): Record<string, QueryValue | readonly QueryValue[]> | undefined {
  if (!query) return undefined;
  const entries = Object.entries(query).filter(
    (entry): entry is [string, QueryValue | readonly QueryValue[]] =>
      entry[1] !== null && entry[1] !== undefined,
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}
