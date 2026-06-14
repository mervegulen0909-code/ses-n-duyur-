export const metadata = { title: 'Privacy Policy — VoxScore' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm leading-relaxed text-neutral-300">
      <h1 className="text-2xl font-bold text-neutral-100">Privacy Policy</h1>
      <p className="text-neutral-500">Draft — review with counsel before launch.</p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">What we store</h2>
      <p>
        Account data (email, handle), the performances you submit (YouTube links + public metadata),
        your votes and listen events, comments, and moderation records. We never store YouTube
        media.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Listen events</h2>
      <p>
        To enforce fair voting, we record watch-progress events (timestamps and playback position)
        for the Verified Listen check. These are used for anti-abuse only.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Anti-abuse</h2>
      <p>
        We use rate limiting and a bot-check (e.g. Cloudflare Turnstile) to protect vote integrity.
        We do not use invasive device fingerprinting.
      </p>

      <h2 className="pt-2 text-lg font-semibold text-neutral-100">Your rights</h2>
      <p>
        You may request deletion of your account and associated data. Contact us via the takedown
        form for content disputes.
      </p>
    </main>
  );
}
