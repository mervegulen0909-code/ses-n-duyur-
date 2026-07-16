import Slider from '@react-native-community/slider';
import { type Href, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type YoutubeIframeRef } from 'react-native-youtube-iframe';

import {
  buildShareLine,
  isRankedScoreStatus,
  measuredDisplayApplies,
  MIN_VERIFIED_LISTEN_SECONDS,
  scoreBar,
  type ListenEvent,
} from '@voxscore/core';
import { NativeYouTubePlayer } from '@/components/native-youtube-player';
import { CRITERIA } from '@voxscore/scoring';
import { postComment, submitVote } from '@/lib/api';
import { useCriterionLabels } from '@/lib/criteria-labels';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { useVerifiedListen } from '@/lib/use-verified-listen';

type ScoreRow = {
  current_score: number | null;
  initial_ai_score: number | null;
  trend_score: number | null;
  ai_breakdown: Record<string, number> | null;
  is_provisional: boolean | null;
  score_status: string;
};
type Perf = {
  id: string;
  user_id: string;
  youtube_video_id: string;
  has_video: boolean;
  song_id: string | null;
  oembed_meta: { title?: string; authorName?: string } | null;
  scores: ScoreRow | ScoreRow[] | null;
};

function one<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  profiles: { handle: string } | { handle: string }[] | null;
};
function handleOf(p: CommentRow['profiles']): string | null {
  const row = Array.isArray(p) ? p[0] : p;
  return row?.handle ? `@${row.handle}` : null;
}

export default function PerformanceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const criterionLabels = useCriterionLabels();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [perf, setPerf] = useState<Perf | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  // The uploader disabled embedding (YouTube error 101/150) — the video can only
  // be watched on YouTube, so an in-app Verified Listen can never complete here.
  const [embedBlocked, setEmbedBlocked] = useState(false);

  const listen = useVerifiedListen(id);

  // Watch-event tracking for the Verified Listen.
  const playerRef = useRef<YoutubeIframeRef>(null);
  const eventsRef = useRef<ListenEvent[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const firstPlaybackPositionRef = useRef<number | null>(null);
  const completionRequestedRef = useRef(false);

  // The moment the listen verifies, bring the vote panel into view so the
  // viewer never has to hunt for it — voting opens the instant watching ends.
  const scrollRef = useRef<ScrollView>(null);
  const scrolledToVoteRef = useRef(false);

  const [ratings, setRatings] = useState<Record<string, number>>(() =>
    Object.fromEntries(CRITERIA.map((c) => [c, 50])),
  );
  const [voteState, setVoteState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [voteMsg, setVoteMsg] = useState('');

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const [commentErr, setCommentErr] = useState('');

  // Real DSP measurement of the artist's own recording (ADR 0003). Soft-fails
  // to null until the measured_scores table ships live.
  const [measured, setMeasured] = useState<Record<string, number> | null>(null);
  // Whether the measured take's duration matched the linked video (T13) —
  // gates whether the measurement may show as "Measured" (see
  // measuredDisplayApplies): a mismatched/unknown take never inflated the
  // score, so it must never be labeled as if it had.
  const [durationMatched, setDurationMatched] = useState<boolean | null>(null);

  // Refetch performance + score (and the measurement) on every focus, not just
  // mount: returning from the /measure screen must show the just-recomputed
  // current_score, not the pre-measurement snapshot. Never resets `state` to
  // 'loading' after the first load, so refocusing doesn't flash a spinner.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data, error } = await supabase
          .from('performances')
          .select(
            'id, user_id, youtube_video_id, has_video, song_id, oembed_meta, scores(current_score, initial_ai_score, trend_score, ai_breakdown, is_provisional, score_status)',
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
      (async () => {
        const { data } = await supabase
          .from('measured_scores')
          .select('measured_breakdown, duration_matched')
          .eq('performance_id', id)
          .maybeSingle();
        if (active) {
          setMeasured((data?.measured_breakdown as Record<string, number> | null) ?? null);
          setDurationMatched((data?.duration_matched as boolean | null) ?? null);
        }
      })();
      return () => {
        active = false;
      };
    }, [id]),
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('id, body, created_at, profiles(handle)')
      .eq('performance_id', id)
      .order('created_at', { ascending: false });
    setComments((data ?? []) as unknown as CommentRow[]);
  }, [id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const pushEvent = (kind: ListenEvent['kind'], atSeconds: number) => {
    eventsRef.current.push({ kind, atSeconds: Math.max(0, atSeconds), clientTs: Date.now() });
  };

  const onChangeState = useCallback(
    async (s: string) => {
      if (s === 'playing') {
        await listen.onStart();
        const t = (await playerRef.current?.getCurrentTime()) ?? 0;
        firstPlaybackPositionRef.current ??= t;
        pushEvent('playing', t);
        if (!pollRef.current) {
          pollRef.current = setInterval(async () => {
            const cur = await playerRef.current?.getCurrentTime();
            if (typeof cur !== 'number') return;
            pushEvent('playing', cur);
            const first = firstPlaybackPositionRef.current;
            if (
              first !== null &&
              cur - first >= MIN_VERIFIED_LISTEN_SECONDS &&
              !completionRequestedRef.current
            ) {
              completionRequestedRef.current = true;
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              const dur = (await playerRef.current?.getDuration()) ?? cur;
              await listen.onComplete(eventsRef.current, dur);
            }
          }, 250);
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
        if (completionRequestedRef.current) return;
        completionRequestedRef.current = true;
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
    const activeRatings = Object.fromEntries(
      activeCriteria.map((c) => [c, Math.round(ratings[c])]),
    );
    const res = await submitVote(perf.id, listenId, activeRatings);
    if (res.ok) {
      setVoteState('done');
      setVoteMsg(
        res.currentScore != null
          ? t('Performance.voteThanksScore', { score: res.currentScore.toFixed(1) })
          : t('Performance.voteThanks'),
      );
    } else {
      setVoteState('error');
      if (res.status === 403 && res.error !== 'You cannot vote on your own performance') {
        setVoteMsg(res.error ?? t('Performance.listenRequired'));
        return;
      }
      // /api/votes is Turnstile-gated (botGuard) and native cannot supply a
      // browser token, so a 403 here for a user who DID complete the Verified
      // Listen is the bot-check — surface an honest message (mirrors add.tsx)
      // instead of the engine's cryptic "Bot check failed."; self-vote 403s
      // carry their own server message (English) — matched literally, shown
      // translated.
      setVoteMsg(
        res.status === 401
          ? t('Performance.sessionExpiredVote')
          : res.status === 403
            ? res.error === 'You cannot vote on your own performance'
              ? t('Performance.selfVote')
              : t('Performance.attestationGate')
            : res.status === 409
              ? t('Performance.alreadyVoted')
              : (res.error ?? t('Performance.failed', { status: res.status })),
      );
    }
  }

  async function doComment() {
    const text = commentText.trim();
    if (!text || !perf) return;
    setPosting(true);
    setCommentErr('');
    const res = await postComment(perf.id, text);
    setPosting(false);
    if (res.ok) {
      setCommentText('');
      await loadComments();
    } else {
      setCommentErr(
        res.status === 401
          ? t('Performance.commentSessionExpired')
          : (res.error ?? t('Performance.failed', { status: res.status })),
      );
    }
  }

  const meta = perf?.oembed_meta ?? {};
  const score = one(perf?.scores);
  const isAiVerified = score?.score_status === 'ai_verified';
  // Provisional estimates display and take votes too; only the "measured"
  // presentation stays exclusive to ai_verified rows.
  const isRanked = isRankedScoreStatus(score?.score_status);
  const breakdown = (isRanked ? (score?.ai_breakdown ?? {}) : {}) as Record<string, number>;
  const activeCriteria = CRITERIA.filter((c) => perf?.has_video !== false || c !== 'stagePresence');
  // Same rule the measurements route blends by — a criterion only shows as
  // "Measured" when it actually counted toward current_score.
  const measuredApplies =
    isAiVerified && measuredDisplayApplies(!!perf?.youtube_video_id, durationMatched);

  // Native share of the same Wordle-style result line the web emits — one
  // stable artifact shape across every surface (packages/core/share-line).
  async function onShare() {
    await Share.share({
      message: buildShareLine({
        headline: `🎤 VoxScore ${score?.current_score?.toFixed(1) ?? '—'} — ${meta.title ?? t('Common.untitled')}`,
        bar: score?.current_score == null ? undefined : scoreBar(score.current_score),
        url: `https://voxscore.app/performance/${id}`,
      }),
    });
  }

  const hint = embedBlocked
    ? t('Performance.embedBlockedHint')
    : listen.status === 'verified'
      ? t('Performance.verifiedHint')
      : listen.status === 'listening'
        ? t('Performance.listeningHint')
        : listen.status === 'invalid'
          ? (listen.reason ?? t('Performance.invalidHint'))
          : t('Performance.idleHint');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>{t('Common.back')}</Text>
      </Pressable>

      {state === 'loading' && <ActivityIndicator style={styles.spinner} color="#22D3EE" />}
      {state === 'error' && <Text style={styles.error}>{t('Common.loadError', { error })}</Text>}

      {state === 'ready' && perf && (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <Text style={styles.title}>{meta.title ?? t('Common.untitled')}</Text>
          {!!meta.authorName && <Text style={styles.artist}>{meta.authorName}</Text>}
          {!!perf.song_id && (
            <Pressable
              onPress={() => router.push({ pathname: '/song/[id]', params: { id: perf.song_id! } })}
              hitSlop={8}
            >
              <Text style={styles.songLink}>{t('Performance.songRanking')}</Text>
            </Pressable>
          )}

          <View style={styles.player}>
            <NativeYouTubePlayer
              ref={playerRef}
              height={210}
              videoId={perf.youtube_video_id}
              onChangeState={onChangeState}
              onError={(e: string) => {
                if (e === 'embed_not_allowed') setEmbedBlocked(true);
              }}
            />
          </View>

          <Text
            style={[
              styles.gate,
              listen.status === 'verified' && styles.gateOk,
              (listen.status === 'invalid' || embedBlocked) && styles.gateBad,
            ]}
          >
            {hint}
          </Text>

          {listen.status === 'verified' && !isRanked && (
            <Text style={styles.aiPendingNotice}>{t('Performance.aiScoreRequired')}</Text>
          )}

          {/* Vote panel — only after a Verified Listen, and only when signed in. */}
          {listen.status === 'verified' && isRanked && voteState !== 'done' && (
            <View
              style={styles.voteCard}
              onLayout={(e) => {
                if (scrolledToVoteRef.current) return;
                scrolledToVoteRef.current = true;
                const y = Math.max(0, e.nativeEvent.layout.y - 12);
                scrollRef.current?.scrollTo({ y, animated: true });
              }}
            >
              {!user ? (
                <Pressable onPress={() => router.push('/login')}>
                  <Text style={styles.signinPrompt}>{t('Performance.signInToVote')}</Text>
                </Pressable>
              ) : (
                <>
                  <Text style={styles.voteTitle}>{t('Performance.rateTitle')}</Text>
                  {activeCriteria.map((c) => (
                    <View key={c} style={styles.critEdit}>
                      <View style={styles.critEditTop}>
                        <Text style={styles.critLabel}>{criterionLabels[c]}</Text>
                        <Text style={styles.critVal}>{Math.round(ratings[c])}</Text>
                      </View>
                      <Slider
                        minimumValue={0}
                        maximumValue={100}
                        step={1}
                        value={ratings[c]}
                        onValueChange={(v) => setRatings((r) => ({ ...r, [c]: v }))}
                        minimumTrackTintColor="#22D3EE"
                        maximumTrackTintColor="#3f3f46"
                        thumbTintColor="#22D3EE"
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
                      <Text style={styles.voteBtnText}>{t('Performance.submitVote')}</Text>
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
                  {isRanked && score?.current_score != null ? score.current_score.toFixed(1) : '—'}
                </Text>
                <Text style={styles.scoreLabel}>{t('Performance.currentScore')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.trend}>
                  {t('Performance.trend', {
                    value:
                      isRanked && score?.trend_score != null
                        ? `${score.trend_score >= 0 ? '+' : ''}${score.trend_score.toFixed(1)}`
                        : '0.0',
                  })}
                </Text>
                <Text style={styles.aiStart}>
                  {t('Performance.aiStart', {
                    value:
                      isRanked && score?.initial_ai_score != null
                        ? score.initial_ai_score.toFixed(1)
                        : '—',
                  })}
                </Text>
              </View>
            </View>

            {!isAiVerified && (
              <Text style={styles.badge}>
                {isRanked ? t('Common.provisionalBadge') : t('Performance.aiPendingBadge')}
              </Text>
            )}

            {measured && measuredApplies && (
              <Text style={styles.measuredCaption}>{t('Performance.measuredCaption')}</Text>
            )}

            <View style={styles.criteria}>
              {activeCriteria.map((c) => {
                const measuredValue = measuredApplies ? (measured?.[c] ?? null) : null;
                const value = measuredValue ?? (breakdown[c] != null ? breakdown[c] : null);
                return (
                  <View key={c} style={styles.critRow}>
                    <View style={styles.critNameWrap}>
                      <Text style={styles.critLabel}>{criterionLabels[c]}</Text>
                      {measuredValue != null && (
                        <Text style={styles.measuredChip}>{t('Performance.measuredChip')}</Text>
                      )}
                    </View>
                    <Text style={[styles.critVal, measuredValue != null && styles.critValMeasured]}>
                      {value != null ? Number(value).toFixed(0) : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>

            {user?.id === perf.user_id && (
              <Pressable
                style={({ pressed }) => [styles.measureBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push(`/measure/${perf.id}` as Href)}
              >
                <Text style={styles.measureBtnText}>{t('Measure.openAiJudge')}</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]}
              onPress={onShare}
            >
              <Text style={styles.shareBtnText}>{t('Performance.shareResult')}</Text>
            </Pressable>
          </View>

          {/* Comments — readable by all; posting requires sign-in. */}
          <View style={styles.commentsCard}>
            <Text style={styles.commentsTitle}>{t('Performance.comments')}</Text>
            {user ? (
              <View style={styles.commentForm}>
                <TextInput
                  style={styles.commentInput}
                  placeholder={t('Performance.commentPlaceholder')}
                  placeholderTextColor="#6b7280"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={4000}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.commentBtn,
                    pressed && { opacity: 0.85 },
                    (posting || !commentText.trim()) && { opacity: 0.5 },
                  ]}
                  onPress={doComment}
                  disabled={posting || !commentText.trim()}
                >
                  {posting ? (
                    <ActivityIndicator color="#06281d" />
                  ) : (
                    <Text style={styles.commentBtnText}>{t('Performance.post')}</Text>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => router.push('/login')}>
                <Text style={styles.signinPrompt}>{t('Performance.signInToComment')}</Text>
              </Pressable>
            )}
            {commentErr ? <Text style={styles.error}>{commentErr}</Text> : null}
            {comments.length === 0 ? (
              <Text style={styles.commentEmpty}>{t('Performance.noComments')}</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <Text style={styles.commentHandle}>
                    {handleOf(c.profiles) ?? t('Performance.anonymous')}
                  </Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  back: { paddingHorizontal: 16, paddingVertical: 8 },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  spinner: { marginTop: 40 },
  error: { marginTop: 8, color: '#fb7185', fontSize: 13 },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '800', color: '#fafafa' },
  artist: { marginTop: 4, fontSize: 14, color: '#9ca3af' },
  songLink: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#22D3EE' },
  player: { marginTop: 16, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  gate: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#171717',
    color: '#9ca3af',
    fontSize: 13,
  },
  gateOk: { backgroundColor: 'rgba(52,211,153,0.12)', color: '#22D3EE' },
  gateBad: { backgroundColor: 'rgba(251,113,133,0.12)', color: '#fb7185' },
  aiPendingNotice: { marginTop: 8, color: '#FBBF24', fontSize: 13, lineHeight: 19 },
  voteCard: { marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: '#171717', gap: 8 },
  voteTitle: { fontSize: 15, fontWeight: '700', color: '#fafafa', marginBottom: 4 },
  signinPrompt: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  critEdit: { marginTop: 4 },
  critEditTop: { flexDirection: 'row', justifyContent: 'space-between' },
  voteBtn: {
    marginTop: 12,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  voteBtnText: { color: '#06281d', fontSize: 16, fontWeight: '800' },
  voteDone: { marginTop: 12, color: '#22D3EE', fontSize: 14, fontWeight: '600' },
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
  critNameWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  critLabel: { fontSize: 14, color: '#d4d4d8' },
  critVal: { fontSize: 14, fontWeight: '700', color: '#fafafa', fontVariant: ['tabular-nums'] },
  critValMeasured: { color: '#38bdf8' },
  measuredCaption: { marginTop: 10, fontSize: 12, color: '#9ca3af', lineHeight: 17 },
  measuredChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(56,189,248,0.15)',
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  shareBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareBtnText: { color: '#22D3EE', fontSize: 14, fontWeight: '800' },
  measureBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(56,189,248,0.15)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  measureBtnText: { color: '#38bdf8', fontSize: 14, fontWeight: '800' },
  commentsCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#171717',
    gap: 10,
  },
  commentsTitle: { fontSize: 15, fontWeight: '700', color: '#fafafa' },
  commentForm: { gap: 8 },
  commentInput: {
    backgroundColor: '#0a0a0a',
    borderRadius: 10,
    padding: 12,
    color: '#fafafa',
    fontSize: 14,
    minHeight: 44,
  },
  commentBtn: {
    backgroundColor: '#22D3EE',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  commentBtnText: { color: '#06281d', fontSize: 14, fontWeight: '800' },
  commentEmpty: { color: '#6b7280', fontSize: 13 },
  commentRow: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#262626' },
  commentHandle: { color: '#22D3EE', fontSize: 13, fontWeight: '700' },
  commentBody: { color: '#d4d4d8', fontSize: 14 },
});
