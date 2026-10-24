import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulaireSortie } from '@/components/espace/formulaire-sortie';
import { exigerProfil } from '@/lib/auth';
import { creerClientServeur } from '@/lib/supabase/server';
import { lienAudio, lienPochette } from '@/lib/storage';

export const metadata: Metadata = { title: 'Modifier ma demande' };

export default async function PageModifierSortie({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profil = await exigerProfil(`/espace/sorties/${id}/modifier`);
  const supabase = await creerClientServeur();

  const { data: sortie } = await supabase.from('releases').select('*').eq('id', id).maybeSingle();
  if (!sortie || sortie.user_id !== profil.id) notFound();

  if (!['brouillon', 'informations_a_corriger'].includes(sortie.statut)) {
    redirect(`/espace/sorties/${sortie.id}`);
  }

  const [pochetteUrl, audioUrl] = await Promise.all([
    lienPochette(supabase, sortie.pochette_path),
    lienAudio(supabase, sortie.audio_path),
  ]);

  return (
    <>
      <Link
        href={`/espace/sorties/${sortie.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour à la demande
      </Link>

      <EntetePage
        titre="Modifier ma demande"
        sousTitre="Mettez à jour les informations, puis enregistrez le brouillon ou soumettez la demande."
      />

      <FormulaireSortie
        userId={profil.id}
        sortie={sortie}
        pochetteUrl={pochetteUrl}
        audioUrl={audioUrl}
      />
    </>
  );
}
