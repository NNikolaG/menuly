import type { VenueType } from '../venues/venue';

/** A tenant and its venues with a published menu: `GET /v1/public/tenants/{tenantSlug}`. */
export interface PublicTenant {
  tenant: { name: string; slug: string };
  venues: {
    name: string;
    slug: string;
    type: VenueType;
    address: string;
    city: string;
    /** Language codes of the published menu, Serbian first. */
    languages: string[];
    /** Last change of the venue or its menu. */
    updated_at: string;
  }[];
}
