import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { SeasonSummary } from '@/lib/seasons';

/** Season switcher chips — links into `<basePath>?season=<key>`, preserving `extraParams`. */
export async function SeasonSwitcher({
  seasons,
  activeKey,
  basePath,
  extraParams,
}: {
  seasons: readonly SeasonSummary[];
  /** The resolved active season's key, or 'all' for the all-time view. */
  activeKey: string;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  if (seasons.length === 0) return null; // feature unused yet — nothing to switch between

  const t = await getTranslations();
  const chipClass = (isActive: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${
      isActive
        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
    }`;

  const hrefFor = (season: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    params.set('season', season);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {seasons.map((s) => (
        <Link key={s.id} href={hrefFor(s.key)} className={chipClass(activeKey === s.key)}>
          {s.title}
        </Link>
      ))}
      <Link href={hrefFor('all')} className={chipClass(activeKey === 'all')}>
        {t('Seasons.allSeasons')}
      </Link>
    </div>
  );
}
