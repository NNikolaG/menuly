import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-client';
import { ANONYMOUS_AUTH_PATHS } from './auth-api';
import { AuthStore } from './auth-store';

/** Adds the bearer token to API calls; on 401 refreshes once and retries. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  const isApi = req.url.startsWith(`${baseUrl}/`);
  if (!isApi || ANONYMOUS_AUTH_PATHS.some((path) => req.url === `${baseUrl}${path}`))
    return next(req);
  const auth = inject(AuthStore);

  return from(auth.accessToken()).pipe(
    switchMap((token) =>
      next(withBearer(req, token)).pipe(
        catchError((error: unknown) => {
          if (!token || !(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          return from(auth.refresh()).pipe(
            switchMap((fresh) => (fresh ? next(withBearer(req, fresh)) : throwError(() => error))),
          );
        }),
      ),
    ),
  );
};

function withBearer<T>(req: HttpRequest<T>, token: string | null): HttpRequest<T> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}
