import { ImageResponse } from 'next/og';

// Branded social-share card (WhatsApp / Slack / X link previews). Rendered to
// PNG at request time so it always matches the VoxScore brand — dark + emerald.
export const alt = 'VoxScore — Global AI Vocal Performance League';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BARS = [70, 150, 240, 320, 240, 150, 70];

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        background: '#0A0A0A',
        color: '#FAFAFA',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 320 }}>
        {BARS.map((h, i) => (
          <div key={i} style={{ width: 28, height: h, borderRadius: 14, background: '#34D399' }} />
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>
        <span>Vox</span>
        <span style={{ color: '#34D399' }}>Score</span>
      </div>
      <div style={{ fontSize: 36, color: '#A3A3A3' }}>Global AI Vocal Performance League</div>
    </div>,
    { ...size },
  );
}
