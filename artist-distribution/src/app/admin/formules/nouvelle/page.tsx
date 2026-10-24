import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EntetePage } from '@/components/espace/entete-page';
import { FormulaireFormule } from '@/components/admin/formulaire-formule';

export const metadata: Metadata = { title: 'Nouvelle formule' };

export default function PageNouvelleFormule() {
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
        titre="Nouvelle formule"
        sousTitre="Créez une offre d’abonnement. Elle sera visible immédiatement sur le site public."
      />

      <div className="max-w-3xl rounded-3xl border border-marine-900/[0.06] bg-white p-5 shadow-carte sm:p-6">
        <FormulaireFormule />
      </div>
    </>
  );
}
