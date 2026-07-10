import { getTranslations } from 'next-intl/server';
import { DmcaForm } from '@/components/dmca-form';

export const metadata = { title: 'DMCA / Takedown — VoxScore' };

export default async function DmcaPage() {
  const t = await getTranslations('Dmca');
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold">{t('formTitle')}</h1>
      <p className="mb-6 text-sm text-neutral-400">{t('intro')}</p>
      <DmcaForm />
    </main>
  );
}
