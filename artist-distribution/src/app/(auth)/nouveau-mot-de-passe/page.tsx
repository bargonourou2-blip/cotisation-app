import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { EnteteAuth } from '@/components/auth/entete-auth';
import { FormulaireNouveauMotDePasse } from '@/components/auth/formulaire-nouveau-mot-de-passe';
import { getUtilisateur } from '@/lib/auth';
import { supabaseConfigure } from '@/lib/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nouveau mot de passe',
};

export default async function PageNouveauMotDePasse() {
  if (!supabaseConfigure) redirect('/configuration');

  const utilisateur = await getUtilisateur();
  if (!utilisateur) redirect('/mot-de-passe-oublie?erreur=expire');

  return (
    <>
      <EnteteAuth
        titre="Définissez un nouveau mot de passe"
        sousTitre={`Connecté en tant que ${utilisateur.email ?? 'votre compte'}. Choisissez un mot de passe que vous n’utilisez nulle part ailleurs.`}
      />
      <FormulaireNouveauMotDePasse />
    </>
  );
}
