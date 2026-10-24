'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supprimerSortie } from '@/actions/sorties';
import { Bouton } from '@/components/ui/button';

export function BoutonSupprimerSortie({ id }: { id: string }) {
  const [confirmation, setConfirmation] = useState(false);

  if (!confirmation) {
    return (
      <Bouton
        type="button"
        variante="fantome"
        taille="sm"
        onClick={() => setConfirmation(true)}
        className="text-red-600 hover:bg-red-50"
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        Supprimer
      </Bouton>
    );
  }

  return (
    <form action={supprimerSortie} className="rounded-2xl border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="sortie_id" value={id} />
      <p className="text-xs font-medium text-red-800">
        Supprimer définitivement ce brouillon et ses fichiers ?
      </p>
      <div className="mt-2.5 flex gap-2">
        <Bouton type="submit" variante="danger" taille="sm">
          Confirmer
        </Bouton>
        <Bouton type="button" variante="secondaire" taille="sm" onClick={() => setConfirmation(false)}>
          Annuler
        </Bouton>
      </div>
    </form>
  );
}
