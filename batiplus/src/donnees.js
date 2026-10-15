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
  theme: "bp.theme"
});

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

const TOILE = Object.freeze({
  densite: 1 / 16000,
  pointsMax: 70,
  pointsMin: 18,
  distanceLien: 130,
  vitesse: 0.22,
  impulsionsMax: 6,
  vitesseImpulsion: 0.012
});
