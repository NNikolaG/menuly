import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody } from './api-types';

/** An API failure in one shape: HTTP status plus the API's error code (`email_taken`, `forbidden`, …). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** API error code; `network` when the request never got an answer, `unknown` when the body has none. */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return new ApiError(0, 'network', error.message);
    const body = error.error as Partial<ApiErrorBody> | null;
    return new ApiError(
      error.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? error.message,
    );
  }
  return new ApiError(0, 'unknown', String(error));
}
