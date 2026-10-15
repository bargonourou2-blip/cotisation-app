/* ==========================================================================
   BâtiPlus — donnees.js
   Constantes et données de référence. Aucune fonction ici, aucun secret.
   Assemblé AVANT moteur.js dans le script unique de www/index.html.
   ========================================================================== */

const DEBUG = false;

const APP = Object.freeze({
  nom: "BâtiPlus",
  version: "1.0.0",
  identifiant: "com.brgelectro.batiplus",
  concepteur: "BRG Électro+",
  telephones: Object.freeze(["+226 05 60 86 08", "+226 68 52 42 90"]),
  mention: "BâtiPlus est une application conçue et développée par BRG Électro+",
  copyright: "© 2026 BRG Électro+ — Tous droits réservés"
});

const CLES_STOCKAGE = Object.freeze({
  theme: "bp.theme",
  presentationVue: "bp.presentation-vue",
  comptes: "bp.comptes",
  session: "bp.session",
  verrou: "bp.verrou"
});

/* WhatsApp de BRG Électro+ pour « Code oublié ? » (chiffres uniquement). */
const WHATSAPP_BRG = "22605608608";

const THEMES = Object.freeze({
  clair: { libelle: "Clair", barreEtat: "#6A0DAD" },
  sombre: { libelle: "Sombre", barreEtat: "#08070C" }
});

/* Menu du tiroir : une entrée n'est affichée QUE si son écran existe dans la
   page (section#ecran-<id>). Les écrans arrivent au fil des étapes. */
const NAVIGATION = Object.freeze([
  { ecran: "accueil", libelle: "Accueil", icone: "i-accueil" },
  { ecran: "nouveau-chantier", libelle: "Nouveau chantier", icone: "i-eclair" },
  { ecran: "devis", libelle: "Mes devis", icone: "i-devis" },
  { ecran: "chantiers", libelle: "Mes chantiers", icone: "i-chantier" },
  { ecran: "clients", libelle: "Mes clients", icone: "i-clients" },
  { ecran: "prix", libelle: "Mes prix", icone: "i-prix" },
  { ecran: "profil", libelle: "Profil", icone: "i-profil" },
  { ecran: "abonnement", libelle: "Abonnement", icone: "i-abonnement" },
  { ecran: "a-propos", libelle: "À propos", icone: "i-info" },
  { ecran: "installer", libelle: "Installer", icone: "i-installer" }
]);

/* Barre d'onglets mobile : Accueil · Devis · [+] · Prix · Profil
   Même règle : un onglet n'apparaît que si son écran existe. */
const ONGLETS = Object.freeze([
  { ecran: "accueil", libelle: "Accueil", icone: "i-accueil" },
  { ecran: "devis", libelle: "Devis", icone: "i-devis" },
  { ecran: "nouveau-chantier", libelle: "Nouveau", icone: "i-plus", central: true },
  { ecran: "prix", libelle: "Prix", icone: "i-prix" },
  { ecran: "profil", libelle: "Profil", icone: "i-profil" }
]);

const ECRAN_DEPART = "accueil";

/* Écrans d'entrée : plein écran, sans en-tête, tiroir ni onglets. */
const ECRANS_ENTREE = Object.freeze(["demarrage", "presentation", "connexion"]);
const DUREE_DEMARRAGE = 1500;

/* ---------- Sécurité du code secret ---------- */
const CODE = Object.freeze({
  longueurMin: 4,
  longueurMax: 6,
  iterations: 150000,
  octetsSel: 16,
  bitsEmpreinte: 256
});
/* Après 5 échecs : 30 s, puis 1 min, 5 min et 15 min à chaque nouvel échec. */
const BLOCAGE = Object.freeze({
  essaisLibres: 5,
  durees: Object.freeze([30000, 60000, 300000, 900000])
});

/* ---------- Bornes de saisie (partie B.6) ---------- */
const BORNES = Object.freeze({
  texteMin: 1,
  texteMax: 120,
  telephoneMin: 8,
  telephoneMax: 15
});

/* ---------- Devises ---------- */
const DEVISES = Object.freeze({
  XOF: { libelle: "FCFA", nom: "Franc CFA (UEMOA)", decimales: 0 },
  XAF: { libelle: "FCFA", nom: "Franc CFA (CEMAC)", decimales: 0 },
  GNF: { libelle: "GNF", nom: "Franc guinéen", decimales: 0 },
  NGN: { libelle: "NGN", nom: "Naira nigérian", decimales: 2 },
  GHS: { libelle: "GHS", nom: "Cedi ghanéen", decimales: 2 },
  MRU: { libelle: "MRU", nom: "Ouguiya mauritanien", decimales: 2 },
  CDF: { libelle: "CDF", nom: "Franc congolais", decimales: 2 },
  KES: { libelle: "KES", nom: "Shilling kényan", decimales: 2 },
  MAD: { libelle: "MAD", nom: "Dirham marocain", decimales: 2 },
  DZD: { libelle: "DZD", nom: "Dinar algérien", decimales: 2 },
  TND: { libelle: "TND", nom: "Dinar tunisien", decimales: 3 },
  ZAR: { libelle: "ZAR", nom: "Rand sud-africain", decimales: 2 },
  EUR: { libelle: "€", nom: "Euro", decimales: 2 },
  CAD: { libelle: "$ CA", nom: "Dollar canadien", decimales: 2 },
  USD: { libelle: "$ US", nom: "Dollar américain", decimales: 2 }
});

/* ---------- Pays : indicatif, devise, longueurs du numéro national ----------
   zero : le numéro national s'écrit avec un 0 initial à retirer en international.
   L'ordre ne compte pas : la détection lit toujours l'indicatif le PLUS LONG d'abord. */
const PAYS = Object.freeze([
  { iso: "BF", nom: "Burkina Faso", indicatif: "226", devise: "XOF", longueurs: [8] },
  { iso: "CI", nom: "Côte d'Ivoire", indicatif: "225", devise: "XOF", longueurs: [10] },
  { iso: "SN", nom: "Sénégal", indicatif: "221", devise: "XOF", longueurs: [9] },
  { iso: "ML", nom: "Mali", indicatif: "223", devise: "XOF", longueurs: [8] },
  { iso: "TG", nom: "Togo", indicatif: "228", devise: "XOF", longueurs: [8] },
  { iso: "BJ", nom: "Bénin", indicatif: "229", devise: "XOF", longueurs: [8, 10] },
  { iso: "NE", nom: "Niger", indicatif: "227", devise: "XOF", longueurs: [8] },
  { iso: "GW", nom: "Guinée-Bissau", indicatif: "245", devise: "XOF", longueurs: [7, 9] },
  { iso: "CM", nom: "Cameroun", indicatif: "237", devise: "XAF", longueurs: [9] },
  { iso: "GA", nom: "Gabon", indicatif: "241", devise: "XAF", longueurs: [7, 8] },
  { iso: "CG", nom: "Congo", indicatif: "242", devise: "XAF", longueurs: [9] },
  { iso: "TD", nom: "Tchad", indicatif: "235", devise: "XAF", longueurs: [8] },
  { iso: "CF", nom: "Centrafrique", indicatif: "236", devise: "XAF", longueurs: [8] },
  { iso: "GQ", nom: "Guinée équatoriale", indicatif: "240", devise: "XAF", longueurs: [9] },
  { iso: "GN", nom: "Guinée", indicatif: "224", devise: "GNF", longueurs: [9] },
  { iso: "NG", nom: "Nigeria", indicatif: "234", devise: "NGN", longueurs: [10], zero: true },
  { iso: "GH", nom: "Ghana", indicatif: "233", devise: "GHS", longueurs: [9], zero: true },
  { iso: "MR", nom: "Mauritanie", indicatif: "222", devise: "MRU", longueurs: [8] },
  { iso: "CD", nom: "RD Congo", indicatif: "243", devise: "CDF", longueurs: [9], zero: true },
  { iso: "KE", nom: "Kenya", indicatif: "254", devise: "KES", longueurs: [9], zero: true },
  { iso: "MA", nom: "Maroc", indicatif: "212", devise: "MAD", longueurs: [9], zero: true },
  { iso: "DZ", nom: "Algérie", indicatif: "213", devise: "DZD", longueurs: [8, 9], zero: true },
  { iso: "TN", nom: "Tunisie", indicatif: "216", devise: "TND", longueurs: [8] },
  { iso: "ZA", nom: "Afrique du Sud", indicatif: "27", devise: "ZAR", longueurs: [9], zero: true },
  { iso: "FR", nom: "France", indicatif: "33", devise: "EUR", longueurs: [9], zero: true },
  { iso: "BE", nom: "Belgique", indicatif: "32", devise: "EUR", longueurs: [8, 9], zero: true },
  { iso: "CA", nom: "Canada", indicatif: "1", devise: "CAD", longueurs: [10] },
  { iso: "US", nom: "États-Unis", indicatif: "1", devise: "USD", longueurs: [10] }
]);
const PAYS_DEFAUT = "BF";

const TOILE = Object.freeze({
  densite: 1 / 16000,
  pointsMax: 70,
  pointsMin: 18,
  distanceLien: 130,
  vitesse: 0.22,
  impulsionsMax: 6,
  vitesseImpulsion: 0.012
});
