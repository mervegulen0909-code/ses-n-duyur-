import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// VoxScore — Design Prototype (mobile)
//
// A real, navigable Expo screen that walks the full VoxScore concept flow from
// the Claude Design storyboard: Splash → Onboarding → Recording → Live Scoring
// → Results → Progress. Built with the app's own patterns (StyleSheet + RN
// Animated + expo-router) and palette (#070d18 / #22D3EE).
//
// IMPORTANT — this is a DESIGN PROTOTYPE. The recording is simulated and every
// score is demo data; no audio is captured or analyzed. The real product scores
// embedded YouTube performances as a "Provisional AI Estimate" — real per-note
// DSP (pitch/tone/confidence on your own voice) is a future premium surface, so
// nothing here is presented as a real measurement.

const GLOW = require('../../assets/brand/glow.png');
const CTA = require('../../assets/brand/cta.png');

const CYAN = '#22D3EE';
const MINT = '#7CF5C8';
const CORAL = '#F2795C';
const INK = '#F4F8FC';
const MUTED = '#9fb1c6';
const FAINT = '#6b7a8d';

/** Linear-interpolate the cyan→coral ramp; t in [0,1]. */
function mix(t: number): string {
  const ch = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${ch(34, 242)},${ch(211, 121)},${ch(238, 92)})`;
}

type Screen = 'splash' | 'onboarding' | 'recording' | 'scoring' | 'results' | 'progress';

const STEPS: { key: Screen; n: string }[] = [
  { key: 'splash', n: '01' },
  { key: 'onboarding', n: '02' },
  { key: 'recording', n: '03' },
  { key: 'scoring', n: '04' },
  { key: 'results', n: '05' },
  { key: 'progress', n: '06' },
];
const ORDER = STEPS.map((s) => s.key);

/* ------------------------------- atoms --------------------------------- */

/** The angular VoxScore "V" mark, composed from two strokes (no SVG dep). */
function VMark({ size }: { size: number }) {
  const stroke = Math.max(4, size * 0.12);
  const arm: ViewStyle = {
    position: 'absolute',
    bottom: size * 0.12,
    width: stroke,
    height: size * 0.82,
    borderRadius: stroke,
    backgroundColor: CYAN,
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[arm, { left: size * 0.27, transform: [{ rotate: '20deg' }] }]} />
      <View
        style={[
          arm,
          { right: size * 0.27, transform: [{ rotate: '-20deg' }], backgroundColor: CORAL },
        ]}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.1,
          width: stroke * 1.05,
          height: stroke * 1.05,
          borderRadius: stroke,
          backgroundColor: mix(0.5),
        }}
      />
    </View>
  );
}

/** A shimmering equalizer/waveform row. */
function Equalizer({
  bars = 28,
  height = 44,
  barWidth = 3,
  gap = 3,
  animate = true,
}: {
  bars?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
  animate?: boolean;
}) {
  const values = useRef(
    Array.from(
      { length: bars },
      (_, i) => new Animated.Value(0.4 + 0.6 * Math.abs(Math.sin(i * 1.3))),
    ),
  ).current;

  useEffect(() => {
    if (!animate) return;
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 460 + (i % 7) * 55,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.42,
            duration: 460 + (i % 7) * 55,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [values, animate]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height, gap }}>
      {values.map((v, i) => {
        const t = bars === 1 ? 0 : i / (bars - 1);
        const h = Math.max(4, (0.35 + 0.65 * Math.sin(t * Math.PI)) * height);
        return (
          <Animated.View
            key={i}
            style={{
              width: barWidth,
              height: h,
              borderRadius: barWidth,
              backgroundColor: mix(t),
              transform: [{ scaleY: animate ? v : 1 }],
            }}
          />
        );
      })}
    </View>
  );
}

/** A circular score gauge drawn as a dotted ring that sweep-fills on mount. */
function Gauge({ value, size, center }: { value: number; size: number; center: ReactNode }) {
  const DOTS = 40;
  const lit = Math.round((value / 100) * DOTS);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.setValue(0);
    Animated.timing(sweep, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sweep, value]);

  const r = size / 2 - 8;
  const c = size / 2;
  const dot = 5;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: DOTS }, (_, i) => {
        const ang = ((-90 + i * (360 / DOTS)) * Math.PI) / 180;
        const base: ViewStyle = {
          position: 'absolute',
          left: c + r * Math.cos(ang) - dot / 2,
          top: c + r * Math.sin(ang) - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
        };
        if (i >= lit) {
          return <View key={i} style={[base, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />;
        }
        const thr = i / lit;
        const opacity = sweep.interpolate({
          inputRange: [Math.max(0, thr - 0.001), Math.min(0.999, thr + 0.06), 1],
          outputRange: [0.12, 1, 1],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={[base, { backgroundColor: mix(i / Math.max(1, lit - 1)), opacity }]}
          />
        );
      })}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        {center}
      </View>
    </View>
  );
}

/** Onboarding's slowly-rotating particle "listening" orb. */
function Orb({ size = 200 }: { size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 38000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const dots = useMemo(() => {
    const c = size / 2;
    const rings: [number, number][] = [
      [size * 0.18, 8],
      [size * 0.31, 12],
      [size * 0.42, 15],
    ];
    const out: { left: number; top: number; r: number; color: string; opacity: number }[] = [];
    rings.forEach(([rad, count], ri) => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + ri * 0.6;
        const rr = 1 + (ri === 0 ? 1.4 : 0.6 + (i % 3) * 0.5);
        out.push({
          left: c + Math.cos(a) * rad - rr,
          top: c + Math.sin(a) * rad - rr,
          r: rr,
          color: i % 5 === 0 && ri > 0 ? CORAL : CYAN,
          opacity: 0.35 + ((i * 7) % 6) / 10,
        });
      }
    });
    return out;
  }, [size]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.66,
          height: size * 0.66,
          borderRadius: size,
          backgroundColor: 'rgba(34,211,238,0.12)',
        }}
      />
      <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
        {dots.map((d, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: d.left,
              top: d.top,
              width: d.r * 2,
              height: d.r * 2,
              borderRadius: d.r,
              backgroundColor: d.color,
              opacity: d.opacity,
            }}
          />
        ))}
      </Animated.View>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: CYAN,
          shadowColor: CYAN,
          shadowOpacity: 0.9,
          shadowRadius: 12,
        }}
      />
    </View>
  );
}

/** The recording screen's mic glyph (composed from Views). */
function Mic() {
  return (
    <View style={{ width: 36, height: 44, alignItems: 'center' }}>
      <View style={{ width: 14, height: 26, borderRadius: 7, backgroundColor: CYAN }} />
      <View
        style={{
          position: 'absolute',
          top: 12,
          width: 28,
          height: 16,
          borderWidth: 2.5,
          borderTopWidth: 0,
          borderColor: CYAN,
          borderBottomLeftRadius: 14,
          borderBottomRightRadius: 14,
        }}
      />
      <View
        style={{ position: 'absolute', top: 30, width: 2.5, height: 8, backgroundColor: CYAN }}
      />
      <View
        style={{
          position: 'absolute',
          top: 38,
          width: 16,
          height: 2.5,
          borderRadius: 2,
          backgroundColor: CYAN,
        }}
      />
    </View>
  );
}

function Cta({
  label,
  onPress,
  tone = 'cyan',
}: {
  label: string;
  onPress: () => void;
  tone?: 'cyan' | 'coral';
}) {
  if (tone === 'coral') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.coralCta, pressed && styles.ctaPressed]}
      >
        <Text style={styles.coralCtaText}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.ctaPressed]}>
      <ImageBackground
        source={CTA}
        style={styles.cta}
        imageStyle={styles.ctaImage}
        resizeMode="cover"
      >
        <Text style={styles.ctaText}>{label}</Text>
      </ImageBackground>
    </Pressable>
  );
}

/* ------------------------------ screens -------------------------------- */

function SplashScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <Pressable style={styles.splash} onPress={() => go('onboarding')}>
      <VMark size={132} />
      <View style={{ marginTop: 18 }}>
        <Equalizer bars={26} height={30} />
      </View>
      <Text style={styles.wordmark}>
        Vox<Text style={{ color: CYAN }}>Score</Text>
      </Text>
      <Text style={styles.splashTag}>Know Your Voice.{'\n'}Elevate Every Note.</Text>
      <Text style={styles.tapHint}>tap to continue</Text>
    </Pressable>
  );
}

function OnboardingScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <View style={styles.pad}>
      <Pressable onPress={() => go('recording')} hitSlop={10} style={{ alignSelf: 'flex-end' }}>
        <Text style={styles.skip}>Skip</Text>
      </Pressable>
      <Text style={styles.h1}>
        Uncover the True Potential of <Text style={{ color: CYAN }}>Your Voice</Text>
      </Text>
      <Text style={styles.body}>
        Advanced AI listens. Real-time insights help you sing with confidence.
      </Text>
      <View style={styles.grow}>
        <Orb size={210} />
      </View>
      <View style={styles.dotsRow}>
        <View style={[styles.pageDot, { width: 22, backgroundColor: CYAN }]} />
        <View style={styles.pageDot} />
        <View style={styles.pageDot} />
        <View style={styles.pageDot} />
      </View>
      <Cta label="Let's Get Started" onPress={() => go('recording')} />
      <Text style={styles.loginRow}>
        Already have an account? <Text style={{ color: CYAN, fontWeight: '700' }}>Log in</Text>
      </Text>
    </View>
  );
}

function RecordingScreen({
  seconds,
  paused,
  onTogglePause,
  go,
}: {
  seconds: number;
  paused: boolean;
  onTogglePause: () => void;
  go: (s: Screen) => void;
}) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return (
    <View style={styles.pad}>
      <View style={styles.screenHeader}>
        <View style={{ width: 22 }} />
        <Text style={styles.screenTitle}>Recording</Text>
        <Pressable onPress={() => go('onboarding')} hitSlop={10}>
          <Text style={styles.headerIcon}>✕</Text>
        </Pressable>
      </View>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Text style={styles.timer}>
          {mm}:{ss}
        </Text>
        <Text style={styles.timerSub}>/ 01:00</Text>
      </View>
      <View style={styles.grow}>
        <View style={[styles.micRing, paused && { opacity: 0.55 }]}>
          <View style={styles.micInner}>
            <Mic />
          </View>
        </View>
        <View style={{ marginTop: 30 }}>
          <Equalizer bars={36} height={56} animate={!paused} />
        </View>
        <Text style={[styles.muted, { marginTop: 18 }, paused && { color: '#f0a05f' }]}>
          {paused ? 'Paused' : 'Keep singing…'}
        </Text>
      </View>
      <View style={styles.studioChip}>
        <Equalizer bars={4} height={13} barWidth={2.5} gap={2.5} animate={!paused} />
        <Text style={styles.studioText}>Studio Mode</Text>
      </View>
      <View style={styles.row}>
        <Pressable
          onPress={onTogglePause}
          style={({ pressed }) => [styles.ghostBtn, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ghostText}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Cta label="Stop & Score" onPress={() => go('scoring')} />
        </View>
      </View>
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricVal}>
          <Text style={{ color: INK, fontWeight: '800' }}>{value}</Text> / 100
        </Text>
      </View>
      <Equalizer bars={24} height={18} barWidth={2.5} gap={2.5} />
    </View>
  );
}

function ScoringScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <View style={styles.pad}>
      <View style={styles.screenHeader}>
        <Pressable onPress={() => go('recording')} hitSlop={10}>
          <Text style={styles.headerIcon}>‹</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Live Score</Text>
        <Text style={styles.headerIcon}>ⓘ</Text>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 14 }}>
        <Gauge
          value={82}
          size={184}
          center={
            <>
              <Text style={styles.gaugeNum}>82</Text>
              <Text style={styles.gaugeLabel}>Good</Text>
            </>
          }
        />
      </View>
      <View style={{ gap: 11 }}>
        <MetricRow label="Pitch" value={85} />
        <MetricRow label="Tone" value={78} />
        <MetricRow label="Confidence" value={83} />
      </View>
      <View style={styles.grow} />
      <View style={styles.liveRow}>
        <View style={styles.liveTag}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
        <Equalizer bars={28} height={18} barWidth={2.5} gap={2.5} />
      </View>
      <Cta label="Finish & View Results" onPress={() => go('results')} />
    </View>
  );
}

function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <View>
      <View style={styles.metricTop}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.metricVal}>
          <Text style={{ color: INK, fontWeight: '700' }}>{value}</Text> / 100
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${value}%` }]} />
      </View>
    </View>
  );
}

function ResultsScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <View style={styles.pad}>
      <View style={styles.screenHeader}>
        <Pressable onPress={() => go('scoring')} hitSlop={10}>
          <Text style={styles.headerIcon}>‹</Text>
        </Pressable>
        <Text style={styles.screenTitle}>Session Results</Text>
        <Text style={styles.headerIcon}>↥</Text>
      </View>
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <Gauge
          value={86}
          size={168}
          center={
            <>
              <Text style={styles.overall}>OVERALL</Text>
              <Text style={styles.gaugeNum}>86</Text>
              <Text style={styles.gaugeLabel}>Great Performance!</Text>
            </>
          }
        />
      </View>
      <Text style={styles.stars}>★★★★★</Text>
      <Text style={styles.sectionLabel}>BREAKDOWN</Text>
      <View style={{ gap: 11 }}>
        <BreakdownBar label="Pitch" value={88} />
        <BreakdownBar label="Tone" value={82} />
        <BreakdownBar label="Confidence" value={87} />
      </View>
      <View style={styles.feedback}>
        <Text style={styles.feedbackTitle}>AI Feedback</Text>
        <Text style={styles.feedbackBody}>
          Great control and expression. Work on pitch stability in higher notes and maintain breath
          support.
        </Text>
      </View>
      <View style={styles.grow} />
      <Cta label="Save & Continue" tone="coral" onPress={() => go('progress')} />
    </View>
  );
}

function TrendChart() {
  const heights = [34, 42, 32, 58, 64, 82];
  const max = 90;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height: max,
        marginTop: 10,
      }}
    >
      {heights.map((h, i) => {
        const last = i === heights.length - 1;
        return (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            {last && <View style={styles.trendDot} />}
            <View
              style={{
                width: 12,
                height: h,
                borderRadius: 6,
                backgroundColor: last ? MINT : 'rgba(34,211,238,0.45)',
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function ProgressScreen({ go }: { go: (s: Screen) => void }) {
  const tab = (active: boolean, label: string, onPress: () => void) => (
    <Pressable onPress={onPress} hitSlop={8} style={{ alignItems: 'center', gap: 4 }}>
      <View style={[styles.tabIcon, active && { borderColor: CYAN }]} />
      <Text style={[styles.tabLabel, active && { color: CYAN, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.pad, { paddingBottom: 0 }]}>
      <View style={styles.screenHeader}>
        <View style={{ width: 18 }} />
        <Text style={styles.screenTitle}>My Progress</Text>
        <Text style={styles.headerIcon}>▦</Text>
      </View>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.cardLabel}>Overall Score</Text>
            <Text style={styles.cardSub}>This Month</Text>
          </View>
          <Text style={styles.cardScore}>86</Text>
        </View>
        <TrendChart />
        <View style={styles.chartLabels}>
          <Text style={styles.chartLabel}>May 5</Text>
          <Text style={styles.chartLabel}>May 12</Text>
          <Text style={styles.chartLabel}>May 19</Text>
          <Text style={styles.chartLabel}>May 26</Text>
        </View>
      </View>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>Performance History</Text>
        <Text style={{ color: CYAN, fontSize: 12 }}>See all</Text>
      </View>
      {(
        [
          ['May 26, 2024', 86, 'Great', MINT],
          ['May 19, 2024', 79, 'Good', CYAN],
          ['May 12, 2024', 72, 'Fair', '#f0a05f'],
          ['May 5, 2024', 65, 'Fair', '#f0a05f'],
        ] as [string, number, string, string][]
      ).map(([date, score, rating, color], i, arr) => (
        <View key={date} style={[styles.historyRow, i < arr.length - 1 && styles.historyDivider]}>
          <Text style={styles.historyDate}>{date}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Text style={styles.historyScore}>{score}</Text>
            <Text style={{ color, fontSize: 11, width: 34, textAlign: 'right' }}>{rating}</Text>
          </View>
        </View>
      ))}
      <View style={styles.grow} />
      <View style={styles.tabBar}>
        {tab(false, 'Home', () => go('splash'))}
        {tab(false, 'Sessions', () => go('recording'))}
        {tab(true, 'Progress', () => go('progress'))}
        {tab(false, 'Profile', () => go('onboarding'))}
      </View>
    </View>
  );
}

/* ------------------------------- shell --------------------------------- */

const BG: Record<Screen, string> = {
  splash: '#0a1622',
  onboarding: '#0b1622',
  recording: '#0a1420',
  scoring: '#0a1420',
  results: '#0b1521',
  progress: '#0a1420',
};

export default function VoxScoreDemoRoute() {
  // SIMULATED recording/scoring prototype — dev/preview only. The nav link is
  // already __DEV__-gated, but expo-router still bundles this file as a real
  // route, so deep links (voxscore://voxscore-demo) could reach it in a store
  // build. Gate the ROUTE itself: in production, bounce straight home.
  if (!__DEV__) return <Redirect href="/" />;
  return <VoxScoreDemoScreen />;
}

function VoxScoreDemoScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('splash');
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const enter = useRef(new Animated.Value(1)).current;

  const go = useCallback((s: Screen) => {
    setScreen(s);
    if (s === 'recording') {
      setSeconds(0);
      setPaused(false);
    }
  }, []);

  // Splash auto-advances like a real launch; cancelled if the user navigates.
  useEffect(() => {
    if (screen !== 'splash') return;
    const id = setTimeout(() => setScreen('onboarding'), 2400);
    return () => clearTimeout(id);
  }, [screen]);

  // Recording timer.
  useEffect(() => {
    if (screen !== 'recording' || paused) return;
    const id = setInterval(() => setSeconds((s) => Math.min(60, s + 1)), 1000);
    return () => clearInterval(id);
  }, [screen, paused]);

  // Auto-finish at the 60s cap.
  useEffect(() => {
    if (screen === 'recording' && seconds >= 60) go('scoring');
  }, [screen, seconds, go]);

  // Entrance transition on every screen change.
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [screen, enter]);

  const idx = ORDER.indexOf(screen);
  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  const renderScreen = () => {
    switch (screen) {
      case 'splash':
        return <SplashScreen go={go} />;
      case 'onboarding':
        return <OnboardingScreen go={go} />;
      case 'recording':
        return (
          <RecordingScreen
            seconds={seconds}
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            go={go}
          />
        );
      case 'scoring':
        return <ScoringScreen go={go} />;
      case 'results':
        return <ResultsScreen go={go} />;
      case 'progress':
        return <ProgressScreen go={go} />;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG[screen] }]} edges={['top', 'bottom']}>
      <Image source={GLOW} style={styles.glow} contentFit="contain" pointerEvents="none" />

      <Animated.View key={screen} style={[styles.screenBody, enterStyle]}>
        {renderScreen()}
      </Animated.View>

      {/* prototype control bar */}
      <View style={styles.controlBar}>
        <Text style={styles.protoNote}>Prototype · simulated data — no live audio analysis</Text>
        <View style={styles.controlRow}>
          <View style={styles.stepDots}>
            {STEPS.map((s, i) => {
              const active = s.key === screen;
              const done = i < idx;
              return (
                <Pressable key={s.key} onPress={() => go(s.key)} hitSlop={6}>
                  <View
                    style={[
                      styles.stepDot,
                      active && styles.stepDotActive,
                      done && styles.stepDotDone,
                    ]}
                  >
                    <Text style={[styles.stepNum, active && { color: '#04121f' }]}>{s.n}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.exit}>Exit</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  glow: {
    position: 'absolute',
    top: -180,
    alignSelf: 'center',
    width: 560,
    height: 560,
    opacity: 0.7,
  },
  screenBody: { flex: 1 },
  pad: { flex: 1, paddingHorizontal: 26, paddingTop: 10, paddingBottom: 18 },
  grow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },

  // splash
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  wordmark: { marginTop: 26, fontSize: 44, fontWeight: '800', color: INK, letterSpacing: -1 },
  splashTag: { marginTop: 12, fontSize: 14, lineHeight: 22, color: FAINT, textAlign: 'center' },
  tapHint: { marginTop: 24, fontSize: 12, letterSpacing: 1, color: '#46586a' },

  // common headers
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 30,
  },
  screenTitle: { fontSize: 17, fontWeight: '700', color: INK },
  headerIcon: { fontSize: 18, color: MUTED },

  h1: { marginTop: 8, fontSize: 27, lineHeight: 34, fontWeight: '700', color: INK },
  body: { marginTop: 12, fontSize: 15, lineHeight: 23, color: MUTED },
  skip: { fontSize: 14, color: FAINT, fontWeight: '600' },
  muted: { fontSize: 14, color: FAINT },

  // onboarding footer
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: 22 },
  pageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  loginRow: { textAlign: 'center', marginTop: 16, fontSize: 13, color: FAINT },

  // recording
  timer: { fontSize: 58, fontWeight: '800', color: INK, letterSpacing: 1.5 },
  timerSub: { fontSize: 13, color: FAINT, marginTop: 2 },
  micRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
  },
  micInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10202c',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
  },
  studioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  studioText: { fontSize: 12, color: '#cfd8e1' },

  // buttons
  cta: { height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaImage: { borderRadius: 16 },
  ctaText: { color: '#04121f', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  ctaPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  coralCta: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CORAL,
  },
  coralCtaText: { color: '#2a0d08', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  ghostBtn: {
    width: '40%',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ghostText: { color: INK, fontSize: 15, fontWeight: '700' },

  // gauges
  gaugeNum: { fontSize: 56, fontWeight: '800', color: INK, lineHeight: 60 },
  gaugeLabel: { fontSize: 13, color: MINT, marginTop: 2, letterSpacing: 0.5 },
  overall: { fontSize: 10, color: FAINT, letterSpacing: 1 },

  // metrics
  metric: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  metricLabel: { fontSize: 13, color: '#cfd8e1', fontWeight: '600' },
  metricVal: { fontSize: 12, color: FAINT },

  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: CORAL },
  liveText: { fontSize: 12, color: CORAL, fontWeight: '700' },

  // results
  stars: {
    textAlign: 'center',
    color: '#f5b14a',
    fontSize: 18,
    letterSpacing: 4,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    color: MUTED,
    letterSpacing: 1,
    fontWeight: '700',
    marginBottom: 10,
  },
  breakdownLabel: { fontSize: 12.5, color: '#cfd8e1' },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 6,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4, backgroundColor: MINT },
  feedback: {
    marginTop: 14,
    backgroundColor: 'rgba(34,211,238,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.16)',
    borderRadius: 13,
    padding: 12,
  },
  feedbackTitle: { fontSize: 12, fontWeight: '700', color: CYAN, marginBottom: 5 },
  feedbackBody: { fontSize: 12.5, lineHeight: 19, color: MUTED },

  // progress
  card: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 14,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLabel: { fontSize: 13, color: '#cfd8e1', fontWeight: '600' },
  cardSub: { fontSize: 11, color: FAINT, marginTop: 2 },
  cardScore: { fontSize: 26, fontWeight: '800', color: CYAN },
  trendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: MINT,
    backgroundColor: '#0a1420',
    marginBottom: 4,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  chartLabel: { fontSize: 10, color: FAINT },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  historyTitle: { fontSize: 13, fontWeight: '700', color: INK },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  historyDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  historyDate: { fontSize: 12.5, color: '#cfd8e1' },
  historyScore: { fontSize: 14, fontWeight: '800', color: INK },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  tabIcon: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.8, borderColor: FAINT },
  tabLabel: { fontSize: 10, color: FAINT },

  // control bar
  controlBar: {
    paddingHorizontal: 22,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  protoNote: { fontSize: 11, color: FAINT, textAlign: 'center' },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepDots: { flexDirection: 'row', gap: 7 },
  stepDot: {
    width: 30,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepDotActive: { backgroundColor: CYAN, borderColor: CYAN },
  stepDotDone: { borderColor: 'rgba(34,211,238,0.5)' },
  stepNum: { fontSize: 11, fontWeight: '800', color: MUTED },
  exit: { fontSize: 13, color: MUTED, fontWeight: '600' },
});
