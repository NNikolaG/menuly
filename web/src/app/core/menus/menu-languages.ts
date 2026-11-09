import type { MenuLanguage, Translations } from './menu';

/** The base language: its text is the plain `name` / `description` / `label`. */
export const BASE_LANGUAGE: MenuLanguage = { code: 'sr', name: 'Srpski' };

/** Quick picks when adding a language, named as their speakers write them. */
export const COMMON_LANGUAGES: readonly MenuLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ru', name: 'Русский' },
  { code: 'it', name: 'Italiano' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'el', name: 'Ελληνικά' },
  { code: 'hu', name: 'Magyar' },
  { code: 'zh', name: '中文' },
];

/** Same pattern as the API: `en`, `de`, `pt-br`. */
export const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

/** One row per menu language with the text of `fields` ('' where nothing is translated yet). */
export function translationRows<F extends string>(
  languages: readonly MenuLanguage[],
  translations: Translations | undefined,
  fields: readonly F[],
): Record<F, string>[] {
  return languages.map(
    (language) =>
      Object.fromEntries(
        fields.map((field) => [field, translations?.[language.code]?.[field] ?? '']),
      ) as Record<F, string>,
  );
}

/**
 * `existing` with the rows written over it. Languages the menu no longer offers keep their text,
 * so adding a language back restores it; empty fields are left out (the guest sees Serbian).
 */
export function mergeTranslations(
  existing: Translations | undefined,
  languages: readonly MenuLanguage[],
  rows: readonly Record<string, string>[],
): Translations {
  const out: Translations = { ...existing };
  languages.forEach((language, i) => {
    const filled = Object.entries(rows[i] ?? {})
      .map(([field, text]) => [field, text.trim()] as const)
      .filter(([, text]) => text !== '');
    if (filled.length) out[language.code] = Object.fromEntries(filled);
    else delete out[language.code];
  });
  return out;
}

/** Languages of several menus, first one wins per code (a venue's combos span its menus). */
export function unionLanguages(lists: readonly (readonly MenuLanguage[])[]): MenuLanguage[] {
  const out: MenuLanguage[] = [];
  for (const language of lists.flat()) {
    if (!out.some((known) => known.code === language.code)) out.push(language);
  }
  return out;
}

/** Trimmed, without empty fields or languages, as the API stores it. */
export function cleanTranslations(translations: Translations): Translations {
  const out: Translations = {};
  for (const [code, fields] of Object.entries(translations)) {
    const filled = Object.entries(fields)
      .map(([field, text]) => [field, text.trim()] as const)
      .filter(([, text]) => text !== '');
    if (filled.length) out[code] = Object.fromEntries(filled);
  }
  return out;
}
