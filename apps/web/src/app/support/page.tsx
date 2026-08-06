export const metadata = { title: 'Support — VoxScore' };

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Support</h1>
      <p className="text-neutral-500">Last updated: August 6, 2026</p>

      <p>
        Something not working, or a question about how scoring works? Write to us and a human will
        answer. This page also lists the things people ask about most, in case the answer is here
        already.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Contact us</h2>
      <p>
        Email:{' '}
        <a className="text-emerald-400" href="mailto:support@voxscore.app">
          support@voxscore.app
        </a>
      </p>
      <p>
        We aim to reply within two business days. Please include your account email, the device and
        app version you are using, and — if the problem is about a specific performance or battle —
        a link to it. That usually saves a whole round of questions.
      </p>
      <p>
        For copyright complaints and takedown notices, use the{' '}
        <a className="text-emerald-400" href="/dmca">
          DMCA / takedown
        </a>{' '}
        procedure instead, so your notice is handled under the right process.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Common questions</h2>

      <h3 className="pt-2 font-semibold text-neutral-200">I can&apos;t vote or score a performance</h3>
      <p>
        Scoring unlocks only after a Verified Listen. Play the performance and let it run to the
        end — skipping ahead does not count, which is deliberate: it keeps rankings honest. In a
        battle, both sides have to be listened to before a winner can be picked.
      </p>

      <h3 className="pt-2 font-semibold text-neutral-200">What does &ldquo;Provisional AI Estimate&rdquo; mean?</h3>
      <p>
        For performances added as YouTube links, VoxScore never downloads or analyses the audio. The
        score shown is an interpretive estimate and is labelled as provisional. It is not a
        measurement. Real measured feedback is only produced for a recording you make yourself and
        own.
      </p>

      <h3 className="pt-2 font-semibold text-neutral-200">What happens to a recording I make?</h3>
      <p>
        It is analysed and then immediately deleted. Only the resulting measurements are stored — the
        audio itself is not kept. See the{' '}
        <a className="text-emerald-400" href="/privacy">
          Privacy Policy
        </a>{' '}
        for the full description.
      </p>

      <h3 className="pt-2 font-semibold text-neutral-200">Reporting content or another user</h3>
      <p>
        Every performance and comment can be reported from its own page. Reports go to moderators,
        who can hide content and restrict accounts. If something needs urgent attention, email us
        with a link and we will look at it directly.
      </p>

      <h3 className="pt-2 font-semibold text-neutral-200">Deleting your account</h3>
      <p>
        You can delete your account and its content at any time, from inside the app or from{' '}
        <a className="text-emerald-400" href="/account/delete">
          this page
        </a>
        . Deletion removes your performances, scores and comments.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Who operates VoxScore</h2>
      <p>
        VoxScore is operated by the company listed on the{' '}
        <a className="text-emerald-400" href="/company">
          Company Information
        </a>{' '}
        page, which also carries our registered address and registry details. Our{' '}
        <a className="text-emerald-400" href="/terms">
          Terms of Service
        </a>{' '}
        explain the rules that apply to using the service.
      </p>
    </main>
  );
}
