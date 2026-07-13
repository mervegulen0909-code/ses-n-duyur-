import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CRITERIA } from '@voxscore/scoring';
import {
  MiniFlow,
  Podium,
  RadarChart,
  ScoreRings,
  VsWaves,
  Waveform,
} from '@/components/onboarding-visuals';
import { alpha, COLORS, FONTS } from '@/constants/brand';
import { completeOnboarding } from '@/lib/onboarding';
import {
  DEMO_OVERALL,
  DEMO_SCORES_ORDERED,
  routeForIntent,
  type IntentId,
} from '@/lib/onboarding-flow';

const GLOW = require('../../assets/brand/glow.png');

type Step = 'promise' | 'trust' | 'intent' | 'path';
const LINEAR: Step[] = ['promise', 'trust', 'intent'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<Step>('promise');
  const [intent, setIntent] = useState<IntentId>('singer');

  // Fade/rise transition on every step change (re-keyed view remounts).
  const enter = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [step, enter]);

  const finish = useCallback(
    async (href: Href) => {
      await completeOnboarding();
      router.replace(href);
    },
    [router],
  );

  const goPath = useCallback((id: IntentId) => {
    setIntent(id);
    setStep('path');
  }, []);

  const back = useCallback(() => {
    setStep((s) =>
      s === 'trust' ? 'promise' : s === 'intent' ? 'trust' : s === 'path' ? 'intent' : 'promise',
    );
  }, []);

  const progressIndex = step === 'path' ? 2 : LINEAR.indexOf(step);
  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Image
        source={GLOW}
        style={[styles.glow, { width: width * 1.3 }]}
        contentFit="contain"
        pointerEvents="none"
      />

      {/* header: back (once past step 1) · progress · skip */}
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {step !== 'promise' && (
            <Pressable onPress={back} hitSlop={12}>
              <Text style={styles.headerNav}>‹</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.progress}>
          {LINEAR.map((s, i) => (
            <View
              key={s}
              style={[styles.progressSeg, i <= progressIndex && styles.progressSegOn]}
            />
          ))}
        </View>
        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
          {step !== 'path' && (
            <Pressable onPress={() => void finish('/')} hitSlop={12}>
              <Text style={styles.skip}>{t('Onboarding.skip')}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Animated.View key={step} style={[styles.stepWrap, enterStyle]}>
        {step === 'promise' && (
          <PromiseStep
            onPrimary={() => setStep('trust')}
            onSecondary={() => void finish('/login')}
          />
        )}
        {step === 'trust' && <Trust onContinue={() => setStep('intent')} />}
        {step === 'intent' && <Intent onPick={goPath} onSkip={() => void finish('/')} />}
        {step === 'path' && (
          <Path intent={intent} onCta={() => void finish(routeForIntent(intent) as Href)} />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

/* ------------------------------ atoms ------------------------------ */

function Eyebrow({ children, color = COLORS.cyan }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

function PrimaryButton({
  label,
  onPress,
  color = COLORS.cyan,
}: {
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cta, { backgroundColor: color }, pressed && styles.pressed]}
    >
      <Text style={styles.ctaText}>{label}</Text>
    </Pressable>
  );
}

/* ---------------------------- 1 · Promise -------------------------- */

function PromiseStep({
  onPrimary,
  onSecondary,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.stepFill}>
      <View style={styles.promiseCopy}>
        <Eyebrow>{t('Onboarding.promiseEyebrow')}</Eyebrow>
        <Text style={styles.h1}>{t('Onboarding.promiseTitle')}</Text>
        <Text style={styles.body}>{t('Onboarding.promiseBody')}</Text>
      </View>

      <View style={styles.fingerprint}>
        <View style={styles.fingerprintWave}>
          <Waveform height={116} />
        </View>
        <ScoreRings size={150} score={DEMO_OVERALL} label={t('Onboarding.verifying')} />
      </View>

      <View style={styles.footer}>
        <PrimaryButton label={t('Onboarding.promisePrimary')} onPress={onPrimary} />
        <Pressable onPress={onSecondary} hitSlop={8} style={styles.textBtn}>
          <Text style={styles.textBtnLabel}>{t('Onboarding.promiseSecondary')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ----------------------------- 2 · Trust --------------------------- */

type ChainStep = { key: string; n: string; color: string; badge?: string; line: boolean };

function Trust({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const chain: ChainStep[] = [
    { key: 'chain1', n: '01', color: COLORS.cyan, line: true },
    { key: 'chain2', n: '02', color: COLORS.cyan, line: true },
    {
      key: 'chain3',
      n: '03',
      color: COLORS.amber,
      badge: t('Onboarding.badgeProvisional'),
      line: true,
    },
    {
      key: 'chain4',
      n: '04',
      color: COLORS.green,
      badge: t('Onboarding.badgeVerified'),
      line: false,
    },
  ];
  return (
    <View style={styles.stepFill}>
      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        <Eyebrow>{t('Onboarding.trustEyebrow')}</Eyebrow>
        <Text style={styles.h2}>{t('Onboarding.trustTitle')}</Text>
        <Text style={styles.body}>{t('Onboarding.trustBody')}</Text>

        <View style={styles.chain}>
          {chain.map((s) => (
            <View key={s.key} style={styles.chainRow}>
              <View style={styles.chainRail}>
                <View style={[styles.chainNode, { borderColor: s.color }]}>
                  <Text style={[styles.chainNum, { color: s.color }]}>{s.n}</Text>
                </View>
                {s.line && (
                  <View style={[styles.chainLine, { backgroundColor: alpha(s.color, 0.5) }]} />
                )}
              </View>
              <View style={styles.chainText}>
                <Text style={styles.chainTitle}>{t(`Onboarding.${s.key}Title`)}</Text>
                <Text style={styles.chainSub}>{t(`Onboarding.${s.key}Sub`)}</Text>
                {s.badge && (
                  <View style={[styles.badge, { borderColor: s.color }]}>
                    <Text style={[styles.badgeText, { color: s.color }]}>{s.badge}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={t('Onboarding.trustContinue')} onPress={onContinue} />
      </View>
    </View>
  );
}

/* ----------------------------- 3 · Intent -------------------------- */

type IntentCard = { id: IntentId; glyph: string; accent: string };

function Intent({ onPick, onSkip }: { onPick: (id: IntentId) => void; onSkip: () => void }) {
  const { t } = useTranslation();
  const cards: IntentCard[] = [
    { id: 'singer', glyph: '♪', accent: COLORS.cyan },
    { id: 'juror', glyph: 'VS', accent: COLORS.rose },
    { id: 'explorer', glyph: '≡', accent: COLORS.muted },
  ];
  return (
    <View style={styles.stepFill}>
      <View style={styles.intentHead}>
        <Eyebrow>{t('Onboarding.intentEyebrow')}</Eyebrow>
        <Text style={styles.h2}>{t('Onboarding.intentTitle')}</Text>
        <Text style={styles.body}>{t('Onboarding.intentBody')}</Text>
      </View>

      <View style={styles.intentList}>
        {cards.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onPick(c.id)}
            style={({ pressed }) => [
              styles.intentCard,
              { borderColor: alpha(c.accent, 0.35), backgroundColor: alpha(c.accent, 0.06) },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.intentGlyph, { borderColor: alpha(c.accent, 0.4) }]}>
              <Text style={[styles.intentGlyphText, { color: c.accent }]}>{c.glyph}</Text>
            </View>
            <View style={styles.intentCardText}>
              <Text style={styles.intentTitle}>{t(`Onboarding.${c.id}Title`)}</Text>
              <Text style={styles.intentSub}>{t(`Onboarding.${c.id}Sub`)}</Text>
            </View>
            <Text style={[styles.intentArrow, { color: c.accent }]}>→</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable onPress={onSkip} hitSlop={8} style={styles.textBtn}>
          <Text style={styles.textBtnLabel}>{t('Onboarding.intentSkip')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------ 4 · Path --------------------------- */

const PATHS: Record<IntentId, { key: string; accent: string }> = {
  singer: { key: 'Singer', accent: COLORS.cyan },
  juror: { key: 'Juror', accent: COLORS.rose },
  explorer: { key: 'Explorer', accent: COLORS.green },
};

function Path({ intent, onCta }: { intent: IntentId; onCta: () => void }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { key, accent } = PATHS[intent];

  const flow = useMemo(
    () => [t(`Onboarding.flow${key}1`), t(`Onboarding.flow${key}2`), t(`Onboarding.flow${key}3`)],
    [t, key],
  );
  const radarLabels = useMemo(() => CRITERIA.map((c) => t(`Onboarding.radar.${c}`)), [t]);
  const radarSize = Math.min(width - 64, 296);

  return (
    <View style={styles.stepFill}>
      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        <Eyebrow color={accent}>{t(`Onboarding.path${key}Eyebrow`)}</Eyebrow>
        <Text style={styles.h2}>{t(`Onboarding.path${key}Headline`)}</Text>
        <Text style={styles.body}>{t(`Onboarding.path${key}Body`)}</Text>

        {intent === 'singer' && (
          <>
            <View style={styles.urlPill}>
              <Text style={styles.urlIcon}>🔗</Text>
              <Text style={styles.urlText} numberOfLines={1}>
                {t('Onboarding.urlPlaceholder')}
              </Text>
              <View style={[styles.urlGo, { backgroundColor: accent }]}>
                <Text style={styles.urlGoText}>→</Text>
              </View>
            </View>
            <View style={styles.visual}>
              <RadarChart
                size={radarSize}
                scores={DEMO_SCORES_ORDERED}
                labels={radarLabels}
                overall={DEMO_OVERALL}
              />
            </View>
          </>
        )}
        {intent === 'juror' && (
          <View style={styles.visualCard}>
            <VsWaves />
          </View>
        )}
        {intent === 'explorer' && (
          <View style={styles.visualCard}>
            <Podium />
          </View>
        )}

        <View style={styles.flowCard}>
          <MiniFlow steps={flow} accent={accent} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t(`Onboarding.path${key}Cta`)} onPress={onCta} color={accent} />
        <Text style={styles.note}>{t(`Onboarding.path${key}Note`)}</Text>
      </View>
    </View>
  );
}

/* ------------------------------ styles ----------------------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.surface },
  glow: { position: 'absolute', top: -140, alignSelf: 'center', height: 520, opacity: 0.8 },

  header: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  headerSide: { width: 48, justifyContent: 'center' },
  headerNav: { color: COLORS.muted, fontSize: 26, lineHeight: 26, fontFamily: FONTS.sans },
  progress: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  progressSeg: { width: 26, height: 4, borderRadius: 2, backgroundColor: COLORS.borderDeep },
  progressSegOn: { backgroundColor: COLORS.cyan },
  skip: { color: COLORS.faint, fontSize: 15, fontFamily: FONTS.sansSemibold },

  stepWrap: { flex: 1 },
  stepFill: { flex: 1, paddingHorizontal: 28 },
  scrollBody: { paddingTop: 8, paddingBottom: 16 },

  eyebrow: { fontFamily: FONTS.mono, fontSize: 12, letterSpacing: 4, marginBottom: 14 },
  h1: {
    fontFamily: FONTS.sansBold,
    fontSize: 34,
    lineHeight: 40,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: FONTS.sansBold,
    fontSize: 30,
    lineHeight: 36,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  body: {
    marginTop: 14,
    fontFamily: FONTS.sans,
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.muted,
  },

  footer: { paddingTop: 16, paddingBottom: 6, gap: 6 },
  cta: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: COLORS.onCyan, fontFamily: FONTS.sansBold, fontSize: 16, letterSpacing: 0.3 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  textBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { color: COLORS.muted, fontFamily: FONTS.sansSemibold, fontSize: 15 },
  note: { textAlign: 'center', fontFamily: FONTS.sans, fontSize: 13, color: COLORS.faint2 },

  // promise
  promiseCopy: { paddingTop: 10 },
  fingerprint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fingerprintWave: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },

  // trust — causal chain
  chain: { marginTop: 26 },
  chainRow: { flexDirection: 'row', gap: 16 },
  chainRail: { width: 34, alignItems: 'center' },
  chainNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainNum: { fontFamily: FONTS.mono, fontSize: 13 },
  chainLine: { width: 1, flex: 1, minHeight: 24 },
  chainText: { flex: 1, paddingBottom: 22 },
  chainTitle: { fontFamily: FONTS.sansSemibold, fontSize: 17, color: COLORS.ink, paddingTop: 5 },
  chainSub: {
    marginTop: 3,
    fontFamily: FONTS.sans,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 2 },

  // intent
  intentHead: { paddingTop: 8 },
  intentList: { flex: 1, justifyContent: 'center', gap: 14 },
  intentCard: {
    minHeight: 92,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
  },
  intentGlyph: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: COLORS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intentGlyphText: { fontFamily: FONTS.mono, fontSize: 16 },
  intentCardText: { flex: 1 },
  intentTitle: { fontFamily: FONTS.sansSemibold, fontSize: 17, color: COLORS.ink },
  intentSub: {
    marginTop: 3,
    fontFamily: FONTS.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.muted,
  },
  intentArrow: { fontFamily: FONTS.mono, fontSize: 16 },

  // path
  urlPill: {
    marginTop: 20,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raisedFaint,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    gap: 10,
  },
  urlIcon: { fontSize: 14 },
  urlText: { flex: 1, fontFamily: FONTS.mono, fontSize: 13, color: COLORS.faint },
  urlGo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlGoText: { color: COLORS.onCyan, fontFamily: FONTS.sansBold, fontSize: 16 },
  visual: { alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  visualCard: {
    marginTop: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raisedFaint,
    paddingVertical: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowCard: {
    marginTop: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raisedFaint,
    paddingVertical: 22,
    paddingHorizontal: 18,
  },
});
