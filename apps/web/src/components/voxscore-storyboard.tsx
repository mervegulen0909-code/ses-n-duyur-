// VoxScore — Visual Storyboard
//
// Pixel-perfect recreation of the "VoxScore Storyboard" board exported from
// Claude Design (claude.ai/design). One 1600px presentation board showing the
// app across six mobile screens, in the dark-graphite / electric-cyan / coral
// palette. Server-rendered and static: all motion is CSS keyframes, all
// data-viz is inline SVG. The seeded particle/ramp math lives in
// ./voxscore-storyboard-art (unit-tested). Type is Sora (display) + Manrope
// (body), wired in by the route via CSS variables.

import type { CSSProperties, ReactNode } from 'react';
import { CORAL, CYAN, barHeights, mix, orbDots } from './voxscore-storyboard-art';

const SORA = 'var(--font-sora), system-ui, sans-serif';
const MANROPE = 'var(--font-manrope), system-ui, sans-serif';

const KEYFRAMES = `
@keyframes voxBar{from{transform:scaleY(0.4)}to{transform:scaleY(1)}}
@keyframes voxGlow{0%,100%{box-shadow:0 0 0 1px rgba(63,208,236,0.35),0 0 28px rgba(63,208,236,0.26)}50%{box-shadow:0 0 0 1px rgba(63,208,236,0.55),0 0 48px rgba(63,208,236,0.5)}}
@keyframes voxSpin{to{transform:rotate(360deg)}}`;

/* ----------------------------- shared atoms ----------------------------- */

type BarsProps = {
  n: number;
  hfn: (i: number, t: number) => number;
  w?: number;
  gap?: number;
  maxH?: number;
  anim?: boolean;
  grad?: boolean;
  radius?: number;
};

/** A frequency/equalizer bar row, optionally animated and color-ramped. */
function Bars({
  n,
  hfn,
  w = 2.5,
  gap = 2.4,
  maxH = 42,
  anim = false,
  grad = true,
  radius = 4,
}: BarsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${gap}px`, height: `${maxH}px` }}>
      {barHeights(n, hfn).map((h, i) => {
        const t = n === 1 ? 0 : i / (n - 1);
        const style: CSSProperties = {
          width: `${w}px`,
          height: `${h}px`,
          borderRadius: `${radius}px`,
          background: grad ? mix(t) : CYAN,
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

/** The angular VoxScore "V" brand mark. */
function VMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ position: 'relative' }}>
      <path d="M6 9 L24 41 L42 9 L34 9 L24 27 L14 9 Z" fill="url(#vxV)" />
    </svg>
  );
}

/** iOS-style status bar glyphs: signal, wifi, battery. */
function StatusIcons() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5px', height: '9px' }}>
        {[4, 6, 8, 10].map((h, i) => (
          <div
            key={i}
            style={{ width: '2.5px', height: `${h}px`, borderRadius: '1px', background: '#e7edf2' }}
          />
        ))}
      </div>
      <svg
        width={14}
        height={11}
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
      <svg width={24} height={12} viewBox="0 0 26 13">
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
    </>
  );
}

function StatusBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 17px 4px',
        fontSize: '11px',
        color: '#e7edf2',
        fontWeight: 600,
      }}
    >
      <span style={{ fontFamily: SORA }}>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <StatusIcons />
      </div>
    </div>
  );
}

/** Numbered label + device frame wrapper shared by all six screens. */
function Phone({
  number,
  title,
  caption,
  screenBg,
  children,
}: {
  number: string;
  title: string;
  caption: ReactNode;
  screenBg: string;
  children: ReactNode;
}) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '218px' }}>
        <div style={{ height: '84px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '9px' }}>
            <span style={{ fontFamily: SORA, fontWeight: 800, fontSize: '27px', color: CORAL }}>
              {number}
            </span>
            <span
              style={{
                fontFamily: SORA,
                fontWeight: 600,
                fontSize: '14px',
                letterSpacing: '1.5px',
                color: '#d2dae2',
              }}
            >
              {title}
            </span>
          </div>
          <div style={{ marginTop: '9px', fontSize: '13px', lineHeight: 1.45, color: '#7f8b9a' }}>
            {caption}
          </div>
        </div>
        <div
          style={{
            height: '466px',
            borderRadius: '34px',
            padding: '6px',
            background: 'linear-gradient(160deg,#2a323d,#0b0f15)',
            boxShadow: '0 24px 50px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              borderRadius: '28px',
              overflow: 'hidden',
              background: screenBg,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <StatusBar />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <div
      style={{
        flex: '0 0 22px',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '298px',
        fontSize: '26px',
        color: CYAN,
        fontFamily: SORA,
      }}
    >
      ›
    </div>
  );
}

/* ------------------------------- header -------------------------------- */

function HeroPlaceholder() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(135deg, #141b24 0 10px, #111824 10px 20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <span
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '11px',
          letterSpacing: '0.5px',
          color: '#52606e',
          padding: '0 18px',
        }}
      >
        vocalist photo
      </span>
    </div>
  );
}

function Header() {
  const logoBars: [number, string][] = [
    [24, '#3fd0ec'],
    [40, '#5cd6ea'],
    [54, '#8fe0e6'],
    [30, '#f0795f'],
    [46, '#f0925f'],
    [22, '#3fd0ec'],
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '34px' }}>
      {/* logo lockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: '0 0 auto' }}>
        <div
          style={{
            position: 'relative',
            width: '88px',
            height: '88px',
            borderRadius: '23px',
            background: 'linear-gradient(158deg,#1c2531,#0b1016)',
            boxShadow:
              'inset 0 0 0 1px rgba(255,255,255,0.09), 0 14px 34px rgba(0,0,0,0.55), 0 0 24px rgba(63,208,236,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              opacity: 0.45,
            }}
          >
            {logoBars.map(([h, c], i) => (
              <div
                key={i}
                style={{ width: '3px', height: `${h}px`, borderRadius: '2px', background: c }}
              />
            ))}
          </div>
          <VMark size={56} />
        </div>
        <div>
          <div
            style={{
              fontFamily: SORA,
              fontWeight: 700,
              fontSize: '48px',
              letterSpacing: '-1px',
              lineHeight: 1,
            }}
          >
            <span style={{ color: '#f1f5f8' }}>Vox</span>
            <span style={{ color: CYAN }}>Score</span>
          </div>
          <div
            style={{ marginTop: '9px', fontSize: '16px', color: '#7e8a98', letterSpacing: '0.2px' }}
          >
            Know Your Voice. Elevate Every Note.
          </div>
        </div>
      </div>

      <div
        style={{
          width: '1px',
          height: '84px',
          background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.18), transparent)',
          flex: '0 0 auto',
        }}
      />

      {/* tagline */}
      <div style={{ flex: '1 1 auto', maxWidth: '480px' }}>
        <div
          style={{
            fontFamily: SORA,
            fontWeight: 700,
            fontSize: '16px',
            letterSpacing: '2.5px',
            color: CYAN,
          }}
        >
          AI-POWERED VOICE &amp; VOCAL SCORING
        </div>
        <div style={{ marginTop: '13px', fontSize: '16.5px', lineHeight: 1.55, color: '#9aa6b3' }}>
          VoxScore analyzes your voice in real-time and helps you train smarter, sing better, and
          track your progress like a pro.
        </div>
      </div>

      {/* hero photo slot */}
      <div
        style={{
          flex: '0 0 440px',
          position: 'relative',
          height: '154px',
          borderRadius: '18px',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        <HeroPlaceholder />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg,#0a0e14 4%, rgba(10,14,20,0.35) 38%, rgba(10,14,20,0) 60%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '18px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <Bars
            n={28}
            hfn={(i, t) =>
              6 + 44 * Math.sin(t * Math.PI) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.7)))
            }
            w={3}
            gap={3}
            maxH={56}
          />
        </div>
      </div>
    </div>
  );
}

/* --------------------------- screen bodies ----------------------------- */

function SplashMesh() {
  return (
    <svg
      width="100%"
      height={118}
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

function SplashBody() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        padding: '18px',
      }}
    >
      <svg
        width={104}
        height={100}
        viewBox="0 0 48 48"
        style={{ filter: 'drop-shadow(0 8px 26px rgba(63,208,236,0.3))' }}
      >
        <path d="M6 9 L24 41 L42 9 L34 9 L24 27 L14 9 Z" fill="url(#vxV)" />
      </svg>
      <div style={{ marginTop: '10px' }}>
        <Bars
          n={22}
          hfn={(i, t) => 3 + 16 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.9)))}
          w={2.5}
          gap={2.5}
          maxH={20}
        />
      </div>
      <div style={{ marginTop: '20px', fontFamily: SORA, fontWeight: 700, fontSize: '30px' }}>
        <span style={{ color: '#f1f5f8' }}>Vox</span>
        <span style={{ color: CYAN }}>Score</span>
      </div>
      <div
        style={{
          marginTop: '9px',
          textAlign: 'center',
          fontSize: '11.5px',
          lineHeight: 1.55,
          color: '#7e8a98',
        }}
      >
        Know Your Voice.
        <br />
        Elevate Every Note.
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <SplashMesh />
      </div>
    </div>
  );
}

function AiOrb() {
  return (
    <div style={{ position: 'relative', width: '162px', height: '162px' }}>
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
        width={162}
        height={162}
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
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: CYAN,
          boxShadow: '0 0 20px rgba(63,208,236,0.85)',
        }}
      />
    </div>
  );
}

function OnboardingBody() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 18px 16px' }}>
      <div style={{ alignSelf: 'flex-end', fontSize: '11.5px', color: '#7e8a98' }}>Skip</div>
      <div
        style={{
          marginTop: '4px',
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '20px',
          lineHeight: 1.28,
        }}
      >
        Uncover the True Potential of <span style={{ color: CYAN }}>Your Voice</span>
      </div>
      <div style={{ marginTop: '9px', fontSize: '11.5px', lineHeight: 1.55, color: '#8090a0' }}>
        Advanced AI listens. Real-time insights help you sing with confidence.
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <AiOrb />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '16px' }}>
        <div style={{ width: '18px', height: '5px', borderRadius: '3px', background: CYAN }} />
        <div
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.18)',
          }}
        />
        <div
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.18)',
          }}
        />
        <div
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '3px',
            background: 'rgba(255,255,255,0.18)',
          }}
        />
      </div>
      <div
        style={{
          height: '44px',
          borderRadius: '13px',
          background: 'linear-gradient(90deg,#28b4d6,#3fd0ec)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '13.5px',
          color: '#06222b',
          boxShadow: '0 10px 22px rgba(43,182,214,0.32)',
        }}
      >
        Let&apos;s Get Started
      </div>
      <div style={{ textAlign: 'center', marginTop: '13px', fontSize: '11.5px', color: '#7e8a98' }}>
        Already have an account? <span style={{ color: CYAN, fontWeight: 600 }}>Log in</span>
      </div>
    </div>
  );
}

function RecordingBody() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 18px 16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <span style={{ width: '16px' }} />
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '14px', color: '#eef2f6' }}>
          Recording
        </span>
        <span style={{ fontSize: '15px', color: '#8090a0' }}>✕</span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontFamily: SORA,
            fontWeight: 700,
            fontSize: '40px',
            color: '#f1f5f8',
            letterSpacing: '1.5px',
          }}
        >
          00:18
        </div>
        <div style={{ fontSize: '11px', color: '#7e8a98', marginTop: '1px' }}>/ 01:00</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0 20px' }}>
        <div
          style={{
            position: 'relative',
            width: '98px',
            height: '98px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'radial-gradient(circle at 50% 38%, rgba(63,208,236,0.22), rgba(63,208,236,0.03))',
            animation: 'voxGlow 2.6s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: '66px',
              height: '66px',
              borderRadius: '50%',
              background: 'linear-gradient(160deg,#1b2632,#0d141b)',
              boxShadow: 'inset 0 0 0 1px rgba(63,208,236,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width={26}
              height={32}
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
        <Bars
          n={44}
          hfn={(i, t) => 6 + 30 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.8)))}
          w={2.5}
          gap={2.4}
          maxH={42}
          anim
        />
      </div>
      <div style={{ textAlign: 'center', fontSize: '11px', color: '#7e8a98', marginTop: '14px' }}>
        Keep singing…
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '11px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 13px',
            borderRadius: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
            fontSize: '11px',
            color: '#cfd8e1',
          }}
        >
          <svg
            width={13}
            height={13}
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
      <div
        style={{
          height: '46px',
          borderRadius: '15px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '9px',
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '13.5px',
          color: '#eef2f6',
        }}
      >
        <span style={{ display: 'flex', gap: '3px' }}>
          <span
            style={{ width: '3px', height: '13px', background: '#eef2f6', borderRadius: '1px' }}
          />
          <span
            style={{ width: '3px', height: '13px', background: '#eef2f6', borderRadius: '1px' }}
          />
        </span>
        Pause
      </div>
    </div>
  );
}

/** One pitch/tone/confidence metric card with its mini waveform. */
function MetricCard({ label, value, d }: { label: string; value: number; d: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '13px',
        padding: '9px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: '#cfd8e1', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '11px', color: '#8090a0' }}>
          <b style={{ color: '#f1f5f8', fontFamily: SORA, fontSize: '14px' }}>{value}</b> / 100
        </span>
      </div>
      <svg
        width="100%"
        height={22}
        viewBox="0 0 150 22"
        preserveAspectRatio="none"
        style={{ marginTop: '6px' }}
      >
        <path d={d} fill="none" stroke="url(#vxWave)" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </div>
  );
}

function LiveScoringBody() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '18px', color: '#8090a0' }}>‹</span>
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '14px', color: '#eef2f6' }}>
          Live Score
        </span>
        <span style={{ fontSize: '15px', color: '#8090a0' }}>ⓘ</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 14px' }}>
        <div style={{ position: 'relative', width: '138px', height: '138px' }}>
          <svg width={138} height={138} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={42} fill="none" stroke="#172029" strokeWidth={7} />
            <circle
              cx={50}
              cy={50}
              r={42}
              fill="none"
              stroke="url(#vxRing)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray="263.9"
              strokeDashoffset="47.5"
              transform="rotate(-90 50 50)"
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
            <div
              style={{
                fontFamily: SORA,
                fontWeight: 700,
                fontSize: '46px',
                color: '#f1f5f8',
                lineHeight: 1,
              }}
            >
              82
            </div>
            <div
              style={{
                fontSize: '12px',
                color: '#8ff0c8',
                marginTop: '3px',
                letterSpacing: '0.5px',
              }}
            >
              Good
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <MetricCard
          label="Pitch"
          value={85}
          d="M2 14 C 20 4, 36 18, 54 11 S 96 5, 116 13 S 140 9, 148 12"
        />
        <MetricCard
          label="Tone"
          value={78}
          d="M2 11 C 18 16, 34 6, 52 13 S 92 18, 112 9 S 138 14, 148 10"
        />
        <MetricCard
          label="Confidence"
          value={83}
          d="M2 13 C 22 9, 38 15, 58 10 S 98 6, 118 12 S 140 8, 148 11"
        />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: CORAL,
            fontWeight: 600,
          }}
        >
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: CORAL }} />
          Live
        </span>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Bars
            n={30}
            hfn={(i, t) =>
              3 + 12 * Math.sin(t * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.1)))
            }
            w={2}
            gap={2}
            maxH={16}
            anim
          />
        </div>
      </div>
    </div>
  );
}

/** One labeled breakdown bar on the results screen. */
function BreakdownBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
        <span style={{ color: '#cfd8e1' }}>{label}</span>
        <span style={{ color: '#8090a0' }}>
          <b style={{ color: '#f1f5f8' }}>{value}</b> / 100
        </span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.07)',
          marginTop: '5px',
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            borderRadius: '4px',
            background: 'linear-gradient(90deg,#3fd0ec,#8ff0c8)',
          }}
        />
      </div>
    </div>
  );
}

function ResultsBody() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '18px', color: '#8090a0' }}>‹</span>
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '14px', color: '#eef2f6' }}>
          Session Results
        </span>
        <svg
          width={15}
          height={15}
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
      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 6px' }}>
        <div style={{ position: 'relative', width: '124px', height: '124px' }}>
          <svg width={124} height={124} viewBox="0 0 100 100">
            <circle cx={50} cy={50} r={42} fill="none" stroke="#172029" strokeWidth={7} />
            <circle
              cx={50}
              cy={50}
              r={42}
              fill="none"
              stroke="url(#vxRing2)"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray="263.9"
              strokeDashoffset="36.9"
              transform="rotate(-90 50 50)"
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
            <div style={{ fontSize: '9px', color: '#7e8a98', letterSpacing: '1px' }}>OVERALL</div>
            <div
              style={{
                fontFamily: SORA,
                fontWeight: 700,
                fontSize: '42px',
                color: '#f1f5f8',
                lineHeight: 1,
              }}
            >
              86
            </div>
            <div style={{ fontSize: '10px', color: '#8ff0c8', marginTop: '2px' }}>
              Great Performance!
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          textAlign: 'center',
          color: '#f5b14a',
          fontSize: '13px',
          letterSpacing: '3px',
          marginBottom: '10px',
        }}
      >
        ★★★★★
      </div>
      <div
        style={{
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '11px',
          color: '#9aa6b3',
          letterSpacing: '1px',
          marginBottom: '8px',
        }}
      >
        BREAKDOWN
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <BreakdownBar label="Pitch" value={88} />
        <BreakdownBar label="Tone" value={82} />
        <BreakdownBar label="Confidence" value={87} />
      </div>
      <div
        style={{
          marginTop: '11px',
          background: 'rgba(63,208,236,0.06)',
          border: '1px solid rgba(63,208,236,0.16)',
          borderRadius: '12px',
          padding: '9px 12px',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontFamily: SORA,
            fontWeight: 600,
            color: CYAN,
            marginBottom: '4px',
          }}
        >
          AI Feedback
        </div>
        <div style={{ fontSize: '10.5px', lineHeight: 1.5, color: '#9aa6b3' }}>
          Great control and expression. Work on pitch stability in higher notes and maintain breath
          support.
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          height: '46px',
          marginTop: '11px',
          borderRadius: '15px',
          background: 'linear-gradient(90deg,#ef6f54,#f59478)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: SORA,
          fontWeight: 600,
          fontSize: '13.5px',
          color: '#2a0d08',
          boxShadow: '0 12px 24px rgba(240,121,95,0.32)',
        }}
      >
        Save &amp; Continue
      </div>
    </div>
  );
}

/** One row of the performance-history list. */
function HistoryRow({
  date,
  score,
  rating,
  ratingColor,
  divider = false,
}: {
  date: string;
  score: number;
  rating: string;
  ratingColor: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: divider ? '1px solid rgba(255,255,255,0.05)' : undefined,
      }}
    >
      <span style={{ fontSize: '11px', color: '#cfd8e1' }}>{date}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontFamily: SORA, fontWeight: 700, fontSize: '13px', color: '#f1f5f8' }}>
          {score}
        </span>
        <span style={{ fontSize: '10px', color: ratingColor, width: '32px', textAlign: 'right' }}>
          {rating}
        </span>
      </div>
    </div>
  );
}

function TabBar() {
  const item = (active: boolean, label: string, icon: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
      {icon}
      <span
        style={{
          fontSize: '8.5px',
          color: active ? CYAN : '#6b7886',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
      </span>
    </div>
  );
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '9px 4px 11px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {item(
        false,
        'Home',
        <svg
          width={18}
          height={18}
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
      )}
      {item(
        false,
        'Sessions',
        <svg
          width={18}
          height={18}
          viewBox="0 0 22 22"
          fill="none"
          stroke="#6b7886"
          strokeWidth={1.8}
          strokeLinecap="round"
        >
          <circle cx={11} cy={11} r={7.5} />
          <path d="M11 7v4l3 2" />
        </svg>,
      )}
      {item(
        true,
        'Progress',
        <svg
          width={18}
          height={18}
          viewBox="0 0 22 22"
          fill="none"
          stroke={CYAN}
          strokeWidth={2}
          strokeLinecap="round"
        >
          <path d="M5 18V12M11 18V5M17 18V9" />
        </svg>,
      )}
      {item(
        false,
        'Profile',
        <svg
          width={18}
          height={18}
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
      )}
    </div>
  );
}

function ProgressBody() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ width: '16px' }} />
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '14px', color: '#eef2f6' }}>
          My Progress
        </span>
        <svg
          width={15}
          height={15}
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
          marginTop: '12px',
          background: 'rgba(255,255,255,0.035)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '14px',
          padding: '11px 12px 8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#cfd8e1', fontWeight: 600 }}>Overall Score</div>
            <div style={{ fontSize: '10px', color: '#7e8a98', marginTop: '1px' }}>This Month</div>
          </div>
          <div style={{ fontFamily: SORA, fontWeight: 700, fontSize: '22px', color: CYAN }}>86</div>
        </div>
        <svg
          width="100%"
          height={74}
          viewBox="0 0 180 74"
          preserveAspectRatio="none"
          style={{ marginTop: '6px' }}
        >
          <path
            d="M6 52 L40 44 L74 56 L108 38 L142 34 L174 14 L174 74 L6 74 Z"
            fill="url(#vxFill)"
          />
          <path
            d="M6 52 L40 44 L74 56 L108 38 L142 34 L174 14"
            fill="none"
            stroke="url(#vxChart)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={40} cy={44} r={2.6} fill={CYAN} />
          <circle cx={74} cy={56} r={2.6} fill={CYAN} />
          <circle cx={108} cy={38} r={2.6} fill={CYAN} />
          <circle cx={142} cy={34} r={2.6} fill={CYAN} />
          <circle cx={174} cy={14} r={4.5} fill="#0a0e14" stroke="#8ff0c8" strokeWidth={2.4} />
        </svg>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '8.5px',
            color: '#6b7886',
            marginTop: '2px',
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
          marginTop: '13px',
        }}
      >
        <span style={{ fontFamily: SORA, fontWeight: 600, fontSize: '12px', color: '#eef2f6' }}>
          Performance History
        </span>
        <span style={{ fontSize: '10.5px', color: CYAN }}>See all</span>
      </div>
      <div style={{ marginTop: '6px' }}>
        <HistoryRow date="May 26, 2024" score={86} rating="Great" ratingColor="#8ff0c8" divider />
        <HistoryRow date="May 19, 2024" score={79} rating="Good" ratingColor="#3fd0ec" divider />
        <HistoryRow date="May 12, 2024" score={72} rating="Fair" ratingColor="#f0a05f" divider />
        <HistoryRow date="May 5, 2024" score={65} rating="Fair" ratingColor="#f0a05f" />
      </div>
      <div style={{ flex: 1 }} />
      <TabBar />
    </div>
  );
}

/* ------------------------------- footer -------------------------------- */

function Pillar({
  tone,
  title,
  desc,
  icon,
}: {
  tone: 'cyan' | 'coral';
  title: string;
  desc: string;
  icon: ReactNode;
}) {
  const accent = tone === 'cyan' ? CYAN : CORAL;
  const bg = tone === 'cyan' ? 'rgba(63,208,236,0.08)' : 'rgba(240,121,95,0.08)';
  const border = tone === 'cyan' ? 'rgba(63,208,236,0.22)' : 'rgba(240,121,95,0.22)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 0' }}>
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: bg,
          border: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
        }}
      >
        {icon}
      </div>
      <div>
        <div
          style={{
            fontFamily: SORA,
            fontWeight: 600,
            fontSize: '13px',
            letterSpacing: '1px',
            color: accent,
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: '4px', fontSize: '12.5px', lineHeight: 1.45, color: '#8a96a4' }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div
      style={{
        marginTop: '34px',
        paddingTop: '26px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '26px',
      }}
    >
      <Pillar
        tone="cyan"
        title="PRECISION ANALYTICS"
        desc="Accurate pitch, tone & performance insights powered by AI."
        icon={
          <svg
            width={22}
            height={22}
            viewBox="0 0 22 22"
            fill="none"
            stroke={CYAN}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M4 15V10M9 15V4M14 15V12M19 15V7" />
          </svg>
        }
      />
      <Pillar
        tone="coral"
        title="REAL-TIME FEEDBACK"
        desc="Instant scoring and dynamic voice visualization."
        icon={
          <svg width={22} height={22} viewBox="0 0 22 22" fill="none">
            <circle cx={11} cy={11} r={7.5} stroke={CORAL} strokeWidth={2} />
            <circle cx={11} cy={11} r={3} fill={CORAL} />
          </svg>
        }
      />
      <Pillar
        tone="cyan"
        title="TRACK YOUR GROWTH"
        desc="Detailed history and progress tracking to keep you motivated."
        icon={
          <svg
            width={22}
            height={22}
            viewBox="0 0 22 22"
            fill="none"
            stroke={CYAN}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 15l5-5 4 3 6-7" />
            <path d="M14 6h5v5" />
          </svg>
        }
      />
      <Pillar
        tone="coral"
        title="PERFORM YOUR BEST"
        desc="Actionable tips and smart insights to elevate every performance."
        icon={
          <svg
            width={22}
            height={22}
            viewBox="0 0 22 22"
            fill="none"
            stroke={CORAL}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 4h10v3a5 5 0 0 1-10 0V4z" />
            <path d="M6 5H3v1a3 3 0 0 0 3 3M16 5h3v1a3 3 0 0 1-3 3M9 13v3M13 13v3M8 18h6" />
          </svg>
        }
      />
      <div
        style={{
          flex: '0 0 auto',
          fontFamily: SORA,
          fontWeight: 700,
          fontSize: '19px',
          color: CYAN,
          letterSpacing: '0.3px',
          paddingLeft: '6px',
        }}
      >
        #ElevateEveryNote
      </div>
    </div>
  );
}

/* ----------------------------- svg gradients --------------------------- */

function Defs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="vxWave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="1" stopColor="#f0795f" />
        </linearGradient>
        <linearGradient id="vxRing" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="1" stopColor="#8ff0c8" />
        </linearGradient>
        <linearGradient id="vxRing2" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="0.55" stopColor="#9fe0e8" />
          <stop offset="1" stopColor="#f0795f" />
        </linearGradient>
        <linearGradient id="vxChart" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3fd0ec" />
          <stop offset="1" stopColor="#8ff0c8" />
        </linearGradient>
        <linearGradient id="vxFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(63,208,236,0.32)" />
          <stop offset="1" stopColor="rgba(63,208,236,0)" />
        </linearGradient>
        <linearGradient id="vxV" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#3fd7f1" />
          <stop offset="0.5" stopColor="#7bb6da" />
          <stop offset="1" stopColor="#f0795f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* -------------------------------- board -------------------------------- */

export function VoxScoreStoryboard() {
  return (
    <div
      style={{
        width: '1600px',
        fontFamily: MANROPE,
        color: '#e7edf2',
        padding: '46px 50px 40px',
        background:
          'radial-gradient(1200px 520px at 80% -8%, rgba(63,208,236,0.12), transparent 58%), radial-gradient(1000px 540px at 6% 112%, rgba(240,121,95,0.09), transparent 55%), linear-gradient(180deg,#0a0e14,#070a0f)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <Defs />

      <Header />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: '36px' }}>
        <Phone
          number="01"
          title="SPLASH SCREEN"
          caption={
            <>
              Premium start.
              <br />
              Bold identity.
            </>
          }
          screenBg="radial-gradient(120% 80% at 50% 18%, #11202b, #080b11 70%)"
        >
          <SplashBody />
        </Phone>
        <Chevron />
        <Phone
          number="02"
          title="ONBOARDING"
          caption={
            <>
              Discover the power
              <br />
              of vocal analysis.
            </>
          }
          screenBg="radial-gradient(120% 70% at 50% 42%, #101d27, #080b11 72%)"
        >
          <OnboardingBody />
        </Phone>
        <Chevron />
        <Phone
          number="03"
          title="RECORDING"
          caption={
            <>
              Record with clarity.
              <br />
              We capture every detail.
            </>
          }
          screenBg="radial-gradient(110% 60% at 50% 36%, #0f1b25, #080b11 70%)"
        >
          <RecordingBody />
        </Phone>
        <Chevron />
        <Phone
          number="04"
          title="LIVE SCORING"
          caption={
            <>
              Real-time feedback.
              <br />
              See your voice in action.
            </>
          }
          screenBg="radial-gradient(110% 55% at 50% 22%, #0f1b25, #080b11 68%)"
        >
          <LiveScoringBody />
        </Phone>
        <Chevron />
        <Phone
          number="05"
          title="RESULTS"
          caption={
            <>
              Your performance.
              <br />
              Our insights.
            </>
          }
          screenBg="radial-gradient(110% 55% at 50% 20%, #101c26, #080b11 68%)"
        >
          <ResultsBody />
        </Phone>
        <Chevron />
        <Phone
          number="06"
          title="PROGRESS"
          caption={
            <>
              Track. Improve.
              <br />
              Be unstoppable.
            </>
          }
          screenBg="radial-gradient(110% 55% at 50% 18%, #0f1b25, #080b11 70%)"
        >
          <ProgressBody />
        </Phone>
      </div>

      <Footer />
    </div>
  );
}
