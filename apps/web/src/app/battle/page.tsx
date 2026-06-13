import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BattleArena } from '@/components/battle-arena';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function BattlePage() {
  const t = await getTranslations();
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{t('Nav.battle')}</h1>
        <p className="mt-2 text-sm text-neutral-400">{t('Battle.subtitle')}</p>
      </div>

      {user ? (
        <BattleArena />
      ) : (
        <p className="text-center text-sm text-neutral-400">
          {t.rich('Battle.signInPrompt', {
            link: (chunks) => (
              <Link href="/login" className="font-medium text-emerald-400">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </main>
  );
}
