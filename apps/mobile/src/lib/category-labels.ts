import { useTranslation } from 'react-i18next';

import { type SongCategory } from '@voxscore/core';

/**
 * i18n keys for the 8 song categories. These live under the `Request.*`
 * namespace (the Add screen already ships them in every locale); this helper
 * lets the home feed reuse the same translations instead of duplicating keys.
 */
const CATEGORY_KEY: Record<SongCategory, string> = {
  pop: 'categoryPop',
  rock: 'categoryRock',
  'rnb-soul': 'categoryRnbSoul',
  ballad: 'categoryBallad',
  'turkish-global': 'categoryTurkishGlobal',
  'indie-alternative': 'categoryIndieAlternative',
  'musical-classical': 'categoryMusicalClassical',
  other: 'categoryOther',
};

/** Translate a category value; unknown values fall back to the raw string. */
export function useCategoryLabel(): (category: string | null | undefined) => string {
  const { t } = useTranslation();
  return (category) => {
    if (!category) return '';
    const key = CATEGORY_KEY[category as SongCategory];
    return key ? t(`Request.${key}`, { defaultValue: category }) : category;
  };
}
