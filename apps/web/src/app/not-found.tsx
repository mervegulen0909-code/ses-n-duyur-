import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('Errors');
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-3xl items-center px-6 py-14">
      <div className="w-full border-y border-neutral-800 py-10">
        <p className="text-7xl font-black tracking-[-0.06em] text-neutral-800">404</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">{t('notFoundTitle')}</h1>
        <p className="mt-4 max-w-xl text-neutral-400">{t('notFoundBody')}</p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-bold text-emerald-950"
        >
          {t('home')}
        </Link>
      </div>
    </main>
  );
}
