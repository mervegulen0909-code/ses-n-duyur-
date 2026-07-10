import type { MetadataRoute } from 'next';

// PWA / installability manifest. Brand: dark canvas + emerald soundwave mark
// (matches icon.svg and the OpenGraph card). The SVG icon is served from the
// app-router icon convention at /icon.svg.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VoxScore — Global AI Vocal Performance League',
    short_name: 'VoxScore',
    description: 'Discover who sings a song best. AI-scored, community-voted vocal performances.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
