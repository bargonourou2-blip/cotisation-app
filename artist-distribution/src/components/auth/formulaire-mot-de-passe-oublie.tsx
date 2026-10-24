'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { motDePasseOublie } from '@/actions/auth';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Champ, Input } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';

export function FormulaireMotDePasseOublie() {
  const [etat, action] = useActionState(motDePasseOublie, etatInitial);

  if (etat.statut === 'succes') {
    return (
      <div className="space-y-6">
        <MessageFormulaire etat={etat} />
        <p className="text-sm text-marine-600">
          Le lien est valable une heure. Si vous ne le recevez pas, vérifiez l’adresse saisie puis
          réessayez dans quelques minutes.
        </p>
        <Link href="/connexion" className="lien-texte text-sm">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      <MessageFormulaire etat={etat} />
      <Champ
        id="email"
        label="Adresse e-mail"
        requis
        erreur={etat.erreursChamps?.email}
        aide="Saisissez l’adresse utilisée lors de votre inscription."
      >
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          required
          erreur={Boolean(etat.erreursChamps?.email)}
        />
      </Champ>

      <BoutonSoumettre taille="lg" className="w-full" enCours="Envoi…">
        Recevoir le lien de réinitialisation
      </BoutonSoumettre>

      <p className="text-center text-sm text-marine-600">
        <Link href="/connexion" className="lien-texte">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
