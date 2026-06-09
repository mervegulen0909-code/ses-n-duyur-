import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { NavAuth } from '@/components/nav-auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'VocalLeague — Global AI Vocal Performance League',
  description: 'Discover who sings a song best. AI-scored, community-voted vocal performances.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
