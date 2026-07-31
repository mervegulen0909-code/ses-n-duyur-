export const metadata = { title: 'Company Information — VoxScore' };

export default function CompanyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Company Information</h1>
      <p className="text-neutral-500">Last updated: July 31, 2026</p>

      <p>
        VoxScore is a product operated and published by the company registered below. This page is
        provided so that users, partners, and platform reviewers can identify the legal entity
        behind this website and behind the VoxScore mobile application.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Registered company</h2>
      <dl className="space-y-2">
        <div>
          <dt className="text-neutral-500">Legal name</dt>
          <dd className="text-neutral-200">FERSA ELEKTRONİK SANAYİ VE TİCARET LİMİTED ŞİRKETİ</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Legal form</dt>
          <dd className="text-neutral-200">
            Limited şirket (limited liability company), incorporated in the Republic of Türkiye
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Registered address</dt>
          <dd className="text-neutral-200">
            Yeni Mah. Selanik Cad. Demirtel Apt. No: 71/BC, Didim / Aydın, Türkiye
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Trade registry</dt>
          <dd className="text-neutral-200">Didim Trade Registry Office — No. 7478</dd>
        </div>
        <div>
          <dt className="text-neutral-500">MERSİS number</dt>
          <dd className="text-neutral-200">0385213552000001</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Tax office / tax number</dt>
          <dd className="text-neutral-200">Didim Tax Office — 3852135520</dd>
        </div>
      </dl>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Contact</h2>
      <p>
        General and support enquiries:{' '}
        <a className="text-emerald-400" href="mailto:support@voxscore.app">
          support@voxscore.app
        </a>
      </p>
      <p>
        For copyright complaints and takedown notices, please use the{' '}
        <a className="text-emerald-400" href="/dmca">
          DMCA / takedown
        </a>{' '}
        procedure instead of the general contact address, so that your notice is handled correctly.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Products</h2>
      <p>
        This company operates the VoxScore website at{' '}
        <a className="text-emerald-400" href="https://voxscore.app">
          voxscore.app
        </a>{' '}
        and publishes the VoxScore mobile application (Android package{' '}
        <code className="text-neutral-200">com.voxscore.app</code>).
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Related documents</h2>
      <p>
        See our{' '}
        <a className="text-emerald-400" href="/terms">
          Terms of Service
        </a>{' '}
        and{' '}
        <a className="text-emerald-400" href="/privacy">
          Privacy Policy
        </a>
        .
      </p>
    </main>
  );
}
