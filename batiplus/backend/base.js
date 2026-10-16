/* ==========================================================================
   BâtiPlus — backend : base SQLite (node:sqlite, sans ORM)
   WAL + clés étrangères ; requêtes TOUJOURS préparées avec des « ? ».
   Garde-fous dans la base elle-même :
   - référence de paiement UNIQUE, un abonnement au plus par paiement (paiement_id UNIQUE) ;
   - un statut final ne change plus jamais (seul payé → remboursé est permis) ;
   - le journal d'activités est en écriture seule (ni modification ni suppression).
   ========================================================================== */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
CREATE TRIGGER IF NOT EXISTS activites_sans_modification BEFORE UPDATE ON activites
BEGIN SELECT RAISE(ABORT, 'journal en lecture seule'); END;
CREATE TRIGGER IF NOT EXISTS activites_sans_suppression BEFORE DELETE ON activites
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
  return base;
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
