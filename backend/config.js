/* ==========================================================================
   BâtiPlus — backend : configuration (.env du backend UNIQUEMENT)
   Le backend REFUSE DE DÉMARRER si un secret manque, est faible ou garde une valeur
   d'exemple, si une clé d'agrégateur manque, si le code administrateur n'est pas haché,
   ou si la production est réglée sur la simulation / le mode test.
   Aucun message d'erreur ne contient la valeur d'un secret : seulement son nom.
   ========================================================================== */
import { createPrivateKey, createPublicKey } from "node:crypto";
import { lireHachageAdmin } from "./codes.js";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const FOURNISSEURS = Object.freeze(["ligdicash", "cinetpay", "fedapay", "paydunya", "stripe", "simulation"]);

/* Clés exigées pour chaque agrégateur (noms des variables du .env). */
export const CLES_FOURNISSEUR = Object.freeze({
  ligdicash: Object.freeze(["LIGDICASH_API_KEY", "LIGDICASH_AUTH_TOKEN"]),
  cinetpay: Object.freeze(["CINETPAY_API_KEY", "CINETPAY_API_PASSWORD"]),
  fedapay: Object.freeze(["FEDAPAY_SECRET_KEY", "FEDAPAY_WEBHOOK_SECRET"]),
  paydunya: Object.freeze(["PAYDUNYA_MASTER_KEY", "PAYDUNYA_PRIVATE_KEY", "PAYDUNYA_TOKEN"]),
  stripe: Object.freeze(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]),
  simulation: Object.freeze(["SIMULATION_SECRET"])
});

export class ErreurConfiguration extends Error {
  constructor(problemes) {
    super("Configuration refusée :\n  - " + problemes.join("\n  - "));
    this.problemes = problemes;
  }
}

/* Lecture d'un fichier .env sans dépendance : CLE=valeur, # commentaire, guillemets facultatifs. */
export function lireFichierEnv(chemin) {
  const valeurs = {};
  if (!chemin || !existsSync(chemin)) return valeurs;
  for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith("#")) continue;
    const egal = propre.indexOf("=");
    if (egal < 1) continue;
    const cle = propre.slice(0, egal).trim();
    let valeur = propre.slice(egal + 1).trim();
    if ((valeur.startsWith("\"") && valeur.endsWith("\"")) || (valeur.startsWith("'") && valeur.endsWith("'"))) valeur = valeur.slice(1, -1);
    if (/^[A-Z][A-Z0-9_]*$/.test(cle)) valeurs[cle] = valeur;
  }
  return valeurs;
}

/* Valeur d'exemple ou de remplissage : refusée pour tout secret (C.1). */
const EXEMPLE = /exemple|example|changez|change-?me|remplacer|votre[-_ ]?(?:cle|secret|code)|xxxx|^(.)\1+$/i;
/* Secret trop peu varié (« a1a1a1… », « 000… ») : moins de 10 caractères distincts. */
const peuVarie = (valeur) => new Set(valeur).size < 10;

/* Origines de l'application mobile (Capacitor) : déclarées explicitement, jamais « * ». */
const ORIGINES_MOBILES = Object.freeze(["capacitor://localhost"]);

function adresseLocale(url) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
}

function lireUrl(texte) {
  try {
    const url = new URL(texte);
    return url.username || url.password ? null : url;
  } catch (erreur) {
    return null;
  }
}

/* env : valeurs déjà fusionnées (.env + environnement). dossier : base des chemins relatifs. */
export function chargerConfig(env, dossier) {
  const problemes = [];
  const production = env.NODE_ENV === "production";
  const texte = (nom) => (typeof env[nom] === "string" ? env[nom].trim() : "");

  const urlPublique = lireUrl(texte("URL_PUBLIQUE"));
  if (!urlPublique) problemes.push("URL_PUBLIQUE manquante ou invalide");
  else if (urlPublique.protocol !== "https:" && (production || !adresseLocale(urlPublique))) problemes.push("URL_PUBLIQUE doit être en https (http accepté seulement pour localhost hors production)");

  const origines = texte("ORIGINES_AUTORISEES").split(",").map((o) => o.trim()).filter(Boolean);
  if (!origines.length) problemes.push("ORIGINES_AUTORISEES manquante (ex. https://localhost,https://batiplus.bf)");
  if (origines.some((o) => o === "*" || o.includes("*"))) problemes.push("ORIGINES_AUTORISEES ne peut pas contenir « * »");
  if (origines.some((o) => { if (ORIGINES_MOBILES.includes(o)) return false; const u = lireUrl(o); return !u || u.origin !== o; })) problemes.push("ORIGINES_AUTORISEES : chaque origine doit être de la forme https://domaine (sans chemin)");

  const jetonSecret = texte("JETON_SECRET");
  if (!/^[a-f0-9]{64,}$/i.test(jetonSecret)) problemes.push("JETON_SECRET manquant ou trop court (64 caractères hexadécimaux : openssl rand -hex 32)");
  const webhookSecret = texte("WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(webhookSecret)) problemes.push("WEBHOOK_SECRET manquant ou trop court (32 caractères au moins : openssl rand -hex 32)");
  if (jetonSecret && jetonSecret === webhookSecret) problemes.push("JETON_SECRET et WEBHOOK_SECRET doivent être différents");
  for (const nom of ["JETON_SECRET", "WEBHOOK_SECRET", "SAUVEGARDE_CLE"]) if (texte(nom) && (EXEMPLE.test(texte(nom)) || peuVarie(texte(nom)))) problemes.push(nom + " garde une valeur d'exemple ou trop peu variée");

  const adminCode = lireHachageAdmin(texte("ADMIN_CODE_HASH"));
  if (!adminCode) problemes.push("ADMIN_CODE_HASH manquant ou invalide (node outils/hacher-code-admin.mjs) — jamais le code en clair");
  const adminIps = texte("ADMIN_IPS").split(",").map((ip) => ip.trim()).filter(Boolean);
  if (adminIps.some((ip) => !/^[0-9a-f:.]{2,45}$/i.test(ip))) problemes.push("ADMIN_IPS : adresses IP séparées par des virgules");

  const cleSauvegarde = texte("SAUVEGARDE_CLE");
  if (!/^[a-f0-9]{64}$/i.test(cleSauvegarde)) problemes.push("SAUVEGARDE_CLE manquante (64 caractères hexadécimaux : openssl rand -hex 32)");
  else if (cleSauvegarde === jetonSecret || cleSauvegarde === webhookSecret) problemes.push("SAUVEGARDE_CLE doit être différente des autres secrets");

  let clePrivee = null;
  let clePublique = "";
  const cheminCle = texte("ABONNEMENT_CLE_PRIVEE_CHEMIN");
  if (!cheminCle) problemes.push("ABONNEMENT_CLE_PRIVEE_CHEMIN manquant (clé de signature des abonnements)");
  else {
    const chemin = isAbsolute(cheminCle) ? cheminCle : join(dossier, cheminCle);
    try {
      clePrivee = createPrivateKey(readFileSync(chemin));
      const details = clePrivee.asymmetricKeyDetails || {};
      if (clePrivee.asymmetricKeyType !== "ec" || details.namedCurve !== "prime256v1") throw new Error("courbe");
      clePublique = createPublicKey(clePrivee).export({ type: "spki", format: "der" }).toString("base64");
    } catch (erreur) {
      clePrivee = null;
      problemes.push("ABONNEMENT_CLE_PRIVEE_CHEMIN : clé ECDSA P-256 illisible (node src/scripts/cles-abonnement.mjs generer)");
    }
  }

  const mode = texte("PAIEMENT_MODE") || "test";
  if (!["test", "production"].includes(mode)) problemes.push("PAIEMENT_MODE doit valoir test ou production");
  const fournisseur = texte("PAIEMENT_FOURNISSEUR");
  const secours = texte("PAIEMENT_SECOURS");
  if (!FOURNISSEURS.includes(fournisseur)) problemes.push("PAIEMENT_FOURNISSEUR inconnu (" + FOURNISSEURS.join(", ") + ")");
  if (secours && (!FOURNISSEURS.includes(secours) || secours === fournisseur)) problemes.push("PAIEMENT_SECOURS inconnu ou identique au fournisseur principal");
  if (production) {
    if (mode !== "production") problemes.push("en production, PAIEMENT_MODE doit valoir production (un paiement de test activerait un vrai abonnement)");
    if (fournisseur === "simulation" || secours === "simulation") problemes.push("la simulation est interdite en production");
  } else if (mode === "production") {
    problemes.push("PAIEMENT_MODE=production exige NODE_ENV=production");
  }

  /* Agrégateurs actifs : principal, secours, et Stripe s'il est configuré (renouvellement par carte). */
  const actifs = [...new Set([fournisseur, secours, texte("STRIPE_SECRET_KEY") ? "stripe" : ""].filter((f) => FOURNISSEURS.includes(f)))];
  const cles = {};
  for (const nom of actifs) {
    cles[nom] = {};
    for (const variable of CLES_FOURNISSEUR[nom]) {
      const valeur = texte(variable);
      if (valeur.length < 8) problemes.push(variable + " manquante (exigée par l'agrégateur " + nom + ")");
      else if (EXEMPLE.test(valeur) && production) problemes.push(variable + " garde une valeur d'exemple");
      cles[nom][variable] = valeur;
    }
  }

  const port = Number(texte("PORT") || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problemes.push("PORT invalide");
  if (problemes.length) throw new ErreurConfiguration(problemes);

  const base = texte("BASE_DONNEES") || "donnees/batiplus.sqlite";
  const dossierSauvegarde = texte("SAUVEGARDE_DOSSIER") || "sauvegardes";
  return Object.freeze({
    production,
    port,
    hote: texte("HOTE") || "0.0.0.0",
    confianceProxy: texte("CONFIANCE_PROXY") === "1",
    urlPublique: urlPublique.origin,
    urlSite: lireUrl(texte("URL_SITE")) ? new URL(texte("URL_SITE")).origin : "",
    origines: Object.freeze(origines),
    baseDonnees: base === ":memory:" || isAbsolute(base) ? base : join(dossier, base),
    jetonSecret,
    webhookSecret,
    clePrivee,
    clePublique,
    adminCode,
    adminIps: Object.freeze(adminIps),
    sauvegarde: Object.freeze({ cle: cleSauvegarde, dossier: isAbsolute(dossierSauvegarde) ? dossierSauvegarde : join(dossier, dossierSauvegarde) }),
    paiement: Object.freeze({ mode, fournisseur, secours: secours || "", actifs: Object.freeze(actifs) }),
    cles: Object.freeze(cles)
  });
}
