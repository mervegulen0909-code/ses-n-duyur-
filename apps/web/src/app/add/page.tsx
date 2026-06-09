import Link from 'next/link';
import { AddPerformanceForm } from '@/components/add-performance-form';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AddPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Add a performance</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Paste a YouTube link. We embed it (never download), fetch its metadata, and create a
          Provisional AI Estimate.
        </p>
      </div>

      {user ? (
        <AddPerformanceForm />
      ) : (
        <p className="text-sm text-neutral-400">
          Please{' '}
          <Link href="/login" className="font-medium text-emerald-400">
            sign in
          </Link>{' '}
          to add a performance.
        </p>
      )}
    </main>
  );
}
