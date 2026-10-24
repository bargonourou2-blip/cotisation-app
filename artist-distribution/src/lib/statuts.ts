import type {
  StatutAbonnement,
  StatutPaiement,
  StatutSortie,
  TypeCompte,
  TypeSortie,
} from '@/types/database';

export type Ton = 'neutre' | 'info' | 'attention' | 'succes' | 'erreur' | 'violet';

export interface DefinitionStatut {
  label: string;
  description: string;
  ton: Ton;
}

/** Statuts d'une demande de distribution. */
export const STATUTS_SORTIE: Record<StatutSortie, DefinitionStatut> = {
  brouillon: {
    label: 'Brouillon',
    description: 'Votre demande n’est pas encore envoyée. Vous pouvez la compléter quand vous voulez.',
    ton: 'neutre',
  },
  en_attente_verification: {
    label: 'En attente de vérification',
    description: 'Notre équipe vérifie les informations et les fichiers de votre demande.',
    ton: 'info',
  },
  informations_a_corriger: {
    label: 'Informations à corriger',
    description: 'Quelques éléments doivent être corrigés avant de continuer.',
    ton: 'attention',
  },
  validee: {
    label: 'Validée',
    description: 'Votre demande est validée. Nous préparons l’envoi vers les plateformes.',
    ton: 'succes',
  },
  en_preparation: {
    label: 'En préparation',
    description: 'Vos fichiers et métadonnées sont en cours de préparation pour les plateformes.',
    ton: 'violet',
  },
  envoyee_plateformes: {
    label: 'Envoyée aux plateformes',
    description: 'Votre sortie a été transmise aux plateformes. La mise en ligne peut prendre quelques jours.',
    ton: 'violet',
  },
  publiee: {
    label: 'Publiée',
    description: 'Votre sortie est en ligne. Félicitations !',
    ton: 'succes',
  },
  refusee: {
    label: 'Non retenue',
    description: 'Cette demande ne peut pas être traitée en l’état. Consultez le message de notre équipe.',
    ton: 'erreur',
  },
};

/** Étapes de la frise de suivi affichée à l’artiste. */
export const ETAPES_SUIVI: Array<{ statut: StatutSortie; label: string }> = [
  { statut: 'en_attente_verification', label: 'Réception' },
  { statut: 'validee', label: 'Validation' },
  { statut: 'en_preparation', label: 'Préparation' },
  { statut: 'envoyee_plateformes', label: 'Envoi' },
  { statut: 'publiee', label: 'Publication' },
];

export function etapeActuelle(statut: StatutSortie): number {
  if (statut === 'brouillon') return -1;
  if (statut === 'informations_a_corriger' || statut === 'refusee') return -1;
  return ETAPES_SUIVI.findIndex((etape) => etape.statut === statut);
}

/** Message actionnable : « ce qu'il vous reste à faire ». */
export function actionAttendue(statut: StatutSortie): string {
  switch (statut) {
    case 'brouillon':
      return 'Complétez votre brouillon puis soumettez-le pour vérification.';
    case 'informations_a_corriger':
      return 'Corrigez les éléments signalés, puis soumettez à nouveau votre demande.';
    case 'en_attente_verification':
      return 'Aucune action de votre part : notre équipe examine votre demande.';
    case 'validee':
      return 'Aucune action de votre part : nous préparons votre sortie.';
    case 'en_preparation':
      return 'Aucune action de votre part : la préparation est en cours.';
    case 'envoyee_plateformes':
      return 'Aucune action de votre part : les plateformes traitent votre sortie.';
    case 'publiee':
      return 'Votre sortie est en ligne. Pensez à partager le lien à votre public.';
    case 'refusee':
      return 'Contactez notre équipe pour connaître les solutions possibles.';
    default:
      return '';
  }
}

export const STATUTS_ABONNEMENT: Record<StatutAbonnement, DefinitionStatut> = {
  en_attente_paiement: {
    label: 'En attente de paiement',
    description: 'Votre abonnement sera actif dès que le paiement aura été vérifié.',
    ton: 'attention',
  },
  actif: {
    label: 'Actif',
    description: 'Votre abonnement est actif.',
    ton: 'succes',
  },
  expire: {
    label: 'Expiré',
    description: 'Votre abonnement est arrivé à échéance.',
    ton: 'neutre',
  },
  annule: {
    label: 'Annulé',
    description: 'Cet abonnement a été annulé.',
    ton: 'erreur',
  },
};

export const STATUTS_PAIEMENT: Record<StatutPaiement, DefinitionStatut> = {
  en_attente: {
    label: 'En attente',
    description: 'Le paiement n’a pas encore été transmis.',
    ton: 'neutre',
  },
  a_verifier: {
    label: 'À vérifier',
    description: 'Votre déclaration a été reçue. Notre équipe vérifie la réception du paiement.',
    ton: 'attention',
  },
  confirme: {
    label: 'Confirmé',
    description: 'Le paiement a été vérifié et confirmé.',
    ton: 'succes',
  },
  rejete: {
    label: 'Rejeté',
    description: 'Le paiement n’a pas pu être confirmé.',
    ton: 'erreur',
  },
};

export const MOYENS_PAIEMENT: Record<string, string> = {
  mobile_money: 'Mobile Money',
  virement: 'Virement bancaire',
  especes: 'Espèces',
  autre: 'Autre',
};

export const TYPES_SORTIE: Record<TypeSortie, string> = {
  single: 'Single (1 titre)',
  ep: 'EP (2 à 6 titres)',
  album: 'Album (7 titres et plus)',
};

export const TYPES_COMPTE: Record<TypeCompte, string> = {
  artiste_independant: 'Artiste indépendant',
  representant: 'Représentant d’artiste',
};

export function statutSortie(statut: string): DefinitionStatut {
  return STATUTS_SORTIE[statut as StatutSortie] ?? STATUTS_SORTIE.brouillon;
}

export function statutAbonnement(statut: string): DefinitionStatut {
  return STATUTS_ABONNEMENT[statut as StatutAbonnement] ?? STATUTS_ABONNEMENT.expire;
}

export function statutPaiement(statut: string): DefinitionStatut {
  return STATUTS_PAIEMENT[statut as StatutPaiement] ?? STATUTS_PAIEMENT.en_attente;
}

/** Vrai si l'abonnement est encore valable à cet instant. */
export function abonnementValide(
  abonnement: { statut: StatutAbonnement; fin: string | null } | null | undefined,
): boolean {
  if (!abonnement) return false;
  if (abonnement.statut !== 'actif') return false;
  if (!abonnement.fin) return true;
  return new Date(abonnement.fin).getTime() > Date.now();
}

/**
 * Statut réellement affiché : un abonnement « actif » dont la date de fin est
 * dépassée est considéré comme expiré, même si la base n'a pas encore été mise
 * à jour.
 */
export function statutAbonnementEffectif(
  abonnement: { statut: StatutAbonnement; fin: string | null } | null | undefined,
): StatutAbonnement | null {
  if (!abonnement) return null;
  if (abonnement.statut === 'actif' && abonnement.fin) {
    if (new Date(abonnement.fin).getTime() <= Date.now()) return 'expire';
  }
  return abonnement.statut;
}
