export const metadata = { title: 'Privacy Policy — VoxScore' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Privacy Policy</h1>
      <p className="text-neutral-500">Last updated: July 10, 2026</p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">What we store</h2>
      <p>
        Account data (email address and handle), the performances you submit (YouTube links + the
        public title/channel metadata YouTube provides), your votes and listen events, comments,
        push-notification registrations, and moderation records. We never store YouTube media —
        videos are embedded via the official YouTube player and remain on YouTube.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Listen events</h2>
      <p>
        To enforce fair voting, we record watch-progress events (timestamps and playback position)
        for the Verified Listen check. These are used for anti-abuse only.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Push notifications</h2>
      <p>
        If you enable notifications in the mobile app, we store your device&apos;s push token and
        platform (iOS/Android) so we can deliver notifications through Expo&apos;s push service. We
        use it only to send you app notifications; you can disable this at any time in your device
        settings, and the token is deleted with your account.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">AI scoring</h2>
      <p>
        The &ldquo;Provisional AI Estimate&rdquo; is produced by sending the performance&apos;s
        public metadata (video title and channel name) to an AI provider. We never send audio,
        video, or your personal data for scoring, and the estimate is an interpretive label — not a
        real audio measurement.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Third-party services</h2>
      <p>
        VoxScore runs on Supabase (database &amp; authentication, including optional Google sign-in)
        and Vercel (hosting). Embedded videos are served by YouTube under YouTube&apos;s own terms
        and privacy policy.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Anti-abuse</h2>
      <p>
        We use rate limiting and a bot-check (e.g. Cloudflare Turnstile) to protect vote integrity.
        We do not use invasive device fingerprinting, and we do not sell your data or show
        third-party ads.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Your rights</h2>
      <p>
        You can delete your account and all associated data at any time from the app&apos;s Profile
        screen (Delete account); deletion is immediate and permanent. For content disputes or any
        other data request, contact us via the{' '}
        <a className="text-emerald-400" href="/dmca">
          takedown form
        </a>
        .
      </p>
    </main>
  );
}
