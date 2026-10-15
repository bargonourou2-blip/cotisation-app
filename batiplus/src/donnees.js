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

/* Stockage : préfixe bp_ + version du schéma (v1). Changer de schéma = nouvelle
   version + migration dans migrerStockage(). */
const CLES_STOCKAGE = Object.freeze({
  theme: "bp_v1_theme",
  presentationVue: "bp_v1_presentation_vue",
  comptes: "bp_v1_comptes",
  session: "bp_v1_session",
  verrou: "bp_v1_verrou",
  devis: "bp_v1_devis"
});
/* Anciennes clés (avant le schéma v1) reprises une seule fois au démarrage. */
const CLES_ANCIENNES = Object.freeze({
  "bp.theme": "bp_v1_theme",
  "bp.presentation-vue": "bp_v1_presentation_vue",
  "bp.comptes": "bp_v1_comptes",
  "bp.session": "bp_v1_session",
  "bp.verrou": "bp_v1_verrou"
});

/* Adresse publique de l'API, injectée par l'assembleur depuis .env (API_URL).
   C'est la SEULE valeur de configuration connue du front : aucune clé, aucun secret. */
const API_URL = "@@API_URL@@";

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
  conditionsMax: 1000,
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

/* ---------- Formules d'abonnement (affichage uniquement) ----------
   Le front ne décide JAMAIS de la formule : elle viendra du compte vérifié
   (étapes 11-14). Une seule fonction, libelleFormule(), l'affiche partout. */
const FORMULES = Object.freeze({
  gratuit: { nom: "Gratuit", prix: 0, illimite: false },
  semaine: { nom: "Pass semaine", prix: 750, illimite: true },
  mensuel: { nom: "Pro mensuel", prix: 2500, illimite: true },
  annuel: { nom: "Pro annuel", prix: 25000, illimite: true },
  vie: { nom: "Lifetime", prix: 60000, illimite: true }
});
const FORMULE_DEFAUT = "gratuit";
const LIMITE_GRATUITE = 5;

const STATUTS_DEVIS = Object.freeze({
  brouillon: { libelle: "Brouillon", ton: "neutre" },
  envoye: { libelle: "Envoyé", ton: "info" },
  accepte: { libelle: "Accepté", ton: "ok" },
  refuse: { libelle: "Refusé", ton: "alerte" }
});

/* Animations des compteurs du tableau de bord (ms). */
const DUREE_COMPTEUR = 700;
/* Appui long sur le logo de « À propos » pour ouvrir l'administration (ms). */
const DUREE_APPUI_ADMIN = 3000;

/* ---------- Astuce du jour : sécurité électrique (une par jour, en boucle) ---------- */
const ASTUCES = Object.freeze([
  "Coupez toujours le disjoncteur général et vérifiez l'absence de tension au VAT avant de toucher un conducteur.",
  "Un différentiel 30 mA protège les personnes : testez-le chaque mois avec son bouton « T ».",
  "La terre est obligatoire sur tous les circuits : une prise sans terre est un risque d'électrocution.",
  "Respectez les couleurs : vert-jaune uniquement pour la terre, bleu pour le neutre.",
  "Une section trop faible chauffe : 1,5 mm² pour l'éclairage, 2,5 mm² pour les prises.",
  "Serrez toutes les bornes au bon couple : un serrage lâche provoque des échauffements et des incendies.",
  "Dans la salle d'eau, respectez les volumes : aucune prise ordinaire à moins de 60 cm de la douche.",
  "Prévoyez au moins 20 % de place libre dans le tableau pour les extensions futures.",
  "Un parafoudre protège les appareils dans les zones exposées à la foudre et aux coupures brutales.",
  "Ne dépassez pas 8 prises sur un circuit 16 A en 1,5 mm², ni 12 sur un circuit 20 A en 2,5 mm².",
  "Un appareil puissant (cuisinière, climatiseur, chauffe-eau) doit avoir son propre circuit.",
  "Utilisez des gaines adaptées : une gaine écrasée dans le béton abîme les conducteurs.",
  "Repérez chaque disjoncteur avec une étiquette claire : le client gagnera du temps en cas de panne.",
  "Gardez vos outils isolés en bon état : un manche fendu n'isole plus.",
  "Ne travaillez jamais seul sur une installation à risque : une deuxième personne peut couper le courant.",
  "Mesurez la résistance de terre : en dessous de 100 ohms avec un différentiel 30 mA, c'est conforme.",
  "Les boîtes de dérivation doivent rester accessibles : jamais enfouies dans le mur sans trappe.",
  "Pour la cuisinière, prévoyez un circuit en 6 mm² protégé par un disjoncteur 32 A.",
  "Évitez les dominos sous tension mécanique : préférez des bornes à levier de qualité.",
  "Coupez le courant avant de remplacer une ampoule ou un luminaire, même pour quelques secondes.",
  "Laissez une distance suffisante entre câbles électriques et canalisations d'eau ou de gaz.",
  "Un tableau doit être fixé à une hauteur accessible, entre 1 m et 1,80 m du sol.",
  "Une odeur de brûlé ou une prise qui noircit signale un échauffement : coupez et contrôlez.",
  "Testez chaque circuit après la pose : continuité, isolement, puis fonctionnement.",
  "Ne surchargez pas une multiprise : elle n'augmente pas la puissance du circuit.",
  "Fixez les câbles tous les 30 à 40 cm pour éviter qu'ils pendent ou soient arrachés.",
  "En extérieur, utilisez du matériel étanche (IP44 minimum) et un différentiel 30 mA.",
  "Expliquez au client où se trouve le disjoncteur général et comment le couper.",
  "Gardez une trace de chaque installation : schéma et devis aident en cas de dépannage.",
  "Portez des chaussures isolantes et retirez bagues, montres et bracelets avant d'intervenir.",
  "La qualité du matériel compte : un disjoncteur contrefait peut ne jamais déclencher."
]);

/* ---------- Recherche (en-tête) : écrans et rubriques ----------
   Une entrée n'est proposée que si son écran existe. Les devis, chantiers et
   clients s'ajouteront quand leurs écrans existeront. */
const RECHERCHE = Object.freeze([
  { libelle: "Accueil", detail: "Tableau de bord", ecran: "accueil", mots: "tableau bord compteurs astuce" },
  { libelle: "Mon profil", detail: "Nom, entreprise, téléphone, ville", ecran: "profil", cible: "carte-infos", mots: "profil nom entreprise telephone ville pays devise" },
  { libelle: "Photo de profil", detail: "Mon profil", ecran: "profil", cible: "carte-identite", mots: "photo image avatar" },
  { libelle: "Logo de l'entreprise", detail: "Mon profil", ecran: "profil", cible: "carte-logo", mots: "logo entreprise image devis" },
  { libelle: "Conditions par défaut", detail: "Mon profil", ecran: "profil", cible: "carte-conditions", mots: "conditions acompte validite paiement" },
  { libelle: "Changer le code secret", detail: "Mon profil", ecran: "profil", cible: "carte-code", mots: "code secret mot passe securite" },
  { libelle: "Mes statistiques", detail: "Mon profil", ecran: "profil", cible: "carte-stats", mots: "statistiques chiffres montant" },
  { libelle: "Sauvegarde", detail: "Exporter ou importer", ecran: "profil", cible: "carte-sauvegarde", mots: "sauvegarde export import fichier" },
  { libelle: "Changer de compte", detail: "Mon profil", ecran: "profil", cible: "carte-session", mots: "compte deconnexion changer" },
  { libelle: "À propos", detail: "BâtiPlus et BRG Électro+", ecran: "a-propos", mots: "propos version concepteur brg contact whatsapp" },
  { libelle: "Installer BâtiPlus", detail: "Android, iPhone, ordinateur", ecran: "a-propos", cible: "carte-installation", mots: "installer android iphone ordinateur" },
  { libelle: "Normes", detail: "NF C 15-100", ecran: "a-propos", cible: "carte-normes", mots: "norme nf c 15-100 conformite" },
  { libelle: "Confidentialité", detail: "Vos données", ecran: "a-propos", cible: "carte-confidentialite", mots: "confidentialite donnees conditions" }
]);

const CONDITIONS_DEFAUT = "Devis valable 30 jours. Acompte de 50 % à la commande, solde à la fin des travaux. Matériel garanti selon les conditions du fabricant.";

/* ---------- Images importées (photo, logo) ---------- */
/* ---------- Identité visuelle (étape 4) ---------- */
/* Remplace toute photo d'électricien manquante : jamais de cadre vide. */
const PHOTO_REPLI = "images/equipe/electricien-repli.svg";
/* Moyens de paiement, dans l'ordre d'affichage de la section Paiement (étapes 11-12).
   Un logo n'est affiché que si le fichier officiel est fourni dans www/images/paiement/ ;
   sinon : pastille unie à la couleur de la marque, nom écrit en texte (couleurs dans charte.css). */
const MOYENS_PAIEMENT = Object.freeze([
  Object.freeze({ id: "orange-money", nom: "Orange Money" }),
  Object.freeze({ id: "moov-money", nom: "Moov Money" }),
  Object.freeze({ id: "wave", nom: "Wave" }),
  Object.freeze({ id: "telecel-money", nom: "Telecel Money" }),
  Object.freeze({ id: "visa", nom: "Visa" }),
  Object.freeze({ id: "mastercard", nom: "Mastercard" }),
  Object.freeze({ id: "cinetpay", nom: "CinetPay" })
]);
/* Rempli par l'assembleur : noms des fichiers WebP présents dans www/images/paiement/. */
const LOGOS_PAIEMENT_FOURNIS = Object.freeze("@@LOGOS_PAIEMENT@@");

const IMAGES = Object.freeze({
  types: Object.freeze(["image/jpeg", "image/png", "image/webp"]),
  octetsMax: 5 * 1024 * 1024,
  pixelsMax: 40000000,
  photo: Object.freeze({ cote: 320 }),
  logo: Object.freeze({ largeur: 600, hauteur: 300 }),
  qualite: 0.82,
  donneesMax: 300 * 1024
});

/* ---------- Sauvegarde exportée / importée ---------- */
const SAUVEGARDE = Object.freeze({
  format: "batiplus-sauvegarde",
  version: 1,
  octetsMax: 2 * 1024 * 1024
});

/* ---------- Administration : le code est vérifié par l'API, jamais ici ---------- */
const ADMIN = Object.freeze({
  chemin: "/api/admin/session",
  delaiMs: 10000,
  codeMin: 6,
  codeMax: 64
});

