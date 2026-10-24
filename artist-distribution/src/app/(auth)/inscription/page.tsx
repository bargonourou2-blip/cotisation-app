import type { Metadata } from 'next';
import Link from 'next/link';
import { Alerte } from '@/components/ui/alerte';
import { EnteteAuth } from '@/components/auth/entete-auth';
import { FormulaireInscription } from '@/components/auth/formulaire-inscription';
import { supabaseConfigure } from '@/lib/env';

export const metadata: Metadata = {
  title: 'Créer mon compte',
  description:
    'Créez votre compte artiste en quelques minutes, sans avoir besoin d’un morceau prêt.',
};

export default async function PageInscription({
  searchParams,
}: {
  searchParams: Promise<{ formule?: string }>;
}) {
  const params = await searchParams;
  const formule = typeof params.formule === 'string' ? params.formule.slice(0, 40) : '';

  return (
    <>
      <EnteteAuth
        titre="Créez votre compte artiste"
        sousTitre="Quelques informations suffisent. Vous choisirez votre formule et ajouterez votre musique depuis votre espace personnel."
      />

      {!supabaseConfigure && (
        <div className="mb-6">
          <Alerte type="attention" titre="Service en cours de configuration">
            La base de données n’est pas encore connectée : la création de compte est
            temporairement indisponible.{' '}
            <Link href="/configuration" className="font-semibold underline underline-offset-2">
              Voir la procédure
            </Link>
            .
          </Alerte>
        </div>
      )}

      {formule && (
        <div className="mb-6">
          <Alerte type="info" titre="Une formule a été présélectionnée">
            Vous pourrez confirmer ou changer de formule depuis votre espace, après la création de
            votre compte.
          </Alerte>
        </div>
      )}

      <FormulaireInscription formule={formule} />
    </>
  );
}
