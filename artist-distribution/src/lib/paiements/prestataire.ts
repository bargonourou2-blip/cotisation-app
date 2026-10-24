import { paiement } from '@/config/site';

/**
 * =====================================================================
 *  ARCHITECTURE MODULAIRE DE PAIEMENT
 * =====================================================================
 *  Aucun prestataire n'est branché par défaut : le site indique
 *  clairement que le paiement en ligne n'est pas disponible et propose
 *  un paiement manuel vérifié par un administrateur.
 *
 *  Pour brancher un prestataire plus tard (CinetPay, Orange Money,
 *  Wave, PayDunya…) :
 *    1. Créez un fichier dans ce dossier qui respecte l'interface
 *       `PrestatairePaiement`.
 *    2. Renseignez les clés SECRÈTES uniquement dans les variables
 *       d'environnement du serveur (jamais dans le navigateur).
 *    3. Activez `paiement.enLigne.actif` dans `src/config/site.ts`.
 *    4. IMPORTANT : l'activation d'un abonnement doit toujours être
 *       déclenchée par une notification signée du prestataire
 *       (webhook), jamais par le retour du navigateur.
 *
 *  Voir le fichier README.md de ce dossier.
 * =====================================================================
 */

export interface DemandePaiement {
  abonnementId: string;
  montantFcfa: number;
  email: string;
  description: string;
}

export type ResultatPaiement =
  | { disponible: true; urlRedirection: string; reference: string }
  | { disponible: false; message: string };

export interface PrestatairePaiement {
  nom: string;
  /** Vrai uniquement si les clés sont présentes ET le prestataire activé. */
  disponible: boolean;
  /** Crée une intention de paiement et renvoie l'URL de la page de paiement. */
  initier(demande: DemandePaiement): Promise<ResultatPaiement>;
}

/**
 * Prestataire « vide » : utilisé tant qu'aucun service n'est configuré.
 * Il ne simule jamais un paiement réussi.
 */
const aucunPrestataire: PrestatairePaiement = {
  nom: 'Aucun prestataire configuré',
  disponible: false,
  async initier() {
    return {
      disponible: false,
      message:
        'Le paiement en ligne n’est pas encore disponible. Utilisez le paiement manuel : ' +
        'votre abonnement sera activé après vérification par notre équipe.',
    };
  },
};

/** Renvoie le prestataire actif (ou le prestataire vide). */
export function getPrestatairePaiement(): PrestatairePaiement {
  // Pour ajouter un prestataire, importez-le ici et retournez-le
  // lorsque les variables d'environnement nécessaires sont définies.
  return aucunPrestataire;
}

/** Vrai si un paiement en ligne peut réellement être proposé. */
export function paiementEnLigneDisponible(): boolean {
  const prestataire = getPrestatairePaiement();
  return paiement.enLigne.actif && prestataire.disponible;
}
