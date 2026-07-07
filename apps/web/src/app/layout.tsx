import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NavAuth } from '@/components/nav-auth';
import './globals.css';

// Production origin for absolute URLs (OpenGraph/canonical). Override per
// environment with NEXT_PUBLIC_SITE_URL; falls back to the current prod alias.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://web-seven-coral-88.vercel.app';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  const title = t('title');
  const description = t('description');
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: 'VoxScore',
    openGraph: {
      title,
      description,
      siteName: 'VoxScore',
      type: 'website',
      url: SITE_URL,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    // App-controlled i18n (next-intl) translates the UI — keep BROWSER auto-
    // translation OFF: Chrome Translate swaps text nodes for <font> wrappers and
    // breaks React reconciliation. See docs/adr/0002-disable-browser-auto-translation.md.
    other: { google: 'notranslate' },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('Nav');

  return (
    <html lang={locale} translate="no" className="notranslate">
      <body>
        <NextIntlClientProvider messages={messages}>
          <header className="border-b border-neutral-800">
            <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
              <div className="flex items-center gap-4">
                <Link href="/" className="font-bold tracking-tight">
                  Vox<span className="text-emerald-400">Score</span>
                </Link>
                <Link
                  href="/leaderboard"
                  className="text-sm text-neutral-400 hover:text-neutral-200"
                >
                  {t('leaderboard')}
                </Link>
                <Link href="/battle" className="text-sm text-neutral-400 hover:text-neutral-200">
                  {t('battle')}
                </Link>
                <Link href="/standings" className="text-sm text-neutral-400 hover:text-neutral-200">
                  {t('standings')}
                </Link>
                {/* English-only design storyboard — kept reachable by URL for
                    demos, but out of the main nav in production so regular (incl.
                    Turkish) users don't land on untranslated prototype copy. */}
                {process.env.NODE_ENV !== 'production' && (
                  <Link
                    href="/storyboard"
                    className="text-sm text-neutral-400 hover:text-neutral-200"
                  >
                    {t('storyboard')}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-3">
                <LanguageSwitcher />
                <NavAuth />
              </div>
            </nav>
          </header>
          {children}
          <footer className="mt-12 border-t border-neutral-800">
            <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-6 py-5 text-xs text-neutral-500">
              <span>{t('footerTagline')}</span>
              <div className="flex gap-4">
                <Link href="/terms" className="hover:text-neutral-300">
                  {t('terms')}
                </Link>
                <Link href="/privacy" className="hover:text-neutral-300">
                  {t('privacy')}
                </Link>
                <Link href="/dmca" className="hover:text-neutral-300">
                  {t('dmca')}
                </Link>
              </div>
            </div>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
