import type { MetadataRoute } from 'next';
import { site } from '@/config/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.nom,
    short_name: site.nom,
    description: site.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f8fc',
    theme_color: '#081631',
    lang: 'fr',
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
