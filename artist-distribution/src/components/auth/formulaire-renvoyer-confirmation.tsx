'use client';

import { useActionState } from 'react';
import { renvoyerConfirmation } from '@/actions/auth';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';

export function FormulaireRenvoyerConfirmation({ email }: { email: string }) {
  const [etat, action] = useActionState(renvoyerConfirmation, etatInitial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <MessageFormulaire etat={etat} />
      <BoutonSoumettre variante="secondaire" taille="md" enCours="Envoi…">
        Renvoyer l’e-mail de confirmation
      </BoutonSoumettre>
    </form>
  );
}
