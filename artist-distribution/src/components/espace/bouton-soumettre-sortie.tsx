'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { soumettreSortie } from '@/actions/sorties';
import { Bouton } from '@/components/ui/button';
import { Alerte } from '@/components/ui/alerte';

export function BoutonSoumettreSortie({ id }: { id: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lancer() {
    setEnCours(true);
    setErreur(null);
    const resultat = await soumettreSortie(id);
    if (!resultat.ok) {
      setErreur(resultat.message ?? 'La soumission a échoué.');
      setEnCours(false);
      return;
    }
    router.push(`/espace/sorties/${id}?soumis=1`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {erreur && <Alerte type="erreur">{erreur}</Alerte>}
      <Bouton type="button" onClick={lancer} disabled={enCours} taille="lg" className="w-full">
        {enCours ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Send aria-hidden="true" className="h-4 w-4" />
        )}
        {enCours ? 'Envoi en cours…' : 'Soumettre pour vérification'}
      </Bouton>
    </div>
  );
}
