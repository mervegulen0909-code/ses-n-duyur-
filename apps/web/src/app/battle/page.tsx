import Link from 'next/link';
import { BattleArena } from '@/components/battle-arena';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function BattlePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">Battle</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Two performances, one winner. Listen to both fully, then decide.
        </p>
      </div>

      {user ? (
        <BattleArena />
      ) : (
        <p className="text-center text-sm text-neutral-400">
          Please{' '}
          <Link href="/login" className="font-medium text-emerald-400">
            sign in
          </Link>{' '}
          to battle.
        </p>
      )}
    </main>
  );
}
