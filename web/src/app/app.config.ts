import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideLucideConfig } from '@lucide/angular';
import {
  provideRouter,
  TitleStrategy,
  withComponentInputBinding,
  withInMemoryScrolling,
} from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { API_BASE_URL } from './core/api/api-client';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AppTitleStrategy } from './core/layout/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
    provideLucideConfig({ strokeWidth: 1.5, size: 18 }),
  ],
};
