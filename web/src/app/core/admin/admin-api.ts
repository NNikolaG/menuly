import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import type { Tenant } from '../api/api-types';
import type { Venue } from '../venues/venue';

export interface AdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: string;
  created_at: string;
  venues: number;
  members: number;
  imports: number;
  /** Estimated OCR cost, USD millionths. */
  ocr_cost_micros: number;
  /** Menu opens in the last 30 days. */
  views_30d: number;
}

export interface AdminTenantDetail {
  tenant: Tenant;
  owners: { id: string; name: string; email: string }[];
  venues: {
    id: string;
    name: string;
    slug: string;
    ocr_import_limit: number;
    imports_used: number;
    created_at: string;
  }[];
}

export interface OcrUsage {
  items: {
    tenant_id: string;
    tenant_name: string;
    model: string;
    pages: number;
    input_tokens: number;
    output_tokens: number;
    /** USD millionths. */
    cost_micros: number;
  }[];
  total_cost_micros: number;
}

/** `/v1/admin/*`: platform admin only (`user.is_platform_admin`). */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly api = inject(ApiClient);

  /** Newest first, at most 200; `q` matches name or slug. */
  tenantsResource(query: () => string) {
    return this.api.resource<{ items: AdminTenantSummary[] }>(() => ({
      path: '/v1/admin/tenants',
      query: { q: query() || undefined },
    }));
  }

  tenantResource(id: () => string | undefined) {
    return this.api.resource<AdminTenantDetail>(() => {
      const tenantId = id();
      return tenantId ? `/v1/admin/tenants/${encodeURIComponent(tenantId)}` : undefined;
    });
  }

  ocrUsageResource(days: () => number) {
    return this.api.resource<OcrUsage>(() => ({
      path: '/v1/admin/ocr-usage',
      query: { days: days() },
    }));
  }

  /** Suspended: public menus 404 and users cannot log in to it. */
  setTenantStatus(id: string, status: 'active' | 'suspended'): Observable<Tenant> {
    return this.api.patch(`/v1/admin/tenants/${encodeURIComponent(id)}`, { status });
  }

  setImportLimit(venueId: string, limit: number): Observable<Venue> {
    return this.api.patch(`/v1/admin/venues/${encodeURIComponent(venueId)}`, {
      ocr_import_limit: limit,
    });
  }
}
