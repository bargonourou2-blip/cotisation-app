import type { Metadata } from 'next';
import { EnteteAuth } from '@/components/auth/entete-auth';
import { FormulaireMotDePasseOublie } from '@/components/auth/formulaire-mot-de-passe-oublie';
import { Alerte } from '@/components/ui/alerte';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
};

export default function PageMotDePasseOublie() {
  return (
    <>
      <EnteteAuth
        titre="Mot de passe oublié"
        sousTitre="Indiquez votre adresse e-mail : nous vous enverrons un lien sécurisé pour définir un nouveau mot de passe."
      />
      <div className="mb-6">
        <Alerte type="info">
          Pour votre sécurité, nous ne confirmons jamais si une adresse est enregistrée sur la
          plateforme.
        </Alerte>
      </div>
      <FormulaireMotDePasseOublie />
    </>
  );
}
