import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { NavAuth } from '@/components/nav-auth';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta');
  return {
    title: t('title'),
    description: t('description'),
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
                  Vocal<span className="text-emerald-400">League</span>
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
