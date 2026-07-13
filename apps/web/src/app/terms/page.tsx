export const metadata = { title: 'Terms of Service — VoxScore' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Terms of Service</h1>
      <p className="text-neutral-500">Last updated: July 11, 2026</p>
      <p className="rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-amber-200">
        These terms are written and maintained by the VoxScore team. They have not yet been reviewed
        by a lawyer, and the governing-law and jurisdiction section below is a placeholder. Do not
        rely on this as a final, store-ready terms document until that review is complete.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">1. What VoxScore is</h2>
      <p>
        VoxScore lets users submit links to vocal performances hosted on YouTube and rates them with
        AI estimates and community votes. We embed YouTube content via the official player; we do
        not host, download, or store any video or audio from YouTube. Separately, VoxScore offers an
        optional feature that lets you record and upload your own performance so we can calculate
        real vocal metrics from that recording; that audio is analyzed and immediately deleted (see
        the{' '}
        <a className="text-emerald-400" href="/privacy">
          Privacy Policy
        </a>{' '}
        for details).
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">2. Eligibility</h2>
      <p>
        You must be at least 13 years old (or the minimum age of digital consent in your country) to
        create a VoxScore account.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">3. Your responsibilities</h2>
      <p>
        You must have the right to link the content you submit, and to record and upload your own
        performances. Do not submit infringing content, content you don&apos;t have rights to, or
        recordings that are not your own voice. AI scores are labeled &ldquo;Provisional AI
        Estimate&rdquo; and criteria from your own recordings are labeled &ldquo;Measured&rdquo; —
        neither is an authoritative or professional audio measurement, and both are provided for
        entertainment and community-ranking purposes only.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">4. Fair play</h2>
      <p>
        Votes require a completed Verified Listen and are subject to anti-abuse controls.
        Manipulating listens, votes, or recordings (for example, submitting audio that is not your
        own live performance) may result in content removal or account suspension.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">5. Prohibited conduct</h2>
      <p>
        Do not use VoxScore to harass others, upload unlawful or infringing content, attempt to
        bypass anti-abuse or bot-check systems, or interfere with the service&apos;s normal
        operation. We may remove content or suspend accounts that violate these terms.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">6. Takedowns</h2>
      <p>
        We respond to copyright complaints. See our{' '}
        <a className="text-emerald-400" href="/dmca">
          DMCA / takedown
        </a>{' '}
        policy for how to submit a notice and how counter-notices work.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">7. Termination</h2>
      <p>
        You may stop using VoxScore and delete your account at any time from the app&apos;s Profile
        screen. We may suspend or terminate accounts that violate these terms.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">8. Disclaimers</h2>
      <p>
        VoxScore is provided &ldquo;as is,&rdquo; without warranties of any kind. Scores, rankings,
        and battle outcomes are for entertainment purposes and do not constitute professional vocal
        assessment or certification of any kind.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">9. Governing law</h2>
      <p>
        These terms are governed by the laws of the Republic of Turkey, and any dispute not resolved
        informally will be subject to the exclusive jurisdiction of the courts of Istanbul, Turkey,
        without regard to conflict-of-laws principles.
      </p>
      <p>
        This choice does not remove any protection you are entitled to under the mandatory consumer
        protection, data privacy, or other statutory laws of the country where you live, which
        continue to apply where local law requires it. If you are a consumer in the European Union
        or the United Kingdom, you may also be able to bring a claim in the courts of your own
        country of residence, and EU consumers can use the European Commission&apos;s Online Dispute
        Resolution platform at{' '}
        <a
          className="text-emerald-400"
          href="https://ec.europa.eu/consumers/odr"
          target="_blank"
          rel="noreferrer"
        >
          ec.europa.eu/consumers/odr
        </a>
        . If you are a California resident, nothing here waives any right you have under California
        law that cannot be waived by agreement.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">10. Changes to these terms</h2>
      <p>
        If we make material changes to these terms, we will update the &ldquo;Last updated&rdquo;
        date above and, where required, notify you in the app.
      </p>
    </main>
  );
}
