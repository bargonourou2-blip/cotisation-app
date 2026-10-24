import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulaireFormule } from '@/components/admin/formulaire-formule';
import { creerClientServeur } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Modifier une formule' };

export default async function PageModifierFormule({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await creerClientServeur();
  const { data: formule } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!formule) notFound();

  return (
    <>
      <Link
        href="/admin/formules"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-marine-500 hover:text-marine-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Retour aux formules
      </Link>

      <EntetePage
        titre={`Modifier « ${formule.nom} »`}
        sousTitre="Le code technique de la formule reste inchangé pour préserver l’historique des abonnements."
      />

      <div className="max-w-3xl rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
        <FormulaireFormule formule={formule} />
      </div>
    </>
  );
}
