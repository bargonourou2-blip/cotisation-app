/**
 * =====================================================================
 *  CONFIGURATION CENTRALE DU SERVICE
 * =====================================================================
 *  C'est LE fichier à modifier pour changer :
 *   - le nom du service, le slogan, le logo
 *   - les coordonnées (e-mail, WhatsApp, adresse, réseaux sociaux)
 *   - les formules d'abonnement affichées par défaut
 *   - les moyens de paiement
 *
 *  ⚠️ IMPORTANT : les tarifs ci-dessous sont PROVISOIRES.
 *  Ils sont faciles à modifier ici, mais il est encore plus simple de les
 *  modifier depuis l'espace administrateur (/admin/formules) une fois la
 *  base de données configurée : la base fait foi pour le site public.
 *  Ce fichier sert de valeurs de secours (quand Supabase n'est pas encore
 *  configuré) et de modèle pour le script de démarrage SQL.
 * =====================================================================
 */

export type MoyenPaiement = 'mobile_money' | 'virement' | 'especes' | 'autre';

export interface FormuleAbonnement {
  /** Identifiant technique stable utilisé dans la base de données. */
  code: string;
  nom: string;
  description: string;
  /** Prix en francs CFA (nombre entier, sans espace). */
  prixFcfa: number;
  /** Durée de l'abonnement en jours (30 = 1 mois). */
  dureeJours: number;
  avantages: string[];
  /** Met la carte en avant sur la page d'accueil. Une seule formule conseillée. */
  misEnAvant?: boolean;
  /** Petit badge affiché sur la carte, par exemple « Le plus choisi ». */
  badge?: string | null;
  actif: boolean;
  ordre: number;
}

export const site = {
  /**
   * Nom provisoire du service. Changez-le ici, il est utilisé partout.
   */
  nom: 'ARTIST DISTRIBUTION',
  nomCourt: 'Artist Distribution',
  slogan: 'Votre musique mérite d’aller plus loin.',
  baseline:
    'La plateforme qui accompagne les artistes africains de l’inscription à la mise en ligne de leur musique.',
  description:
    'ARTIST DISTRIBUTION accompagne les artistes indépendants dans la préparation, la soumission et le suivi de leurs sorties musicales sur les plateformes de streaming.',

  /** Logo affiché dans l'en-tête. Laissez `image` vide pour utiliser le monogramme. */
  logo: {
    image: '', // ex. '/logo.svg' — placez votre fichier dans le dossier /public
    monogramme: 'AD',
  },

  contact: {
    email: 'contact@artistdistribution.example', // À REMPLACER avant le lancement
    telephone: '', // ex. '+226 25 00 00 00' — laissez vide si inconnu
    whatsapp: '', // ex. '+226 70 00 00 00' — laissez vide si inconnu
    adresse: 'Ouagadougou, Burkina Faso',
    horaires: 'Lundi – samedi, 9 h – 18 h (GMT)',
  },

  reseauxSociaux: {
    facebook: '', // ex. 'https://facebook.com/votrepage'
    instagram: '',
    tiktok: '',
    youtube: '',
  },

  legal: {
    raisonSociale: 'ARTIST DISTRIBUTION',
    pays: 'Burkina Faso',
    /** Date de dernière mise à jour des pages légales (format JJ/MM/AAAA). */
    miseAJour: '24/10/2026',
    /** À compléter avant le lancement public (obligatoire pour le commerce en ligne). */
    numeroIdentifiant: '', // IFU / RCCM par exemple
    /**
     * Affiche un avertissement sur les pages légales tant qu'elles n'ont pas
     * été relues et complétées. Passez à false avant le lancement public.
     */
    documentProvisoire: true,
  },

  /**
   * Indicateur affiché sous les formules. Passez à false quand les tarifs
   * définitifs sont validés.
   */
  tarifsProvisoires: true,

  /** Délai de réponse indicatif affiché sur la page d'accueil. */
  delaiReponse: 'sous 48 h ouvrées',
};

/**
 * Formules affichées par défaut.
 * ⚠️ TARIFS ET DURÉES PROVISOIRES — à valider avant toute mise en ligne.
 */
export const formulesParDefaut: FormuleAbonnement[] = [
  {
    code: 'essentiel',
    nom: 'Essentiel',
    description: 'Pour faire vos premiers pas et présenter votre premier projet.',
    prixFcfa: 5000,
    dureeJours: 30,
    avantages: [
      'Un espace artiste personnel',
      'Soumission de vos sorties musicales',
      'Suivi du statut de chaque demande',
      'Assistance par e-mail',
    ],
    actif: true,
    ordre: 1,
  },
  {
    code: 'artiste',
    nom: 'Artiste',
    description: 'La formule pensée pour les artistes qui sortent régulièrement.',
    prixFcfa: 13500,
    dureeJours: 90,
    avantages: [
      'Tout ce que contient la formule Essentiel',
      'Accompagnement à la préparation des crédits',
      'Suivi prioritaire des demandes',
      'Assistance par WhatsApp',
    ],
    misEnAvant: true,
    badge: 'Recommandée',
    actif: true,
    ordre: 2,
  },
  {
    code: 'professionnel',
    nom: 'Professionnel',
    description: 'Pour les artistes et équipes qui gèrent plusieurs projets.',
    prixFcfa: 48000,
    dureeJours: 365,
    avantages: [
      'Tout ce que contient la formule Artiste',
      'Gestion de plusieurs projets en parallèle',
      'Échanges réguliers avec notre équipe',
      'Assistance prioritaire',
    ],
    actif: true,
    ordre: 3,
  },
];

/**
 * Paiement.
 * ---------------------------------------------------------------------
 * Aucun prestataire n'est branché par défaut : le site l'indique
 * clairement et n'active JAMAIS un abonnement automatiquement.
 *
 * `manuel.actif = true` : l'artiste peut déclarer un paiement
 *   (Mobile Money, virement, espèces) ; un administrateur vérifie la
 *   réception réelle de l'argent avant d'activer l'abonnement.
 *
 * `enLigne.actif = false` : aucun prestataire en ligne n'est configuré.
 *   Voir `src/lib/paiements/README.md` pour brancher un prestataire
 *   compatible avec le Burkina Faso (CinetPay, Orange Money, etc.)
 */
export const paiement = {
  devise: 'FCFA',
  codeDevise: 'XOF',
  enLigne: {
    actif: false,
    nomPrestataire: '',
  },
  manuel: {
    actif: true,
    /** Instructions affichées à l'artiste qui déclare un paiement. */
    instructions:
      'Contactez notre équipe pour connaître les coordonnées de paiement Mobile Money à jour. Indiquez ensuite la référence exacte de votre transaction : votre abonnement sera activé après vérification par notre équipe.',
    moyens: [
      { code: 'mobile_money', label: 'Mobile Money (Orange / Moov)' },
      { code: 'virement', label: 'Virement bancaire' },
      { code: 'especes', label: 'Espèces (en agence)' },
      { code: 'autre', label: 'Autre moyen' },
    ] as Array<{ code: MoyenPaiement; label: string }>,
    /** Délai indicatif de vérification d'un paiement manuel. */
    delaiVerification: 'sous 48 h ouvrées',
  },
} as const;

/**
 * Plateformes de diffusion visées.
 * Phrase volontairement prudente : aucune promesse de mise en ligne automatique.
 */
export const plateformes = [
  'Spotify',
  'Apple Music',
  'YouTube Music',
  'Deezer',
  'Boomplay',
  'Audiomack',
];

/** Aide à la décision : durée d'accès minimale pour soumettre une sortie. */
export const abonnementRequisPourSoumettre = true;
