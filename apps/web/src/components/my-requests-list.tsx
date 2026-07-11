import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { SongCategory } from '@voxscore/core';

export interface MyRequestRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  category: SongCategory;
  youtube_url: string;
  rejection_reason: string | null;
  approved_performance_id: string | null;
}

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

const STATUS_STYLE: Record<MyRequestRow['status'], string> = {
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  rejected: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

export async function MyRequestsList({ requests }: { requests: MyRequestRow[] }) {
  const t = await getTranslations();
  const statusKey: Record<MyRequestRow['status'], string> = {
    pending: 'Add.statusPending',
    approved: 'Add.statusApproved',
    rejected: 'Add.statusRejected',
  };

  return (
    <section className="w-full max-w-xl">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">
        {t('Add.myRequestsHeading')}
      </h2>
      {requests.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('Add.noRequests')}</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="space-y-1 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-neutral-300">{r.youtube_url}</span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}
                >
                  {t(statusKey[r.status])}
                </span>
              </div>
              <div className="text-xs text-neutral-500">{t(`Category.${CATEGORY_KEY[r.category]}`)}</div>
              {r.status === 'rejected' && r.rejection_reason && (
                <p className="text-xs text-rose-400/80">
                  {t('Add.rejectionReasonPrefix', { reason: r.rejection_reason })}
                </p>
              )}
              {r.status === 'approved' && r.approved_performance_id && (
                <Link
                  href={`/performance/${r.approved_performance_id}`}
                  className="inline-block text-xs font-medium text-emerald-400 hover:underline"
                >
                  {t('Add.viewPerformance')}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
