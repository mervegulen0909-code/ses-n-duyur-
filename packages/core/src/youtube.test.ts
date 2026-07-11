import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCaptionText, fetchOEmbed, parseYouTubeId, watchUrl } from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`https://youtube.com/watch?v=${ID}&t=42s`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://music.youtube.com/watch?v=${ID}`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=abc`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/v/${ID}`, ID],
    ['  https://youtu.be/' + ID + '  ', ID],
  ])('parses %s', (url, expected) => {
    expect(parseYouTubeId(url)).toBe(expected);
  });

  it.each([
    ['not a url at all'],
    ['https://vimeo.com/12345'],
    ['https://www.youtube.com/watch?v=tooShort'],
    ['https://youtu.be/'],
    ['https://youtu.be/badid'],
    ['https://www.youtube.com/feed/subscriptions'],
    ['https://www.youtube.com/embed/'],
    ['https://www.youtube.com/channel/UC1234567890'],
  ])('rejects %s', (url) => {
    expect(parseYouTubeId(url)).toBeNull();
  });
});

describe('watchUrl', () => {
  it('builds a canonical watch URL', () => {
    expect(watchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});

describe('fetchOEmbed', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
    return (async () =>
      ({
        ok,
        status,
        json: async () => body,
      }) as Response) as unknown as typeof fetch;
  }

  it('maps oEmbed fields', async () => {
    const meta = await fetchOEmbed(
      ID,
      fakeFetch({
        title: 'My Cover',
        author_name: 'Singer',
        author_url: 'https://youtube.com/@singer',
        thumbnail_url: 'https://img/thumb.jpg',
        provider_name: 'YouTube',
      }),
    );
    expect(meta.title).toBe('My Cover');
    expect(meta.authorName).toBe('Singer');
    expect(meta.thumbnailUrl).toBe('https://img/thumb.jpg');
  });

  it('defaults missing/invalid fields to empty strings and YouTube provider', async () => {
    const meta = await fetchOEmbed(ID, fakeFetch({ title: 123 }));
    expect(meta.title).toBe('');
    expect(meta.authorName).toBe('');
    expect(meta.providerName).toBe('YouTube');
  });

  it('throws on a non-ok response', async () => {
    await expect(fetchOEmbed(ID, fakeFetch({}, false, 404))).rejects.toThrow(/404/);
  });

  it('uses the global fetch by default', async () => {
    vi.stubGlobal('fetch', fakeFetch({ title: 'Default Fetch' }));
    const meta = await fetchOEmbed(ID);
    expect(meta.title).toBe('Default Fetch');
  });
});

describe('fetchCaptionText — public captions as scoring metadata', () => {
  it('strips XML and entity escapes into plain text, capped at 1500 chars', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          `<?xml version="1.0"?><transcript><text start="0">Hello &amp; welcome</text><text start="2">it&#39;s me</text></transcript>`,
      })),
    );
    await expect(fetchCaptionText('dQw4w9WgXcQ')).resolves.toBe("Hello & welcome it's me");
    vi.unstubAllGlobals();
  });

  it('returns null when captions are absent or the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '' })),
    );
    await expect(fetchCaptionText('x')).resolves.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      }),
    );
    await expect(fetchCaptionText('x')).resolves.toBeNull();
    vi.unstubAllGlobals();
  });
});
