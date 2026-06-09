/**
 * Keyless YouTube helpers. We ONLY parse public URLs and read oEmbed metadata
 * (no API key, no quota). We NEVER download or store media — embed only.
 */

/** A validated 11-char YouTube video id. */
export type YouTubeVideoId = string;

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract the 11-character video id from any common YouTube URL shape:
 * `watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, with or without extra params.
 * Returns `null` when the input is not a recognizable YouTube video URL.
 */
export function parseYouTubeId(input: string): YouTubeVideoId | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    // watch?v=<id>
    const v = url.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;

    // /embed/<id> or /shorts/<id> or /v/<id>
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 2 && ['embed', 'shorts', 'v'].includes(segments[0]!)) {
      const id = segments[1]!;
      return VIDEO_ID_RE.test(id) ? id : null;
    }
  }

  return null;
}

/** Canonical watch URL for a video id (used for oEmbed + display). */
export function watchUrl(videoId: YouTubeVideoId): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Normalized oEmbed metadata we persist (never the media itself). */
export interface OEmbedMetadata {
  readonly title: string;
  readonly authorName: string;
  readonly authorUrl: string;
  readonly thumbnailUrl: string;
  readonly providerName: string;
}

interface RawOEmbed {
  title?: unknown;
  author_name?: unknown;
  author_url?: unknown;
  thumbnail_url?: unknown;
  provider_name?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Fetch public oEmbed metadata for a video. `fetchImpl` is injectable so this
 * is unit-testable without network access (defaults to global `fetch`).
 */
export async function fetchOEmbed(
  videoId: YouTubeVideoId,
  fetchImpl: typeof fetch = fetch,
): Promise<OEmbedMetadata> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    watchUrl(videoId),
  )}&format=json`;

  const res = await fetchImpl(endpoint);
  if (!res.ok) {
    throw new Error(`oEmbed request failed: ${res.status}`);
  }
  const raw = (await res.json()) as RawOEmbed;

  return {
    title: asString(raw.title),
    authorName: asString(raw.author_name),
    authorUrl: asString(raw.author_url),
    thumbnailUrl: asString(raw.thumbnail_url),
    providerName: asString(raw.provider_name) || 'YouTube',
  };
}
