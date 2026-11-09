import { venuePublicUrl } from '../venues/venue-public-url';
import { configuredBaseDomain } from './base-domain';

describe('configuredBaseDomain', () => {
  it('falls back to menuly.app when nothing is configured', () => {
    expect(configuredBaseDomain(undefined)).toBe('menuly.app');
    expect(configuredBaseDomain({ baseDomain: ' ' })).toBe('menuly.app');
  });

  it('uses the configured domain', () => {
    expect(configuredBaseDomain({ baseDomain: '1.2.3.4.NIP.io' })).toBe('1.2.3.4.nip.io');
    expect(venuePublicUrl('demo', 'mornar', '1.2.3.4.nip.io')).toBe('demo.1.2.3.4.nip.io/mornar');
  });
});
