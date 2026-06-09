import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { NavAuth } from '@/components/nav-auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'VocalLeague — Global AI Vocal Performance League',
  description: 'Discover who sings a song best. AI-scored, community-voted vocal performances.',
  // Disable Chrome/Google auto-translation site-wide. The UI is English-only and
  // heavily interactive (React conditional text). Google Translate swaps text
  // nodes for <font> wrappers, which breaks React's reconciliation (e.g. the
  // /login Sign in ↔ Sign up toggle silently stops updating and forms crash).
  // See docs/adr/0002-disable-browser-auto-translation.md. Revisit with real
  // i18n (next-intl) before re-enabling translation.
  other: { google: 'notranslate' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" translate="no" className="notranslate">
      <body>
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-4">
              <Link href="/" className="font-bold tracking-tight">
                Vocal<span className="text-emerald-400">League</span>
              </Link>
              <Link href="/leaderboard" className="text-sm text-neutral-400 hover:text-neutral-200">
                Leaderboard
              </Link>
              <Link href="/battle" className="text-sm text-neutral-400 hover:text-neutral-200">
                Battle
              </Link>
            </div>
            <NavAuth />
          </nav>
        </header>
        {children}
        <footer className="mt-12 border-t border-neutral-800">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3 px-6 py-5 text-xs text-neutral-500">
            <span>VocalLeague — embeds only, never hosts media.</span>
            <div className="flex gap-4">
              <Link href="/terms" className="hover:text-neutral-300">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-neutral-300">
                Privacy
              </Link>
              <Link href="/dmca" className="hover:text-neutral-300">
                DMCA / Takedown
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
