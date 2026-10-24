import path from 'node:path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(process.cwd()),
  // Nécessaire pour les aperçus servis derrière un domaine proxy pendant le développement.
  allowedDevOrigins: ['*.e2b.app', '*.e2b.dev'],
  poweredByHeader: false,
  // L'application est déployée sur Vercel : la compression et les images sont gérées par la plateforme.
  images: {
    // Aucune image distante n'est utilisée pour l'instant. Si vous ajoutez un jour un CDN
    // pour les pochettes, déclarez son nom de domaine ici.
    remotePatterns: [],
  },
  async headers() {
    // En-têtes de sécurité appliqués à toutes les réponses.
    // La politique de sécurité du contenu (CSP) est construite dans `src/middleware.ts`
    // car elle dépend de l'URL Supabase configurée.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'X-Frame-Options', value: 'DENY' }]
            : []),
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
