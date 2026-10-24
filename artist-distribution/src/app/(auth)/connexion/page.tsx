import type { Metadata } from 'next';
import Link from 'next/link';
import { Alerte } from '@/components/ui/alerte';
import { EnteteAuth } from '@/components/auth/entete-auth';
import { FormulaireConnexion } from '@/components/auth/formulaire-connexion';
import { supabaseConfigure } from '@/lib/env';
import { cheminInterneSur } from '@/lib/url';

export const metadata: Metadata = {
  title: 'Se connecter',
  description: 'Connectez-vous à votre espace artiste ARTIST DISTRIBUTION.',
};

const messagesErreur: Record<string, string> = {
  lien: 'Le lien reçu est invalide ou a expiré. Demandez un nouveau lien de réinitialisation ou de confirmation.',
  expire: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  profil: 'Votre profil n’a pas pu être chargé. Reconnectez-vous ou contactez notre équipe.',
};

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ suivant?: string; erreur?: string; message?: string }>;
}) {
  const params = await searchParams;
  const suivant = params.suivant ? cheminInterneSur(params.suivant) : undefined;
  const erreur = params.erreur ? messagesErreur[params.erreur] : null;

  return (
    <>
      <EnteteAuth
        titre="Bon retour parmi nous"
        sousTitre="Connectez-vous pour accéder à votre espace, suivre vos sorties et gérer votre abonnement."
      />

      {!supabaseConfigure && (
        <div className="mb-6">
          <Alerte type="attention" titre="Service en cours de configuration">
            La connexion est temporairement indisponible car la base de données n’est pas encore
            connectée.{' '}
            <Link href="/configuration" className="font-semibold underline underline-offset-2">
              Voir la procédure
            </Link>
            .
          </Alerte>
        </div>
      )}

      {erreur && (
        <div className="mb-6">
          <Alerte type="erreur">{erreur}</Alerte>
        </div>
      )}

      {params.message === 'mot-de-passe-modifie' && (
        <div className="mb-6">
          <Alerte type="succes">
            Votre mot de passe a bien été modifié. Vous pouvez continuer.
          </Alerte>
        </div>
      )}

      <FormulaireConnexion suivant={suivant} />
    </>
  );
}
