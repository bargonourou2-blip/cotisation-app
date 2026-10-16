/* ==========================================================================
   BâtiPlus — backend : base SQLite (node:sqlite, sans ORM)
   WAL + clés étrangères ; requêtes TOUJOURS préparées avec des « ? ».
   Garde-fous dans la base elle-même :
   - référence de paiement UNIQUE, un abonnement au plus par paiement (paiement_id UNIQUE) ;
   - un statut final ne change plus jamais (seul payé → remboursé est permis) ;
   - le journal d'activités est en écriture seule : ni modification, ni suppression d'une
     ligne de moins de 12 mois (durée de conservation annoncée dans la confidentialité) ;
   - les données d'un électricien (devis, chantiers, clients, catalogue, appareils) sont
     supprimées en cascade avec lui ; ses paiements, eux, sont conservés 10 ans.
   Évolution du schéma : PRAGMA user_version (1 = étape 12, 2 = étape 14).
   ========================================================================== */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const VERSION_SCHEMA = 2;

export const STATUTS = Object.freeze({
  attente: "en_attente",
  paye: "payé",
  echoue: "échoué",
  annule: "annulé",
  expire: "expiré",
  anomalie: "anomalie",
  rembourse: "remboursé"
});
export const STATUTS_FINAUX = Object.freeze([STATUTS.paye, STATUTS.echoue, STATUTS.annule, STATUTS.expire, STATUTS.anomalie, STATUTS.rembourse]);

const LISTE_STATUTS = Object.values(STATUTS).map((s) => "'" + s + "'").join(", ");
const LISTE_FINAUX = STATUTS_FINAUX.map((s) => "'" + s + "'").join(", ");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS electriciens (
  id INTEGER PRIMARY KEY,
  compte_id TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  telephone TEXT NOT NULL UNIQUE,
  email TEXT,
  metier TEXT NOT NULL DEFAULT 'electricien' CHECK (metier = 'electricien'),
  formule TEXT NOT NULL DEFAULT 'gratuit',
  abonne_depuis TEXT,
  abonne_jusqu TEXT,
  renouvellement_auto INTEGER NOT NULL DEFAULT 0 CHECK (renouvellement_auto IN (0, 1)),
  carte_client TEXT,
  carte_moyen TEXT,
  version_session INTEGER NOT NULL DEFAULT 1,
  suspendu INTEGER NOT NULL DEFAULT 0 CHECK (suspendu IN (0, 1)),
  cree_le TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id),
  formule TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  devise TEXT NOT NULL,
  fournisseur TEXT NOT NULL,
  moyen TEXT,
  id_fournisseur TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN (${LISTE_STATUTS})),
  cle_idempotence TEXT NOT NULL UNIQUE,
  secret_notification TEXT,
  donnees_brutes TEXT,
  cree_le TEXT NOT NULL,
  paye_le TEXT,
  maj_le TEXT NOT NULL,
  verifie_le TEXT
);
CREATE INDEX IF NOT EXISTS paiements_statut ON paiements (statut, cree_le);
CREATE INDEX IF NOT EXISTS paiements_fournisseur ON paiements (fournisseur, id_fournisseur);
CREATE INDEX IF NOT EXISTS paiements_electricien ON paiements (electricien_id, cree_le);
CREATE TABLE IF NOT EXISTS abonnements (
  id INTEGER PRIMARY KEY,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id),
  formule TEXT NOT NULL,
  debut TEXT NOT NULL,
  fin TEXT,
  source TEXT NOT NULL,
  paiement_id INTEGER UNIQUE REFERENCES paiements(id),
  cree_le TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS abonnements_electricien ON abonnements (electricien_id, cree_le);
CREATE TABLE IF NOT EXISTS activites (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  electricien_id INTEGER,
  ip TEXT,
  action TEXT NOT NULL,
  details TEXT
);
CREATE INDEX IF NOT EXISTS activites_action ON activites (action, date);
CREATE INDEX IF NOT EXISTS activites_electricien ON activites (electricien_id, date);

CREATE TABLE IF NOT EXISTS appareils (
  id INTEGER PRIMARY KEY,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id) ON DELETE CASCADE,
  empreinte TEXT NOT NULL,
  nom TEXT NOT NULL DEFAULT '',
  cree_le TEXT NOT NULL,
  vu_le TEXT NOT NULL,
  revoque_le TEXT,
  UNIQUE (electricien_id, empreinte)
);
CREATE TABLE IF NOT EXISTS devis (
  id INTEGER PRIMARY KEY,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  numero TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL DEFAULT 'brouillon',
  client TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  donnees TEXT,
  cree_le TEXT NOT NULL,
  mois TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  version INTEGER NOT NULL,
  supprime INTEGER NOT NULL DEFAULT 0 CHECK (supprime IN (0, 1)),
  hors_ligne INTEGER NOT NULL DEFAULT 0 CHECK (hors_ligne IN (0, 1)),
  appareil_id INTEGER,
  UNIQUE (electricien_id, uid)
);
CREATE INDEX IF NOT EXISTS devis_version ON devis (electricien_id, version);
CREATE INDEX IF NOT EXISTS devis_mois ON devis (electricien_id, mois);
CREATE TABLE IF NOT EXISTS chantiers (
  id INTEGER PRIMARY KEY,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  nom TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL DEFAULT 'brouillon',
  donnees TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  version INTEGER NOT NULL,
  supprime INTEGER NOT NULL DEFAULT 0 CHECK (supprime IN (0, 1)),
  appareil_id INTEGER,
  UNIQUE (electricien_id, uid)
);
CREATE INDEX IF NOT EXISTS chantiers_version ON chantiers (electricien_id, version);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  nom TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  donnees TEXT,
  cree_le TEXT NOT NULL,
  modifie_le TEXT NOT NULL,
  version INTEGER NOT NULL,
  supprime INTEGER NOT NULL DEFAULT 0 CHECK (supprime IN (0, 1)),
  appareil_id INTEGER,
  UNIQUE (electricien_id, uid)
);
CREATE INDEX IF NOT EXISTS clients_version ON clients (electricien_id, version);
CREATE TABLE IF NOT EXISTS catalogue (
  id INTEGER PRIMARY KEY,
  electricien_id INTEGER NOT NULL REFERENCES electriciens(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  rang INTEGER NOT NULL,
  designation TEXT NOT NULL,
  unite TEXT NOT NULL,
  categorie TEXT NOT NULL,
  choisi INTEGER,
  UNIQUE (electricien_id, ref)
);
CREATE TABLE IF NOT EXISTS fournisseurs (
  id INTEGER PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES catalogue(id) ON DELETE CASCADE,
  rang INTEGER NOT NULL,
  nom TEXT NOT NULL,
  prix REAL NOT NULL CHECK (prix >= 0),
  UNIQUE (article_id, rang)
);
CREATE TABLE IF NOT EXISTS codes_activation (
  id INTEGER PRIMARY KEY,
  empreinte TEXT NOT NULL UNIQUE,
  formule TEXT NOT NULL CHECK (formule IN ('semaine', 'mensuel', 'annuel', 'vie')),
  cree_le TEXT NOT NULL,
  expire_le TEXT NOT NULL,
  motif TEXT NOT NULL,
  utilise_par INTEGER REFERENCES electriciens(id) ON DELETE SET NULL,
  utilise_le TEXT,
  revoque_le TEXT
);
CREATE TABLE IF NOT EXISTS blocages (
  cle TEXT PRIMARY KEY,
  echecs INTEGER NOT NULL DEFAULT 0,
  jusqu INTEGER NOT NULL DEFAULT 0,
  maj_le TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS activites_sans_modification BEFORE UPDATE ON activites
BEGIN SELECT RAISE(ABORT, 'journal en lecture seule'); END;
CREATE TRIGGER IF NOT EXISTS activites_sans_suppression_12_mois BEFORE DELETE ON activites
WHEN OLD.date > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-365 days')
BEGIN SELECT RAISE(ABORT, 'journal en lecture seule'); END;
CREATE TRIGGER IF NOT EXISTS paiements_statut_final BEFORE UPDATE OF statut ON paiements
WHEN OLD.statut IN (${LISTE_FINAUX}) AND NEW.statut <> OLD.statut AND NOT (OLD.statut = 'payé' AND NEW.statut = 'remboursé')
BEGIN SELECT RAISE(ABORT, 'statut final'); END;
CREATE TRIGGER IF NOT EXISTS paiements_montant_fige BEFORE UPDATE OF montant, devise, formule, reference, electricien_id ON paiements
BEGIN SELECT RAISE(ABORT, 'paiement figé'); END;
`;

export function ouvrirBase(chemin) {
  if (chemin !== ":memory:") mkdirSync(dirname(chemin), { recursive: true, mode: 0o700 });
  const base = new DatabaseSync(chemin);
  base.exec("PRAGMA journal_mode = WAL;");
  base.exec("PRAGMA foreign_keys = ON;");
  base.exec("PRAGMA busy_timeout = 5000;");
  base.exec("PRAGMA synchronous = NORMAL;");
  base.exec(SCHEMA);
  migrer(base);
  return base;
}

/* Colonnes ajoutées à l'étape 14 (comptes, profil, synchronisation). Chaque instruction est
   une constante littérale ; seules celles dont la colonne manque sont exécutées. */
const COLONNES_ETAPE_14 = Object.freeze([
  ["entreprise", "ALTER TABLE electriciens ADD COLUMN entreprise TEXT NOT NULL DEFAULT ''"],
  ["ville", "ALTER TABLE electriciens ADD COLUMN ville TEXT NOT NULL DEFAULT ''"],
  ["pays", "ALTER TABLE electriciens ADD COLUMN pays TEXT NOT NULL DEFAULT 'BF'"],
  ["devise", "ALTER TABLE electriciens ADD COLUMN devise TEXT NOT NULL DEFAULT 'XOF'"],
  ["code_hash", "ALTER TABLE electriciens ADD COLUMN code_hash TEXT"],
  ["code_sel", "ALTER TABLE electriciens ADD COLUMN code_sel TEXT"],
  ["conditions", "ALTER TABLE electriciens ADD COLUMN conditions TEXT NOT NULL DEFAULT ''"],
  ["photo", "ALTER TABLE electriciens ADD COLUMN photo TEXT NOT NULL DEFAULT ''"],
  ["logo", "ALTER TABLE electriciens ADD COLUMN logo TEXT NOT NULL DEFAULT ''"],
  ["main_oeuvre", "ALTER TABLE electriciens ADD COLUMN main_oeuvre TEXT"],
  ["catalogue_perso", "ALTER TABLE electriciens ADD COLUMN catalogue_perso INTEGER NOT NULL DEFAULT 0"],
  ["seq", "ALTER TABLE electriciens ADD COLUMN seq INTEGER NOT NULL DEFAULT 0"],
  ["profil_version", "ALTER TABLE electriciens ADD COLUMN profil_version INTEGER NOT NULL DEFAULT 0"],
  ["catalogue_version", "ALTER TABLE electriciens ADD COLUMN catalogue_version INTEGER NOT NULL DEFAULT 0"],
  ["profil_modifie_le", "ALTER TABLE electriciens ADD COLUMN profil_modifie_le TEXT"],
  ["catalogue_modifie_le", "ALTER TABLE electriciens ADD COLUMN catalogue_modifie_le TEXT"],
  ["motif_suspension", "ALTER TABLE electriciens ADD COLUMN motif_suspension TEXT"],
  ["supprime_le", "ALTER TABLE electriciens ADD COLUMN supprime_le TEXT"],
  ["derniere_activite", "ALTER TABLE electriciens ADD COLUMN derniere_activite TEXT"]
]);

function migrer(base) {
  const version = base.prepare("PRAGMA user_version").get().user_version;
  if (version >= VERSION_SCHEMA) return;
  const presentes = new Set(base.prepare("SELECT name FROM pragma_table_info('electriciens')").all().map((c) => c.name));
  base.exec("BEGIN IMMEDIATE");
  try {
    for (const [colonne, instruction] of COLONNES_ETAPE_14) if (!presentes.has(colonne)) base.exec(instruction);
    base.exec("DROP TRIGGER IF EXISTS activites_sans_suppression");
    base.exec("PRAGMA user_version = 2");
    base.exec("COMMIT");
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
}

/* Transaction SQL synchrone : tout ou rien. BEGIN IMMEDIATE prend le verrou d'écriture
   tout de suite (deux notifications simultanées ne peuvent pas lire le même état). */
export function enTransaction(base, travail) {
  base.exec("BEGIN IMMEDIATE");
  try {
    const resultat = travail();
    base.exec("COMMIT");
    return resultat;
  } catch (erreur) {
    base.exec("ROLLBACK");
    throw erreur;
  }
}

/* Journal d'audit (table activites, écriture seule). Jamais de code, de sel, de jeton ni de clé. */
export function journaliser(base, action, { electricienId = null, ip = null, details = null } = {}) {
  base.prepare("INSERT INTO activites (date, electricien_id, ip, action, details) VALUES (?, ?, ?, ?, ?)")
    .run(new Date().toISOString(), electricienId, ip ? String(ip).slice(0, 64) : null, action, details === null ? null : JSON.stringify(details).slice(0, 2000));
}
