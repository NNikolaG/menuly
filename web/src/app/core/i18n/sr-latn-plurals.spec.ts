import { getLocalePluralCase, Plural } from '@angular/common';
import { registerSerbianLatinPlurals } from './sr-latn-plurals';

describe('registerSerbianLatinPlurals', () => {
  it('gives sr-Latn the one / few / other rules', () => {
    registerSerbianLatinPlurals();
    const plural = getLocalePluralCase('sr-Latn');
    expect([1, 2, 4, 5, 11, 21, 22, 25].map(plural)).toEqual([
      Plural.One,
      Plural.Few,
      Plural.Few,
      Plural.Other,
      Plural.Other,
      Plural.One,
      Plural.Few,
      Plural.Other,
    ]);
  });
});
