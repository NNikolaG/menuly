import type { Translations } from '../menus/menu';

/** Types from backend/api/openapi.yaml (Promotions). Prices are minor units. */

export type PromotionStatus = 'live' | 'scheduled' | 'expired' | 'inactive';

export interface PromotionOption {
  id: string;
  item_id: string;
  variant_id: string | null;
  item_name: string;
  variant_label: string | null;
  price_minor: number;
  is_available: boolean;
  /** False when the item is hidden or not in the venue's active menu. */
  in_active_menu: boolean;
}

export interface PromotionSlot {
  id: string;
  label: string;
  translations: Translations;
  quantity: number;
  /** Empty when every item of the slot was deleted; guests then don't see the combo. */
  options: PromotionOption[];
}

export interface Promotion {
  id: string;
  venue_id: string;
  type: 'combo';
  name: string;
  description: string;
  image_url: string;
  price_minor: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  is_featured: boolean;
  position: number;
  status: PromotionStatus;
  /** Slots bought one by one (cheapest option of a choice), at current prices. */
  regular_price_minor: number;
  savings_minor: number;
  slots: PromotionSlot[];
}

export interface PromotionSlotInput {
  label: string;
  quantity: number;
  options: { item_id: string; variant_id: string | null }[];
}

export interface PromotionInput {
  name?: string;
  description?: string;
  image_url?: string;
  price_minor?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  is_featured?: boolean;
  /** Replaces all slots when given. */
  slots?: PromotionSlotInput[];
}
