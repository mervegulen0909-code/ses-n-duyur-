import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import YoutubePlayer, { type YoutubeIframeRef } from 'react-native-youtube-iframe';

import type { ListenEvent } from '@vocal-league/core';
import { CRITERIA } from '@vocal-league/scoring';
import { submitVote } from '@/lib/api';
import { CRITERION_LABELS } from '@/lib/criteria-labels';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { useVerifiedListen } from '@/lib/use-verified-listen';

type ScoreRow = {
  current_score: number | null;
  initial_ai_score: number | null;
  trend_score: number | null;
  ai_breakdown: Record<string, number> | null;
  is_provisional: boolean | null;
};
type Perf = {
  id: string;
  youtube_video_id: string;
  has_video: boolean;
  oembed_meta: { title?: string; authorName?: string } | null;
  scores: ScoreRow | ScoreRow[] | null;
};

function one<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default function PerformanceScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [perf, setPerf] = useState<Perf | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const listen = useVerifiedListen(id);

  // Watch-event tracking for the Verified Listen.
  const playerRef = useRef<YoutubeIframeRef>(null);
  const eventsRef = useRef<ListenEvent[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(CRITERIA.map((c) => [c, 50])),
  );
  const [voteState, setVoteState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [voteMsg, setVoteMsg] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('performances')
        .select(
          'id, youtube_video_id, has_video, oembed_meta, scores(current_score, initial_ai_score, trend_score, ai_breakdown, is_provisional)',
        )
        .eq('id', id)
        .single();
      if (!active) return;
      if (error) {
        setError(error.message);
        setState('error');
        return;
      }
      setPerf(data as unknown as Perf);
      setState('ready');
    })();
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id]);

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

  async function doVote() {
    const listenId = listen.listenId.current;
    if (!listenId || !perf) return;
    setVoteState('submitting');
    setVoteMsg('');
    const activeRatings = Object.fromEntries(activeCriteria.map((c) => [c, Math.round(ratings[c])]));
    const res = await submitVote(perf.id, listenId, activeRatings);
    if (res.ok) {
      setVoteState('done');
      setVoteMsg(
        res.currentScore != null ? `Thanks! New current score: ${res.currentScore.toFixed(1)}` : 'Thanks for voting!',
      );
    } else {
      setVoteState('error');
      setVoteMsg(res.error ?? `Failed (${res.status})`);
    }
  }

  const meta = perf?.oembed_meta ?? {};
  const score = one(perf?.scores);
  const breakdown = (score?.ai_breakdown ?? {}) as Record<string, number>;
  const activeCriteria = CRITERIA.filter((c) => perf?.has_video !== false || c !== 'stagePresence');

  const hint =
    listen.status === 'verified'
      ? 'Verified Listen complete — you can vote now.'
      : listen.status === 'listening'
        ? 'Keep watching to the end to unlock voting…'
        : listen.status === 'invalid'
          ? (listen.reason ?? 'Listen not verified. Watch the full performance to vote.')
          : 'Press play and watch to the end to unlock voting.';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#34d399" />}
      {state === 'error' && <Text style={styles.error}>Could not load: {error}</Text>}

      {state === 'ready' && perf && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{meta.title ?? 'Untitled'}</Text>
          {!!meta.authorName && <Text style={styles.artist}>{meta.authorName}</Text>}

          <View style={styles.player}>
            <YoutubePlayer
              ref={playerRef}
              height={210}
              videoId={perf.youtube_video_id}
              onChangeState={onChangeState}
            />
          </View>

          <Text
            style={[
              styles.gate,
              listen.status === 'verified' && styles.gateOk,
              listen.status === 'invalid' && styles.gateBad,
            ]}
          >
            {hint}
          </Text>

          {/* Vote panel — only after a Verified Listen, and only when signed in. */}
          {listen.status === 'verified' && voteState !== 'done' && (
            <View style={styles.voteCard}>
              {!user ? (
                <Pressable onPress={() => router.push('/login')}>
                  <Text style={styles.signinPrompt}>Sign in to submit your vote ›</Text>
                </Pressable>
              ) : (
                <>
                  <Text style={styles.voteTitle}>Rate this performance</Text>
                  {activeCriteria.map((c) => (
                    <View key={c} style={styles.critEdit}>
                      <View style={styles.critEditTop}>
                        <Text style={styles.critLabel}>{CRITERION_LABELS[c]}</Text>
                        <Text style={styles.critVal}>{Math.round(ratings[c])}</Text>
                      </View>
                      <Slider
                        minimumValue={0}
                        maximumValue={100}
                        step={1}
                        value={ratings[c]}
                        onValueChange={(v) => setRatings((r) => ({ ...r, [c]: v }))}
                        minimumTrackTintColor="#34d399"
                        maximumTrackTintColor="#3f3f46"
                        thumbTintColor="#34d399"
                      />
                    </View>
                  ))}
                  <Pressable
                    style={({ pressed }) => [styles.voteBtn, pressed && { opacity: 0.85 }]}
                    onPress={doVote}
                    disabled={voteState === 'submitting'}
                  >
                    {voteState === 'submitting' ? (
                      <ActivityIndicator color="#06281d" />
                    ) : (
                      <Text style={styles.voteBtnText}>Submit vote</Text>
                    )}
                  </Pressable>
                  {voteState === 'error' && <Text style={styles.error}>{voteMsg}</Text>}
                </>
              )}
            </View>
          )}
          {voteState === 'done' && <Text style={styles.voteDone}>{voteMsg}</Text>}

          <View style={styles.scoreCard}>
            <View style={styles.scoreHead}>
              <View>
                <Text style={styles.scoreBig}>
                  {score?.current_score != null ? score.current_score.toFixed(1) : '—'}
                </Text>
                <Text style={styles.scoreLabel}>Current score</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.trend}>
                  {score?.trend_score != null
                    ? `${score.trend_score >= 0 ? '+' : ''}${score.trend_score.toFixed(1)} trend`
                    : '0.0 trend'}
                </Text>
                <Text style={styles.aiStart}>
                  AI start {score?.initial_ai_score != null ? score.initial_ai_score.toFixed(1) : '—'}
                </Text>
              </View>
            </View>

            {score?.is_provisional !== false && <Text style={styles.badge}>Provisional AI Estimate</Text>}

            <View style={styles.criteria}>
              {activeCriteria.map((c) => (
                <View key={c} style={styles.critRow}>
                  <Text style={styles.critLabel}>{CRITERION_LABELS[c]}</Text>
                  <Text style={styles.critVal}>
                    {breakdown[c] != null ? Number(breakdown[c]).toFixed(0) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  back: { paddingHorizontal: 16, paddingVertical: 8 },
  backText: { color: '#34d399', fontSize: 16, fontWeight: '600' },
  spinner: { marginTop: 40 },
  error: { marginTop: 8, color: '#fb7185', fontSize: 13 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '800', color: '#fafafa' },
  artist: { marginTop: 4, fontSize: 14, color: '#9ca3af' },
  player: { marginTop: 16, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  gate: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#171717',
    color: '#9ca3af',
    fontSize: 13,
  },
  gateOk: { backgroundColor: 'rgba(52,211,153,0.12)', color: '#34d399' },
  gateBad: { backgroundColor: 'rgba(251,113,133,0.12)', color: '#fb7185' },
  voteCard: { marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: '#171717', gap: 8 },
  voteTitle: { fontSize: 15, fontWeight: '700', color: '#fafafa', marginBottom: 4 },
  signinPrompt: { color: '#34d399', fontSize: 15, fontWeight: '600' },
  critEdit: { marginTop: 4 },
  critEditTop: { flexDirection: 'row', justifyContent: 'space-between' },
  voteBtn: {
    marginTop: 12,
    backgroundColor: '#34d399',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  voteBtnText: { color: '#06281d', fontSize: 16, fontWeight: '800' },
  voteDone: { marginTop: 12, color: '#34d399', fontSize: 14, fontWeight: '600' },
  scoreCard: { marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: '#171717' },
  scoreHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  scoreBig: { fontSize: 40, fontWeight: '900', color: '#fafafa', lineHeight: 44 },
  scoreLabel: { fontSize: 12, color: '#9ca3af' },
  trend: { fontSize: 13, color: '#9ca3af' },
  aiStart: { marginTop: 2, fontSize: 12, color: '#6b7280' },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.15)',
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
    overflow: 'hidden',
  },
  criteria: { marginTop: 16, gap: 10 },
  critRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  critLabel: { fontSize: 14, color: '#d4d4d8' },
  critVal: { fontSize: 14, fontWeight: '700', color: '#fafafa', fontVariant: ['tabular-nums'] },
});
