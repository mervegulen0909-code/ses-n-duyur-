export const metadata = { title: 'Privacy Policy — VoxScore' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Privacy Policy</h1>
      <p className="text-neutral-500">Last updated: July 11, 2026</p>
      <p className="rounded-md border border-amber-700/40 bg-amber-950/30 p-3 text-amber-200">
        This policy is written and maintained by the VoxScore team. It has not yet been reviewed by
        a lawyer. Do not rely on it as a final, store-ready policy until that review is complete.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Who we are</h2>
      <p>
        VoxScore is operated by Fersa Ltd. Şti. Questions about this policy or your data can be sent
        to{' '}
        <a className="text-emerald-400" href="mailto:support@voxscore.app">
          support@voxscore.app
        </a>
        .
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">What we collect and why</h2>
      <p>
        <strong>Account data:</strong> email address and handle, used to sign you in and identify
        your submissions and votes.
      </p>
      <p>
        <strong>Performances:</strong> the YouTube links you submit, plus the public title/channel
        metadata YouTube provides for them. We never store YouTube media itself — videos are
        embedded via the official YouTube player and remain on YouTube&apos;s servers.
      </p>
      <p>
        <strong>Votes, comments and listen events:</strong> your votes, written comments, and
        watch-progress events (timestamps and playback position) used for the Verified Listen
        anti-cheat check.
      </p>
      <p>
        <strong>Push-notification tokens:</strong> if you enable notifications in the mobile app, we
        store your device&apos;s push token and platform (iOS/Android).
      </p>
      <p>
        <strong>Moderation records:</strong> reports and takedown requests, kept to enforce these
        policies and respond to legal requests.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">
        Your voice recordings (Measured scoring)
      </h2>
      <p>
        VoxScore&apos;s optional &ldquo;Measure my recording&rdquo; feature lets you record your own
        performance of a song directly in the app so we can calculate real, objective vocal metrics
        (pitch accuracy, rhythm, technical skill, recording quality) instead of an AI estimate. This
        is separate from — and never applied to — embedded YouTube videos, which we never download
        or analyze (see &ldquo;How AI and Measured scores work&rdquo; below).
      </p>
      <p>
        When you use this feature: the app records audio with your device microphone (after you
        grant permission), uploads that recording to our server over an encrypted connection, our
        server analyzes it to produce the metrics above, and <strong>the audio file is deleted
        immediately after analysis</strong>. We do not retain the recording, do not use it to train
        AI models, and do not share it with any third party. Only the resulting numeric scores are
        stored against your performance. You can decline microphone permission and use VoxScore
        without ever recording audio — Measured scoring is entirely optional.
      </p>
      <p>
        Voice recordings can be treated as sensitive data under some privacy laws (for example,
        biometric-information statutes in certain US states). We are flagging this explicitly so it
        gets specific legal attention — see the notice at the top of this page.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">
        How AI and Measured scores work
      </h2>
      <p>
        The &ldquo;Provisional AI Estimate&rdquo; shown on embedded YouTube performances is produced
        by sending the performance&apos;s public metadata (video title and channel name) to an AI
        provider (OpenAI or Anthropic, depending on configuration). We never send audio, video, or
        your personal data for this scoring, and the estimate is an interpretive label — not a real
        audio measurement. Criteria labeled &ldquo;Measured&rdquo; come only from real audio analysis
        of a recording you submitted yourself, as described above.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Third-party services</h2>
      <p>
        VoxScore runs on <strong>Supabase</strong> (database, authentication — including optional
        Google sign-in — and file handling), <strong>Vercel</strong> (web hosting), and{' '}
        <strong>Expo</strong> (mobile push notification delivery). We use{' '}
        <strong>Upstash</strong> for rate limiting and <strong>Cloudflare Turnstile</strong> for bot
        protection on web submissions. AI estimates are generated via <strong>OpenAI</strong> or{' '}
        <strong>Anthropic</strong>. Embedded videos are served by YouTube under YouTube&apos;s own
        terms and privacy policy. None of these providers receive your voice recordings; the DSP
        analysis described above runs on our own servers only.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Anti-abuse</h2>
      <p>
        We use rate limiting and a bot-check (e.g. Cloudflare Turnstile) to protect vote integrity.
        We do not use invasive device fingerprinting, and we do not sell your data or show
        third-party ads.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Data retention</h2>
      <p>
        We keep account, performance, vote, and comment data for as long as your account is active.
        Voice recordings uploaded for Measured scoring are deleted immediately after analysis, as
        described above. Moderation and takedown records may be kept after account deletion where
        needed to comply with legal obligations or resolve disputes.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Your rights</h2>
      <p>
        You can delete your account and all associated data at any time from the app&apos;s Profile
        screen (Delete account); deletion is immediate and permanent. Depending on where you live,
        you may also have the right to access, correct, export, or object to the processing of your
        data (for example, under the EU/UK GDPR or the California Consumer Privacy Act). To exercise
        any of these rights, or for content disputes, contact us via the{' '}
        <a className="text-emerald-400" href="/dmca">
          takedown form
        </a>{' '}
        or the contact address above.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">International users</h2>
      <p>
        Our infrastructure providers (Supabase, Vercel) may process and store data outside your home
        country. If you are in the EU/UK, this may involve a transfer of personal data outside the
        EEA/UK; we rely on our providers&apos; standard contractual safeguards for these transfers.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Children&apos;s privacy</h2>
      <p>
        VoxScore is not directed at children, and we do not knowingly collect personal data from
        anyone under 13 (or the minimum age required in your country). If you believe a child has
        created an account, contact us and we will delete it.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Changes to this policy</h2>
      <p>
        If we make material changes to this policy, we will update the &ldquo;Last updated&rdquo;
        date above and, where required, notify you in the app.
      </p>
    </main>
  );
}
