'use client';

/**
 * Privacy-enhanced YouTube embed (youtube-nocookie). We embed only — never
 * download or proxy media. Faz F replaces this with the IFrame Player API to
 * drive Verified Listen (watch-progress tracking).
 */
export function YouTubeEmbed({ videoId, title }: { videoId: string; title?: string }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-neutral-800 bg-black">
      <iframe
        className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}`}
        title={title ?? 'Performance'}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
