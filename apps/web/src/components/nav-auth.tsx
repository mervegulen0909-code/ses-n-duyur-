import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getCurrentProfile } from '@/lib/auth';
import { SignOutButton } from './sign-out-button';

export async function NavAuth() {
  const profile = await getCurrentProfile();
  const t = await getTranslations('Nav');

  if (!profile) {
    return (
      <Link
        href="/login"
        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium hover:border-neutral-500"
      >
        {t('signIn')}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {profile.role === 'admin' && (
        <Link href="/admin" className="text-sm text-amber-400 hover:text-amber-300">
          {t('admin')}
        </Link>
      )}
      <Link
        href="/add"
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
      >
        {t('addPerformance')}
      </Link>
      <span className="hidden text-sm text-neutral-400 sm:inline">{profile.handle}</span>
      <SignOutButton />
    </div>
  );
}
