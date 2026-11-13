import type { PublicTenant } from './public-tenant';
import { robotsTxt, sitemapXml } from './tenant-site';

const ORIGIN = 'https://zora.menuly.app';

function tenant(slug = 'zora'): PublicTenant {
  return {
    tenant: { name: 'Zora d.o.o.', slug },
    venues: [
      {
        name: 'Kafana Zora',
        slug: 'centar',
        type: 'restaurant',
        address: 'Knez Mihailova 1',
        city: 'Beograd',
        languages: ['sr', 'en', 'de'],
        updated_at: '2026-11-05T10:00:00Z',
      },
      {
        name: 'Zora 2',
        slug: 'dorcol',
        type: 'bar',
        address: '',
        city: '',
        languages: ['sr'],
        updated_at: '2026-11-06T10:00:00Z',
      },
    ],
  };
}

describe('robotsTxt', () => {
  it('allows everything and names the sitemap', () => {
    expect(robotsTxt(ORIGIN)).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://zora.menuly.app/sitemap.xml\n',
    );
  });
});

describe('sitemapXml', () => {
  it('lists every menu language with its alternates and last change', () => {
    const xml = sitemapXml(tenant(), ORIGIN);
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).toContain('<loc>https://zora.menuly.app/centar</loc>');
    expect(xml).toContain('<loc>https://zora.menuly.app/en/centar</loc>');
    expect(xml).toContain('<loc>https://zora.menuly.app/en/centar?lang=de</loc>');
    expect(xml).toContain('<lastmod>2026-11-05T10:00:00Z</lastmod>');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://zora.menuly.app/centar"/>',
    );
    // A single-language menu has no alternates.
    const single = xml.slice(xml.indexOf('<loc>https://zora.menuly.app/dorcol</loc>'));
    expect(single).not.toContain('xhtml:link');
  });

  it('is empty for the demo tenant', () => {
    expect(sitemapXml(tenant('demo'), ORIGIN)).not.toContain('<url>');
  });
});
