import { registerLocaleData } from '@angular/common';
import localeSr from '@angular/common/locales/sr';
import localeSrLatn from '@angular/common/locales/sr-Latn';

/**
 * Angular's `sr-Latn` locale data ships without plural rules (every number is "other"), so ICU
 * plurals read "4 stavki". Re-register it with the `sr` plural function (one / few / other),
 * which CLDR shares between the scripts. The plural function is the last entry of locale data.
 */
export function registerSerbianLatinPlurals(): void {
  const data = [...localeSrLatn];
  data[data.length - 1] = localeSr[localeSr.length - 1];
  registerLocaleData(data, 'sr-Latn');
}
