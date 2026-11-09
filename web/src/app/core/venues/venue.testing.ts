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
    wifi_available: false,
    wifi_ssid: '',
    wifi_password: '',
    wifi_access: 'staff',
    ocr_import_limit: 3,
    active_menu_id: null,
    created_at: '2026-11-05T10:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
    ...overrides,
  };
}
