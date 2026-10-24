'use client';

import { useActionState } from 'react';
import { nouveauMotDePasse } from '@/actions/auth';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Champ, Input } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';

export function FormulaireNouveauMotDePasse() {
  const [etat, action] = useActionState(nouveauMotDePasse, etatInitial);
  const erreurs = etat.erreursChamps ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      <MessageFormulaire etat={etat} />

      <Champ
        id="mot_de_passe"
        label="Nouveau mot de passe"
        requis
        erreur={erreurs.mot_de_passe}
        aide="8 caractères minimum, avec une lettre et un chiffre."
      >
        <Input
          id="mot_de_passe"
          name="mot_de_passe"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          erreur={Boolean(erreurs.mot_de_passe)}
        />
      </Champ>

      <Champ id="confirmation" label="Confirmer le mot de passe" requis erreur={erreurs.confirmation}>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          erreur={Boolean(erreurs.confirmation)}
        />
      </Champ>

      <BoutonSoumettre taille="lg" className="w-full" enCours="Enregistrement…">
        Enregistrer le nouveau mot de passe
      </BoutonSoumettre>
    </form>
  );
}
