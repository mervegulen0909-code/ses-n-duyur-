import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { alpha, COLORS, FONTS } from '@/constants/brand';
import {
  polarPoints,
  polygonEdges,
  radarVertices,
  segment,
  type Segment,
} from '@/lib/onboarding-flow';

/* ------------------------------------------------------------------ *
 * Onboarding v2 — brand visuals, drawn with View composition (no SVG,
 * matching the app's existing approach). Geometry comes from the tested
 * `onboarding-flow` module.
 * ------------------------------------------------------------------ */

/** A straight line rendered as a rotated View (used for radar spokes/edges). */
function Line({
  seg,
  color,
  thickness,
  opacity,
  glow,
}: {
  seg: Segment;
  color: string;
  thickness: number;
  opacity?: Animated.Value | number;
  glow?: boolean;
}) {
  const style: Animated.WithAnimatedObject<ViewStyle> = {
    position: 'absolute',
    left: seg.cx - seg.length / 2,
    top: seg.cy - thickness / 2,
    width: seg.length,
    height: thickness,
    borderRadius: thickness,
    backgroundColor: color,
    transform: [{ rotate: `${seg.angleDeg}deg` }],
    opacity,
    ...(glow
      ? {
          shadowColor: COLORS.cyan,
          shadowOpacity: 0.5,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }
      : null),
  };
  return <Animated.View style={style} />;
}

/* ----------------------------- Waveform ---------------------------- */

// Bar heights from the design source (Onboarding v2, screen 1), 0..108.
const WAVE = [14, 30, 22, 52, 38, 70, 46, 92, 60, 108, 76, 96, 54, 80, 40, 64, 30, 46, 20, 34, 14];
const WAVE_MAX = 108;

/** The audio "fingerprint" — a row of cyan bars that gently pulse. */
export function Waveform({ height = 120, animate = true }: { height?: number; animate?: boolean }) {
  const vals = useRef(
    WAVE.map((_, i) => new Animated.Value(0.6 + 0.4 * Math.abs(Math.sin(i)))),
  ).current;

  useEffect(() => {
    if (!animate) return;
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 520 + (i % 6) * 60,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.55,
            duration: 520 + (i % 6) * 60,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [vals, animate]);

  return (
    <View style={[styles.waveRow, { height }]}>
      {WAVE.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            borderRadius: 2,
            height: Math.max(6, (h / WAVE_MAX) * height),
            backgroundColor: alpha(COLORS.cyan, 0.55 + 0.45 * (h / WAVE_MAX)),
            transform: [{ scaleY: animate ? vals[i] : 1 }],
          }}
        />
      ))}
    </View>
  );
}

/* ---------------------------- ScoreRings --------------------------- */

/** Concentric "trust rings" with a live score and a pulsing status label. */
export function ScoreRings({
  size = 150,
  score = 86,
  label,
}: {
  size?: number;
  score?: number;
  label: string;
}) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: alpha(COLORS.cyan, 0.18),
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size - 28,
            height: size - 28,
            borderRadius: size / 2,
            borderColor: alpha(COLORS.cyan, 0.35),
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            width: size - 56,
            height: size - 56,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: COLORS.cyan,
            shadowColor: COLORS.cyan,
            shadowOpacity: 0.35,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      />
      <View style={{ alignItems: 'center' }}>
        <Text style={styles.ringScore}>{score}</Text>
        <Animated.Text style={[styles.ringLabel, { opacity: pulse }]}>{label}</Animated.Text>
      </View>
    </View>
  );
}

/* ---------------------------- RadarChart --------------------------- */

/** 9-criterion radar: gridlines, spokes, a data polygon, and edge labels. */
export function RadarChart({
  size,
  scores,
  labels,
  overall,
}: {
  size: number;
  scores: number[];
  labels: string[];
  overall: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.29;
  const labelR = size * 0.42;
  const n = scores.length;

  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, {
      toValue: 1,
      duration: 900,
      delay: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [grow]);

  const { rings, spokes, dataEdges, dataPts, labelPts } = useMemo(() => {
    const tips = polarPoints(n, r, cx, cy);
    return {
      rings: [0.5, 1].map((f) => polygonEdges(polarPoints(n, r * f, cx, cy))),
      spokes: tips.map((t) => segment({ x: cx, y: cy }, t)),
      dataEdges: polygonEdges(radarVertices(scores, r, cx, cy)),
      dataPts: radarVertices(scores, r, cx, cy),
      labelPts: polarPoints(n, labelR, cx, cy),
    };
  }, [n, r, cx, cy, labelR, scores]);

  return (
    <View style={{ width: size, height: size }}>
      {rings.map((ring, ri) =>
        ring.map((e, ei) => (
          <Line key={`g${ri}-${ei}`} seg={e} color={alpha(COLORS.cyan, 0.12)} thickness={1} />
        )),
      )}
      {spokes.map((s, i) => (
        <Line key={`s${i}`} seg={s} color={alpha(COLORS.cyan, 0.14)} thickness={1} />
      ))}
      {dataEdges.map((e, i) => (
        <Line key={`d${i}`} seg={e} color={COLORS.cyan} thickness={2} opacity={grow} glow />
      ))}
      {dataPts.map((p, i) => (
        <Animated.View
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: p.x - 3,
            top: p.y - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: COLORS.cyan,
            opacity: grow,
          }}
        />
      ))}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.radarScore}>{overall}</Text>
        <Text style={styles.radarOutOf}>/100</Text>
      </View>
      {labelPts.map((p, i) => (
        <View
          key={`l${i}`}
          style={{
            position: 'absolute',
            left: p.x - 30,
            top: p.y - 15,
            width: 60,
            alignItems: 'center',
          }}
        >
          <Text style={styles.radarLabel} numberOfLines={1}>
            {labels[i]}
          </Text>
          <Text style={styles.radarValue}>{scores[i]}</Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------ VsWaves ---------------------------- */

/** Two mini waveforms facing off across a VS chip (juror path). */
export function VsWaves() {
  return (
    <View style={styles.vsRow}>
      <MiniWave tint={COLORS.cyan} />
      <View style={styles.vsChip}>
        <Text style={styles.vsText}>VS</Text>
      </View>
      <MiniWave tint={COLORS.rose} flip />
    </View>
  );
}

function MiniWave({ tint, flip }: { tint: string; flip?: boolean }) {
  const bars = [10, 22, 14, 30, 20, 26, 12, 24, 16];
  const row = flip ? [...bars].reverse() : bars;
  return (
    <View style={[styles.miniWave, flip && { justifyContent: 'flex-start' }]}>
      {row.map((h, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            backgroundColor: alpha(tint, 0.5 + h / 60),
          }}
        />
      ))}
    </View>
  );
}

/* ------------------------------- Podium ---------------------------- */

/** A 2–1–3 podium with a crown on the top step (explorer path). */
export function Podium() {
  const steps: { rank: number; h: number; top?: boolean }[] = [
    { rank: 2, h: 46 },
    { rank: 1, h: 74, top: true },
    { rank: 3, h: 34 },
  ];
  return (
    <View style={styles.podiumRow}>
      {steps.map(({ rank, h, top }) => (
        <View key={rank} style={{ alignItems: 'center' }}>
          {top && <Text style={styles.crown}>♛</Text>}
          <View
            style={{
              width: 56,
              height: h,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              backgroundColor: top ? alpha(COLORS.green, 0.9) : alpha(COLORS.green, 0.28),
              borderWidth: 1,
              borderColor: alpha(COLORS.green, 0.5),
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingTop: 8,
            }}
          >
            <Text style={[styles.podiumRank, { color: top ? COLORS.onCyan : COLORS.green }]}>
              {rank}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------ MiniFlow --------------------------- */

/** The numbered 3-step flow (Link → Review → Score, etc.) with arrows. */
export function MiniFlow({ steps, accent }: { steps: string[]; accent: string }) {
  return (
    <View style={styles.flowRow}>
      {steps.map((label, i) => (
        <View key={label} style={styles.flowItem}>
          <View style={styles.flowStep}>
            <View style={[styles.flowNode, { borderColor: accent }]}>
              <Text style={[styles.flowNum, { color: accent }]}>
                {String(i + 1).padStart(2, '0')}
              </Text>
            </View>
            <Text style={styles.flowLabel} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {i < steps.length - 1 && <Text style={styles.flowArrow}>→</Text>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  waveRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  ring: { position: 'absolute', borderWidth: 1 },
  ringScore: { fontFamily: FONTS.mono, fontSize: 40, color: COLORS.inkBright },
  ringLabel: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: COLORS.green,
    marginTop: 2,
  },

  radarScore: { fontFamily: FONTS.mono, fontSize: 38, color: COLORS.inkBright, lineHeight: 42 },
  radarOutOf: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.faint2, marginTop: 1 },
  radarLabel: { fontFamily: FONTS.sansMedium, fontSize: 10.5, color: COLORS.muted },
  radarValue: { fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.ink, marginTop: 1 },

  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  miniWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    width: 96,
    justifyContent: 'flex-end',
  },
  vsChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: alpha(COLORS.rose, 0.5),
    backgroundColor: alpha(COLORS.rose, 0.08),
  },
  vsText: { fontFamily: FONTS.mono, fontSize: 14, color: COLORS.rose },

  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    height: 110,
  },
  crown: { fontSize: 20, color: COLORS.green, marginBottom: 4 },
  podiumRank: { fontFamily: FONTS.mono, fontSize: 15, fontWeight: '700' },

  flowRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  flowItem: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  flowStep: { alignItems: 'center', gap: 9, flex: 1 },
  flowNode: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowNum: { fontFamily: FONTS.mono, fontSize: 13 },
  flowLabel: { fontFamily: FONTS.sansSemibold, fontSize: 13, color: COLORS.ink },
  flowArrow: { fontFamily: FONTS.mono, color: COLORS.faint3, paddingTop: 12 },
});
