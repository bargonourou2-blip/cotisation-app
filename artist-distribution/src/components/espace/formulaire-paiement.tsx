'use client';

import { useActionState } from 'react';
import { declarerPaiement } from '@/actions/abonnement';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Champ, Input, Select, Textarea } from '@/components/ui/champs';
import { MessageFormulaire } from '@/components/ui/message-formulaire';
import { etatInitial } from '@/lib/validation';
import { paiement } from '@/config/site';

export function FormulairePaiement({ abonnementId }: { abonnementId: string }) {
  const [etat, action] = useActionState(declarerPaiement, etatInitial);
  const erreurs = etat.erreursChamps ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="abonnement_id" value={abonnementId} />
      <MessageFormulaire etat={etat} />

      <Champ id="moyen" label="Moyen de paiement utilisé" requis erreur={erreurs.moyen}>
        <Select id="moyen" name="moyen" defaultValue="mobile_money" erreur={Boolean(erreurs.moyen)}>
          {paiement.manuel.moyens.map((moyen) => (
            <option key={moyen.code} value={moyen.code}>
              {moyen.label}
            </option>
          ))}
        </Select>
      </Champ>

      <Champ
        id="reference"
        label="Référence de la transaction"
        requis
        erreur={erreurs.reference}
        aide="Numéro de transaction, identifiant de transfert ou reçu fourni par l’opérateur."
      >
        <Input
          id="reference"
          name="reference"
          maxLength={120}
          placeholder="Ex. MP241026.1234.A56789"
          required
          erreur={Boolean(erreurs.reference)}
        />
      </Champ>

      <Champ
        id="telephone_payeur"
        label="Numéro utilisé pour le paiement"
        erreur={erreurs.telephone_payeur}
        aide="Utile pour vérifier la transaction auprès de l’opérateur."
      >
        <Input
          id="telephone_payeur"
          name="telephone_payeur"
          type="tel"
          inputMode="tel"
          placeholder="+226 70 00 00 00"
          maxLength={30}
          erreur={Boolean(erreurs.telephone_payeur)}
        />
      </Champ>

      <Champ
        id="note_client"
        label="Message pour notre équipe"
        erreur={erreurs.note_client}
        aide="Facultatif. Par exemple, le nom du compte utilisé pour le virement."
      >
        <Textarea
          id="note_client"
          name="note_client"
          rows={3}
          maxLength={1000}
          erreur={Boolean(erreurs.note_client)}
        />
      </Champ>

      <BoutonSoumettre taille="lg" className="w-full" enCours="Envoi de la déclaration…">
        Déclarer mon paiement
      </BoutonSoumettre>

      <p className="text-center text-xs leading-relaxed text-marine-500">
        Votre abonnement ne sera activé qu’après vérification par notre équipe. Aucun paiement
        n’est automatiquement considéré comme réussi.
      </p>
    </form>
  );
}
