import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentSeason,
  currentSeasonId,
  listSeasons,
  resolveSeason,
  type SeasonSummary,
} from './seasons';

const OPEN: SeasonSummary = { id: 's-2', key: 'S2-2026', title: 'Season 2', endsAt: null };
const CLOSED: SeasonSummary = {
  id: 's-1',
  key: 'S1-2026',
  title: 'Season 1',
  endsAt: '2026-06-01T00:00:00.000Z',
};

describe('currentSeason', () => {
  it('returns the one season with no end date', () => {
    expect(currentSeason([CLOSED, OPEN])).toEqual(OPEN);
  });

  it('returns null when every season has closed', () => {
    expect(currentSeason([CLOSED])).toBeNull();
  });

  it('returns null for an empty list (seasons unused)', () => {
    expect(currentSeason([])).toBeNull();
  });
});

describe('resolveSeason', () => {
  const seasons = [CLOSED, OPEN];

  it("'all' always means the unfiltered view, even with an open season", () => {
    expect(resolveSeason(seasons, 'all')).toBeNull();
  });

  it('matches a past season by key', () => {
    expect(resolveSeason(seasons, 'S1-2026')).toEqual(CLOSED);
  });

  it('falls back to the current season when no param is given', () => {
    expect(resolveSeason(seasons, undefined)).toEqual(OPEN);
  });

  it('falls back to the current season on an unrecognized key (never guesses)', () => {
    expect(resolveSeason(seasons, 'not-a-real-key')).toEqual(OPEN);
  });

  it('falls back to all-time (null) when no season has ever been opened', () => {
    expect(resolveSeason([], undefined)).toBeNull();
  });
});

describe('currentSeasonId / listSeasons (DB reads)', () => {
  afterEach(() => vi.restoreAllMocks());

  function makeClient(opts: { openId?: string | null; rows?: unknown[] }) {
    const maybeSingle = vi.fn(async () => ({ data: opts.openId ? { id: opts.openId } : null }));
    const limit = vi.fn(() => ({ maybeSingle }));
    const orderForOpen = vi.fn(() => ({ limit }));
    const isFn = vi.fn(() => ({ order: orderForOpen }));

    const orderForList = vi.fn(async () => ({ data: opts.rows ?? [] }));

    const from = vi.fn(() => ({
      select: vi.fn((cols: string) => {
        if (cols === 'id') return { is: isFn };
        return { order: orderForList };
      }),
    }));

    return { client: { from } as never, isFn };
  }

  it('currentSeasonId returns the open season id', async () => {
    const { client } = makeClient({ openId: 's-2' });
    await expect(currentSeasonId(client)).resolves.toBe('s-2');
  });

  it('currentSeasonId returns null when nothing is open', async () => {
    const { client } = makeClient({ openId: null });
    await expect(currentSeasonId(client)).resolves.toBeNull();
  });

  it('listSeasons maps rows into SeasonSummary shape', async () => {
    const { client } = makeClient({
      rows: [{ id: 's-1', key: 'S1-2026', title: 'Season 1', ends_at: null }],
    });
    await expect(listSeasons(client)).resolves.toEqual([
      { id: 's-1', key: 'S1-2026', title: 'Season 1', endsAt: null },
    ]);
  });
});
