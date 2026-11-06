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
