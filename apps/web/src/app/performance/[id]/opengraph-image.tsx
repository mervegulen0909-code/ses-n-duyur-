import { ImageResponse } from 'next/og';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const alt = 'VoxScore performance score';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface OEmbedish {
  title?: string;
  authorName?: string;
}

export default async function PerformanceOpengraphImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  let title = 'VoxScore performance';
  let authorName: string | null = null;
  let scoreLabel = '—';
  let isProvisional = true;

  if (supabase) {
    const { data: perf } = await supabase
      .from('performances')
      .select('oembed_meta')
      .eq('id', id)
      .maybeSingle();
    const meta = (perf?.oembed_meta ?? {}) as OEmbedish;
    title = meta.title ?? title;
    authorName = meta.authorName ?? null;

    const { data: score } = await supabase
      .from('scores')
      .select('current_score, is_provisional')
      .eq('performance_id', id)
      .eq('score_status', 'ai_verified')
      .maybeSingle();
    if (score?.current_score !== null && score?.current_score !== undefined) {
      scoreLabel = score.current_score.toFixed(1);
    }
    isProvisional = score?.is_provisional ?? true;
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: '#0A0A0A',
        color: '#FAFAFA',
        fontFamily: 'sans-serif',
        padding: 80,
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
        <span>Vox</span>
        <span style={{ color: '#34D399' }}>Score</span>
      </div>
      <div style={{ display: 'flex', fontSize: 52, fontWeight: 700, maxWidth: 960 }}>{title}</div>
      {authorName && <div style={{ fontSize: 32, color: '#A3A3A3' }}>{authorName}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: 140, fontWeight: 800, color: '#34D399' }}>{scoreLabel}</span>
      </div>
      {isProvisional && (
        <div
          style={{
            display: 'flex',
            borderRadius: 999,
            border: '2px solid rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.1)',
            color: '#FCD34D',
            padding: '10px 24px',
            fontSize: 28,
            fontWeight: 600,
          }}
        >
          Provisional AI Estimate
        </div>
      )}
    </div>,
    { ...size },
  );
}
