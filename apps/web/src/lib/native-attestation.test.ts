import { describe, expect, it } from 'vitest';
import { nativeRequestHash, verifyNativeRequest } from './native-attestation';

describe('native request binding', () => {
  it('binds proof to method, path, query, and exact body bytes', async () => {
    const base = new Request('https://voxscore.app/api/votes?round=1', { method: 'POST' });
    const hash = await nativeRequestHash(base, '{"score":80}');

    await expect(
      nativeRequestHash(
        new Request('https://voxscore.app/api/votes?round=1', { method: 'POST' }),
        '{"score":80}',
      ),
    ).resolves.toBe(hash);
    await expect(
      nativeRequestHash(
        new Request('https://voxscore.app/api/votes?round=2', { method: 'POST' }),
        '{"score":80}',
      ),
    ).resolves.not.toBe(hash);
    await expect(
      nativeRequestHash(
        new Request('https://voxscore.app/api/votes?round=1', { method: 'PUT' }),
        '{"score":80}',
      ),
    ).resolves.not.toBe(hash);
    await expect(nativeRequestHash(base, '{"score":81}')).resolves.not.toBe(hash);
  });

  it('fails closed for absent or unknown platform proof', async () => {
    await expect(
      verifyNativeRequest(new Request('https://voxscore.app/api/votes'), 'user-1', ''),
    ).resolves.toBe(false);
    await expect(
      verifyNativeRequest(
        new Request('https://voxscore.app/api/votes', {
          headers: { 'x-voxscore-platform': 'desktop' },
        }),
        'user-1',
        '',
      ),
    ).resolves.toBe(false);
  });
});
