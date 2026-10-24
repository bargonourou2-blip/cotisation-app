'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { changerStatutSortie } from '@/actions/admin';
import { Alerte } from '@/components/ui/alerte';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Select, Textarea } from '@/components/ui/champs';
import { etatInitial } from '@/lib/validation';
import { STATUTS_SORTIE } from '@/lib/statuts';
import type { StatutSortie } from '@/types/database';

export function FormulaireStatutSortie({
  sortieId,
  statutActuel,
  motifActuel,
}: {
  sortieId: string;
  statutActuel: StatutSortie;
  motifActuel: string | null;
}) {
  const router = useRouter();
  const [etat, action] = useActionState(changerStatutSortie, etatInitial);
  const [statut, setStatut] = useState<StatutSortie>(statutActuel);

  useEffect(() => {
    if (etat.statut === 'succes') router.refresh();
  }, [etat.statut, router]);

  const commentaireObligatoire = statut === 'informations_a_corriger' || statut === 'refusee';

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sortie_id" value={sortieId} />
      {etat.statut !== 'initial' && (
        <Alerte type={etat.statut === 'succes' ? 'succes' : 'erreur'}>{etat.message}</Alerte>
      )}

      <div>
        <label htmlFor="statut" className="etiquette">
          Nouveau statut
        </label>
        <Select
          id="statut"
          name="statut"
          value={statut}
          onChange={(evenement) => setStatut(evenement.target.value as StatutSortie)}
        >
          {Object.entries(STATUTS_SORTIE).map(([valeur, definition]) => (
            <option key={valeur} value={valeur}>
              {definition.label}
            </option>
          ))}
        </Select>
        <p className="aide-champ">{STATUTS_SORTIE[statut]?.description}</p>
      </div>

      <div>
        <label htmlFor="commentaire" className="etiquette">
          Message pour l’artiste {commentaireObligatoire && <span className="text-red-600">*</span>}
        </label>
        <Textarea
          id="commentaire"
          name="commentaire"
          rows={3}
          maxLength={2000}
          defaultValue={motifActuel ?? ''}
          required={commentaireObligatoire}
          placeholder={
            commentaireObligatoire
              ? 'Décrivez précisément ce que l’artiste doit corriger.'
              : 'Facultatif. Ce message apparaîtra dans le suivi de la demande.'
          }
        />
      </div>

      <BoutonSoumettre enCours="Mise à jour…">
        <Save aria-hidden="true" className="h-4 w-4" />
        Mettre à jour le statut
      </BoutonSoumettre>
    </form>
  );
}
