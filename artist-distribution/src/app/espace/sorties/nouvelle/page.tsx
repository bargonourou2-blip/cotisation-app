import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulaireSortie } from '@/components/espace/formulaire-sortie';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { abonnementValide } from '@/lib/statuts';

export const metadata: Metadata = { title: 'Nouvelle demande' };

export default async function PageNouvelleSortie() {
  const profil = await exigerProfil('/espace/sorties/nouvelle');
  const supabase = await creerClientServeur();

  const { data: abonnements } = await supabase
    .from('subscriptions')
    .select('statut, fin')
    .eq('user_id', profil.id)
    .eq('statut', 'actif');

  if (!(abonnements ?? []).some((element) => abonnementValide(element))) {
    redirect('/espace/abonnement?besoin=sortie');
  }

  return (
    <>
      <Link
        href="/espace/sorties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour à mes sorties
      </Link>

      <EntetePage
        titre="Nouvelle demande de distribution"
        sousTitre="Prenez le temps nécessaire. Vous pouvez enregistrer un brouillon et continuer plus tard."
      />

      <FormulaireSortie userId={profil.id} />
    </>
  );
}
