import { parseHost } from './app-host';

describe('parseHost', () => {
  it('reads the tenant from its subdomain', () => {
    expect(parseHost('kafana-zora.menuly.app')).toEqual({
      kind: 'tenant',
      tenantSlug: 'kafana-zora',
    });
    expect(parseHost('Zora.localhost')).toEqual({ kind: 'tenant', tenantSlug: 'zora' });
  });

  it('treats the root, reserved and unknown hosts as the app', () => {
    for (const host of [
      'menuly.app',
      'app.menuly.app',
      'www.menuly.app',
      'localhost',
      '127.0.0.1',
      'a.b.menuly.app',
      'example.com',
    ]) {
      expect(parseHost(host)).toEqual({ kind: 'app' });
    }
  });
});
