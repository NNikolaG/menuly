/**
 * Shared vocabulary for item tags and allergens. The API stores free text,
 * lowercased (`normalizeLabels`); these keys are the Serbian words the editor
 * offers, so the guest menu can translate them, filter by them and highlight
 * the ones that matter. Unknown labels still show, as written.
 */

export interface KnownLabel {
  key: string;
  label: string;
}

/** Diet tags: guests filter by them ("only vegan"). */
export const DIET_TAGS: readonly KnownLabel[] = [
  { key: 'vegan', label: $localize`:@@label.diet.vegan:Vegan` },
  { key: 'vegetarijansko', label: $localize`:@@label.diet.vegetarian:Vegetarijansko` },
  { key: 'bez glutena', label: $localize`:@@label.diet.glutenFree:Bez glutena` },
  { key: 'bez laktoze', label: $localize`:@@label.diet.lactoseFree:Bez laktoze` },
  { key: 'ljuto', label: $localize`:@@label.diet.spicy:Ljuto` },
];

/** Highlights: shown as an accent badge in the venue's color. */
export const HIGHLIGHT_TAGS: readonly KnownLabel[] = [
  { key: 'novo', label: $localize`:@@label.highlight.new:Novo` },
  { key: 'preporuka', label: $localize`:@@label.highlight.recommended:Preporuka` },
  { key: 'specijalitet kuće', label: $localize`:@@label.highlight.house:Specijalitet kuće` },
];

/** The 14 allergens EU and Serbian rules require on menus. */
export const ALLERGENS: readonly KnownLabel[] = [
  { key: 'gluten', label: $localize`:@@label.allergen.gluten:Gluten` },
  { key: 'rakovi', label: $localize`:@@label.allergen.crustaceans:Rakovi` },
  { key: 'jaja', label: $localize`:@@label.allergen.eggs:Jaja` },
  { key: 'riba', label: $localize`:@@label.allergen.fish:Riba` },
  { key: 'kikiriki', label: $localize`:@@label.allergen.peanuts:Kikiriki` },
  { key: 'soja', label: $localize`:@@label.allergen.soy:Soja` },
  { key: 'mleko', label: $localize`:@@label.allergen.milk:Mleko` },
  { key: 'orašasti plodovi', label: $localize`:@@label.allergen.nuts:Orašasti plodovi` },
  { key: 'celer', label: $localize`:@@label.allergen.celery:Celer` },
  { key: 'senf', label: $localize`:@@label.allergen.mustard:Senf` },
  { key: 'susam', label: $localize`:@@label.allergen.sesame:Susam` },
  { key: 'sulfiti', label: $localize`:@@label.allergen.sulphites:Sulfiti` },
  { key: 'lupina', label: $localize`:@@label.allergen.lupin:Lupina` },
  { key: 'mekušci', label: $localize`:@@label.allergen.molluscs:Mekušci` },
];

const LABELS = new Map(
  [...DIET_TAGS, ...HIGHLIGHT_TAGS, ...ALLERGENS].map((known) => [known.key, known.label]),
);
const HIGHLIGHTS = new Set(HIGHLIGHT_TAGS.map((known) => known.key));

/** Display text of a tag or allergen: translated when known, else as stored. */
export function labelOf(key: string): string {
  return LABELS.get(key.toLowerCase()) ?? key;
}

export function isHighlight(tag: string): boolean {
  return HIGHLIGHTS.has(tag.toLowerCase());
}
