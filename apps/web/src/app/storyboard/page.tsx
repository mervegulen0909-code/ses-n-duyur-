import type { Metadata } from 'next';
import { Manrope, Sora } from 'next/font/google';
import { FitToWidth } from '@/components/fit-to-width';
import { VoxScorePrototype } from '@/components/voxscore-prototype';
import { VoxScoreStoryboard } from '@/components/voxscore-storyboard';

// Storyboard type, scoped to this route via CSS variables (Sora display +
// Manrope body) so it doesn't affect the rest of the app's neutral theme.
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sora',
});
const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'VoxScore — Visual Storyboard',
  description:
    'A premium product-design storyboard for VoxScore: AI-powered voice & vocal scoring across six mobile screens — splash, onboarding, recording, live scoring, results, and progress.',
};

const sora_ff = { fontFamily: 'var(--font-sora), system-ui, sans-serif' };

export default function StoryboardPage() {
  return (
    <main
      className={`${sora.variable} ${manrope.variable} min-h-screen bg-[#070a0f] text-[#e7edf2]`}
      style={{ fontFamily: 'var(--font-manrope), system-ui, sans-serif' }}
    >
      {/* intro */}
      <section className="mx-auto max-w-3xl px-6 pb-10 pt-16 text-center">
        <div className="text-[13px] font-semibold tracking-[0.22em] text-[#3fd0ec]" style={sora_ff}>
          AI-POWERED VOICE &amp; VOCAL SCORING
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl" style={sora_ff}>
          <span className="text-[#f1f5f8]">Vox</span>
          <span className="text-[#3fd0ec]">Score</span>
          <span className="text-[#f1f5f8]"> — Visual Storyboard</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#9aa6b3]">
          A premium product-design walkthrough of the VoxScore mobile experience — splash to
          progress. Tap through the live prototype below, or scan the full six-screen flow at a
          glance.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] text-[#8a96a4]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f0795f]" />
          Prototype · simulated data — no live audio is captured or analyzed
        </div>
      </section>

      {/* interactive prototype */}
      <section className="px-6 pb-20">
        <h2
          className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-[#7f8b9a]"
          style={sora_ff}
        >
          Try it · tap through the flow
        </h2>
        <div className="mt-10">
          <VoxScorePrototype />
        </div>
      </section>

      {/* full board overview */}
      <section className="border-t border-white/[0.06] px-4 py-16 sm:px-8">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2
            className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#7f8b9a]"
            style={sora_ff}
          >
            The full flow at a glance
          </h2>
          <p className="mt-3 text-[14px] text-[#8a96a4]">
            The presentation board — all six screens in sequence with the VoxScore brand system.
          </p>
        </div>
        <FitToWidth width={1600}>
          <VoxScoreStoryboard />
        </FitToWidth>
      </section>
    </main>
  );
}
