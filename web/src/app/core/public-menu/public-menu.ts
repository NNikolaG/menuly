import type { MenuTheme } from '../menus/menu-theme';

/**
 * Guest view of a venue's published menu: `GET /v1/public/menus/{tenantSlug}/{venueSlug}`.
 * Schema `PublicMenu` in backend/api/openapi.yaml. Names come already in the requested `lang`
 * (Serbian fallback); only visible categories and items; unavailable items last in their category.
 * Prices are minor units. `translations` are also sent but not needed here.
 */
export interface PublicMenu {
  /** Language actually served (`sr` when none was asked for). */
  lang: string;
  tenant: { name: string; slug: string };
  venue: {
    name: string;
    slug: string;
    address: string;
    phone: string;
    currency: string;
    timezone: string;
  };
  menu: {
    id: string;
    name: string;
    published_at: string | null;
    categories: PublicCategory[];
  };
  /** Live combos; `is_featured` ones go in the banner, unavailable ones last. */
  promotions?: PublicPromotion[];
  /** Defaults when the menu never saved one. */
  theme?: MenuTheme;
}

export interface PublicPromotion {
  id: string;
  name: string;
  description: string;
  image_url: string;
  price_minor: number;
  /** Sum of the cheapest option per slot, times quantity. */
  regular_price_minor: number;
  savings_minor: number;
  ends_at: string | null;
  is_featured: boolean;
  is_available: boolean;
  slots: {
    label: string;
    quantity: number;
    options: {
      item_id: string;
      variant_id: string | null;
      name: string;
      variant_label: string;
      price_minor: number;
      is_available: boolean;
    }[];
  }[];
}

export interface PublicCategory {
  id: string;
  name: string;
  description: string;
  items: PublicItem[];
}

export interface PublicItem {
  id: string;
  name: string;
  description: string;
  tags: string[];
  allergens: string[];
  image_url: string;
  is_available: boolean;
  variants: { id: string; label: string; price_minor: number }[];
}
