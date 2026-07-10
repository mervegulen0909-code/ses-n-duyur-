import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Static public routes. Dynamic pages (/performance/[id], /profile/[handle])
// are intentionally omitted: they require live data to enumerate and the
// per-item value is low for a fresh launch. Add a data-driven feed here once
// there is a stable corpus of performances worth indexing.
const ROUTES: ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
}> = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/leaderboard', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/standings', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/battle', priority: 0.8, changeFrequency: 'daily' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/dmca', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency,
    priority,
  }));
}
