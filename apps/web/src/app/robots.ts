import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Crawl rules. Public content is indexable; keep auth-gated, admin, and API
// surfaces out of search results (they either require a session or are
// machine-only endpoints).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/auth', '/login', '/add', '/profile'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
