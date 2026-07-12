import { ImageResponse } from 'next/og';

// Apple touch icon (iOS "Add to Home Screen"). Rendered to PNG because Safari
// does not use SVG touch icons. Mirrors the VoxScore soundwave mark on dark.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const BARS = [32, 80, 124, 68, 32];

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: '#0A0A0A',
      }}
    >
      {BARS.map((h, i) => (
        <div key={i} style={{ width: 13, height: h, borderRadius: 7, background: '#34D399' }} />
      ))}
    </div>,
    { ...size },
  );
}
