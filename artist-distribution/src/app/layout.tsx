import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './globals.css';
import { site } from '@/config/site';
import { siteUrl as urlSite } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(urlSite),
  title: {
    default: `${site.nom} — ${site.slogan}`,
    template: `%s · ${site.nom}`,
  },
  description: site.description,
  applicationName: site.nom,
  keywords: [
    'distribution musicale',
    'Burkina Faso',
    'artiste',
    'streaming',
    'abonnement',
    'sortie musicale',
  ],
  authors: [{ name: site.legal.raisonSociale }],
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/',
    siteName: site.nom,
    title: `${site.nom} — ${site.slogan}`,
    description: site.description,
  },
  twitter: {
    card: 'summary',
    title: `${site.nom} — ${site.slogan}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
  icons: {
    icon: '/logo.svg',
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#081631',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
