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
  devis: "bp_v1_devis",
  chantiers: "bp_v1_chantiers",
  brouillonChantier: "bp_v1_brouillon_chantier",
  catalogue: "bp_v1_catalogue",
  numerosDevis: "bp_v1_numeros_devis"
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
  XOF: { libelle: "FCFA", nom: "Franc CFA (UEMOA)", decimales: 0, lettres: ["franc CFA", "francs CFA", "centime", "centimes"] },
  XAF: { libelle: "FCFA", nom: "Franc CFA (CEMAC)", decimales: 0, lettres: ["franc CFA", "francs CFA", "centime", "centimes"] },
  GNF: { libelle: "GNF", nom: "Franc guinéen", decimales: 0, lettres: ["franc guinéen", "francs guinéens", "centime", "centimes"] },
  NGN: { libelle: "NGN", nom: "Naira nigérian", decimales: 2, lettres: ["naira", "nairas", "kobo", "kobos"] },
  GHS: { libelle: "GHS", nom: "Cedi ghanéen", decimales: 2, lettres: ["cedi", "cedis", "pesewa", "pesewas"] },
  MRU: { libelle: "MRU", nom: "Ouguiya mauritanien", decimales: 2, lettres: ["ouguiya", "ouguiyas", "khoum", "khoums"] },
  CDF: { libelle: "CDF", nom: "Franc congolais", decimales: 2, lettres: ["franc congolais", "francs congolais", "centime", "centimes"] },
  KES: { libelle: "KES", nom: "Shilling kényan", decimales: 2, lettres: ["shilling kényan", "shillings kényans", "cent", "cents"] },
  MAD: { libelle: "MAD", nom: "Dirham marocain", decimales: 2, lettres: ["dirham", "dirhams", "centime", "centimes"] },
  DZD: { libelle: "DZD", nom: "Dinar algérien", decimales: 2, lettres: ["dinar algérien", "dinars algériens", "centime", "centimes"] },
  TND: { libelle: "TND", nom: "Dinar tunisien", decimales: 3, lettres: ["dinar tunisien", "dinars tunisiens", "millime", "millimes"] },
  ZAR: { libelle: "ZAR", nom: "Rand sud-africain", decimales: 2, lettres: ["rand", "rands", "cent", "cents"] },
  EUR: { libelle: "€", nom: "Euro", decimales: 2, lettres: ["euro", "euros", "centime", "centimes"] },
  CAD: { libelle: "$ CA", nom: "Dollar canadien", decimales: 2, lettres: ["dollar canadien", "dollars canadiens", "cent", "cents"] },
  USD: { libelle: "$ US", nom: "Dollar américain", decimales: 2, lettres: ["dollar américain", "dollars américains", "cent", "cents"] }
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
  refuse: { libelle: "Refusé", ton: "alerte" },
  paye: { libelle: "Payé", ton: "paye" }
});

/* Animations des compteurs du tableau de bord (ms). */
const DUREE_COMPTEUR = 700;
const DELAI_BROUILLON = 600;
const DUREE_TOAST = 3500;
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
  { libelle: "Nouveau chantier", detail: "Étude NF C 15-100 en 5 étapes", ecran: "nouveau-chantier", mots: "chantier etude nouveau pieces prises circuits tableau norme calcul" },
  { libelle: "Mes prix", detail: "Catalogue du matériel et fournisseurs", ecran: "prix", mots: "prix catalogue materiel fournisseur tarif article cable disjoncteur" },
  { libelle: "Main-d'œuvre par défaut", detail: "Mes prix habituels", ecran: "prix", cible: "carte-prix-mo", mots: "main oeuvre habituels point journee tarif" },
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

const CONDITIONS_DEFAUT = "Devis valable 30 jours. Acompte de 40 % à la commande, solde à la fin des travaux. Matériel garanti selon les conditions du fabricant.";

/* ---------- Images importées (photo, logo) ---------- */
/* ==========================================================================
   Nouveau chantier et moteur de calcul NF C 15-100 (étape 5)
   Les propositions sont des valeurs de départ : l'électricien peut tout modifier.
   ========================================================================== */
const ETAPES_CHANTIER = Object.freeze(["Client", "Pièces", "Appareils", "Options", "Main-d'œuvre"]);
const TYPES_CHANTIER = Object.freeze({
  villa: "Villa", appartement: "Appartement", boutique: "Boutique", bureau: "Bureau", renovation: "Rénovation"
});
const ALIMENTATIONS = Object.freeze({ mono: "Monophasé", tri: "Triphasé" });

/* Bornes de saisie : toute valeur hors bornes est refusée à la saisie et ramenée dans les bornes par le moteur. */
const BORNES_CHANTIER = Object.freeze({
  surfaceMin: 0.5, surfaceMax: 2000, piecesMax: 60, prisesMax: 50, pointsMax: 50,
  appareilsMax: 20, distanceMax: 500, hauteurMin: 2, hauteurMax: 6, hauteurDefaut: 2.8,
  quantiteMax: 9999, prixMax: 100000000, ouvriersMax: 50, joursMax: 365, lignesLibresMax: 20
});

/* Pièces : prises proposées = max(minimum, arrondi supérieur de surface / m² par prise) ;
   points lumineux = max(1, arrondi supérieur de surface / m² par point).
   Séjour : 1 prise par 4 m², 5 minimum, 7 au-delà de 28 m². Chambre : 3. Cuisine : 6 dont 4 sur
   plan de travail (circuit dédié 20 A). Salle d'eau, véranda : 1. WC : aucune. */
const TYPES_PIECES = Object.freeze({
  sejour: Object.freeze({ libelle: "Séjour", prisesMin: 5, m2ParPrise: 4, m2ParPoint: 20, commande: "simple" }),
  chambre: Object.freeze({ libelle: "Chambre", prisesMin: 3, m2ParPrise: 0, m2ParPoint: 20, commande: "simple" }),
  cuisine: Object.freeze({ libelle: "Cuisine", prisesMin: 6, m2ParPrise: 0, m2ParPoint: 15, commande: "simple", circuitCuisine: true }),
  "salle-eau": Object.freeze({ libelle: "Salle d'eau", prisesMin: 1, m2ParPrise: 0, m2ParPoint: 20, commande: "simple", etanche: true }),
  wc: Object.freeze({ libelle: "WC", prisesMin: 0, m2ParPrise: 0, m2ParPoint: 20, commande: "simple" }),
  couloir: Object.freeze({ libelle: "Couloir", prisesMin: 1, m2ParPrise: 0, m2ParPoint: 10, commande: "va-et-vient" }),
  veranda: Object.freeze({ libelle: "Véranda", prisesMin: 1, m2ParPrise: 0, m2ParPoint: 20, commande: "simple", etanche: true }),
  garage: Object.freeze({ libelle: "Garage", prisesMin: 1, m2ParPrise: 0, m2ParPoint: 20, commande: "simple" }),
  magasin: Object.freeze({ libelle: "Magasin", prisesMin: 2, m2ParPrise: 8, m2ParPoint: 8, commande: "simple" }),
  bureau: Object.freeze({ libelle: "Bureau", prisesMin: 3, m2ParPrise: 4, m2ParPoint: 10, commande: "simple" }),
  exterieur: Object.freeze({ libelle: "Extérieur", prisesMin: 1, m2ParPrise: 0, m2ParPoint: 25, commande: "simple", etanche: true })
});
const SEJOUR_GRAND = Object.freeze({ surface: 28, prisesMin: 7 });

/* Circuits : sections en mm², calibres en A. */
const REGLES_CIRCUITS = Object.freeze({
  prises: Object.freeze({ section: 1.5, calibre: 16, max: 8 }),
  prisesCuisine: Object.freeze({ section: 2.5, calibre: 20, max: 6 }),
  eclairage: Object.freeze({ section: 1.5, calibre: 10, max: 8 }),
  differentiel: Object.freeze({ circuitsMax: 8, minimum: 2, sensibilite: 30 }),
  margeCable: 0.12,
  reserveModules: 0.2,
  modulesParRangee: 13
});
/* Appareils à circuit dédié : un circuit par appareil. Type A : différentiel de type A (plaque, lave-linge). */
const APPAREILS = Object.freeze({
  climatiseur: Object.freeze({ libelle: "Climatiseur", section: 2.5, calibre: 20 }),
  "chauffe-eau": Object.freeze({ libelle: "Chauffe-eau", section: 2.5, calibre: 20 }),
  cuisiniere: Object.freeze({ libelle: "Cuisinière / plaque", section: 6, calibre: 32, typeA: true }),
  four: Object.freeze({ libelle: "Four", section: 2.5, calibre: 20 }),
  "lave-linge": Object.freeze({ libelle: "Lave-linge", section: 2.5, calibre: 20, typeA: true }),
  "lave-vaisselle": Object.freeze({ libelle: "Lave-vaisselle", section: 2.5, calibre: 20 }),
  pompe: Object.freeze({ libelle: "Pompe", section: 2.5, calibre: 20 }),
  congelateur: Object.freeze({ libelle: "Congélateur", section: 2.5, calibre: 20 }),
  portail: Object.freeze({ libelle: "Portail motorisé", section: 2.5, calibre: 20 })
});

/* Main-d'œuvre au point : prix de départ en FCFA (XOF/XAF), modifiables sur chaque chantier.
   Dans une autre devise, les prix partent de 0 et l'électricien les saisit. */
const MAIN_OEUVRE_POINTS = Object.freeze({
  prise: Object.freeze({ libelle: "Prise de courant", prix: 2500 }),
  interrupteur: Object.freeze({ libelle: "Interrupteur", prix: 2000 }),
  "va-et-vient": Object.freeze({ libelle: "Va-et-vient (2 commandes)", prix: 3000 }),
  point: Object.freeze({ libelle: "Point lumineux", prix: 2500 }),
  dedie: Object.freeze({ libelle: "Circuit dédié", prix: 7500 }),
  tableau: Object.freeze({ libelle: "Pose de tableau", prix: 25000 }),
  depose: Object.freeze({ libelle: "Dépose de l'ancien tableau", prix: 10000 }),
  terre: Object.freeze({ libelle: "Prise de terre", prix: 20000 })
});
const TARIF_JOURNEE_DEFAUT = 10000;
const DEVISES_PRIX_DEFAUT = Object.freeze(["XOF", "XAF"]);

/* ==========================================================================
   Résultat de l'étude (étape 6)
   ========================================================================== */
const MENTION_ETUDE = "Étude indicative. L'électricien vérifie et reste responsable de l'exécution conforme.";
const ONGLETS_RESULTAT = Object.freeze([
  Object.freeze({ id: "circuits", libelle: "Circuits" }),
  Object.freeze({ id: "tableau", libelle: "Tableau" }),
  Object.freeze({ id: "materiel", libelle: "Matériel" }),
  Object.freeze({ id: "main-oeuvre", libelle: "Main-d'œuvre" }),
  Object.freeze({ id: "conformite", libelle: "Conformité" }),
  Object.freeze({ id: "total", libelle: "Total" })
]);
const CATEGORIES_MATERIEL = Object.freeze({
  tableau: "Tableau et protections",
  cables: "Câbles et gaines",
  appareillage: "Appareillage",
  terre: "Prise de terre",
  autres: "Autres articles"
});
const TVA_DEFAUT = 18;
const TVA_MAX = 30;
const ACOMPTE_DEFAUT = 40;

/* Catalogue de départ : prix INDICATIFS en FCFA (XOF/XAF), un article par référence de
   matériel produite par le moteur (mêmes désignations). lireCatalogue() est la SEULE source
   des prix : chantier, devis, statistiques et export. Dès que l'électricien modifie « Mes prix »,
   son catalogue remplace celui-ci ; « Réinitialiser » y revient. Dans une autre devise, les prix
   partent de 0 et chaque ligne est signalée « Prix à compléter ». */
const CATALOGUE_DEFAUT = Object.freeze(Object.fromEntries([
  ...[1, 2, 3, 4, 5, 6].map((n) => ["coffret-" + n + "r", "Coffret " + n + (n > 1 ? " rangées" : " rangée") + " de 13 modules", "u", "tableau", 15000 * n]),
  ["peigne", "Peigne d'alimentation 13 modules", "u", "tableau", 2500],
  ["bornier", "Bornier de terre et de neutre", "u", "tableau", 2000],
  ...[[10, 3000], [16, 3000], [20, 3500], [32, 4500]].map(([a, prix]) => ["disjoncteur-" + a, "Disjoncteur divisionnaire 1P+N " + a + " A", "u", "tableau", prix]),
  ...[["2p", 40, "AC", 20000], ["2p", 63, "AC", 25000], ["2p", 40, "A", 30000], ["2p", 63, "A", 35000],
    ["4p", 40, "AC", 45000], ["4p", 63, "AC", 55000], ["4p", 40, "A", 60000], ["4p", 63, "A", 70000]]
    .map(([p, a, t, prix]) => ["differentiel-" + p + "-" + a + "-" + t, "Interrupteur différentiel " + p.toUpperCase() + " " + a + " A 30 mA type " + t, "u", "tableau", prix]),
  ["parafoudre-2p", "Parafoudre 2P avec protection intégrée", "u", "tableau", 30000],
  ["parafoudre-4p", "Parafoudre 4P avec protection intégrée", "u", "tableau", 55000],
  ["cable-1.5", "Câble 3G1,5 mm²", "m", "cables", 400],
  ["cable-2.5", "Câble 3G2,5 mm²", "m", "cables", 600],
  ["cable-6", "Câble 3G6 mm²", "m", "cables", 1500],
  ["gaine-20", "Gaine ICTA 20", "m", "cables", 150],
  ["gaine-25", "Gaine ICTA 25", "m", "cables", 250],
  ["alimentation-3g10", "Câble d'alimentation 3G10 mm²", "m", "cables", 2500],
  ["alimentation-5g10", "Câble d'alimentation 5G10 mm²", "m", "cables", 4000],
  ["prise", "Prise 2P+T 16 A", "u", "appareillage", 1500],
  ["prise-etanche", "Prise 2P+T 16 A étanche IP44", "u", "appareillage", 3500],
  ["interrupteur", "Interrupteur simple allumage", "u", "appareillage", 1200],
  ["va-et-vient", "Interrupteur va-et-vient", "u", "appareillage", 1500],
  ["point", "Point lumineux (DCL et douille)", "u", "appareillage", 1000],
  ["boite", "Boîte d'encastrement", "u", "appareillage", 200],
  ["derivation", "Boîte de dérivation", "u", "appareillage", 500],
  ["piquet", "Piquet de terre 1,5 m", "u", "terre", 7500],
  ["cable-terre", "Câble de terre vert-jaune 16 mm²", "m", "terre", 1500],
  ["barrette", "Barrette de mesure de terre", "u", "terre", 3500],
  ["regard", "Regard de visite", "u", "terre", 5000]
].map(([ref, designation, unite, categorie, prix]) => [ref, Object.freeze({ designation, unite, categorie, prix })])));

/* ==========================================================================
   Mes prix et devis (étape 7)
   ========================================================================== */
const UNITES = Object.freeze({ u: "unité", m: "mètre", lot: "lot", forfait: "forfait" });
const BORNES_CATALOGUE = Object.freeze({ articlesMax: 300, fournisseursMax: 5, fournisseurMax: 60, designationMax: 120 });
const BORNES_DEVIS = Object.freeze({ lignesMax: 150, noteMax: 1000, titreMax: 120, quantiteMax: 999999 });
/* −10 % / +10 % sur toute la main-d'œuvre (prix au point, tarif journée, forfait, lignes libres). */
const AJUSTEMENT_MAIN_OEUVRE = 0.1;
const PREFIXE_NUMERO_DEVIS = "BP";

/* ==========================================================================
   Feuille A4, PDF et partage (étape 8)
   ========================================================================== */
/* Pied de page du devis : en filigrane discret pour la formule gratuite, absent pour un abonné. */
const PIED_DEVIS = "Devis réalisé avec BâtiPlus — application conçue par BRG Électro+ · +226 05 60 86 08 · +226 68 52 42 90";
const OPACITE_FILIGRANE = 0.22;
const SIGNATURE_WHATSAPP = "Devis réalisé avec BâtiPlus";
/* Android : Documents/BatiPlus/Devis_BP-2026-0042_NomClient.pdf */
const DOSSIER_PDF = "BatiPlus";
const SIGNATURES_DEVIS = Object.freeze([
  Object.freeze({ titre: "L'électricien", aide: "Date et signature" }),
  Object.freeze({ titre: "Le client", aide: "« Bon pour accord », date et signature" })
]);
/* PDF : feuille A4 en points (1 pt = 1/72 pouce), marges de 12 mm. */
/* Largeur d'une feuille A4 à l'écran (210 mm à 96 ppp) : base de la réduction de l'aperçu. */
const LARGEUR_A4_PX = 794;
const PDF_A4 = Object.freeze({ largeur: 595.28, hauteur: 841.89, marge: 34.02 });
/* Largeurs des caractères des polices standard du PDF (Helvetica et Helvetica-Bold,
   en millièmes de la taille), codes 32 à 255 de l'encodage WinAnsi. Aucune police
   à embarquer : tout lecteur PDF les possède. */
const POLICES_PDF = Object.freeze({
  normale: Object.freeze([278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500]),
  grasse: Object.freeze([278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556])
});
/* Caractères hors Latin-1 présents dans l'encodage WinAnsi (point de code → octet). */
const WINANSI_SPECIAUX = Object.freeze({
  8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139,
  338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153,
  353: 154, 8250: 155, 339: 156, 382: 158, 376: 159, 8722: 45, 8239: 160, 8199: 160, 8201: 32
});

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

