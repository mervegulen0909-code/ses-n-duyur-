import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FollowButton } from '@/components/follow-button';
import { ProfileEditor } from '@/components/profile-editor';
import { ProvisionalBadge } from '@/components/provisional-badge';
import { summarizeCreator } from '@/lib/creator';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw);
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center text-neutral-400">
        {t('Common.supabaseNotConfigured')}
      </main>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handle, role, bio, avatar_url, links')
    .eq('handle', handle)
    .maybeSingle();

  if (!profile) notFound();
  const profileLinks = (profile.links ?? []) as { label: string; url: string }[];

  // Badges: server-granted only (grant_badge RPC, service_role — see
  // supabase/migrations/20260711170000_badges.sql). profile_badges is
  // public-read RLS, so no service client is needed here. Two queries + a JS
  // join, matching this file's existing pattern for follows/performances
  // (nested Supabase embeds aren't used anywhere in this codebase).
  const { data: earnedBadges } = await supabase
    .from('profile_badges')
    .select('badge_key, awarded_at')
    .eq('user_id', profile.id)
    .order('awarded_at', { ascending: true });
  const badgeKeys = [...new Set((earnedBadges ?? []).map((b) => b.badge_key))];
  const { data: badgeDefs } = badgeKeys.length
    ? await supabase.from('badges').select('key, title, description, icon').in('key', badgeKeys)
    : { data: [] };
  const badgeByKey = new Map((badgeDefs ?? []).map((b) => [b.key, b]));
  const badges = (earnedBadges ?? [])
    .map((b) => badgeByKey.get(b.badge_key))
    .filter((b): b is NonNullable<typeof b> => !!b);

  // Follow graph: public counts + (when signed in and not self) whether the
  // viewer already follows this creator. All reads pass the follows
  // select-all RLS policy — no service client needed on a public page.
  const [{ count: followerCount }, { count: followingCount }, viewer] = await Promise.all([
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('followee_id', profile.id),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', profile.id),
    supabase.auth.getUser(),
  ]);
  const viewerId = viewer.data.user?.id ?? null;
  let viewerFollows = false;
  if (viewerId && viewerId !== profile.id) {
    const { data: edge } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', viewerId)
      .eq('followee_id', profile.id)
      .maybeSingle();
    viewerFollows = !!edge;
  }

  // Public view: active performances only (RLS would also surface the owner's
  // own non-active ones, but a profile page is the public creator view).
  const { data: perfs } = await supabase
    .from('performances')
    .select('id, oembed_meta, battle_wins, battle_count')
    .eq('user_id', profile.id)
    .eq('status', 'active');

  const ids = (perfs ?? []).map((p) => p.id);
  const { data: scores } = ids.length
    ? await supabase
        .from('scores')
        .select('performance_id, current_score, is_provisional')
        .in('performance_id', ids)
    : { data: [] };

  const summary = summarizeCreator(perfs ?? [], scores ?? []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <div className="flex items-start gap-4">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-16 w-16 shrink-0 rounded-full bg-neutral-800" />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">@{profile.handle}</h1>
              {profile.role === 'admin' && (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                  {t('Nav.admin')}
                </span>
              )}
              {viewerId && viewerId !== profile.id && (
                <FollowButton handle={profile.handle} initialFollowing={viewerFollows} />
              )}
            </div>
            <p className="mt-2 text-sm text-neutral-400">
              {t('Profile.followerCount', { count: followerCount ?? 0 })}
              {' · '}
              {t('Profile.followingCount', { count: followingCount ?? 0 })}
              {' · '}
              {t('Profile.performanceCount', { count: summary.totalPerformances })}
              {summary.battles > 0 && (
                <>
                  {' · '}
                  {t('Profile.battleRecord', { wins: summary.wins, losses: summary.losses })}
                  {summary.winRate !== null && (
                    <> · {t('Profile.winRate', { rate: (summary.winRate * 100).toFixed(0) })}</>
                  )}
                </>
              )}
            </p>
            {profile.bio && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-300">{profile.bio}</p>
            )}
            {badges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {badges.map((b) => (
                  <span
                    key={b.key}
                    title={b.description}
                    className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900/70 px-2 py-0.5 text-xs text-neutral-300"
                  >
                    <span>{b.icon}</span>
                    <span>{b.title}</span>
                  </span>
                ))}
              </div>
            )}
            {profileLinks.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-3">
                {profileLinks.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="text-sm text-emerald-400 hover:underline"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
            {viewerId === profile.id && (
              <div>
                <ProfileEditor
                  userId={profile.id}
                  initialBio={profile.bio}
                  initialAvatarUrl={profile.avatar_url}
                  initialLinks={profileLinks}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {summary.rows.length === 0 ? (
        <p className="text-neutral-400">{t('Profile.noPublic')}</p>
      ) : (
        <ol className="space-y-2">
          {summary.rows.map((r, i) => (
            <li key={r.id}>
              <Link
                href={`/performance/${r.id}`}
                className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 hover:border-neutral-600"
              >
                <span className="w-6 text-right tabular-nums text-neutral-500">{i + 1}</span>
                <span className="flex-1 truncate text-sm">
                  {r.title || t('Common.untitledPerformance')}
                </span>
                {r.isProvisional && <ProvisionalBadge />}
                <span className="hidden text-xs text-neutral-500 sm:inline">
                  {r.wins}-{r.battles - r.wins}
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">
                  {r.currentScore === null ? '—' : r.currentScore.toFixed(1)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
