import type { ImportDraft, Uncertain } from '../../core/imports/import';

/** The draft as the review form edits it: prices in major units (`350`), `null` when not read. */
export interface EditVariant {
  label: string;
  price: number | null;
  /** As printed, shown next to the field. */
  price_text: string;
}

export interface EditItem {
  name: string;
  description: string;
  page_index: number;
  uncertain: Uncertain[];
  variants: EditVariant[];
}

export interface EditCategory {
  name: string;
  description: string;
  items: EditItem[];
}

export interface EditDraft {
  currency: string;
  categories: EditCategory[];
}

export function toEdit(draft: ImportDraft | null | undefined): EditDraft {
  return {
    currency: draft?.currency ?? '',
    categories: (draft?.categories ?? []).map((category) => ({
      name: category.name,
      description: category.description ?? '',
      items: category.items.map((item) => ({
        name: item.name,
        description: item.description ?? '',
        page_index: item.page_index,
        uncertain: [...(item.uncertain ?? [])],
        variants: item.variants.map((variant) => ({
          label: variant.label ?? '',
          price: variant.price_minor === null ? null : variant.price_minor / 100,
          price_text: variant.price_text ?? '',
        })),
      })),
    })),
  };
}

/** Back to the API shape; categories left without items are dropped. */
export function toDraft(edit: EditDraft): ImportDraft {
  return {
    currency: edit.currency,
    categories: edit.categories
      .filter((category) => category.items.length)
      .map((category) => ({
        name: category.name.trim(),
        description: category.description.trim(),
        items: category.items.map((item) => ({
          name: item.name.trim(),
          description: item.description.trim(),
          page_index: item.page_index,
          uncertain: item.uncertain,
          variants: item.variants.map((variant) => ({
            label: variant.label.trim(),
            price_minor:
              variant.price === null || Number.isNaN(variant.price)
                ? null
                : Math.round(variant.price * 100),
            price_text: variant.price_text,
          })),
        })),
      })),
  };
}

/** Counts for the review sidebar, from the local (possibly unsaved) edits. */
export function summarize(edit: EditDraft): {
  categories: number;
  items: number;
  toCheck: number;
  missingPrices: number;
  missingNames: number;
} {
  let items = 0;
  let toCheck = 0;
  let missingPrices = 0;
  let missingNames = 0;
  let categories = 0;
  for (const category of edit.categories) {
    if (!category.items.length) continue;
    categories++;
    if (!category.name.trim()) missingNames++;
    for (const item of category.items) {
      items++;
      if (item.uncertain.length) toCheck++;
      if (!item.name.trim()) missingNames++;
      missingPrices += item.variants.filter((variant) => variant.price === null).length;
    }
  }
  return { categories, items, toCheck, missingPrices, missingNames };
}
