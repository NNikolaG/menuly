/**
 * Lowercase, no diacritics, so people can type without them:
 * "cevapi" finds "Ćevapi", "dorde" and "djordje" find "Đorđe".
 */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('đ', 'dj')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('dj', 'd');
}

/** True when every word of `query` is in one of `fields` (folded); an empty query matches all. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold(fields.filter(Boolean).join(' '));
  return words.every((word) => text.includes(word));
}
