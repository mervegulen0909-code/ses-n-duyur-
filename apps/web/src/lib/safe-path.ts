/**
 * Open-redirect guard for ?next= params: only a same-origin RELATIVE path
 * survives ('/x...'), everything else falls back to home. '//host' is a
 * protocol-relative absolute URL — rejected.
 */
export function safeInternalPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}
