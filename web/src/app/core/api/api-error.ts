import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody } from './api-types';

/** The API's error code (`invalid_credentials`, `email_taken`, …), or null for network and unknown errors. */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body = error.error as Partial<ApiErrorBody> | null;
  return body?.error?.code ?? null;
}
