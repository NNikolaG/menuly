/** Types from backend/api/openapi.yaml (Menus, Categories, Items, Prices). Prices are minor units. */

export type Translations = Record<string, Record<string, string>>;

export interface Menu {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  menu_id: string;
  name: string;
  description: string;
  translations: Translations;
  position: number;
  is_visible: boolean;
}

export interface Variant {
  id: string;
  item_id: string;
  label: string;
  translations: Translations;
  price_minor: number;
  position: number;
}

export interface Item {
  id: string;
  category_id: string;
  name: string;
  description: string;
  translations: Translations;
  image_url: string;
  tags: string[];
  allergens: string[];
  position: number;
  is_available: boolean;
  is_visible: boolean;
}

export interface ItemWithVariants extends Item {
  variants: Variant[];
}

export interface CategoryWithItems extends Category {
  items: ItemWithVariants[];
}

export interface MenuTree extends Menu {
  categories: CategoryWithItems[];
}

export interface CategoryInput {
  name?: string;
  description?: string;
  is_visible?: boolean;
}

export interface VariantInput {
  label?: string;
  price_minor?: number;
}

export interface ItemInput {
  name?: string;
  description?: string;
  /** Empty or an http(s) URL. */
  image_url?: string;
  tags?: string[];
  allergens?: string[];
  is_available?: boolean;
  is_visible?: boolean;
}

export interface ItemCreate extends ItemInput {
  name: string;
  variants: (VariantInput & { price_minor: number })[];
}

/** `POST /v1/menus/{id}/price-adjustments`: exactly one of `percent` or `amount_minor`. */
export interface PriceAdjustment {
  /** Only this category; the whole menu when left out. */
  category_id?: string;
  /** +10 = 10% more; -90 … 500. */
  percent?: number;
  /** Added to every price, negative to lower. */
  amount_minor?: number;
  /** Round to the nearest multiple; 0 = no rounding. */
  round_to_minor?: number;
}
