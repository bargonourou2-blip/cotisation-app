'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { annulerAbonnement } from '@/actions/admin';
import { Alerte } from '@/components/ui/alerte';
import { Bouton } from '@/components/ui/button';
import { BoutonSoumettre } from '@/components/ui/bouton-soumettre';
import { Input } from '@/components/ui/champs';
import { etatInitial } from '@/lib/validation';

export function AnnulerAbonnement({ abonnementId }: { abonnementId: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [etat, action] = useActionState(annulerAbonnement, etatInitial);

  useEffect(() => {
    if (etat.statut === 'succes') {
      setOuvert(false);
      router.refresh();
    }
  }, [etat.statut, router]);

  if (!ouvert) {
    return (
      <div>
        <Bouton type="button" variante="fantome" taille="sm" onClick={() => setOuvert(true)} className="text-red-600 hover:bg-red-50">
          <Ban aria-hidden="true" className="h-3.5 w-3.5" />
          Annuler
        </Bouton>
        {etat.statut === 'succes' && <p className="mt-1 text-xs text-emerald-700">{etat.message}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="abonnement_id" value={abonnementId} />
      {etat.statut === 'erreur' && <Alerte type="erreur">{etat.message}</Alerte>}
      <Input name="note" placeholder="Motif (facultatif)" maxLength={500} className="!bg-white" />
      <div className="flex gap-2">
        <BoutonSoumettre variante="danger" taille="sm" enCours="Annulation…">
          Confirmer l’annulation
        </BoutonSoumettre>
        <Bouton type="button" variante="secondaire" taille="sm" onClick={() => setOuvert(false)}>
          Fermer
        </Bouton>
      </div>
    </form>
  );
}
