import { getTranslations } from 'next-intl/server';
import { isAdmin } from '@/lib/auth';
import { CalibrateForm } from '@/components/calibrate-form';

export const dynamic = 'force-dynamic';

export default async function CalibratePage() {
  const t = await getTranslations('Admin');
  if (!(await isAdmin())) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-neutral-400">
        {t('accessRequired')}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold">{t('cardCalibration')}</h1>
      <p className="mb-6 text-sm text-neutral-400">{t('calibrateIntro')}</p>
      <CalibrateForm />
    </main>
  );
}
