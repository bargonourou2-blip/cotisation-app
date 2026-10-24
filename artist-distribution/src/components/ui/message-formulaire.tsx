import { Alerte } from '@/components/ui/alerte';
import type { EtatFormulaire } from '@/lib/validation';

/** Affiche le message global renvoyé par une Server Action. */
export function MessageFormulaire({ etat }: { etat: EtatFormulaire }) {
  if (etat.statut === 'initial' || !etat.message) return null;
  return (
    <Alerte type={etat.statut === 'succes' ? 'succes' : 'erreur'}>{etat.message}</Alerte>
  );
}
