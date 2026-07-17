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

/**
 * Best-effort public caption text for a video (YouTube timedtext endpoint —
 * plain TEXT metadata, never audio/video; legitimately empty for many
 * videos). Used only to enrich the provisional LLM estimate.
 */
export async function fetchCaptionText(videoId: string, lang = 'en'): Promise<string | null> {
  try {
    const res = await fetch(
      `https://video.google.com/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(videoId)}`,
    );
    if (!res.ok) return null;
    const xml = await res.text();
    if (!xml.includes('<text')) return null;
    const text = xml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.slice(0, 1500) : null;
  } catch {
    return null;
  }
}

/** ISO-8601 duration (PT#H#M#S) → whole seconds; null when unparseable. */
export function parseIsoDurationSeconds(iso: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

/**
 * Video duration in seconds via the YouTube Data API videos.list
 * `contentDetails` part — public METADATA only, never media (Hard Rule 1).
 * Null when the key is absent or anything fails: callers must treat
 * "unknown" and "mismatch" differently, so a failure never fakes a match.
 */
export async function fetchVideoDurationSeconds(
  videoId: string,
  apiKey: string | undefined,
): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: { contentDetails?: { duration?: string } }[];
    };
    const duration = body.items?.[0]?.contentDetails?.duration;
    return typeof duration === 'string' ? parseIsoDurationSeconds(duration) : null;
  } catch {
    return null;
  }
}

/**
 * Return the subset of video ids that YouTube currently allows inside an
 * embedded player. This reads only the public `status.embeddable` metadata;
 * it never downloads media. `null` means the check was unavailable (missing
 * key, HTTP failure, or network failure), so callers can degrade gracefully.
 *
 * The Data API accepts at most 50 ids per videos.list call. Callers in the
 * battle matcher already cap their candidate pool to that same size.
 */
export async function fetchEmbeddableVideoIds(
  videoIds: readonly string[],
  apiKey: string | undefined,
): Promise<ReadonlySet<string> | null> {
  if (!apiKey) return null;
  const uniqueIds = [...new Set(videoIds)].slice(0, 50);
  if (uniqueIds.length === 0) return new Set<string>();

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(uniqueIds.join(','))}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      items?: { id?: unknown; status?: { embeddable?: unknown } }[];
    };
    const embeddable = new Set<string>();
    for (const item of body.items ?? []) {
      if (typeof item.id === 'string' && item.status?.embeddable === true) {
        embeddable.add(item.id);
      }
    }
    return embeddable;
  } catch {
    return null;
  }
}
