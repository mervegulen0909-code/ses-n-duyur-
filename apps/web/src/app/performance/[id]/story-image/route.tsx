import { ImageResponse } from 'next/og';
import { buildShareCardData } from '@/lib/share-card';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Story-format (9:16) score card — the downloadable/shareable counterpart of
 * the landscape opengraph-image. Next's `opengraph-image` file convention
 * allows exactly one canonical OG image per segment, so the portrait variant
 * lives in this explicit route handler instead.
 */
const SIZE = { width: 1080, height: 1920 };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  let perf: { oembed_meta: unknown } | null = null;
  let score: { current_score: number | null; is_provisional: boolean } | null = null;
  if (supabase) {
    ({ data: perf } = await supabase
      .from('performances')
      .select('oembed_meta')
      .eq('id', id)
      .maybeSingle());
    ({ data: score } = await supabase
      .from('scores')
      .select('current_score, is_provisional')
      .eq('performance_id', id)
      .maybeSingle());
  }
  const card = buildShareCardData(perf, score);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
        background: '#0A0A0A',
        color: '#FAFAFA',
        fontFamily: 'sans-serif',
        padding: 96,
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>
        <span>Vox</span>
        <span style={{ color: '#34D399' }}>Score</span>
      </div>
      <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, maxWidth: 880 }}>
        {card.title}
      </div>
      {card.authorName && <div style={{ fontSize: 44, color: '#A3A3A3' }}>{card.authorName}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span style={{ fontSize: 280, fontWeight: 800, color: '#34D399' }}>{card.scoreLabel}</span>
      </div>
      {card.isProvisional && (
        <div
          style={{
            display: 'flex',
            borderRadius: 999,
            border: '3px solid rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.1)',
            color: '#FCD34D',
            padding: '14px 36px',
            fontSize: 36,
            fontWeight: 600,
          }}
        >
          Provisional AI Estimate
        </div>
      )}
      <div style={{ fontSize: 36, color: '#737373', marginTop: 24 }}>
        Who sings it best? — voxscore.app
      </div>
    </div>,
    { ...SIZE },
  );
}
