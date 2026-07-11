import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type YoutubeIframeRef } from 'react-native-youtube-iframe';

import type { ListenEvent } from '@voxscore/core';
import { NativeYouTubePlayer } from '@/components/native-youtube-player';
import { nextBattle, submitBattleVote } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { useVerifiedListen } from '@/lib/use-verified-listen';

// One side of a battle: a performance to listen to and pick (or not).
type Side = {
  performanceId: string;
  videoId: string;
  title: string;
  authorName: string;
};
type Battle = {
  battleId: string;
  a: Side;
  b: Side;
};

// /api/battles/next returns videoId + title only. We enrich each side with the
// richer oembed_meta (author) by reading performances directly from supabase
// (RLS-protected, world-readable for active rows) — same source the detail and
// leaderboard screens use.
type MetaRow = {
  id: string;
  oembed_meta: { title?: string; authorName?: string } | null;
};

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Drives one side's Verified Listen by mirroring the YouTube player-state
 * tracking from performance/[id].tsx: open the listen on first play, push a
 * watch-event every second while playing, and submit the trail on end. The
 * server runs the same anti-cheat and decides if the listen is verified.
 */
function useSideTracker(performanceId: string) {
  const listen = useVerifiedListen(performanceId);
  const playerRef = useRef<YoutubeIframeRef>(null);
  const eventsRef = useRef<ListenEvent[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Uploader disabled embedding (YouTube 101/150): this side can't be verified.
  const [embedBlocked, setEmbedBlocked] = useState(false);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const pushEvent = (kind: ListenEvent['kind'], atSeconds: number) => {
    eventsRef.current.push({ kind, atSeconds: Math.max(0, atSeconds), clientTs: Date.now() });
  };

  const onChangeState = useCallback(
    async (s: string) => {
      if (s === 'playing') {
        await listen.onStart();
        const t = (await playerRef.current?.getCurrentTime()) ?? 0;
        pushEvent('playing', t);
        if (!pollRef.current) {
          pollRef.current = setInterval(async () => {
            const cur = await playerRef.current?.getCurrentTime();
            if (typeof cur === 'number') pushEvent('playing', cur);
          }, 1000);
        }
      } else if (s === 'paused') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        const t = (await playerRef.current?.getCurrentTime()) ?? 0;
        pushEvent('paused', t);
      } else if (s === 'ended') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        const dur = (await playerRef.current?.getDuration()) ?? 0;
        pushEvent('ended', dur);
        await listen.onComplete(eventsRef.current, dur);
      }
    },
    [listen],
  );

  return { listen, playerRef, onChangeState, embedBlocked, setEmbedBlocked };
}

function statusHint(
  status: ReturnType<typeof useVerifiedListen>['status'],
  reason: string | null,
  embedBlocked: boolean,
) {
  if (embedBlocked) return 'Embedding disabled — plays on YouTube only, can’t verify here.';
  if (status === 'verified') return 'Listened ✓';
  if (status === 'listening') return 'Keep watching to the end…';
  if (status === 'invalid') return reason ?? 'Not fully listened — watch again to count.';
  return 'Press play and watch fully.';
}

function BattleSide({ side, tracker }: { side: Side; tracker: ReturnType<typeof useSideTracker> }) {
  const { listen, playerRef, onChangeState, embedBlocked, setEmbedBlocked } = tracker;
  return (
    <View style={styles.sideCard}>
      <Text style={styles.sideTitle} numberOfLines={2}>
        {side.title}
      </Text>
      {!!side.authorName && (
        <Text style={styles.sideArtist} numberOfLines={1}>
          {side.authorName}
        </Text>
      )}
      <View style={styles.player}>
        <NativeYouTubePlayer
          ref={playerRef}
          height={200}
          videoId={side.videoId}
          onChangeState={onChangeState}
          onError={(e: string) => {
            if (e === 'embed_not_allowed') setEmbedBlocked(true);
          }}
        />
      </View>
      <Text
        style={[
          styles.sideStatus,
          listen.status === 'verified' && styles.sideStatusOk,
          (listen.status === 'invalid' || embedBlocked) && styles.sideStatusBad,
        ]}
      >
        {statusHint(listen.status, listen.reason, embedBlocked)}
      </Text>
    </View>
  );
}

function BattleArena({ battle, onNext }: { battle: Battle; onNext: () => void }) {
  const router = useRouter();
  const { user } = useSession();
  const trackerA = useSideTracker(battle.a.performanceId);
  const trackerB = useSideTracker(battle.b.performanceId);

  const [voteState, setVoteState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [voteMsg, setVoteMsg] = useState('');

  // HARD RULE: a winner cannot be picked until BOTH sides reach a Verified
  // Listen. The server re-checks this; we also gate the UI here.
  const bothVerified =
    trackerA.listen.status === 'verified' && trackerB.listen.status === 'verified';

  async function pickWinner(winnerPerformanceId: string) {
    const listenAId = trackerA.listen.listenId.current;
    const listenBId = trackerB.listen.listenId.current;
    if (!bothVerified || !listenAId || !listenBId || voteState === 'submitting') return;
    setVoteState('submitting');
    setVoteMsg('');
    // battleVoteSchema: { battleId, winnerPerformanceId, listenAId, listenBId }.
    const res = await submitBattleVote({
      battleId: battle.battleId,
      winnerPerformanceId,
      listenAId,
      listenBId,
    });
    if (res.ok) {
      setVoteState('done');
      setVoteMsg('Vote recorded. Thanks for judging!');
    } else {
      setVoteState('error');
      // /api/battles/vote uses only rateLimit (NO botGuard) and authenticates via
      // Bearer (getRequestContext), which is live in prod — so it works from
      // native. A 401 here means the session expired; a 403 is the
      // both-listens-must-be-valid hard-rule check; a 409 is a duplicate vote.
      setVoteMsg(
        res.status === 401
          ? 'Your session expired — sign in again to vote.'
          : res.status === 403
            ? (res.error ?? 'Both performances must be fully listened to vote.')
            : res.status === 409
              ? 'You have already voted in this battle.'
              : (res.error ?? `Could not record vote (${res.status}).`),
      );
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.gate}>
        {bothVerified
          ? 'Both performances listened — pick your winner.'
          : 'Listen to BOTH performances fully to unlock the winner pick.'}
      </Text>

      <BattleSide side={battle.a} tracker={trackerA} />
      <Text style={styles.vs}>VS</Text>
      <BattleSide side={battle.b} tracker={trackerB} />

      {voteState === 'done' ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultText}>{voteMsg}</Text>
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
            onPress={onNext}
          >
            <Text style={styles.nextBtnText}>Next battle ›</Text>
          </Pressable>
        </View>
      ) : !user ? (
        <Pressable style={styles.signinCard} onPress={() => router.push('/login')}>
          <Text style={styles.signinPrompt}>Sign in to pick a winner ›</Text>
        </Pressable>
      ) : (
        <View style={styles.pickRow}>
          <Pressable
            style={({ pressed }) => [
              styles.pickBtn,
              (!bothVerified || voteState === 'submitting') && styles.pickBtnDisabled,
              pressed && bothVerified && { opacity: 0.85 },
            ]}
            disabled={!bothVerified || voteState === 'submitting'}
            onPress={() => pickWinner(battle.a.performanceId)}
          >
            <Text style={styles.pickBtnText} numberOfLines={2}>
              {battle.a.title} wins
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.pickBtn,
              (!bothVerified || voteState === 'submitting') && styles.pickBtnDisabled,
              pressed && bothVerified && { opacity: 0.85 },
            ]}
            disabled={!bothVerified || voteState === 'submitting'}
            onPress={() => pickWinner(battle.b.performanceId)}
          >
            <Text style={styles.pickBtnText} numberOfLines={2}>
              {battle.b.title} wins
            </Text>
          </Pressable>
        </View>
      )}

      {voteState === 'submitting' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}
      {voteState === 'error' && <Text style={styles.error}>{voteMsg}</Text>}

      {/* Always offer a way out: if a side can't be completed (embedding
          disabled, broken video, or the user just isn't interested), the
          battle would otherwise dead-end — Next only appeared after a vote. */}
      {voteState !== 'done' && (
        <Pressable onPress={onNext} hitSlop={8} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip — next battle ›</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

export default function BattleScreen() {
  const router = useRouter();
  const { user, loading } = useSession();
  const userId = user?.id ?? null;
  const [battle, setBattle] = useState<Battle | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  // Bumping the nonce reloads a fresh pairing (after a vote or a retry).
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // Only fetch once the session has resolved AND a user is signed in: the
    // battle routes authenticate via Bearer (getRequestContext), so an
    // anonymous fetch 401s. The signed-out gate below covers the no-user case.
    // Keying on userId (not the user object) avoids a refetch on token refresh.
    if (loading || !userId) return;
    let active = true;
    setState('loading');
    setBattle(null);
    setError('');

    (async () => {
      // Pairings come from /api/battles/next: only admins/service-role may insert
      // into `battles` (RLS), so a client cannot create one directly via supabase.
      // The route is Bearer-authenticated (live in prod), so a 401 here means the
      // session expired rather than a missing backend.
      const res = await nextBattle();
      if (!active) return;

      if (res.status === 404) {
        setState('empty');
        return;
      }
      if (!res.ok || !res.data?.battleId) {
        setError(
          res.status === 401
            ? 'Your session expired — sign in again and retry.'
            : (res.data?.error ?? `Could not load a battle (${res.status}).`),
        );
        setState('error');
        return;
      }

      const { battleId, a, b } = res.data;
      // /api/battles/next types videoId as string | null (the route selects the
      // nullable youtube_video_id). Guard for a missing video before narrowing —
      // the web arena does the same (body.a.videoId && body.b.videoId).
      if (!a.videoId || !b.videoId) {
        setError('This battle is missing a video. Try another.');
        setState('error');
        return;
      }
      // Enrich both sides from supabase (RLS-protected, world-readable).
      const { data: metaRows } = await supabase
        .from('performances')
        .select('id, oembed_meta')
        .in('id', [a.performanceId, b.performanceId]);
      if (!active) return;

      const rows = (metaRows ?? []) as unknown as MetaRow[];
      const metaOf = (id: string) => rows.find((r) => r.id === id)?.oembed_meta ?? {};
      const sideOf = (side: { performanceId: string; videoId: string; title: string }): Side => {
        const meta = metaOf(side.performanceId);
        return {
          performanceId: side.performanceId,
          videoId: side.videoId,
          title: meta.title ?? side.title ?? 'Performance',
          authorName: meta.authorName ?? '',
        };
      };

      setBattle({
        battleId,
        a: sideOf({ ...a, videoId: a.videoId }),
        b: sideOf({ ...b, videoId: b.videoId }),
      });
      setState('ready');
    })();

    return () => {
      active = false;
    };
  }, [nonce, userId, loading]);

  // ---- Signed-out gate (mirrors /add and /profile) ------------------------
  if (!loading && !user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.heading}>Battle</Text>
          <Text style={styles.sub}>Two performances, one winner. Listen to both, then decide.</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Sign in to battle</Text>
          <Text style={styles.emptyText}>
            Battles pit two performances head-to-head. Sign in to listen to both and pick the
            winner.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.nextBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.heading}>Battle</Text>
        <Text style={styles.sub}>Two performances, one winner. Listen to both, then decide.</Text>
      </View>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}

      {state === 'empty' && (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No open battles</Text>
          <Text style={styles.emptyText}>
            Not enough performances to battle yet. Add more from the leaderboard, then check back.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setNonce((n) => n + 1)}
          >
            <Text style={styles.nextBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {state === 'error' && (
        <View style={styles.emptyWrap}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setNonce((n) => n + 1)}
          >
            <Text style={styles.nextBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {state === 'ready' && battle && (
        <BattleArena key={battle.battleId} battle={battle} onNext={() => setNonce((n) => n + 1)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  back: { paddingVertical: 4 },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  heading: { marginTop: 4, fontSize: 26, fontWeight: '800', color: '#fafafa' },
  sub: { marginTop: 4, fontSize: 13, color: '#9ca3af' },
  spinner: { marginTop: 40 },
  error: { color: '#fb7185', fontSize: 14, textAlign: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  gate: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#171717',
    color: '#9ca3af',
    fontSize: 13,
    textAlign: 'center',
  },
  sideCard: { padding: 14, borderRadius: 16, backgroundColor: '#171717', gap: 6 },
  sideTitle: { fontSize: 16, fontWeight: '700', color: '#fafafa' },
  sideArtist: { fontSize: 12, color: '#9ca3af' },
  player: { marginTop: 6, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  sideStatus: { marginTop: 4, fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  sideStatusOk: { color: '#22D3EE' },
  sideStatusBad: { color: '#fb7185' },
  vs: { textAlign: 'center', fontSize: 14, fontWeight: '900', color: '#6b7280', letterSpacing: 2 },
  pickRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  pickBtn: {
    flex: 1,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  pickBtnDisabled: { backgroundColor: '#1f2a25', opacity: 0.5 },
  pickBtnText: { color: '#06281d', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  signinCard: {
    marginTop: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#171717',
    alignItems: 'center',
  },
  signinPrompt: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  resultCard: { marginTop: 4, padding: 16, borderRadius: 16, backgroundColor: '#171717', gap: 12 },
  resultText: { color: '#22D3EE', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  nextBtn: {
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
    alignSelf: 'center',
  },
  nextBtnText: { color: '#06281d', fontSize: 15, fontWeight: '800' },
  skipBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  skipText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#fafafa' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
});
