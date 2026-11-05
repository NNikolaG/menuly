import { inject } from '@angular/core';
import type { CanMatchFn } from '@angular/router';
import { APP_HOST } from './app-host';

export const tenantHostGuard: CanMatchFn = () => inject(APP_HOST).kind === 'tenant';
