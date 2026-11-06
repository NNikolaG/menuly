import { fold } from '../../shared/text/fold';
import type { PublicCategory, PublicItem } from './public-menu';

export { fold };

export interface MenuFilter {
  /** Free text; matches name, description, tags and allergens, without diacritics. */
  query: string;
  /** Item must carry every one of these tags (`vegan`, `bez glutena`…). */
  diets: readonly string[];
  /** Item must contain none of these allergens. */
  withoutAllergens: readonly string[];
  availableOnly: boolean;
}

export const NO_FILTER: MenuFilter = {
  query: '',
  diets: [],
  withoutAllergens: [],
  availableOnly: false,
};

export function isFiltering(filter: MenuFilter): boolean {
  return (
    filter.query.trim() !== '' ||
    filter.diets.length > 0 ||
    filter.withoutAllergens.length > 0 ||
    filter.availableOnly
  );
}

/** How many filters (besides the query) are on, for the filter button's badge. */
export function activeFilterCount(filter: MenuFilter): number {
  return filter.diets.length + filter.withoutAllergens.length + (filter.availableOnly ? 1 : 0);
}

function matches(item: PublicItem, words: string[], filter: MenuFilter): boolean {
  if (filter.availableOnly && !item.is_available) return false;
  const tags = item.tags.map((tag) => tag.toLowerCase());
  if (!filter.diets.every((diet) => tags.includes(diet))) return false;
  const allergens = item.allergens.map((allergen) => allergen.toLowerCase());
  if (filter.withoutAllergens.some((allergen) => allergens.includes(allergen))) return false;
  if (!words.length) return true;
  const haystack = fold(
    [item.name, item.description, ...item.tags, ...item.variants.map((v) => v.label)].join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

/** Categories with only the items that pass; empty categories drop out while filtering. */
export function filterMenu(categories: PublicCategory[], filter: MenuFilter): PublicCategory[] {
  if (!isFiltering(filter)) return categories;
  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  return categories
    .map((category) => {
      // A query that names the category keeps all its (otherwise passing) items.
      const categoryHit = words.length > 0 && words.every((w) => fold(category.name).includes(w));
      const items = category.items.filter((item) =>
        matches(item, categoryHit ? [] : words, filter),
      );
      return { ...category, items };
    })
    .filter((category) => category.items.length > 0);
}

/**
 * Tags and allergens that appear in the menu (lowercased key → first spelling seen),
 * so the filter offers only useful choices.
 */
export function labelsInMenu(categories: PublicCategory[]): {
  tags: Map<string, string>;
  allergens: Map<string, string>;
} {
  const tags = new Map<string, string>();
  const allergens = new Map<string, string>();
  for (const category of categories) {
    for (const item of category.items) {
      for (const tag of item.tags)
        if (!tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
      for (const allergen of item.allergens) {
        if (!allergens.has(allergen.toLowerCase())) allergens.set(allergen.toLowerCase(), allergen);
      }
    }
  }
  return { tags, allergens };
}
