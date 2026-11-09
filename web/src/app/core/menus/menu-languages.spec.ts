import { mergeTranslations, translationRows, unionLanguages } from './menu-languages';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
];

describe('menu languages', () => {
  it('reads one row per language, empty where untranslated', () => {
    expect(translationRows(languages, { en: { name: 'Drinks' } }, ['name', 'description'])).toEqual(
      [
        { name: 'Drinks', description: '' },
        { name: '', description: '' },
      ],
    );
  });

  it('writes rows back, keeps languages no longer offered and drops empty ones', () => {
    const merged = mergeTranslations({ en: { name: 'Old' }, fr: { name: 'Boissons' } }, languages, [
      { name: ' Drinks ', description: '' },
      { name: '' },
    ]);
    expect(merged).toEqual({ en: { name: 'Drinks' }, fr: { name: 'Boissons' } });
  });

  it('joins the languages of several menus once per code', () => {
    expect(unionLanguages([[languages[0]], [{ code: 'en', name: 'Eng' }, languages[1]]])).toEqual(
      languages,
    );
  });
});
