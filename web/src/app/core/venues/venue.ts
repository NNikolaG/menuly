/** `Venue` from the API (backend/api/openapi.yaml). */
export interface Venue {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  postal_code: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Both set or both `null`. */
  latitude: number | null;
  longitude: number | null;
  venue_type: VenueType;
  /** Up to 5, e.g. "Roštilj". */
  cuisine: string[];
  /** One or two sentences for search engines and agents. */
  description: string;
  phone: string;
  currency: string;
  timezone: string;
  opening_hours: OpeningHours;
  wifi_available: boolean;
  wifi_ssid: string;
  /** Kept as typed. Guests see it only when `wifi_access` is `menu`. */
  wifi_password: string;
  wifi_access: WifiAccess;
  ocr_import_limit: number;
  /** The published menu guests see. */
  active_menu_id: string | null;
  created_at: string;
  updated_at: string;
}

export type VenueInput = Partial<
  Pick<
    Venue,
    | 'name'
    | 'slug'
    | 'address'
    | 'city'
    | 'postal_code'
    | 'country'
    | 'latitude'
    | 'longitude'
    | 'venue_type'
    | 'cuisine'
    | 'description'
    | 'phone'
    | 'currency'
    | 'timezone'
    | 'opening_hours'
    | 'wifi_available'
    | 'wifi_ssid'
    | 'wifi_password'
    | 'wifi_access'
  >
>;

export const VENUE_TYPES = [
  'restaurant',
  'cafe',
  'bar',
  'fast_food',
  'bakery',
  'pastry_shop',
  'other',
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Up to 3 `[open, close]` intervals (`HH:MM`, venue timezone) per weekday. A missing or empty
 * day is closed; a close at or before the open time runs past midnight. `{}` = not set.
 */
export type OpeningHours = Partial<Record<Weekday, [string, string][]>>;

/** `menu`: the password is on the guest menu. `staff`: guests ask the staff. */
export type WifiAccess = 'menu' | 'staff';

export interface VenueList {
  items: Venue[];
}

/** `GET /v1/venues/{id}/stats`: guest menu opens per day; days without opens are 0. */
export interface VenueStats {
  days: { date: string; views: number }[];
  total: number;
}
