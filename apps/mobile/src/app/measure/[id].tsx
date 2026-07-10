import { AudioStudioModule, useAudioRecorder } from '@siteed/audio-studio';
import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CRITERION_LABELS } from '@/lib/criteria-labels';
import { uploadMeasurement } from '@/lib/measure-upload';
import { useSession } from '@/lib/use-session';

// ~2 minutes at the 16 kHz mono take format stays under the 4 MB upload cap.
const MAX_RECORD_MS = 110_000;
// The DSP needs at least 2 s of audible singing; nudge users well past that.
const MIN_RECORD_MS = 5_000;

/** What each measured criterion is actually derived from (honest labeling). */
const MEASURED_PROXIES: Record<string, string> = {
  vocalAccuracy: 'pitch control',
  rhythmTiming: 'timing steadiness',
  technicalSkill: 'vibrato control',
  recordingQuality: 'signal quality',
};

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Phase = 'intro' | 'recording' | 'uploading' | 'done' | 'error';

export default function MeasureScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { startRecording, stopRecording, isRecording, durationMs } = useAudioRecorder();
  const [phase, setPhase] = useState<Phase>('intro');
  const [message, setMessage] = useState('');
  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(null);

  async function doStart() {
    setMessage('');
    const permission = await AudioStudioModule.requestPermissionsAsync();
    if (!permission?.granted) {
      setPhase('error');
      setMessage('Microphone permission is required to measure your recording.');
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
      setMessage('Could not start recording — close other apps using the microphone.');
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
            ? 'Your session expired — sign in again to measure.'
            : res.status === 403
              ? 'Only the performer can measure their own performance.'
              : (res.error ?? `Measurement failed (${res.status})`),
        );
      }
    } catch {
      setPhase('error');
      setMessage('Recording failed — please try again.');
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
        <Text style={styles.backText}>‹ Back</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Measure my recording</Text>

        {!user ? (
          <Pressable onPress={() => router.push('/login')}>
            <Text style={styles.signinPrompt}>Sign in to measure your recording ›</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.honestyCard}>
              <Text style={styles.honestyTitle}>Real, measured scores</Text>
              <Text style={styles.honestyBody}>
                Sing 20–60 seconds of YOUR OWN performance into the microphone. Our server measures
                the audio itself — pitch control, timing, vibrato, signal quality — and those four
                criteria replace the AI estimate with a Measured score.
              </Text>
              <Text style={styles.honestyBody}>
                Your audio is analyzed, then deleted immediately — on the server and on this device.
                Only the measured numbers are kept.
              </Text>
            </View>

            {phase === 'intro' && (
              <Pressable
                style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.85 }]}
                onPress={doStart}
              >
                <Text style={styles.recordBtnText}>● Start recording</Text>
              </Pressable>
            )}

            {phase === 'recording' && (
              <View style={styles.recordingCard}>
                <Text style={styles.clock}>{fmtClock(durationMs)}</Text>
                <Text style={styles.recordingHint}>
                  Recording… max {fmtClock(MAX_RECORD_MS)}. Sing close to the microphone.
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
                    {durationMs < MIN_RECORD_MS ? 'Keep singing…' : '■ Stop & measure'}
                  </Text>
                </Pressable>
              </View>
            )}

            {phase === 'uploading' && (
              <View style={styles.recordingCard}>
                <ActivityIndicator color="#38bdf8" />
                <Text style={styles.recordingHint}>Measuring your recording…</Text>
              </View>
            )}

            {phase === 'done' && breakdown && (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>Measured ✓</Text>
                {Object.entries(breakdown).map(([criterion, value]) => (
                  <View key={criterion} style={styles.resultRow}>
                    <View>
                      <Text style={styles.resultLabel}>
                        {CRITERION_LABELS[criterion as keyof typeof CRITERION_LABELS] ?? criterion}
                      </Text>
                      <Text style={styles.resultProxy}>
                        from {MEASURED_PROXIES[criterion] ?? 'measurement'}
                      </Text>
                    </View>
                    <Text style={styles.resultVal}>{value}</Text>
                  </View>
                ))}
                <Text style={styles.resultNote}>
                  These four criteria now show as Measured on your performance; the rest keep the AI
                  estimate and community votes. Your audio has been deleted.
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.recordBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => router.back()}
                >
                  <Text style={styles.recordBtnText}>Done</Text>
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
                  <Text style={styles.recordBtnText}>Try again</Text>
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
});
