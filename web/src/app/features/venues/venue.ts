/** `Venue` from the API (backend/api/openapi.yaml). */
export interface Venue {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  address: string;
  phone: string;
  currency: string;
  timezone: string;
  opening_hours: Record<string, unknown>;
  ocr_import_limit: number;
  created_at: string;
  updated_at: string;
}

export type VenueInput = Partial<
  Pick<Venue, 'name' | 'slug' | 'address' | 'phone' | 'currency' | 'timezone' | 'opening_hours'>
>;

export interface VenueList {
  items: Venue[];
}
