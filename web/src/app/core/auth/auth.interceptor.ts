import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthStore } from './auth-store';

const ANONYMOUS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
];

/** Adds the bearer token to API calls; on 401 refreshes once and retries. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || ANONYMOUS.includes(req.url)) return next(req);
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
