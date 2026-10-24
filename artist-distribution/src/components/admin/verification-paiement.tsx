'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { confirmerPaiement, rejeterPaiement } from '@/actions/admin';
import { Alerte } from '@/components/ui/alerte';
import { Bouton } from '@/components/ui/button';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Textarea } from '@/components/ui/champs';
import { etatInitial } from '@/lib/validation';

type Mode = 'aucun' | 'confirmer' | 'rejeter';

export function VerificationPaiement({ paiementId }: { paiementId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('aucun');
  const [etatConfirmation, actionConfirmer] = useActionState(confirmerPaiement, etatInitial);
  const [etatRejet, actionRejeter] = useActionState(rejeterPaiement, etatInitial);

  useEffect(() => {
    if (etatConfirmation.statut === 'succes' || etatRejet.statut === 'succes') {
      setMode('aucun');
      router.refresh();
    }
  }, [etatConfirmation.statut, etatRejet.statut, router]);

  return (
    <div className="mt-4 border-t border-marine-100 pt-4">
      {etatConfirmation.statut === 'succes' && (
        <div className="mb-3">
          <Alerte type="succes">{etatConfirmation.message}</Alerte>
        </div>
      )}
      {etatRejet.statut === 'succes' && (
        <div className="mb-3">
          <Alerte type="succes">{etatRejet.message}</Alerte>
        </div>
      )}

      {mode === 'aucun' && (
        <div className="flex flex-wrap gap-2">
          <Bouton type="button" variante="succes" taille="sm" onClick={() => setMode('confirmer')}>
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Confirmer le paiement
          </Bouton>
          <Bouton type="button" variante="secondaire" taille="sm" onClick={() => setMode('rejeter')}>
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Rejeter
          </Bouton>
        </div>
      )}

      {mode === 'confirmer' && (
        <form action={actionConfirmer} className="space-y-3">
          <input type="hidden" name="payment_id" value={paiementId} />
          <p className="text-xs leading-relaxed text-marine-600">
            Vérifiez que le montant a bien été reçu sur le compte du service. La confirmation active
            immédiatement l’abonnement de l’artiste.
          </p>
          {etatConfirmation.statut === 'erreur' && <Alerte type="erreur">{etatConfirmation.message}</Alerte>}
          <Textarea
            name="note"
            rows={2}
            maxLength={1000}
            placeholder="Note interne (facultatif) : numéro de reçu, date de réception…"
          />
          <div className="flex flex-wrap gap-2">
            <BoutonSoumettre variante="succes" taille="sm" enCours="Confirmation…">
              Confirmer et activer l’abonnement
            </BoutonSoumettre>
            <Bouton type="button" variante="fantome" taille="sm" onClick={() => setMode('aucun')}>
              Annuler
            </Bouton>
          </div>
        </form>
      )}

      {mode === 'rejeter' && (
        <form action={actionRejeter} className="space-y-3">
          <input type="hidden" name="payment_id" value={paiementId} />
          {etatRejet.statut === 'erreur' && <Alerte type="erreur">{etatRejet.message}</Alerte>}
          <Textarea
            name="note"
            rows={3}
            maxLength={1000}
            required
            placeholder="Motif du rejet (visible par l’artiste) : référence introuvable, montant incorrect…"
          />
          <div className="flex flex-wrap gap-2">
            <BoutonSoumettre variante="danger" taille="sm" enCours="Rejet…">
              Rejeter ce paiement
            </BoutonSoumettre>
            <Bouton type="button" variante="fantome" taille="sm" onClick={() => setMode('aucun')}>
              Annuler
            </Bouton>
          </div>
        </form>
      )}
      {mode !== 'aucun' && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-marine-400">
          <Loader2 aria-hidden="true" className="hidden h-3 w-3" />
          Cette action est enregistrée dans le journal d’administration.
        </p>
      )}
    </div>
  );
}
