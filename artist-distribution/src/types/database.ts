/**
 * Types de la base de données.
 * Ils reprennent exactement les tables créées dans
 * `supabase/migrations/20261024000000_initial.sql`.
 *
 * Si vous modifiez une table, pensez à mettre à jour ce fichier.
 * (Vous pouvez aussi générer ces types automatiquement :
 *  `npx supabase gen types typescript --project-id VOTRE_ID > src/types/database.ts`)
 */

export type Role = 'artiste' | 'admin';
export type TypeCompte = 'artiste_independant' | 'representant';
export type StatutAbonnement = 'en_attente_paiement' | 'actif' | 'expire' | 'annule';
export type StatutPaiement = 'en_attente' | 'a_verifier' | 'confirme' | 'rejete';
export type MoyenPaiementCode = 'mobile_money' | 'virement' | 'especes' | 'autre';
export type TypeSortie = 'single' | 'ep' | 'album';
export type StatutSortie =
  | 'brouillon'
  | 'en_attente_verification'
  | 'informations_a_corriger'
  | 'validee'
  | 'en_preparation'
  | 'envoyee_plateformes'
  | 'publiee'
  | 'refusee';

export type Profil = {
  id: string;
  email: string;
  nom_complet: string;
  nom_artiste: string;
  telephone: string;
  pays: string;
  type_compte: TypeCompte;
  formule_souhaitee: string | null;
  role: Role;
  conditions_acceptees_le: string;
  created_at: string;
  updated_at: string;
};

export type FormuleBD = {
  id: string;
  code: string;
  nom: string;
  description: string;
  prix_fcfa: number;
  duree_jours: number;
  avantages: string[];
  badge: string | null;
  mis_en_avant: boolean;
  actif: boolean;
  ordre: number;
  created_at: string;
  updated_at: string;
};

export type Abonnement = {
  id: string;
  user_id: string;
  plan_id: string | null;
  plan_code: string;
  plan_nom: string;
  prix_fcfa: number;
  duree_jours: number;
  statut: StatutAbonnement;
  debut: string | null;
  fin: string | null;
  created_at: string;
  updated_at: string;
};

export type Paiement = {
  id: string;
  user_id: string;
  subscription_id: string;
  montant_fcfa: number;
  devise: string;
  moyen: MoyenPaiementCode;
  prestataire: string;
  reference_paiement: string | null;
  telephone_payeur: string | null;
  note_client: string | null;
  statut: StatutPaiement;
  note_admin: string | null;
  confirme_par: string | null;
  confirme_le: string | null;
  created_at: string;
  updated_at: string;
};

export type Sortie = {
  id: string;
  user_id: string;
  titre: string;
  type_sortie: TypeSortie;
  artiste_principal: string;
  artistes_invites: string | null;
  genre: string | null;
  langue: string | null;
  date_sortie_souhaitee: string | null;
  infos_production: string | null;
  auteurs_compositeurs: string | null;
  credits: string | null;
  liste_titres: string | null;
  pochette_path: string | null;
  audio_path: string | null;
  statut: StatutSortie;
  motif_action: string | null;
  soumis_le: string | null;
  publiee_le: string | null;
  created_at: string;
  updated_at: string;
};

export type EvenementSortie = {
  id: string;
  release_id: string;
  statut: string;
  commentaire: string | null;
  auteur_id: string | null;
  created_at: string;
};

export type ActionAdmin = {
  id: string;
  admin_id: string | null;
  action: string;
  cible: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------
// Type attendu par supabase-js
// ---------------------------------------------------------------------
type Ligne<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Ligne<Profil>;
      subscription_plans: Ligne<FormuleBD>;
      subscriptions: Ligne<Abonnement>;
      payments: Ligne<Paiement>;
      releases: Ligne<Sortie>;
      release_events: Ligne<EvenementSortie>;
      admin_actions: Ligne<ActionAdmin>;
    };
    Views: Record<string, never>;
    Functions: {
      est_admin: { Args: Record<string, never>; Returns: boolean };
      creer_abonnement: { Args: { p_plan_code: string }; Returns: string };
      declarer_paiement_manuel: {
        Args: {
          p_subscription_id: string;
          p_moyen: string;
          p_reference: string;
          p_telephone?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      admin_confirmer_paiement: {
        Args: { p_payment_id: string; p_note?: string | null };
        Returns: undefined;
      };
      admin_rejeter_paiement: {
        Args: { p_payment_id: string; p_note: string };
        Returns: undefined;
      };
      admin_annuler_abonnement: {
        Args: { p_subscription_id: string; p_note?: string | null };
        Returns: undefined;
      };
      admin_statut_sortie: {
        Args: { p_release_id: string; p_statut: string; p_commentaire?: string | null };
        Returns: undefined;
      };
      expirer_abonnements: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ClientBD = Database['public'];
