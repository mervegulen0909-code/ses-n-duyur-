import { DmcaForm } from '@/components/dmca-form';

export const metadata = { title: 'DMCA / Takedown — VoxScore' };

export default function DmcaPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold">DMCA / Takedown request</h1>
      <p className="mb-6 text-sm text-neutral-400">
        We embed YouTube videos and never host media. If you believe content here infringes your
        rights, file a request below and we will review it promptly.
      </p>
      <DmcaForm />
    </main>
  );
}
