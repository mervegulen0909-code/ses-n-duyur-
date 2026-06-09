import { isAdmin } from '@/lib/auth';
import { CalibrateForm } from '@/components/calibrate-form';

export const dynamic = 'force-dynamic';

export default async function CalibratePage() {
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        Admin access required.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold">Calibration scoring</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Human-scored anchors that calibrate the AI scoring model. Paste a performance ID and rate
        each criterion.
      </p>
      <CalibrateForm />
    </main>
  );
}
