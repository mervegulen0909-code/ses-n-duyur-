import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SONG_CATEGORIES, type SongCategory } from '@voxscore/core';

const CATEGORY_KEY: Record<SongCategory, string> = {
  pop: 'pop',
  rock: 'rock',
  'rnb-soul': 'rnbSoul',
  ballad: 'ballad',
  'turkish-global': 'turkishGlobal',
  'indie-alternative': 'indieAlternative',
  'musical-classical': 'musicalClassical',
  other: 'other',
};

/** Category chip nav — links into `/leaderboard?category=<value>`. */
export async function CategoryChips({ active }: { active?: string }) {
  const t = await getTranslations();
  const chipClass = (isActive: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition ${
      isActive
        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
        : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/leaderboard" className={chipClass(!active)}>
        {t('Leaderboard.allCategories')}
      </Link>
      {SONG_CATEGORIES.map((c) => (
        <Link key={c} href={`/leaderboard?category=${c}`} className={chipClass(active === c)}>
          {t(`Category.${CATEGORY_KEY[c]}`)}
        </Link>
      ))}
    </div>
  );
}
