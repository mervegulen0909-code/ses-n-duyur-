import { getTranslations } from 'next-intl/server';
import { DmcaForm } from '@/components/dmca-form';

export const metadata = { title: 'DMCA / Takedown — VoxScore' };

export default async function DmcaPage() {
  const t = await getTranslations('Dmca');
  return (
    <main className="mx-auto max-w-lg space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="mb-2 text-2xl font-bold text-neutral-100">{t('formTitle')}</h1>
      <p className="rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-amber-200">
        This policy is written and maintained by the VoxScore team and has not yet been reviewed by
        a lawyer. The designated agent details below are placeholders — do not treat this as a
        final, store-ready DMCA policy until that review is complete.
      </p>
      <p>{t('intro')}</p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">How to submit a notice</h2>
      <p>
        VoxScore embeds YouTube videos and never hosts media, so most copyright concerns about
        embedded content should go to YouTube directly. For content we do control (comments, or
        performance listings we control), a valid takedown notice under the Digital Millennium
        Copyright Act must include, in writing:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>A physical or electronic signature of the copyright owner or their authorized agent.</li>
        <li>Identification of the copyrighted work claimed to have been infringed.</li>
        <li>
          Identification of the material claimed to be infringing, with enough detail (e.g. a
          performance ID or URL) for us to locate it.
        </li>
        <li>Your contact information: address, telephone number, and email address.</li>
        <li>
          A statement that you have a good-faith belief the use is not authorized by the copyright
          owner, its agent, or the law.
        </li>
        <li>
          A statement, made under penalty of perjury, that the above information is accurate and
          that you are the copyright owner or authorized to act on their behalf.
        </li>
      </ul>
      <p>
        Send notices to our designated agent at [DMCA agent name and email — to be confirmed], or use
        the form below.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Counter-notification</h2>
      <p>
        If content you submitted was removed and you believe this was a mistake or misidentification,
        you may send a counter-notice with your contact information, identification of the removed
        material, a statement under penalty of perjury that you have a good-faith belief the material
        was removed in error, and a statement consenting to the jurisdiction of the applicable federal
        court. We will forward valid counter-notices to the original claimant.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Repeat infringers</h2>
      <p>
        We may remove content and suspend or terminate the accounts of users who repeatedly submit
        infringing content.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Submit a request</h2>
      <DmcaForm />
    </main>
  );
}
