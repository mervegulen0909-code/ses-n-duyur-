export const metadata = { title: 'Terms of Service — VocalLeague' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Terms of Service</h1>
      <p className="text-neutral-500">Draft — review with counsel before launch.</p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">1. What VocalLeague is</h2>
      <p>
        VocalLeague lets users submit links to vocal performances hosted on YouTube and rates them
        with AI estimates and community votes. We embed YouTube content via the official player; we
        do not host, download, or store any video or audio.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">2. Your responsibilities</h2>
      <p>
        You must have the right to link the content you submit. Do not submit infringing content. AI
        scores are labeled “Provisional AI Estimate” and are not authoritative measurements.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">3. Fair play</h2>
      <p>
        Votes require a completed Verified Listen and are subject to anti-abuse controls.
        Manipulating listens or votes may result in removal.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">4. Takedowns</h2>
      <p>
        We respond to copyright complaints. See our{' '}
        <a className="text-emerald-400" href="/dmca">
          DMCA / takedown
        </a>{' '}
        process.
      </p>
    </main>
  );
}
