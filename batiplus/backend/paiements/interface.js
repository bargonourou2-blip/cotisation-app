/* ==========================================================================
   BâtiPlus — paiements : le CONTRAT commun à tous les agrégateurs
   Chaque adaptateur (ligdicash, cinetpay, fedapay, paydunya, stripe, simulation) expose
   EXACTEMENT ces cinq fonctions — rien d'autre n'est appelé par le reste du backend :

   creerPaiement({ reference, montant, devise, formule, telephone, nom, email, renouvellementAuto, carte })
       → { urlPaiement, idFournisseur, secretNotification? }
       secretNotification : jeton propre à CE paiement que l'agrégateur renverra dans sa
       notification (CinetPay « notify_token »), gardé en base, jamais renvoyé par l'API.
       carte : { client, moyen } pour un renouvellement par carte sans page (Stripe) → urlPaiement null.
   verifierNotification(requete, contexte) → booléen (signature de l'agrégateur, temps constant)
       contexte : { secretNotification } du paiement visé.
   lireNotification(requete) → { reference, statut, montant, devise, moyen, idFournisseur }
       LECTURE SEULEMENT : rien de ce qui est lu ici n'active quoi que ce soit.
   consulterStatut(idFournisseur) → { statut, montant, devise, moyen, reference, carte? }
       L'appel sortant qui fait foi (une notification seule ne suffit JAMAIS).
   rembourser(idFournisseur) → { rembourse: true } ou ErreurFournisseur.

   requete : { entetes (noms en minuscules), corpsBrut (texte exact reçu), corps (objet lu) }.
   statut : un des STATUTS de base.js (en_attente, payé, échoué, annulé, expiré, remboursé).
   montant : entier (FCFA) ou null si l'agrégateur ne le donne pas → le paiement passe en anomalie.
   Aucun numéro de carte ni code Mobile Money ne transite par BâtiPlus : la saisie se fait
   uniquement sur la page de l'agrégateur.
   ========================================================================== */
import { createHmac } from "node:crypto";
import { STATUTS } from "../base.js";
import { egalTempsConstant } from "../jetons.js";

export { STATUTS, egalTempsConstant };

export const METHODES = Object.freeze(["creerPaiement", "verifierNotification", "lireNotification", "consulterStatut", "rembourser"]);
export const MOYENS = Object.freeze(["orange-money", "moov-money", "wave", "telecel-money", "visa", "mastercard", "carte", "autre"]);
export const DELAI_APPEL_MS = 10000;
export const TOLERANCE_SIGNATURE_S = 300;

export class ErreurFournisseur extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ErreurFournisseur";
    this.details = details || null;
  }
}

/* Un adaptateur n'est accepté que s'il expose exactement le contrat. */
export function verifierAdaptateur(adaptateur, nom) {
  const fonctions = Object.keys(adaptateur).filter((cle) => typeof adaptateur[cle] === "function").sort();
  const attendues = [...METHODES].sort();
  if (fonctions.join() !== attendues.join()) throw new Error("adaptateur " + nom + " : contrat non respecté (" + fonctions.join(", ") + ")");
  return Object.freeze(adaptateur);
}

export function hmacHex(secret, donnees, algorithme = "sha256") {
  return createHmac(algorithme, secret).update(donnees, "utf8").digest("hex");
}

/* En-tête « t=…,s=… » (FedaPay, simulation) ou « t=…,v1=… » (Stripe) : HMAC de « t.corps ». */
export function verifierSignatureHorodatee(entete, corpsBrut, secret, schema, maintenantS = Math.floor(Date.now() / 1000)) {
  if (typeof entete !== "string" || entete.length > 1024 || !secret) return false;
  let horodatage = null;
  const signatures = [];
  for (const morceau of entete.split(",")) {
    const [cle, ...reste] = morceau.trim().split("=");
    const valeur = reste.join("=");
    if (cle === "t" && /^\d{1,12}$/.test(valeur)) horodatage = Number(valeur);
    if (cle === schema && /^[a-f0-9]{64}$/i.test(valeur)) signatures.push(valeur.toLowerCase());
  }
  if (horodatage === null || !signatures.length || Math.abs(maintenantS - horodatage) > TOLERANCE_SIGNATURE_S) return false;
  const attendue = hmacHex(secret, horodatage + "." + corpsBrut);
  let valide = false;
  for (const signature of signatures) valide = egalTempsConstant(attendue, signature) || valide;
  return valide;
}

/* Appel HTTPS sortant (fetch intégré à Node 22), délai borné, réponse JSON. */
export async function appelJson(url, { methode = "GET", entetes = {}, corps = null, formulaire = false, delaiMs = DELAI_APPEL_MS } = {}) {
  const options = { method: methode, headers: { Accept: "application/json", ...entetes }, signal: AbortSignal.timeout(delaiMs), redirect: "error" };
  if (corps !== null) {
    if (formulaire) {
      options.headers["Content-Type"] = "application/x-www-form-urlencoded";
      options.body = new URLSearchParams(corps).toString();
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(corps);
    }
  }
  let reponse;
  try {
    reponse = await fetch(url, options);
  } catch (erreur) {
    throw new ErreurFournisseur("agrégateur injoignable", { cause: erreur && erreur.name });
  }
  const texte = await reponse.text();
  let donnees = null;
  try {
    donnees = texte ? JSON.parse(texte) : {};
  } catch (erreur) {
    throw new ErreurFournisseur("réponse illisible de l'agrégateur", { statut: reponse.status });
  }
  return { statut: reponse.status, donnees };
}

/* Nom du moyen tel que l'agrégateur le décrit → identifiant connu de l'application. */
export function normaliserMoyen(texte) {
  const t = String(texte || "").toLowerCase();
  if (!t) return "autre";
  if (/orange|\bom\b|^om_|_om\b/.test(t)) return "orange-money";
  if (/moov|flooz/.test(t)) return "moov-money";
  if (/wave/.test(t)) return "wave";
  if (/telecel/.test(t)) return "telecel-money";
  if (/visa/.test(t)) return "visa";
  if (/master/.test(t)) return "mastercard";
  if (/card|carte|cb\b/.test(t)) return "carte";
  return "autre";
}

/* Montant reçu d'un agrégateur → entier, ou null s'il est absent ou non entier. */
export function montantEntier(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const nombre = typeof valeur === "number" ? valeur : Number(String(valeur).replace(",", "."));
  return Number.isFinite(nombre) && Number.isInteger(nombre) && nombre >= 0 ? nombre : null;
}

export function deviseNormalisee(valeur) {
  return typeof valeur === "string" && /^[A-Za-z]{3}$/.test(valeur) ? valeur.toUpperCase() : null;
}

export function decouperNom(nom) {
  const parties = String(nom || "").trim().split(/\s+/).filter(Boolean);
  const prenom = parties.length > 1 ? parties.slice(0, -1).join(" ") : parties[0] || "Client";
  const famille = parties.length > 1 ? parties[parties.length - 1] : "BâtiPlus";
  return { prenom: prenom.slice(0, 60), famille: famille.slice(0, 60) };
}

export function texteCourt(valeur, max) {
  return typeof valeur === "string" ? valeur.slice(0, max) : "";
}
