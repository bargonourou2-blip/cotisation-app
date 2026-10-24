import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/env';

const pages = ['', '/inscription', '/connexion', '/conditions-utilisation', '/politique-confidentialite'];

export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();
  return pages.map((page) => ({
    url: `${siteUrl}${page}`,
    lastModified: maintenant,
    changeFrequency: page === '' ? 'weekly' : 'monthly',
    priority: page === '' ? 1 : 0.5,
  }));
}
