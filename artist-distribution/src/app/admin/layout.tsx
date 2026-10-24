import type { Metadata } from 'next';
import { CoqueAdmin } from '@/components/admin/coque-admin';
import { exigerAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Administration',
    template: '%s · Administration',
  },
  robots: { index: false, follow: false },
};

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const profil = await exigerAdmin();

  return (
    <CoqueAdmin profil={{ nom_complet: profil.nom_complet, email: profil.email }}>
      {children}
    </CoqueAdmin>
  );
}
