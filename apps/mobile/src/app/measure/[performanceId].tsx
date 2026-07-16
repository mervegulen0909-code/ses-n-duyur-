import { AudioStudioModule, useAudioRecorder, type AudioRecording } from '@siteed/audio-studio';
import { Ionicons } from '@expo/vector-icons';
import { File, UploadType } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAnalysisSession, getAnalysisSession } from '@/lib/api';

const MIN_RECORDING_MS = 15_000;
const MAX_RECORDING_MS = 120_000;

type ScreenState =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'uploading'
  | 'complete'
  | 'rejected'
  | 'error';

export default function MeasurePerformanceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { performanceId } = useLocalSearchParams<{ performanceId: string }>();
  const [state, setState] = useState<ScreenState>('idle');
  const [message, setMessage] = useState('');
  const uploadStarted = useRef(false);
  // Set when the user leaves the screen mid-recording: the recorder's
  // onRecordingStopped still fires for that stop, and without this flag the
  // cancelled take would be uploaded and orphan a server analysis session.
  const cancelled = useRef(false);
  const recorder = useAudioRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const removeRecording = (uri: string) => {
    try {
      new File(uri).delete();
    } catch {
      // The recording may already have been removed by the OS or a prior retry.
    }
  };

  async function uploadRecording(recording: AudioRecording) {
    if (uploadStarted.current) return;
    uploadStarted.current = true;
    setState('uploading');
    setMessage('');

    try {
      if (recording.durationMs < MIN_RECORDING_MS) {
        setState('error');
        setMessage(t('Measure.tooShortError'));
        return;
      }

      const created = await createAnalysisSession(performanceId);
      if (!created.ok || !created.session) {
        setState('error');
        setMessage(
          created.status === 409
            ? (created.error ?? t('Measure.referenceNotReadyError'))
            : (created.error ?? t('Measure.genericFailError', { status: created.status })),
        );
        return;
      }
      if (recording.size > created.session.maxBytes) {
        setState('error');
        setMessage(t('Measure.recordingTooLargeError'));
        return;
      }

      const upload = await new File(recording.fileUri).upload(created.session.uploadUrl, {
        httpMethod: 'POST',
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: 'audio/wav',
        headers: {
          authorization: `Bearer ${created.session.uploadToken}`,
          'content-type': 'audio/wav',
        },
        sessionType: 'foreground',
      });
      if (upload.status < 200 || upload.status >= 300) {
        let serverMessage = '';
        try {
          serverMessage = (JSON.parse(upload.body) as { error?: string }).error ?? '';
        } catch {
          // Non-JSON proxy errors are shown through the localized fallback.
        }
        setState('error');
        setMessage(serverMessage || t('Measure.genericFailError', { status: upload.status }));
        return;
      }

      const status = await getAnalysisSession(created.session.sessionId);
      if (status.session?.status === 'completed') {
        setState('complete');
      } else if (status.session?.status === 'rejected') {
        setState('rejected');
        setMessage(
          t(`Measure.rejection.${status.session.error_code ?? 'reference_mismatch'}`, {
            defaultValue: t('Measure.rejectedError'),
          }),
        );
      } else {
        setState('error');
        setMessage(
          status.session?.error_code ?? t('Measure.genericFailError', { status: status.status }),
        );
      }
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : t('Measure.recordingFailedError'));
    } finally {
      removeRecording(recording.fileUri);
      uploadStarted.current = false;
    }
  }

  async function start() {
    setState('preparing');
    setMessage('');
    try {
      const permission = await AudioStudioModule.requestPermissionsAsync();
      if (!permission.granted) {
        setState('error');
        setMessage(t('Measure.micPermissionError'));
        return;
      }

      await recorder.startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        output: { primary: { enabled: true, format: 'wav' } },
        enableProcessing: false,
        keepFullAnalysis: false,
        maxDurationMs: MAX_RECORDING_MS,
        autoStopOnMaxDuration: true,
        onRecordingStopped: async (recording) => {
          if (cancelled.current) {
            removeRecording(recording.fileUri);
            return;
          }
          await uploadRecording(recording);
        },
      });
      setState('recording');
    } catch {
      setState('error');
      setMessage(t('Measure.startError'));
    }
  }

  async function stop() {
    if (recorder.durationMs < MIN_RECORDING_MS) return;
    try {
      const recording = await recorder.stopRecording();
      await uploadRecording(recording);
    } catch {
      setState('error');
      setMessage(t('Measure.recordingFailedError'));
    }
  }

  useEffect(() => {
    return () => {
      cancelled.current = true;
      const current = recorderRef.current;
      if (current.isRecording) {
        void current
          .stopRecording()
          .then((recording) => removeRecording(recording.fileUri))
          .catch(() => undefined);
      }
    };
  }, []);

  const seconds = Math.floor(recorder.durationMs / 1000);
  const canStop = recorder.durationMs >= MIN_RECORDING_MS;
  const busy = state === 'preparing' || state === 'uploading';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.back}
        disabled={state === 'recording' || busy}
        accessibilityLabel={t('Common.back')}
      >
        <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{t('Measure.aiJudgeEyebrow')}</Text>
          <Text style={styles.title}>{t('Measure.title')}</Text>
          <Text style={styles.body}>{t('Measure.aiJudgeBody')}</Text>
        </View>

        <View style={styles.meter}>
          <View style={[styles.pulse, state === 'recording' && styles.pulseActive]}>
            <Ionicons
              name={
                state === 'recording' ? 'mic' : state === 'complete' ? 'checkmark' : 'mic-outline'
              }
              size={42}
              color={state === 'complete' ? '#34D399' : '#22D3EE'}
            />
          </View>
          <Text style={styles.timer}>{seconds.toString().padStart(2, '0')}s</Text>
          <Text style={styles.limit}>{t('Measure.recordingRange')}</Text>
        </View>

        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={21} color="#34D399" />
          <Text style={styles.noticeText}>{t('Measure.privacyNotice')}</Text>
        </View>

        {state === 'complete' ? (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>{t('Measure.resultTitle')}</Text>
            <Text style={styles.resultBody}>{t('Measure.aiJudgeResultNote')}</Text>
            <Pressable style={styles.primaryButton} onPress={() => router.back()}>
              <Ionicons name="checkmark" size={20} color="#052E2B" />
              <Text style={styles.primaryButtonText}>{t('Measure.done')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            {state !== 'recording' ? (
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                onPress={start}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#052E2B" />
                ) : (
                  <Ionicons name="radio-button-on" size={20} color="#052E2B" />
                )}
                <Text style={styles.primaryButtonText}>
                  {state === 'uploading' ? t('Measure.measuring') : t('Measure.startRecording')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.stopButton,
                  !canStop && styles.disabled,
                  pressed && canStop && styles.pressed,
                ]}
                onPress={stop}
                disabled={!canStop}
              >
                <Ionicons name="stop" size={19} color="#F8FAFC" />
                <Text style={styles.stopButtonText}>
                  {canStop ? t('Measure.stopAndMeasure') : t('Measure.keepSinging')}
                </Text>
              </Pressable>
            )}
            {(state === 'error' || state === 'rejected') && (
              <Text style={styles.error}>{message || t('Measure.rejectedError')}</Text>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#07101D' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  content: { flex: 1, paddingHorizontal: 24, paddingBottom: 24, justifyContent: 'space-between' },
  heading: { gap: 10, paddingTop: 20 },
  eyebrow: { color: '#22D3EE', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#F8FAFC', fontSize: 28, lineHeight: 34, fontWeight: '800' },
  body: { color: '#A8B3C2', fontSize: 15, lineHeight: 23 },
  meter: { alignItems: 'center', gap: 10 },
  pulse: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: '#244158',
    backgroundColor: '#0C1A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseActive: { borderColor: '#22D3EE', backgroundColor: '#0B2733' },
  timer: {
    color: '#F8FAFC',
    fontSize: 32,
    lineHeight: 38,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  limit: { color: '#75859A', fontSize: 13 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 16 },
  noticeText: { flex: 1, color: '#9CAFC0', fontSize: 13, lineHeight: 19 },
  actions: { gap: 14 },
  primaryButton: {
    minHeight: 52,
    backgroundColor: '#2DD4BF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    borderRadius: 8,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#052E2B', fontSize: 15, fontWeight: '800' },
  stopButton: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#E34E67',
    backgroundColor: '#321520',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    borderRadius: 8,
    paddingHorizontal: 18,
  },
  stopButtonText: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82 },
  error: { color: '#FDA4AF', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  result: { gap: 14 },
  resultTitle: { color: '#34D399', fontSize: 20, fontWeight: '800' },
  resultBody: { color: '#A8B3C2', fontSize: 14, lineHeight: 21 },
});
