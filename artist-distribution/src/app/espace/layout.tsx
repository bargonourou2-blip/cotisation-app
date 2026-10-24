import type { Metadata } from 'next';
import { CoqueEspace } from '@/components/espace/coque-espace';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Mon espace',
    template: '%s · Mon espace',
  },
  robots: { index: false, follow: false },
};

export default async function LayoutEspace({ children }: { children: React.ReactNode }) {
  const profil = await exigerProfil('/espace');

  // Met à jour les abonnements arrivés à échéance (opération sans risque).
  try {
    const supabase = await creerClientServeur();
    await supabase.rpc('expirer_abonnements');
  } catch (erreur) {
    console.error('Mise à jour des abonnements expirés :', erreur);
  }

  return (
    <CoqueEspace
      profil={{
        nom_complet: profil.nom_complet,
        nom_artiste: profil.nom_artiste,
        email: profil.email,
        role: profil.role,
      }}
    >
      {children}
    </CoqueEspace>
  );
}
