import { HttpClient, httpResource, type HttpResourceRef } from '@angular/common/http';
import { computed, inject, Injectable, InjectionToken } from '@angular/core';
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
   * It refetches only when the URL or query actually change, not on every run of `request`.
   */
  resource<T>(request: () => string | ApiRequest | undefined): HttpResourceRef<T | undefined> {
    const next = computed(
      () => {
        const value = request();
        if (value === undefined) return undefined;
        const { path, query } =
          typeof value === 'string' ? { path: value, query: undefined } : value;
        return { url: this.url(path), params: clean(query) };
      },
      { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );
    return httpResource<T>(next);
  }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: clean(query) }).pipe(catchError(rethrow));
  }

  /** A file (image, PDF) as a Blob, e.g. for an `<img>` via `URL.createObjectURL`, since it needs auth. */
  blob(path: string, query?: Query): Observable<Blob> {
    return this.http
      .get(this.url(path), { params: clean(query), responseType: 'blob' })
      .pipe(catchError(rethrow));
  }

  /** `body` may be `FormData` for multipart uploads. */
  post<T>(path: string, body: unknown = null): Observable<T> {
    return this.http.post<T>(this.url(path), body).pipe(catchError(rethrow));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body).pipe(catchError(rethrow));
  }

  /** `body` may be `FormData` for multipart uploads. */
  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body).pipe(catchError(rethrow));
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
