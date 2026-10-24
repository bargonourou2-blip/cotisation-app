'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { connexion } from '@/actions/auth';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Champ, Input } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';

export function FormulaireConnexion({ suivant }: { suivant?: string }) {
  const [etat, action] = useActionState(connexion, etatInitial);
  const erreurs = etat.erreursChamps ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {suivant && <input type="hidden" name="suivant" value={suivant} />}

      <MessageFormulaire etat={etat} />

      <Champ id="email" label="Adresse e-mail" requis erreur={erreurs.email}>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          required
          erreur={Boolean(erreurs.email)}
        />
      </Champ>

      <Champ id="mot_de_passe" label="Mot de passe" requis erreur={erreurs.mot_de_passe}>
        <Input
          id="mot_de_passe"
          name="mot_de_passe"
          type="password"
          autoComplete="current-password"
          required
          erreur={Boolean(erreurs.mot_de_passe)}
        />
      </Champ>

      <div className="flex justify-end">
        <Link href="/mot-de-passe-oublie" className="text-sm font-semibold text-azur-700 hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>

      <BoutonSoumettre taille="lg" className="w-full" enCours="Connexion…">
        Se connecter
      </BoutonSoumettre>

      <p className="text-center text-sm text-marine-600">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="lien-texte">
          Créer mon compte
        </Link>
      </p>
    </form>
  );
}
