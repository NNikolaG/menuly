import type { Venue } from './venue';

export function venueFixture(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 'v1',
    tenant_id: 't1',
    name: 'Kafana Zora',
    slug: 'centar',
    address: 'Knez Mihailova 1',
    phone: '',
    currency: 'RSD',
    timezone: 'Europe/Belgrade',
    opening_hours: {},
    ocr_import_limit: 3,
    created_at: '2026-11-05T10:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
    ...overrides,
  };
}
