import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCriterionLabels } from '@/lib/criteria-labels';
import { uploadMeasurement } from '@/lib/measure-upload';
import { useSession } from '@/lib/use-session';

/**
 * `@siteed/audio-studio` resolves its NATIVE module at import time and is not
 * bundled into Expo Go — a static `import` would crash this route (and with it
 * the whole router) at boot. Resolve once at module load; when unavailable the
 * screen renders an honest "needs the full build" fallback instead.
 */
let AudioStudio: typeof import('@siteed/audio-studio') | null;
try {
  AudioStudio = require('@siteed/audio-studio') as typeof import('@siteed/audio-studio');
} catch {
  AudioStudio = null;
}

// ~2 minutes at the 16 kHz mono take format stays under the 4 MB upload cap.
const MAX_RECORD_MS = 110_000;
// The DSP needs at least 2 s of audible singing; nudge users well past that.
const MIN_RECORD_MS = 5_000;

/** i18n keys for what each measured criterion is actually derived from (honest labeling). */
const MEASURED_PROXY_KEYS: Record<string, string> = {
  vocalAccuracy: 'Measure.proxyPitchControl',
  rhythmTiming: 'Measure.proxyTimingSteadiness',
  technicalSkill: 'Measure.proxyVibratoControl',
  recordingQuality: 'Measure.proxySignalQuality',
};

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Phase = 'intro' | 'recording' | 'uploading' | 'done' | 'error';

export default function MeasureScreen() {
  // Constant for the app's lifetime, so the early return never reorders hooks.
  if (!AudioStudio) return <MeasureUnavailable />;
  return <MeasureScreenImpl audioStudio={AudioStudio} />;
}

/**
 * The zero-effort scoring path: add a YouTube link (your own performance or
 * someone else's) and the AI scores it on all 9 criteria — no microphone.
 * Mic measurement stays below as the optional accuracy upgrade.
 */
function LinkPathCard() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.linkCard}>
        <Text style={styles.linkTitle}>{t('Measure.linkPathTitle')}</Text>
        <Text style={styles.linkBody}>{t('Measure.linkPathBody')}</Text>
        <Pressable
          style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/add')}
        >
          <Text style={styles.linkBtnText}>{t('Measure.linkPathCta')}</Text>
        </Pressable>
      </View>
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orText}>{t('Measure.orDivider')}</Text>
        <View style={styles.orLine} />
      </View>
    </>
  );
}

/** Expo Go fallback: recording needs the dev/store build's native module. */
function MeasureUnavailable() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>{t('Common.back')}</Text>
      </Pressable>
      <View style={styles.content}>
        <Text style={styles.title}>{t('Measure.title')}</Text>
        <LinkPathCard />
        <View style={styles.honestyCard}>
          <Text style={styles.honestyBody}>{t('Measure.devBuildRequired')}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MeasureScreenImpl({
  audioStudio,
}: {
  audioStudio: typeof import('@siteed/audio-studio');
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const CRITERION_LABELS = useCriterionLabels();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { startRecording, stopRecording, isRecording, durationMs } = audioStudio.useAudioRecorder();
  const [phase, setPhase] = useState<Phase>('intro');
  const [message, setMessage] = useState('');
  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(null);

  async function doStart() {
    setMessage('');
    const permission = await audioStudio.AudioStudioModule.requestPermissionsAsync();
    if (!permission?.granted) {
      setPhase('error');
      setMessage(t('Measure.micPermissionError'));
      return;
    }
    try {
      // The server-side DSP contract: 16 kHz mono 16-bit PCM WAV.
      await startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        maxDurationMs: MAX_RECORD_MS,
      });
      setPhase('recording');
    } catch {
      setPhase('error');
      setMessage(t('Measure.startError'));
    }
  }

  async function doStopAndMeasure() {
    setPhase('uploading');
    let fileUri: string | null = null;
    try {
      const recording = await stopRecording();
      fileUri = recording.fileUri;
      const res = await uploadMeasurement(id, fileUri);
      if (res.ok && res.breakdown) {
        setBreakdown(res.breakdown);
        setPhase('done');
      } else {
        setPhase('error');
        setMessage(
          res.status === 401
            ? t('Measure.sessionExpiredError')
            : res.status === 403
              ? t('Measure.notOwnerError')
              : (res.error ?? t('Measure.genericFailError', { status: res.status })),
        );
      }
    } catch {
      setPhase('error');
      setMessage(t('Measure.recordingFailedError'));
    } finally {
      // Measure and delete applies on-device too: the take never outlives
      // the measurement.
      if (fileUri) {
        try {
          new File(fileUri).delete();
        } catch {
          // best-effort cleanup; the cache directory is purged by the OS anyway
        }
      }
    }
  }

  // Hard stop at the cap — keeps the upload under the server's 4 MB limit.
  useEffect(() => {
    if (phase === 'recording' && isRecording && durationMs >= MAX_RECORD_MS) {
      void doStopAndMeasure();
    }
  }, [phase, isRecording, durationMs]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
        <Text style={styles.backText}>{t('Common.back')}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('Measure.title')}</Text>

        {/* Easy path first — visible whenever the user isn't mid-recording. */}
        {(!user || phase === 'intro') && <LinkPathCard />}

        {!user ? (
          <Pressable onPress={() => router.push('/login')}>
            <Text style={styles.signinPrompt}>{t('Measure.signinPrompt')}</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.honestyCard}>
              <Text style={styles.honestyTitle}>{t('Measure.honestyTitle')}</Text>
              <Text style={styles.honestyBody}>{t('Measure.honestyBody1')}</Text>
              <Text style={styles.honestyBody}>{t('Measure.honestyBody2')}</Text>
            </View>

            {phase === 'intro' && (
              <Pressable
                style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.85 }]}
                onPress={doStart}
              >
                <Text style={styles.recordBtnText}>{t('Measure.startRecording')}</Text>
              </Pressable>
            )}

            {phase === 'recording' && (
              <View style={styles.recordingCard}>
                <Text style={styles.clock}>{fmtClock(durationMs)}</Text>
                <Text style={styles.recordingHint}>
                  {t('Measure.recordingMax', { time: fmtClock(MAX_RECORD_MS) })}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.stopBtn,
                    pressed && { opacity: 0.85 },
                    durationMs < MIN_RECORD_MS && { opacity: 0.5 },
                  ]}
                  onPress={doStopAndMeasure}
                  disabled={durationMs < MIN_RECORD_MS}
                >
                  <Text style={styles.stopBtnText}>
                    {durationMs < MIN_RECORD_MS
                      ? t('Measure.keepSinging')
                      : t('Measure.stopAndMeasure')}
                  </Text>
                </Pressable>
              </View>
            )}

            {phase === 'uploading' && (
              <View style={styles.recordingCard}>
                <ActivityIndicator color="#38bdf8" />
                <Text style={styles.recordingHint}>{t('Measure.measuring')}</Text>
              </View>
            )}

            {phase === 'done' && breakdown && (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>{t('Measure.resultTitle')}</Text>
                {Object.entries(breakdown).map(([criterion, value]) => (
                  <View key={criterion} style={styles.resultRow}>
                    <View>
                      <Text style={styles.resultLabel}>
                        {CRITERION_LABELS[criterion as keyof typeof CRITERION_LABELS] ?? criterion}
                      </Text>
                      <Text style={styles.resultProxy}>
                        {t('Measure.from', {
                          proxy: MEASURED_PROXY_KEYS[criterion]
                            ? t(MEASURED_PROXY_KEYS[criterion])
                            : t('Measure.proxyMeasurement'),
                        })}
                      </Text>
                    </View>
                    <Text style={styles.resultVal}>{value}</Text>
                  </View>
                ))}
                <Text style={styles.resultNote}>{t('Measure.resultNote')}</Text>
                <Pressable
                  style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => router.back()}
                >
                  <Text style={styles.recordBtnText}>{t('Measure.done')}</Text>
                </Pressable>
              </View>
            )}

            {phase === 'error' && (
              <View style={styles.resultCard}>
                <Text style={styles.error}>{message}</Text>
                <Pressable
                  style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => setPhase('intro')}
                >
                  <Text style={styles.recordBtnText}>{t('Measure.tryAgain')}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  back: { paddingHorizontal: 16, paddingVertical: 8 },
  backText: { color: '#22D3EE', fontSize: 16, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#fafafa' },
  signinPrompt: { color: '#22D3EE', fontSize: 15, fontWeight: '600' },
  honestyCard: { padding: 16, borderRadius: 16, backgroundColor: '#171717', gap: 8 },
  honestyTitle: { fontSize: 15, fontWeight: '700', color: '#38bdf8' },
  honestyBody: { fontSize: 13, color: '#9ca3af', lineHeight: 19 },
  recordBtn: {
    backgroundColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  recordBtnText: { color: '#082f49', fontSize: 16, fontWeight: '800' },
  recordingCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#171717',
    alignItems: 'center',
    gap: 12,
  },
  clock: { fontSize: 44, fontWeight: '900', color: '#fafafa', fontVariant: ['tabular-nums'] },
  recordingHint: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  stopBtn: {
    alignSelf: 'stretch',
    backgroundColor: '#fb7185',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  stopBtnText: { color: '#4c0519', fontSize: 16, fontWeight: '800' },
  resultCard: { padding: 16, borderRadius: 16, backgroundColor: '#171717', gap: 12 },
  resultTitle: { fontSize: 17, fontWeight: '800', color: '#38bdf8' },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { fontSize: 14, color: '#d4d4d8' },
  resultProxy: { fontSize: 11, color: '#6b7280' },
  resultVal: { fontSize: 20, fontWeight: '800', color: '#fafafa', fontVariant: ['tabular-nums'] },
  resultNote: { fontSize: 12, color: '#9ca3af', lineHeight: 18 },
  error: { color: '#fb7185', fontSize: 14 },
  linkCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(34,211,238,0.07)',
    gap: 8,
  },
  linkTitle: { fontSize: 16, fontWeight: '800', color: '#22D3EE' },
  linkBody: { fontSize: 13, color: '#9ca3af', lineHeight: 19 },
  linkBtn: {
    marginTop: 4,
    backgroundColor: '#22D3EE',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  linkBtnText: { color: '#06281d', fontSize: 15, fontWeight: '800' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: '#262626' },
  orText: { color: '#525252', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});
