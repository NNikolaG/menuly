/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { registerSerbianLatinPlurals } from './app/core/i18n/sr-latn-plurals';

registerSerbianLatinPlurals();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
