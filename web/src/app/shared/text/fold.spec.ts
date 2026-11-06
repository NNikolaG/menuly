import { fold, matchesQuery } from './fold';

describe('fold', () => {
  it('drops case and diacritics', () => {
    expect(fold('Ćevapi')).toBe('cevapi');
    expect(fold('Đorđe')).toBe(fold('djordje'));
  });
});

describe('matchesQuery', () => {
  it('needs every word somewhere in the fields', () => {
    expect(matchesQuery('', 'Kafić')).toBe(true);
    expect(matchesQuery('kafic centar', 'Kafić', 'Centar 12')).toBe(true);
    expect(matchesQuery('kafic novi', 'Kafić', 'Centar 12')).toBe(false);
    expect(matchesQuery('beo', null, undefined, 'Beograd')).toBe(true);
  });
});
