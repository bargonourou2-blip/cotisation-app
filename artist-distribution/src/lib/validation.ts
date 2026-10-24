import { z } from 'zod';

/**
 * Schémas de validation partagés.
 * Chaque Server Action revalide les données : on ne fait jamais confiance
 * au navigateur, même quand le formulaire est déjà validé côté client.
 */

export type EtatFormulaire = {
  statut: 'initial' | 'erreur' | 'succes';
  message?: string;
  erreursChamps?: Record<string, string>;
};

export const etatInitial: EtatFormulaire = { statut: 'initial' };

/** Transforme les erreurs Zod en objet simple { champ: message }. */
export function erreursParChamp(erreur: z.ZodError): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const probleme of erreur.issues) {
    const champ = probleme.path.join('.') || '_';
    if (!resultat[champ]) resultat[champ] = probleme.message;
  }
  return resultat;
}

/** Chaîne vide → null (utile pour les colonnes facultatives). */
export function videEnNull(valeur: FormDataEntryValue | null | undefined): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return propre === '' ? null : propre;
}

export function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === 'string' ? valeur.trim() : '';
}

const telephone = z
  .string()
  .trim()
  .min(8, 'Indiquez un numéro joignable (au moins 8 chiffres).')
  .max(30, 'Le numéro est trop long.')
  .regex(/^[0-9+()\s.-]+$/, 'Le numéro contient des caractères non autorisés.');

const motDePasse = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(72, 'Le mot de passe ne doit pas dépasser 72 caractères.')
  .regex(/[A-Za-z]/, 'Ajoutez au moins une lettre.')
  .regex(/[0-9]/, 'Ajoutez au moins un chiffre.');

export const schemaInscription = z
  .object({
    nom_complet: z
      .string()
      .trim()
      .min(2, 'Indiquez votre nom complet.')
      .max(120, 'Le nom est trop long.'),
    nom_artiste: z
      .string()
      .trim()
      .min(2, 'Indiquez votre nom d’artiste.')
      .max(120, 'Le nom d’artiste est trop long.'),
    email: z.string().trim().toLowerCase().email('Cette adresse e-mail n’est pas valide.'),
    telephone,
    pays: z.string().trim().min(2, 'Choisissez votre pays.').max(80),
    type_compte: z.enum(['artiste_independant', 'representant'], {
      errorMap: () => ({ message: 'Choisissez un type de compte.' }),
    }),
    mot_de_passe: motDePasse,
    confirmation: z.string(),
    conditions: z.literal('oui', {
      errorMap: () => ({ message: 'Vous devez accepter les conditions pour continuer.' }),
    }),
  })
  .refine((valeurs) => valeurs.mot_de_passe === valeurs.confirmation, {
    path: ['confirmation'],
    message: 'Les deux mots de passe ne correspondent pas.',
  });

export const schemaConnexion = z.object({
  email: z.string().trim().toLowerCase().email('Cette adresse e-mail n’est pas valide.'),
  mot_de_passe: z.string().min(1, 'Saisissez votre mot de passe.'),
});

export const schemaEmail = z.object({
  email: z.string().trim().toLowerCase().email('Cette adresse e-mail n’est pas valide.'),
});

export const schemaNouveauMotDePasse = z
  .object({
    mot_de_passe: motDePasse,
    confirmation: z.string(),
  })
  .refine((valeurs) => valeurs.mot_de_passe === valeurs.confirmation, {
    path: ['confirmation'],
    message: 'Les deux mots de passe ne correspondent pas.',
  });

export const schemaProfil = z.object({
  nom_complet: z.string().trim().min(2, 'Indiquez votre nom complet.').max(120),
  nom_artiste: z.string().trim().min(2, 'Indiquez votre nom d’artiste.').max(120),
  telephone,
  pays: z.string().trim().min(2, 'Choisissez votre pays.').max(80),
  type_compte: z.enum(['artiste_independant', 'representant']),
});

const texteFacultatif = (max: number, message: string) =>
  z.string().trim().max(max, message).optional().default('');

export const schemaSortie = z.object({
  titre: z
    .string()
    .trim()
    .min(2, 'Indiquez le titre de votre sortie.')
    .max(160, 'Le titre est trop long (160 caractères maximum).'),
  type_sortie: z.enum(['single', 'ep', 'album'], {
    errorMap: () => ({ message: 'Choisissez le type de sortie.' }),
  }),
  artiste_principal: z
    .string()
    .trim()
    .min(2, 'Indiquez le nom de l’artiste principal.')
    .max(160),
  artistes_invites: texteFacultatif(500, 'Trop long (500 caractères maximum).'),
  genre: texteFacultatif(80, 'Trop long (80 caractères maximum).'),
  langue: texteFacultatif(80, 'Trop long (80 caractères maximum).'),
  date_sortie_souhaitee: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date de sortie.')
    .or(z.literal('')),
  infos_production: texteFacultatif(3000, 'Trop long (3000 caractères maximum).'),
  auteurs_compositeurs: texteFacultatif(3000, 'Trop long (3000 caractères maximum).'),
  credits: texteFacultatif(5000, 'Trop long (5000 caractères maximum).'),
  liste_titres: texteFacultatif(3000, 'Trop long (3000 caractères maximum).'),
});

export const schemaPaiementManuel = z.object({
  moyen: z.enum(['mobile_money', 'virement', 'especes', 'autre'], {
    errorMap: () => ({ message: 'Choisissez un moyen de paiement.' }),
  }),
  reference: z
    .string()
    .trim()
    .min(3, 'Indiquez la référence de votre paiement.')
    .max(120, 'La référence est trop longue.'),
  telephone_payeur: z
    .string()
    .trim()
    .max(30, 'Le numéro est trop long.')
    .optional()
    .default(''),
  note_client: z
    .string()
    .trim()
    .max(1000, 'Le message est trop long (1000 caractères maximum).')
    .optional()
    .default(''),
});

export const schemaFormule = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,40}$/, 'Utilisez uniquement des lettres minuscules, chiffres, - ou _.'),
  nom: z.string().trim().min(2, 'Indiquez un nom.').max(60),
  description: z.string().trim().max(300, 'Description trop longue.').optional().default(''),
  prix_fcfa: z.coerce
    .number({ invalid_type_error: 'Indiquez un prix en nombre entier.' })
    .int('Le prix doit être un nombre entier.')
    .min(1, 'Le prix doit être supérieur à 0.')
    .max(10_000_000, 'Prix trop élevé.'),
  duree_jours: z.coerce
    .number({ invalid_type_error: 'Indiquez une durée en nombre de jours.' })
    .int('La durée doit être un nombre entier de jours.')
    .min(1, 'La durée doit être d’au moins 1 jour.')
    .max(3660, 'Durée trop longue.'),
  avantages: z.string().max(2000, 'Liste trop longue.').optional().default(''),
  badge: z.string().trim().max(40).optional().default(''),
  mis_en_avant: z.enum(['oui', 'non']).optional().default('non'),
  actif: z.enum(['oui', 'non']).optional().default('oui'),
  ordre: z.coerce.number().int().min(0).max(999).optional().default(0),
});

export const schemaStatutSortie = z.object({
  statut: z.enum([
    'brouillon',
    'en_attente_verification',
    'informations_a_corriger',
    'validee',
    'en_preparation',
    'envoyee_plateformes',
    'publiee',
    'refusee',
  ]),
  commentaire: z.string().trim().max(2000, 'Commentaire trop long.').optional().default(''),
});

/** Découpe une liste de lignes (textarea) en tableau propre. */
export function lignesEnTableau(valeur: string | null | undefined): string[] {
  if (!valeur) return [];
  return valeur
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .slice(0, 20);
}
