'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Link = { label: string; url: string };

const AVATAR_SIZE = 256;

/** Downscale + square-crop an image file client-side, so uploads stay small. */
async function resizeToSquare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unsupported');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
      'image/jpeg',
      0.85,
    );
  });
}

export function ProfileEditor({
  userId,
  initialBio,
  initialAvatarUrl,
  initialLinks,
}: {
  userId: string;
  initialBio: string | null;
  initialAvatarUrl: string | null;
  initialLinks: Link[];
}) {
  const router = useRouter();
  const t = useTranslations('Profile');
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState(initialBio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const blob = await resizeToSquare(file);
      const supabase = createSupabaseBrowserClient();
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch {
      setError(t('avatarUploadError'));
    } finally {
      setUploading(false);
    }
  }

  function updateLink(i: number, patch: Partial<Link>) {
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLink(i: number) {
    setLinks((ls) => ls.filter((_, idx) => idx !== i));
  }
  function addLink() {
    if (links.length >= 5) return;
    setLinks((ls) => [...ls, { label: '', url: '' }]);
  }

  async function save() {
    setSaving(true);
    setError('');
    const cleanLinks = links
      .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label && l.url);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bio: bio.trim() || null, avatarUrl, links: cleanLinks }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? t('saveError'));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-emerald-400 hover:underline"
      >
        {t('editProfile')}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-800" />
        )}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={onPickAvatar}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs hover:border-neutral-500 disabled:opacity-50"
          >
            {uploading ? t('uploading') : t('changeAvatar')}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-neutral-500">{t('bioLabel')}</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-neutral-500">{t('linksLabel')}</label>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={l.label}
              onChange={(e) => updateLink(i, { label: e.target.value })}
              placeholder={t('linkLabelPlaceholder')}
              maxLength={40}
              className="w-1/3 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-emerald-500"
            />
            <input
              value={l.url}
              onChange={(e) => updateLink(i, { url: e.target.value })}
              placeholder="https://…"
              maxLength={300}
              className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={() => removeLink(i)}
              className="text-xs text-rose-400 hover:underline"
            >
              {t('removeLink')}
            </button>
          </div>
        ))}
        {links.length < 5 && (
          <button
            type="button"
            onClick={addLink}
            className="text-xs text-emerald-400 hover:underline"
          >
            {t('addLink')}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || uploading}
          className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? t('saving') : t('save')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-500 hover:text-neutral-300"
        >
          {t('cancelEdit')}
        </button>
      </div>
    </div>
  );
}
