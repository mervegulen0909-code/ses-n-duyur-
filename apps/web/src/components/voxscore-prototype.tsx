'use client';

// VoxScore — Interactive prototype
//
// A tappable, single-phone walkthrough of the full VoxScore flow: Splash →
// Onboarding → Recording → Live Scoring → Results → Progress. Real client state
// (a screen state machine + a live recording timer), CSS-driven entrance/gauge/
// chart animations, and working controls + a step navigator. This is a UX
// prototype: the recording is simulated and all scores are demo data — no live
// audio is captured or analyzed. Shares the ramp/particle math with the static
// board via ./voxscore-storyboard-art.

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { CORAL, CYAN, barHeights, mix, orbDots } from './voxscore-storyboard-art';

const SORA = 'var(--font-sora), system-ui, sans-serif';

type Screen = 'splash' | 'onboarding' | 'recording' | 'scoring' | 'results' | 'progress';

const STEPS: { key: Screen; n: string; label: string }[] = [
  { key: 'splash', n: '01', label: 'Splash' },
  { key: 'onboarding', n: '02', label: 'Onboarding' },
  { key: 'recording', n: '03', label: 'Recording' },
  { key: 'scoring', n: '04', label: 'Live Scoring' },
  { key: 'results', n: '05', label: 'Results' },
  { key: 'progress', n: '06', label: 'Progress' },
];
const ORDER = STEPS.map((s) => s.key);

const BG: Record<Screen, string> = {
  splash: 'radial-gradient(120% 80% at 50% 18%, #11202b, #080b11 70%)',
  onboarding: 'radial-gradient(120% 70% at 50% 42%, #101d27, #080b11 72%)',
  recording: 'radial-gradient(110% 60% at 50% 36%, #0f1b25, #080b11 70%)',
  scoring: 'radial-gradient(110% 55% at 50% 22%, #0f1b25, #080b11 68%)',
  results: 'radial-gradient(110% 55% at 50% 20%, #101c26, #080b11 68%)',
  progress: 'radial-gradient(110% 55% at 50% 18%, #0f1b25, #080b11 70%)',
};

const KEYFRAMES = `
@keyframes voxBar{from{transform:scaleY(0.4)}to{transform:scaleY(1)}}
@keyframes voxGlow{0%,100%{box-shadow:0 0 0 1px rgba(63,208,236,0.35),0 0 28px rgba(63,208,236,0.26)}50%{box-shadow:0 0 0 1px rgba(63,208,236,0.55),0 0 48px rgba(63,208,236,0.5)}}
@keyframes voxSpin{to{transform:rotate(360deg)}}
@keyframes voxRingFill{from{stroke-dashoffset:264}}
@keyframes voxDraw{from{stroke-dashoffset:360}}
@keyframes voxGrow{from{transform:scaleX(0)}}
@keyframes voxScreenIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes voxPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}`;

const bareButton: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  padding: 0,
  margin: 0,
  color: 'inherit',
  font: 'inherit',
  textAlign: 'inherit',
  cursor: 'pointer',
};

/* ------------------------------- atoms --------------------------------- */

function Defs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="pvxV" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3fd7f1" />
          <stop offset="0.5" stopColor="#7bb6da" />
          <stop offset="1" stopColor="#f0795f" />
        </linearGradient>
        <linearGradient id="pvxRing" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="1" stopColor="#8ff0c8" />
        </linearGradient>
        <linearGradient id="pvxRing2" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="0.55" stopColor="#9fe0e8" />
          <stop offset="1" stopColor="#f0795f" />
        </linearGradient>
        <linearGradient id="pvxChart" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="1" stopColor="#8ff0c8" />
        </linearGradient>
        <linearGradient id="pvxFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(63,208,236,0.32)" />
          <stop offset="1" stopColor="rgba(63,208,236,0)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function StatusBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 22px 4px',
        fontSize: '13px',
        color: '#e7edf2',
        fontWeight: 600,
        flex: '0 0 auto',
      }}
    >
      <span style={{ fontFamily: SORA }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '11px' }}>
          {[5, 7, 9, 11].map((h, i) => (
            <div
              key={i}
              style={{ width: '3px', height: `${h}px`, borderRadius: '1px', background: '#e7edf2' }}
            />
          ))}
        </div>
        <svg
          width={17}
          height={13}
          viewBox="0 0 24 18"
          fill="none"
          stroke="#e7edf2"
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <path d="M2 6 A15 15 0 0 1 22 6" />
          <path d="M5.5 9.5 A10 10 0 0 1 18.5 9.5" />
          <path d="M9 12.5 A5 5 0 0 1 15 12.5" />
          <circle cx={12} cy={15.5} r={1.2} fill="#e7edf2" stroke="none" />
        </svg>
        <svg width={26} height={13} viewBox="0 0 26 13">
          <rect
            x={0.5}
            y={0.5}
            width={22}
            height={12}
            rx={3}
            fill="none"
            stroke="#e7edf2"
            strokeOpacity={0.5}
          />
          <rect x={2.5} y={2.5} width={15} height={8} rx={1.5} fill="#e7edf2" />
          <rect x={24} y={4.5} width={2} height={4} rx={1} fill="#e7edf2" opacity={0.6} />
        </svg>
      </div>
    </div>
  );
}

function Equalizer({
  n,
  hfn,
  w = 3,
  gap = 3,
  maxH = 40,
  anim = true,
}: {
  n: number;
  hfn: (i: number, t: number) => number;
  w?: number;
  gap?: number;
  maxH?: number;
  anim?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${gap}px`, height: `${maxH}px` }}>
      {barHeights(n, hfn).map((h, i) => {
        const t = n === 1 ? 0 : i / (n - 1);
        const style: CSSProperties = {
          width: `${w}px`,
          height: `${h}px`,
          borderRadius: '4px',
          background: mix(t),
          flex: '0 0 auto',
        };
        if (anim) {
          style.transformOrigin = 'center';
          style.animation = `voxBar 1.05s ease-in-out ${(i % 9) * 0.09}s infinite alternate`;
        }
        return <div key={i} style={style} />;
      })}
    </div>
  );
}

/** Animated score gauge — fills from empty to `value` on every mount. */
function ScoreRing({
  value,
  size,
  gradId,
  children,
}: {
  value: number;
  size: number;
  gradId: string;
  children: ReactNode;
}) {
  const C = 263.89;
  const off = ((C * (100 - value)) / 100).toFixed(1);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={42} fill="none" stroke="#172029" strokeWidth={7} />
        <circle
          cx={50}
          cy={50}
          r={42}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={off}
          transform="rotate(-90 50 50)"
          style={{ animation: 'voxRingFill 1.2s ease-out' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function SplashMesh() {
  return (
    <svg
      width="100%"
      height={130}
      viewBox="0 0 218 118"
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <path
        d="M0 70 C 50 52, 88 84, 132 66 S 196 52, 218 74"
        fill="none"
        stroke="rgba(63,208,236,0.28)"
        strokeWidth={1}
      />
      <path
        d="M0 84 C 44 66, 80 98, 122 82 S 188 70, 218 90"
        fill="none"
        stroke="rgba(63,208,236,0.5)"
        strokeWidth={1.4}
      />
      <path
        d="M0 99 C 48 82, 84 112, 128 96 S 192 84, 218 104"
        fill="none"
        stroke="rgba(240,121,95,0.4)"
        strokeWidth={1.4}
      />
    </svg>
  );
}

function Orb() {
  return (
    <div style={{ position: 'relative', width: '200px', height: '200px' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 50% 50%, rgba(63,208,236,0.26), rgba(63,208,236,0) 62%)',
        }}
      />
      <svg
        width={200}
        height={200}
        viewBox="0 0 150 150"
        style={{
          position: 'relative',
          transformOrigin: 'center',
          animation: 'voxSpin 38s linear infinite',
        }}
      >
        <circle cx={75} cy={75} r={70} fill="none" stroke="rgba(63,208,236,0.10)" strokeWidth={1} />
        <circle cx={75} cy={75} r={50} fill="none" stroke="rgba(63,208,236,0.09)" strokeWidth={1} />
        {orbDots().map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={d.opacity} />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%,-50%)',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: CYAN,
          boxShadow: '0 0 22px rgba(63,208,236,0.85)',
        }}
      />
    </div>
  );
}

function PrimaryButton({
  label,
  tone = 'cyan',
  onClick,
}: {
  label: string;
  tone?: 'cyan' | 'coral';
  onClick: () => void;
}) {
  const bg =
    tone === 'cyan'
      ? 'linear-gradient(90deg,#28b4d6,#3fd0ec)'
      : 'linear-gradient(90deg,#ef6f54,#f59478)';
  const color = tone === 'cyan' ? '#06222b' : '#2a0d08';
  const shadow =
    tone === 'cyan' ? '0 10px 22px rgba(43,182,214,0.32)' : '0 12px 24px rgba(240,121,95,0.32)';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...bareButton,
        width: '100%',
        height: '52px',
        borderRadius: '15px',
        background: bg,
        color,
        fontFamily: SORA,
        fontWeight: 600,
        fontSize: '15.5px',
        boxShadow: shadow,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}

/* ------------------------------ screens -------------------------------- */

function SplashScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <button
      type="button"
      onClick={() => go('onboarding')}
      style={{
        ...bareButton,
        flex: 1,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '24px',
      }}
    >
      <svg
        width={150}
        height={144}
        viewBox="0 0 48 48"
        style={{ filter: 'drop-shadow(0 8px 26px rgba(63,208,236,0.3))' }}
      >
        <path d="M6 9 L24 41 L42 9 L34 9 L24 27 L14 9 Z" fill="url(#pvxV)" />
      </svg>
      <div style={{ marginTop: '16px' }}>
        <Equalizer
          n={26}
          hfn={(i, t) => 4 + 24 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.9)))}
          w={3}
          gap={3}
          maxH={28}
        />
      </div>
      <div style={{ marginTop: '26px', fontFamily: SORA, fontWeight: 700, fontSize: '42px' }}>
        <span style={{ color: '#f1f5f8' }}>Vox</span>
        <span style={{ color: CYAN }}>Score</span>
      </div>
      <div
        style={{
          marginTop: '12px',
          textAlign: 'center',
          fontSize: '14px',
          lineHeight: 1.55,
          color: '#7e8a98',
        }}
      >
        Know Your Voice.
        <br />
        Elevate Every Note.
      </div>
      <div style={{ marginTop: '22px', fontSize: '12px', letterSpacing: '1px', color: '#56707e' }}>
        tap to continue
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <SplashMesh />
      </div>
    </button>
  );
}

function OnboardingScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 24px 24px' }}>
      <button
        type="button"
        onClick={() => go('recording')}
        style={{ ...bareButton, alignSelf: 'flex-end', fontSize: '13px', color: '#7e8a98' }}
      >
        Skip
      </button>
      <div
        style={{
          marginTop: '6px',
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '26px',
          lineHeight: 1.25,
        }}
      >
        Uncover the True Potential of <span style={{ color: CYAN }}>Your Voice</span>
      </div>
      <div style={{ marginTop: '12px', fontSize: '14px', lineHeight: 1.55, color: '#8090a0' }}>
        Advanced AI listens. Real-time insights help you sing with confidence.
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Orb />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '7px', marginBottom: '20px' }}>
        <div style={{ width: '22px', height: '6px', borderRadius: '3px', background: CYAN }} />
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.18)',
          }}
        />
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.18)',
          }}
        />
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.18)',
          }}
        />
      </div>
      <PrimaryButton label="Let's Get Started" onClick={() => go('recording')} />
      <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '13px', color: '#7e8a98' }}>
        Already have an account?{' '}
        <button
          type="button"
          onClick={() => go('recording')}
          style={{ ...bareButton, color: CYAN, fontWeight: 600 }}
        >
          Log in
        </button>
      </div>
    </div>
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 24px 24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <span style={{ width: '20px' }} />
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '16px', color: '#eef2f6' }}>
          Recording
        </span>
        <button
          type="button"
          onClick={() => go('onboarding')}
          style={{ ...bareButton, fontSize: '18px', color: '#8090a0' }}
        >
          ✕
        </button>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: SORA,
            fontWeight: 700,
            fontSize: '52px',
            color: '#f1f5f8',
            letterSpacing: '1.5px',
          }}
        >
          {mm}:{ss}
        </div>
        <div style={{ fontSize: '13px', color: '#7e8a98', marginTop: '2px' }}>/ 01:00</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '26px 0 24px' }}>
        <div
          style={{
            position: 'relative',
            width: '128px',
            height: '128px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'radial-gradient(circle at 50% 38%, rgba(63,208,236,0.22), rgba(63,208,236,0.03))',
            animation: paused ? 'none' : 'voxGlow 2.6s ease-in-out infinite',
            opacity: paused ? 0.6 : 1,
          }}
        >
          <div
            style={{
              width: '86px',
              height: '86px',
              borderRadius: '50%',
              background: 'linear-gradient(160deg,#1b2632,#0d141b)',
              boxShadow: 'inset 0 0 0 1px rgba(63,208,236,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width={34}
              height={42}
              viewBox="0 0 24 30"
              fill="none"
              stroke={CYAN}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x={8} y={2} width={8} height={15} rx={4} fill={CYAN} stroke="none" />
              <path d="M4 13 a8 8 0 0 0 16 0" />
              <line x1={12} y1={21} x2={12} y2={26} />
              <line x1={8} y1={27} x2={16} y2={27} />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Equalizer
          n={48}
          hfn={(i, t) => 6 + 34 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.8)))}
          w={3}
          gap={3}
          maxH={48}
          anim={!paused}
        />
      </div>
      <div
        style={{
          textAlign: 'center',
          fontSize: '13px',
          color: paused ? '#f0a05f' : '#7e8a98',
          marginTop: '16px',
        }}
      >
        {paused ? 'Paused' : 'Keep singing…'}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '7px 15px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
            fontSize: '12px',
            color: '#cfd8e1',
          }}
        >
          <svg
            width={15}
            height={15}
            viewBox="0 0 22 22"
            fill="none"
            stroke={CYAN}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M4 15V10M9 15V5M14 15V12M19 15V7" />
          </svg>
          Studio Mode
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={onTogglePause}
          style={{
            ...bareButton,
            flex: '0 0 42%',
            height: '52px',
            borderRadius: '15px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#eef2f6',
            fontFamily: SORA,
            fontWeight: 600,
            fontSize: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <PrimaryButton label="Stop & Score" onClick={() => go('scoring')} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, seed }: { label: string; value: number; seed: number }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '14px',
        padding: '11px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '7px',
        }}
      >
        <span style={{ fontSize: '13px', color: '#cfd8e1', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '12px', color: '#8090a0' }}>
          <b style={{ color: '#f1f5f8', fontFamily: SORA, fontSize: '15px' }}>{value}</b> / 100
        </span>
      </div>
      <Equalizer
        n={26}
        hfn={(i, t) =>
          3 + 15 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin((i + seed) * 0.85)))
        }
        w={2.5}
        gap={2.5}
        maxH={20}
      />
    </div>
  );
}

function ScoringScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 22px 22px',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => go('recording')}
          style={{ ...bareButton, fontSize: '20px', color: '#8090a0' }}
        >
          ‹
        </button>
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '16px', color: '#eef2f6' }}>
          Live Score
        </span>
        <span style={{ fontSize: '16px', color: '#8090a0' }}>ⓘ</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 16px' }}>
        <ScoreRing value={82} size={176} gradId="pvxRing">
          <div
            style={{
              fontFamily: SORA,
              fontWeight: 700,
              fontSize: '58px',
              color: '#f1f5f8',
              lineHeight: 1,
            }}
          >
            82
          </div>
          <div
            style={{ fontSize: '14px', color: '#8ff0c8', marginTop: '4px', letterSpacing: '0.5px' }}
          >
            Good
          </div>
        </ScoreRing>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
        <MetricCard label="Pitch" value={85} seed={0} />
        <MetricCard label="Tone" value={78} seed={3} />
        <MetricCard label="Confidence" value={83} seed={6} />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '14px' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: CORAL,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: CORAL,
              animation: 'voxPulse 1.4s ease-in-out infinite',
            }}
          />
          Live
        </span>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Equalizer
            n={34}
            hfn={(i, t) =>
              3 + 13 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.1)))
            }
            w={2.5}
            gap={2.5}
            maxH={18}
          />
        </div>
      </div>
      <PrimaryButton label="Finish & View Results" onClick={() => go('results')} />
    </div>
  );
}

function BreakdownBar({ label, value, delay }: { label: string; value: number; delay: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
        <span style={{ color: '#cfd8e1' }}>{label}</span>
        <span style={{ color: '#8090a0' }}>
          <b style={{ color: '#f1f5f8' }}>{value}</b> / 100
        </span>
      </div>
      <div
        style={{
          height: '7px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.07)',
          marginTop: '6px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            borderRadius: '4px',
            background: 'linear-gradient(90deg,#3fd0ec,#8ff0c8)',
            transformOrigin: 'left',
            animation: `voxGrow 0.9s ease-out ${delay}s both`,
          }}
        />
      </div>
    </div>
  );
}

function ResultsScreen({ go }: { go: (s: Screen) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 22px 22px',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => go('scoring')}
          style={{ ...bareButton, fontSize: '20px', color: '#8090a0' }}
        >
          ‹
        </button>
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '16px', color: '#eef2f6' }}>
          Session Results
        </span>
        <svg
          width={17}
          height={17}
          viewBox="0 0 22 22"
          fill="none"
          stroke="#8090a0"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 14V3M7 6l4-3 4 3" />
          <path d="M5 11v7h12v-7" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 8px' }}>
        <ScoreRing value={86} size={158} gradId="pvxRing2">
          <div style={{ fontSize: '11px', color: '#7e8a98', letterSpacing: '1px' }}>OVERALL</div>
          <div
            style={{
              fontFamily: SORA,
              fontWeight: 700,
              fontSize: '52px',
              color: '#f1f5f8',
              lineHeight: 1,
            }}
          >
            86
          </div>
          <div style={{ fontSize: '12px', color: '#8ff0c8', marginTop: '2px' }}>
            Great Performance!
          </div>
        </ScoreRing>
      </div>
      <div
        style={{
          textAlign: 'center',
          color: '#f5b14a',
          fontSize: '16px',
          letterSpacing: '4px',
          marginBottom: '12px',
        }}
      >
        ★★★★★
      </div>
      <div
        style={{
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '12px',
          color: '#9aa6b3',
          letterSpacing: '1px',
          marginBottom: '10px',
        }}
      >
        BREAKDOWN
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
        <BreakdownBar label="Pitch" value={88} delay={0} />
        <BreakdownBar label="Tone" value={82} delay={0.12} />
        <BreakdownBar label="Confidence" value={87} delay={0.24} />
      </div>
      <div
        style={{
          marginTop: '14px',
          background: 'rgba(63,208,236,0.06)',
          border: '1px solid rgba(63,208,236,0.16)',
          borderRadius: '13px',
          padding: '11px 14px',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            fontFamily: SORA,
            fontWeight: 600,
            color: CYAN,
            marginBottom: '5px',
          }}
        >
          AI Feedback
        </div>
        <div style={{ fontSize: '12px', lineHeight: 1.5, color: '#9aa6b3' }}>
          Great control and expression. Work on pitch stability in higher notes and maintain breath
          support.
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ marginTop: '14px' }}>
        <PrimaryButton label="Save & Continue" tone="coral" onClick={() => go('progress')} />
      </div>
    </div>
  );
}

function ProgressScreen({ go }: { go: (s: Screen) => void }) {
  const tab = (active: boolean, label: string, icon: ReactNode, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...bareButton,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {icon}
      <span
        style={{
          fontSize: '10px',
          color: active ? CYAN : '#6b7886',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
    </button>
  );
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 22px 0',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ width: '18px' }} />
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '16px', color: '#eef2f6' }}>
          My Progress
        </span>
        <svg
          width={17}
          height={17}
          viewBox="0 0 22 22"
          fill="none"
          stroke="#8090a0"
          strokeWidth={2}
          strokeLinecap="round"
        >
          <rect x={3} y={4} width={16} height={15} rx={2.5} />
          <path d="M3 8h16M7 2v4M15 2v4" />
        </svg>
      </div>
      <div
        style={{
          marginTop: '14px',
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          padding: '14px 14px 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#cfd8e1', fontWeight: 600 }}>Overall Score</div>
            <div style={{ fontSize: '11px', color: '#7e8a98', marginTop: '2px' }}>This Month</div>
          </div>
          <div style={{ fontFamily: SORA, fontWeight: 700, fontSize: '26px', color: CYAN }}>86</div>
        </div>
        <svg
          width="100%"
          height={96}
          viewBox="0 0 300 96"
          preserveAspectRatio="none"
          style={{ marginTop: '8px' }}
        >
          <path
            d="M10 66 L66 56 L122 72 L178 46 L234 40 L290 16 L290 96 L10 96 Z"
            fill="url(#pvxFill)"
          />
          <path
            d="M10 66 L66 56 L122 72 L178 46 L234 40 L290 16"
            fill="none"
            stroke="url(#pvxChart)"
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={360}
            strokeDashoffset={0}
            style={{ animation: 'voxDraw 1.3s ease-out' }}
          />
          <circle cx={66} cy={56} r={3} fill={CYAN} />
          <circle cx={122} cy={72} r={3} fill={CYAN} />
          <circle cx={178} cy={46} r={3} fill={CYAN} />
          <circle cx={234} cy={40} r={3} fill={CYAN} />
          <circle cx={290} cy={16} r={5} fill="#0a0e14" stroke="#8ff0c8" strokeWidth={2.6} />
        </svg>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9.5px',
            color: '#6b7886',
            marginTop: '3px',
            padding: '0 2px',
          }}
        >
          <span>May 5</span>
          <span>May 12</span>
          <span>May 19</span>
          <span>May 26</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '15px',
        }}
      >
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '13px', color: '#eef2f6' }}>
          Performance History
        </span>
        <span style={{ fontSize: '12px', color: CYAN }}>See all</span>
      </div>
      <div style={{ marginTop: '7px' }}>
        {(
          [
            ['May 26, 2024', 86, 'Great', '#8ff0c8'],
            ['May 19, 2024', 79, 'Good', '#3fd0ec'],
            ['May 12, 2024', 72, 'Fair', '#f0a05f'],
            ['May 5, 2024', 65, 'Fair', '#f0a05f'],
          ] as [string, number, string, string][]
        ).map(([date, score, rating, color], i, arr) => (
          <div
            key={date}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : undefined,
            }}
          >
            <span style={{ fontSize: '12.5px', color: '#cfd8e1' }}>{date}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span
                style={{ fontFamily: SORA, fontWeight: 700, fontSize: '14px', color: '#f1f5f8' }}
              >
                {score}
              </span>
              <span style={{ fontSize: '11px', color, width: '34px', textAlign: 'right' }}>
                {rating}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '11px 4px 14px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {tab(
          false,
          'Home',
          <svg
            width={20}
            height={20}
            viewBox="0 0 22 22"
            fill="none"
            stroke="#6b7886"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 11l7-7 7 7" />
            <path d="M6 10v8h10v-8" />
          </svg>,
          () => go('splash'),
        )}
        {tab(
          false,
          'Sessions',
          <svg
            width={20}
            height={20}
            viewBox="0 0 22 22"
            fill="none"
            stroke="#6b7886"
            strokeWidth={1.8}
            strokeLinecap="round"
          >
            <circle cx={11} cy={11} r={7.5} />
            <path d="M11 7v4l3 2" />
          </svg>,
          () => go('recording'),
        )}
        {tab(
          true,
          'Progress',
          <svg
            width={20}
            height={20}
            viewBox="0 0 22 22"
            fill="none"
            stroke={CYAN}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M5 18V12M11 18V5M17 18V9" />
          </svg>,
          () => go('progress'),
        )}
        {tab(
          false,
          'Profile',
          <svg
            width={20}
            height={20}
            viewBox="0 0 22 22"
            fill="none"
            stroke="#6b7886"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx={11} cy={8} r={3.5} />
            <path d="M4.5 18a6.5 6.5 0 0 1 13 0" />
          </svg>,
          () => go('onboarding'),
        )}
      </div>
    </div>
  );
}

/* ------------------------------- shell --------------------------------- */

export function VoxScorePrototype() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);

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

  const idx = ORDER.indexOf(screen);
  const currentStep = STEPS[idx];
  const prevScreen: Screen = ORDER[idx - 1] ?? screen;
  const nextScreen: Screen = ORDER[idx + 1] ?? screen;

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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px' }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <Defs />

      {/* device */}
      <div
        style={{
          width: '336px',
          maxWidth: '100%',
          borderRadius: '46px',
          padding: '8px',
          background: 'linear-gradient(160deg,#2a323d,#0b0f15)',
          boxShadow: '0 34px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '710px',
            borderRadius: '38px',
            overflow: 'hidden',
            background: BG[screen],
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <StatusBar />
          <div
            key={screen}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              animation: 'voxScreenIn 0.42s ease',
            }}
          >
            {renderScreen()}
          </div>
        </div>
      </div>

      {/* step navigator */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '8px',
          maxWidth: '520px',
        }}
      >
        {STEPS.map((s) => {
          const active = s.key === screen;
          return (
            <button
              type="button"
              key={s.key}
              onClick={() => go(s.key)}
              aria-current={active ? 'step' : undefined}
              style={{
                ...bareButton,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 12px',
                borderRadius: '999px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: active ? '#06222b' : '#9aa6b3',
                background: active
                  ? 'linear-gradient(90deg,#28b4d6,#3fd0ec)'
                  : 'rgba(255,255,255,0.05)',
                border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ fontFamily: SORA, fontWeight: 800, opacity: active ? 0.7 : 0.55 }}>
                {s.n}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          type="button"
          onClick={() => go(prevScreen)}
          disabled={idx === 0}
          style={{
            ...bareButton,
            fontSize: '13px',
            color: idx === 0 ? '#3a4654' : '#cfd8e1',
            cursor: idx === 0 ? 'default' : 'pointer',
          }}
        >
          ‹ Prev
        </button>
        <span
          style={{ fontSize: '12px', color: '#6b7886', minWidth: '110px', textAlign: 'center' }}
        >
          {currentStep?.n} · {currentStep?.label}
        </span>
        <button
          type="button"
          onClick={() => go(nextScreen)}
          disabled={idx === ORDER.length - 1}
          style={{
            ...bareButton,
            fontSize: '13px',
            color: idx === ORDER.length - 1 ? '#3a4654' : '#cfd8e1',
            cursor: idx === ORDER.length - 1 ? 'default' : 'pointer',
          }}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
