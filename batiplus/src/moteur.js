/* ==========================================================================
   BâtiPlus — moteur.js
   Fonctions de l'application, puis initialisation (tout en bas).
   Règles : aucune donnée dans innerHTML, aucun eval, aucun gestionnaire
   en attribut HTML, chaque fonction déclarée UNE seule fois.
   ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
const tiroirMobileQuery = window.matchMedia("(max-width: 1024px)");
const mouvementReduitQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const themeSystemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const PAYS_PAR_ISO = new Map(PAYS.map((p) => [p.iso, p]));
const INDICATIFS = [...new Set(PAYS.map((p) => p.indicatif))].sort((a, b) => b.length - a.length);
const DONNEES_IMAGE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

/* État de l'application, en mémoire uniquement. */
const etat = {
  compte: null,
  abonnement: null,
  historique: [],
  travailEnCours: null,
  minuterieBlocage: 0,
  minuterieAdmin: 0,
  adminEchecs: 0,
  adminBloqueJusqua: 0,
  elementAvantModale: null,
  elementAvantRecherche: null,
  resoudreModale: null,
  verrouille: false
};

/* Codes en cours de saisie : jamais dans le DOM, jamais stockés. */
const codes = { "ins-code": "", "ins-confirmation": "", "cnx-code": "", "ver-code": "", "pro-ancien": "", "pro-nouveau": "", "pro-confirmation": "" };
const codesVisibles = new Set();
const cibleClavier = { "clavier-inscription": "ins-code", "clavier-connexion": "cnx-code", "clavier-verrou": "ver-code", "clavier-profil": "pro-ancien" };
/* Champ suivant quand un code atteint 6 chiffres. */
const CODE_SUIVANT = { "ins-code": "ins-confirmation", "pro-ancien": "pro-nouveau", "pro-nouveau": "pro-confirmation" };
const animationsCompteurs = new WeakMap();

const presentation = { index: 0, total: 0, departX: null, ecart: 0 };

/* ---------- Outils DOM ---------- */

function $(id) {
  return document.getElementById(id);
}

function journal(...elements) {
  if (DEBUG) console.log("[BâtiPlus]", ...elements);
}

function creerIcone(idSymbole) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icone");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#" + idSymbole);
  svg.appendChild(use);
  return svg;
}

function attendre(ms) {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

function trembler(element) {
  if (!element) return;
  element.classList.remove("tremble");
  void element.offsetWidth;
  element.classList.add("tremble");
  vibrer();
}

/* Pour comparer sans accents ni majuscules (recherche, clients). */
function normaliser(texte) {
  return String(texte || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function defilementDoux() {
  return mouvementReduitQuery.matches ? "auto" : "smooth";
}

/* ---------- Plateforme (Capacitor ou navigateur) ---------- */

function estNatif() {
  const cap = window.Capacitor;
  return Boolean(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
}

function plugin(nom) {
  const cap = window.Capacitor;
  if (!estNatif() || !cap.Plugins) return null;
  return cap.Plugins[nom] || null;
}

function nomPlateforme() {
  if (!estNatif()) return "Navigateur web";
  const plateforme = window.Capacitor.getPlatform();
  return plateforme === "android" ? "Android (application)" : plateforme;
}

/* ---------- Stockage local (Preferences en natif, localStorage sinon) ---------- */

async function lireValeur(cle) {
  const preferences = plugin("Preferences");
  try {
    if (preferences) {
      const resultat = await preferences.get({ key: cle });
      return resultat.value;
    }
    return window.localStorage.getItem(cle);
  } catch (erreur) {
    journal("lecture impossible", cle);
    return null;
  }
}

async function ecrireValeur(cle, valeur) {
  const preferences = plugin("Preferences");
  try {
    if (preferences) {
      await preferences.set({ key: cle, value: String(valeur) });
    } else {
      window.localStorage.setItem(cle, String(valeur));
    }
    return true;
  } catch (erreur) {
    journal("écriture impossible", cle);
    return false;
  }
}

async function supprimerValeur(cle) {
  const preferences = plugin("Preferences");
  try {
    if (preferences) await preferences.remove({ key: cle });
    else window.localStorage.removeItem(cle);
  } catch (erreur) {
    journal("suppression impossible", cle);
  }
}

/* Toutes les clés enregistrées (Preferences en natif, localStorage sinon). */
async function listerCles() {
  const preferences = plugin("Preferences");
  try {
    if (preferences) {
      if (typeof preferences.keys !== "function") return [];
      const resultat = await preferences.keys();
      return Array.isArray(resultat && resultat.keys) ? resultat.keys : [];
    }
    return Object.keys(window.localStorage);
  } catch (erreur) {
    journal("liste des clés impossible");
    return [];
  }
}

async function lireJson(cle) {
  const brut = await lireValeur(cle);
  if (!brut) return null;
  try {
    return JSON.parse(brut);
  } catch (erreur) {
    return null;
  }
}

/* Reprend une seule fois les clés d'avant le schéma v1 (bp.nom → bp_v1_nom). */
async function migrerStockage() {
  for (const [ancienne, nouvelle] of Object.entries(CLES_ANCIENNES)) {
    const valeur = await lireValeur(ancienne);
    if (valeur === null || valeur === undefined) continue;
    const existante = await lireValeur(nouvelle);
    if (existante === null || existante === undefined) await ecrireValeur(nouvelle, valeur);
    await supprimerValeur(ancienne);
  }
}

/* ---------- Retour haptique ---------- */

/* Retour tactile léger (plugin local RetourTactile : retour haptique du système, sans permission VIBRATE). */
function vibrer() {
  const tactile = plugin("RetourTactile");
  if (tactile && typeof tactile.toucher === "function") Promise.resolve(tactile.toucher()).catch(() => {});
}

/* ---------- Thème ---------- */

function themeActuel() {
  const choisi = document.documentElement.getAttribute("data-theme");
  if (choisi === "clair" || choisi === "sombre") return choisi;
  return themeSystemeQuery.matches ? "sombre" : "clair";
}

function appliquerTheme(theme) {
  const valide = theme === "sombre" ? "sombre" : "clair";
  document.documentElement.setAttribute("data-theme", valide);
  const bouton = $("bouton-theme");
  bouton.setAttribute("aria-label", valide === "sombre" ? "Passer en mode clair" : "Passer en mode sombre");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEMES[valide].barreEtat);
  appliquerBarreEtat(valide);
}

function appliquerBarreEtat(theme) {
  const barre = plugin("StatusBar");
  if (!barre) return;
  barre.setBackgroundColor({ color: THEMES[theme].barreEtat }).catch(() => {});
  barre.setStyle({ style: "DARK" }).catch(() => {});
}

async function basculerTheme() {
  const nouveau = themeActuel() === "sombre" ? "clair" : "sombre";
  appliquerTheme(nouveau);
  vibrer();
  await ecrireValeur(CLES_STOCKAGE.theme, nouveau);
}

async function initialiserTheme() {
  const enregistre = await lireValeur(CLES_STOCKAGE.theme);
  if (enregistre === "clair" || enregistre === "sombre") {
    appliquerTheme(enregistre);
  } else {
    appliquerTheme(themeActuel());
    document.documentElement.removeAttribute("data-theme");
  }
  themeSystemeQuery.addEventListener("change", surChangementThemeSysteme);
}

async function surChangementThemeSysteme() {
  const enregistre = await lireValeur(CLES_STOCKAGE.theme);
  if (enregistre) return;
  appliquerTheme(themeActuel());
  document.documentElement.removeAttribute("data-theme");
}

/* ---------- Navigation : UNE seule fonction montrer(id) ---------- */

function ecranExiste(id) {
  return Boolean($("ecran-" + id));
}

function estEcranEntree(id) {
  return ECRANS_ENTREE.includes(id);
}

/* options.retour : ne pas empiler (bouton retour). L'historique ne garde que les
   écrans de l'application ; revenir à l'accueil ou à l'entrée le vide. */
function montrer(id, options) {
  /* Application verrouillée : aucun écran n'est accessible avant le code (menu, retour, raccourcis). */
  const demande = etat.verrouille && etat.compte && id !== "verrou" ? "verrou" : id;
  const destination = !estEcranEntree(demande) && !etat.compte ? "connexion" : demande;
  const cible = $("ecran-" + destination);
  if (!cible) {
    journal("écran inexistant :", destination);
    return false;
  }
  const precedent = montrer.ecranCourant;
  const retour = Boolean(options && options.retour);
  if (precedent === "resultat" && destination !== "resultat" && resultat.minuterie) enregistrerResultat();
  if (precedent === "fiche-devis" && destination !== "fiche-devis" && fiche.minuterie) enregistrerDevis();
  if (precedent === "prix" && destination !== "prix" && mesPrix.minuterie) enregistrerMesPrix();
  if (estEcranEntree(destination) || destination === ECRAN_DEPART) {
    etat.historique = [];
  } else if (!retour && precedent && precedent !== destination && !estEcranEntree(precedent)) {
    etat.historique.push(precedent);
  }
  document.querySelectorAll(".ecran.actif").forEach((ecran) => ecran.classList.remove("actif"));
  cible.classList.add("actif");
  document.body.dataset.mode = estEcranEntree(destination) ? "entree" : "app";
  document.querySelectorAll("[data-ecran]").forEach((lien) => {
    if (lien.dataset.ecran === destination) lien.setAttribute("aria-current", "page");
    else lien.removeAttribute("aria-current");
  });
  fermerTiroir();
  window.scrollTo({ top: 0, behavior: "auto" });
  montrer.ecranCourant = destination;
  document.body.dataset.ecranActif = destination;
  preparerEcran(destination);
  return true;
}
montrer.ecranCourant = null;

/* Remplit l'écran au moment où il s'affiche. */
function preparerEcran(id) {
  if (id === "accueil") afficherAccueil();
  else if (id === "profil") remplirProfil();
  else if (id === "admin") reinitialiserAdmin();
  else if (id === "nouveau-chantier") ouvrirAssistant();
  else if (id === "resultat") ouvrirResultat();
  else if (id === "fiche-devis") ouvrirFicheDevis();
  else if (id === "prix") ouvrirMesPrix();
  else if (id === "feuille") ouvrirFeuille();
  else if (id === "devis") ouvrirMesDevis();
  else if (id === "chantiers") ouvrirMesChantiers();
  else if (id === "clients") ouvrirMesClients();
  else if (id === "stats") ouvrirStats();
  else if (id === "abonnement") ouvrirAbonnement();
  else if (id === "verrou") preparerVerrou();
}

/* Un seul écouteur pour tous les éléments [data-ecran] (menu, onglets, raccourcis…). */
function surClicNavigation(evenement) {
  const lien = evenement.target.closest("[data-ecran]");
  if (!lien || lien.hidden || lien.disabled) return;
  vibrer();
  montrer(lien.dataset.ecran);
}

/* Un lien vers un écran qui n'existe pas encore est masqué, jamais cassé. */
function masquerLiensAbsents() {
  document.querySelectorAll("[data-ecran]").forEach((lien) => {
    lien.hidden = !ecranExiste(lien.dataset.ecran);
  });
}

function creerLienTiroir(entree) {
  const li = document.createElement("li");
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "tiroir-lien";
  bouton.dataset.ecran = entree.ecran;
  bouton.appendChild(creerIcone(entree.icone));
  const libelle = document.createElement("span");
  libelle.textContent = entree.libelle;
  bouton.appendChild(libelle);
  if (entree.pro) {
    /* Un SVG n'obéit pas à « hidden » : le cadenas est enveloppé dans un span. */
    const cadenas = document.createElement("span");
    cadenas.className = "tiroir-cadenas";
    cadenas.dataset.cadenasPro = "";
    const texte = document.createElement("span");
    texte.className = "visuellement-cache";
    texte.textContent = "fonction Pro";
    cadenas.append(creerIcone("i-cadenas"), texte);
    bouton.appendChild(cadenas);
  }
  li.appendChild(bouton);
  return li;
}

function creerOnglet(entree) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = entree.central ? "onglet onglet-central" : "onglet";
  bouton.dataset.ecran = entree.ecran;
  bouton.setAttribute("aria-label", entree.libelle);
  if (entree.central) {
    const bulle = document.createElement("span");
    bulle.className = "onglet-bulle";
    bulle.appendChild(creerIcone(entree.icone));
    bouton.appendChild(bulle);
  } else {
    bouton.appendChild(creerIcone(entree.icone));
    const libelle = document.createElement("span");
    libelle.textContent = entree.libelle;
    bouton.appendChild(libelle);
  }
  return bouton;
}

function construireNavigation() {
  const menu = $("tiroir-menu");
  const onglets = $("onglets");
  menu.replaceChildren(...NAVIGATION.filter((e) => ecranExiste(e.ecran)).map(creerLienTiroir));
  onglets.replaceChildren(...ONGLETS.filter((e) => ecranExiste(e.ecran)).map(creerOnglet));
}

/* ---------- Tiroir latéral ---------- */

function tiroirOuvert() {
  return $("tiroir").classList.contains("ouvert");
}

function ouvrirTiroir() {
  if (!tiroirMobileQuery.matches) return;
  $("tiroir").classList.add("ouvert");
  $("tiroir").setAttribute("aria-hidden", "false");
  $("tiroir").inert = false;
  $("voile").classList.add("visible");
  $("bouton-menu").setAttribute("aria-expanded", "true");
  const premier = $("tiroir").querySelector(".tiroir-lien");
  if (premier) premier.focus({ preventScroll: true });
}

function fermerTiroir() {
  const etaitOuvert = tiroirOuvert();
  $("tiroir").classList.remove("ouvert");
  $("voile").classList.remove("visible");
  $("bouton-menu").setAttribute("aria-expanded", "false");
  majAccessibiliteTiroir();
  if (etaitOuvert) $("bouton-menu").focus({ preventScroll: true });
}

function majAccessibiliteTiroir() {
  const visible = !tiroirMobileQuery.matches || tiroirOuvert();
  $("tiroir").setAttribute("aria-hidden", visible ? "false" : "true");
  $("tiroir").inert = !visible;
}

function activerGlissementTiroir() {
  const tiroir = $("tiroir");
  let departX = null;
  tiroir.addEventListener("touchstart", (e) => { departX = e.touches[0].clientX; }, { passive: true });
  tiroir.addEventListener("touchend", (e) => {
    if (departX === null) return;
    const ecart = e.changedTouches[0].clientX - departX;
    departX = null;
    if (ecart < -60) fermerTiroir();
  }, { passive: true });
}

/* ---------- Clavier physique ---------- */

function surToucheClavier(evenement) {
  if (evenement.key === "Escape") {
    if (!$("modale").hidden) fermerModale(false);
    else if (!$("recherche").hidden) fermerRecherche();
    else if (tiroirOuvert()) fermerTiroir();
    return;
  }
  if (montrer.ecranCourant === "presentation") {
    if (evenement.key === "ArrowRight") allerDiapo(presentation.index + 1);
    if (evenement.key === "ArrowLeft") allerDiapo(presentation.index - 1);
  }
}

/* ---------- Modale (information ou confirmation) ---------- */

function ouvrirModale(titre, contenu, options) {
  const reglages = options || {};
  if (etat.resoudreModale) fermerModale(false);
  $("modale-titre").textContent = titre;
  $("modale-contenu").replaceChildren(contenu);
  $("libelle-modale-ok").textContent = reglages.ok || "J'ai compris";
  $("bouton-modale-annuler").hidden = !reglages.annuler;
  $("libelle-modale-annuler").textContent = reglages.annuler || "Annuler";
  etat.resoudreModale = reglages.resoudre || null;
  if (!etat.elementAvantModale) etat.elementAvantModale = document.activeElement;
  $("modale").hidden = false;
  $(reglages.annuler ? "bouton-modale-annuler" : "bouton-modale-ok").focus({ preventScroll: true });
}

function fermerModale(confirme) {
  if ($("modale").hidden) return;
  $("modale").hidden = true;
  const resoudre = etat.resoudreModale;
  etat.resoudreModale = null;
  const precedent = etat.elementAvantModale;
  etat.elementAvantModale = null;
  if (precedent && typeof precedent.focus === "function") precedent.focus({ preventScroll: true });
  if (resoudre) resoudre(confirme === true);
}

function surOkModale() {
  fermerModale(true);
}

function surAnnulerModale() {
  fermerModale(false);
}

function surClicFondModale(evenement) {
  if (evenement.target === evenement.currentTarget) fermerModale(false);
}

/* Promesse résolue à true si l'utilisateur confirme. */
function demanderConfirmation(titre, texte, libelleOui, libelleNon) {
  return new Promise((resoudre) => {
    const paragraphe = document.createElement("p");
    paragraphe.textContent = texte;
    ouvrirModale(titre, paragraphe, { ok: libelleOui, annuler: libelleNon || "Annuler", resoudre });
  });
}

function ouvrirConditions() {
  ouvrirModale("Conditions d'utilisation et confidentialité", $("modele-conditions").content.cloneNode(true));
}

/* ---------- Bouton retour Android ----------
   Ordre : modale → (écran verrouillé : quitter) → recherche → tiroir → diapositive précédente → historique
   (confirmation si un travail n'est pas enregistré) → accueil → quitter. */

async function surBoutonRetour() {
  if (!$("modale").hidden) {
    fermerModale(false);
    return;
  }
  /* Écran verrouillé : le retour ne mène nulle part ailleurs, il ferme l'application
     (l'historique reste intact pour après le déverrouillage). */
  if (etat.verrouille) {
    const appVerrou = plugin("App");
    if (appVerrou) appVerrou.exitApp();
    return;
  }
  if (!$("recherche").hidden) {
    fermerRecherche();
    return;
  }
  if (tiroirOuvert()) {
    fermerTiroir();
    return;
  }
  if (montrer.ecranCourant === "presentation" && presentation.index > 0) {
    allerDiapo(presentation.index - 1);
    return;
  }
  if (etat.travailEnCours) {
    const quitter = await demanderConfirmation("Quitter sans enregistrer ?", etat.travailEnCours + " n'est pas enregistré. Si vous quittez, les modifications seront perdues.", "Quitter", "Rester");
    if (!quitter) return;
    etat.travailEnCours = null;
  }
  if (etat.historique.length > 0) {
    montrer(etat.historique.pop(), { retour: true });
    return;
  }
  if (montrer.ecranCourant && !estEcranEntree(montrer.ecranCourant) && montrer.ecranCourant !== ECRAN_DEPART) {
    montrer(ECRAN_DEPART, { retour: true });
    return;
  }
  const app = plugin("App");
  if (app) app.exitApp();
}

function brancherBoutonRetour() {
  const app = plugin("App");
  if (app) app.addListener("backButton", surBoutonRetour);
}

/* ---------- Logos : repli texte si l'image ne charge pas ---------- */

function surEchecLogo(evenement) {
  const conteneur = evenement.currentTarget.closest("[data-logo]");
  if (conteneur) conteneur.classList.add("logo-echec");
}

/* Photo d'électricien introuvable : l'illustration de repli prend sa place (jamais de cadre vide).
   L'événement error ne remonte pas : il est capté en phase de capture sur le document. */
function remplacerPhoto(img) {
  if (img.dataset.repli === "1") return;
  img.dataset.repli = "1";
  img.classList.add("photo-repli");
  img.src = PHOTO_REPLI;
}

function surEchecImage(evenement) {
  const img = evenement.target;
  if (img instanceof HTMLImageElement && img.closest(".photo-cadre, .diapo-photo")) remplacerPhoto(img);
}

function surveillerPhotos() {
  document.addEventListener("error", surEchecImage, true);
  document.querySelectorAll(".photo-cadre img, .diapo-photo img").forEach((img) => {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) remplacerPhoto(img);
  });
}

function surveillerLogos() {
  document.querySelectorAll("[data-logo] img").forEach((img) => {
    img.addEventListener("error", surEchecLogo);
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src") && img.offsetParent !== null) {
      img.closest("[data-logo]").classList.add("logo-echec");
    }
  });
}

/* ---------- Onde au toucher ---------- */

function surAppuiOnde(evenement) {
  const cible = evenement.target.closest(".bouton, .bouton-icone, .onglet, .tiroir-lien, .touche, .onglet-auth, .raccourci, .compte-puce, .recherche-resultat, .avatar-entete");
  if (!cible || cible.disabled || mouvementReduitQuery.matches) return;
  const rect = cible.getBoundingClientRect();
  const onde = document.createElement("span");
  onde.className = "onde";
  onde.style.left = (evenement.clientX - rect.left) + "px";
  onde.style.top = (evenement.clientY - rect.top) + "px";
  onde.style.setProperty("--onde-echelle", String(Math.ceil(Math.max(rect.width, rect.height) / 5)));
  onde.addEventListener("animationend", () => onde.remove());
  cible.appendChild(onde);
}

/* ---------- Réseau ---------- */

function afficherReseau(enLigne) {
  const indicateur = $("etat-reseau");
  indicateur.textContent = enLigne ? "En ligne" : "Hors ligne";
  indicateur.classList.toggle("ok", enLigne);
  indicateur.classList.toggle("alerte", !enLigne);
}

async function surveillerReseau() {
  const reseau = plugin("Network");
  if (reseau) {
    const statut = await reseau.getStatus().catch(() => ({ connected: navigator.onLine }));
    afficherReseau(statut.connected);
    reseau.addListener("networkStatusChange", (s) => afficherReseau(s.connected));
    return;
  }
  afficherReseau(navigator.onLine);
  window.addEventListener("online", () => afficherReseau(true));
  window.addEventListener("offline", () => afficherReseau(false));
}

/* ---------- Fond animé : réseau de points et impulsions de courant ---------- */

const toileEtat = { ctx: null, largeur: 0, hauteur: 0, points: [], impulsions: [], animation: 0, dernier: 0 };

function dimensionnerToile() {
  const toile = $("toile");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  toileEtat.largeur = window.innerWidth;
  toileEtat.hauteur = window.innerHeight;
  toile.width = Math.round(toileEtat.largeur * ratio);
  toile.height = Math.round(toileEtat.hauteur * ratio);
  toileEtat.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const nombre = Math.round(toileEtat.largeur * toileEtat.hauteur * TOILE.densite);
  const total = Math.max(TOILE.pointsMin, Math.min(TOILE.pointsMax, nombre));
  toileEtat.points = Array.from({ length: total }, creerPoint);
  toileEtat.impulsions = [];
}

function creerPoint() {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.random() * toileEtat.largeur,
    y: Math.random() * toileEtat.hauteur,
    vx: Math.cos(angle) * TOILE.vitesse,
    vy: Math.sin(angle) * TOILE.vitesse,
    r: 1.2 + Math.random() * 1.6
  };
}

function couleurPoint(alpha) {
  const base = getComputedStyle(document.documentElement).getPropertyValue("--toile-point").trim() || "106, 13, 173";
  return "rgba(" + base + ", " + alpha + ")";
}

function deplacerPoints() {
  for (const p of toileEtat.points) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > toileEtat.largeur) p.vx *= -1;
    if (p.y < 0 || p.y > toileEtat.hauteur) p.vy *= -1;
  }
}

function lancerImpulsion(liens) {
  if (toileEtat.impulsions.length >= TOILE.impulsionsMax || liens.length === 0) return;
  if (Math.random() > 0.04) return;
  const [a, b] = liens[Math.floor(Math.random() * liens.length)];
  toileEtat.impulsions.push({ a, b, t: 0 });
}

function dessinerToile() {
  const { ctx, points, largeur, hauteur } = toileEtat;
  const d2max = TOILE.distanceLien * TOILE.distanceLien;
  const liens = [];
  ctx.clearRect(0, 0, largeur, hauteur);
  ctx.lineWidth = 0.7;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < d2max) {
        liens.push([points[i], points[j]]);
        ctx.strokeStyle = couleurPoint(0.16 * (1 - d2 / d2max));
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[j].x, points[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = couleurPoint(0.45);
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  return liens;
}

function dessinerImpulsions() {
  const { ctx } = toileEtat;
  toileEtat.impulsions = toileEtat.impulsions.filter((imp) => imp.t <= 1);
  for (const imp of toileEtat.impulsions) {
    imp.t += TOILE.vitesseImpulsion * 1.6;
    const x = imp.a.x + (imp.b.x - imp.a.x) * imp.t;
    const y = imp.a.y + (imp.b.y - imp.a.y) * imp.t;
    const lueur = ctx.createRadialGradient(x, y, 0, x, y, 9);
    lueur.addColorStop(0, "rgba(255, 212, 0, 0.95)");
    lueur.addColorStop(1, "rgba(255, 212, 0, 0)");
    ctx.fillStyle = lueur;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function boucleToile(horodatage) {
  toileEtat.animation = requestAnimationFrame(boucleToile);
  if (horodatage - toileEtat.dernier < 33) return;
  toileEtat.dernier = horodatage;
  deplacerPoints();
  const liens = dessinerToile();
  lancerImpulsion(liens);
  dessinerImpulsions();
}

function demarrerToile() {
  arreterToile();
  if (mouvementReduitQuery.matches) {
    dessinerToile();
    return;
  }
  toileEtat.animation = requestAnimationFrame(boucleToile);
}

function arreterToile() {
  if (toileEtat.animation) cancelAnimationFrame(toileEtat.animation);
  toileEtat.animation = 0;
}

function initialiserToile() {
  const toile = $("toile");
  const ctx = toile.getContext ? toile.getContext("2d") : null;
  if (!ctx) return;
  toileEtat.ctx = ctx;
  dimensionnerToile();
  demarrerToile();
  let minuterie = 0;
  window.addEventListener("resize", () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { dimensionnerToile(); demarrerToile(); }, 150);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) arreterToile();
    else demarrerToile();
  });
  mouvementReduitQuery.addEventListener("change", demarrerToile);
}

/* ---------- Présentation (première ouverture) ---------- */

function construirePoints() {
  const diapos = document.querySelectorAll("#diapos .diapo");
  presentation.total = diapos.length;
  const points = [...diapos].map((diapo, index) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "point";
    bouton.dataset.index = String(index);
    bouton.setAttribute("aria-label", "Diapositive " + (index + 1) + " sur " + diapos.length);
    bouton.appendChild(document.createElement("span"));
    bouton.addEventListener("click", surClicPoint);
    return bouton;
  });
  $("points").replaceChildren(...points);
}

function surClicPoint(evenement) {
  allerDiapo(Number(evenement.currentTarget.dataset.index));
}

function allerDiapo(index) {
  const borne = Math.max(0, Math.min(presentation.total - 1, index));
  presentation.index = borne;
  $("diapos").style.transform = "translateX(" + (-borne * 100) + "%)";
  document.querySelectorAll("#diapos .diapo").forEach((diapo, i) => {
    diapo.inert = i !== borne;
    diapo.setAttribute("aria-hidden", i === borne ? "false" : "true");
  });
  document.querySelectorAll("#points .point").forEach((point, i) => {
    point.setAttribute("aria-current", i === borne ? "true" : "false");
  });
  const derniere = borne === presentation.total - 1;
  $("libelle-diapo-suivante").textContent = derniere ? "Commencer" : "Suivant";
}

function surDiapoSuivante() {
  vibrer();
  if (presentation.index >= presentation.total - 1) terminerPresentation();
  else allerDiapo(presentation.index + 1);
}

async function terminerPresentation() {
  await ecrireValeur(CLES_STOCKAGE.presentationVue, "1");
  montrer(etat.compte ? ECRAN_DEPART : "connexion");
}

function surDebutGlisse(evenement) {
  if (evenement.pointerType === "mouse" && evenement.button !== 0) return;
  presentation.departX = evenement.clientX;
  presentation.ecart = 0;
  $("diapos").classList.add("glisse");
  evenement.currentTarget.setPointerCapture(evenement.pointerId);
}

function surGlisse(evenement) {
  if (presentation.departX === null) return;
  presentation.ecart = evenement.clientX - presentation.departX;
  $("diapos").style.transform = "translateX(calc(" + (-presentation.index * 100) + "% + " + presentation.ecart + "px))";
}

function surFinGlisse() {
  if (presentation.departX === null) return;
  presentation.departX = null;
  $("diapos").classList.remove("glisse");
  if (presentation.ecart < -50) allerDiapo(presentation.index + 1);
  else if (presentation.ecart > 50) allerDiapo(presentation.index - 1);
  else allerDiapo(presentation.index);
}

/* ---------- Pays, devises et téléphone ---------- */

function paysDepuisIndicatif(indicatif, isoPrefere) {
  const candidats = PAYS.filter((p) => p.indicatif === indicatif);
  return candidats.find((p) => p.iso === isoPrefere) || candidats[0];
}

/* Lit le numéro saisi. L'indicatif le PLUS LONG est testé en premier (226 avant 22). */
function analyserTelephone(saisie, isoPrefere) {
  const brut = String(saisie || "").trim();
  const chiffres = brut.replace(/\D/g, "");
  const avecPlus = brut.startsWith("+");
  const avecZeros = !avecPlus && chiffres.startsWith("00");
  const utiles = avecZeros ? chiffres.slice(2) : chiffres;
  const international = avecPlus || avecZeros;
  if (international || utiles.length >= 11) {
    const indicatif = INDICATIFS.find((i) => utiles.startsWith(i));
    if (indicatif) {
      const pays = paysDepuisIndicatif(indicatif, isoPrefere);
      let national = utiles.slice(indicatif.length);
      if (pays.zero && national.startsWith("0") && !pays.longueurs.includes(national.length)) national = national.slice(1);
      return { pays, national, detecte: true };
    }
    if (international) return { pays: null, national: "", detecte: false };
  }
  const pays = PAYS_PAR_ISO.get(isoPrefere) || PAYS_PAR_ISO.get(PAYS_DEFAUT);
  const national = pays.zero && utiles.startsWith("0") ? utiles.slice(1) : utiles;
  return { pays, national, detecte: false };
}

function telephoneValide(analyse) {
  if (!analyse.pays || !/^\d+$/.test(analyse.national)) return false;
  const total = analyse.pays.indicatif.length + analyse.national.length;
  return analyse.pays.longueurs.includes(analyse.national.length)
    && total >= BORNES.telephoneMin && total <= BORNES.telephoneMax;
}

function versE164(analyse) {
  return "+" + analyse.pays.indicatif + analyse.national;
}

function paires(texte) {
  return (texte.match(/.{1,2}/g) || []).join(" ");
}

function formaterNational(national, pays) {
  if (pays.indicatif === "1" && national.length === 10) {
    return national.slice(0, 3) + " " + national.slice(3, 6) + " " + national.slice(6);
  }
  if (national.length % 2 === 0) return paires(national);
  if (pays.zero) return national.slice(0, 1) + " " + paires(national.slice(1));
  return national.slice(0, 3) + " " + paires(national.slice(3));
}

/* Toujours au format international affiché : « +226 05 60 86 08 ». */
function formaterTelephone(e164, iso) {
  const pays = PAYS_PAR_ISO.get(iso);
  if (!pays || !e164.startsWith("+" + pays.indicatif)) return e164;
  return "+" + pays.indicatif + " " + formaterNational(e164.slice(pays.indicatif.length + 1), pays);
}

function messageTelephone(analyse) {
  if (!analyse.pays) return "Indicatif inconnu. Choisissez votre pays ou écrivez le numéro avec son indicatif (ex. +226).";
  const longueurs = analyse.pays.longueurs.join(" ou ");
  return "Numéro incorrect pour " + analyse.pays.nom + " : " + longueurs + " chiffres après +" + analyse.pays.indicatif + ".";
}

/* Aperçu sous le champ : « Côte d'Ivoire · Franc CFA (UEMOA) — +225 07 08 09 10 11 ».
   Le numéro est insécable : jamais coupé en fin de ligne. */
function afficherApercu(idApercu, analyse, saisie) {
  const apercu = $(idApercu);
  if (!String(saisie || "").trim()) {
    apercu.replaceChildren();
    return;
  }
  if (!analyse.pays) {
    apercu.replaceChildren("Indicatif inconnu.");
    return;
  }
  const base = analyse.pays.nom + " · " + DEVISES[analyse.pays.devise].nom;
  if (!telephoneValide(analyse)) {
    apercu.replaceChildren(base);
    return;
  }
  const numero = document.createElement("span");
  numero.className = "insecable";
  numero.textContent = formaterTelephone(versE164(analyse), analyse.pays.iso);
  apercu.replaceChildren(base + " — ", numero);
}

function remplirListes(prefixe, iso, codeDevise) {
  const options = [...PAYS]
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((p) => new Option(p.nom + " (+" + p.indicatif + ")", p.iso));
  $(prefixe + "-pays").replaceChildren(...options);
  $(prefixe + "-pays").value = iso;
  const devises = Object.entries(DEVISES).map(([code, d]) => new Option(d.libelle + " — " + d.nom, code));
  $(prefixe + "-devise").replaceChildren(...devises);
  $(prefixe + "-devise").value = codeDevise;
}

/* Le pays et la devise suivent l'indicatif saisi (226 avant 22). */
function majTelephone(prefixe) {
  const champ = $(prefixe + "-telephone");
  const analyse = analyserTelephone(champ.value, $(prefixe + "-pays").value);
  if (analyse.pays && analyse.detecte && analyse.pays.iso !== $(prefixe + "-pays").value) {
    $(prefixe + "-pays").value = analyse.pays.iso;
    $(prefixe + "-devise").value = analyse.pays.devise;
  }
  afficherApercu("apercu-" + prefixe + "-telephone", analyse, champ.value);
  effacerErreur(champ);
}

function majPays(prefixe) {
  const pays = PAYS_PAR_ISO.get($(prefixe + "-pays").value);
  if (pays) $(prefixe + "-devise").value = pays.devise;
  majTelephone(prefixe);
}

function surSaisieTelephoneInscription() {
  majTelephone("ins");
}

function surChangementPaysInscription() {
  majPays("ins");
}

function surSaisieTelephoneProfil() {
  majTelephone("pro");
}

function surChangementPaysProfil() {
  majPays("pro");
}

function surSaisieTelephoneConnexion() {
  const champ = $("cnx-telephone");
  const analyse = analyserTelephone(champ.value, PAYS_DEFAUT);
  afficherApercu("apercu-cnx-telephone", analyse, champ.value);
  effacerErreur(champ);
  majLienCodeOublie(analyse);
}

function majLienCodeOublie(analyse) {
  const numero = analyse && telephoneValide(analyse) ? " Mon numéro : " + formaterTelephone(versE164(analyse), analyse.pays.iso) + "." : "";
  const texte = "Bonjour BRG Électro+, j'ai oublié mon code secret BâtiPlus." + numero;
  $("lien-code-oublie").href = "https://wa.me/" + WHATSAPP_BRG.replace(/[^0-9]/g, "") + "?text=" + encodeURIComponent(texte);
}

/* ---------- Saisie du code secret (clavier 1-9, 0) ---------- */

function afficherCode(id) {
  const valeur = codes[id];
  const visible = codesVisibles.has(id);
  const cases = [];
  for (let i = 0; i < CODE.longueurMax; i++) {
    const caseCode = document.createElement("span");
    caseCode.className = "code-case";
    caseCode.setAttribute("aria-hidden", "true");
    if (i < valeur.length && visible) {
      caseCode.classList.add("chiffre");
      caseCode.textContent = valeur[i];
    } else if (i < valeur.length) {
      caseCode.classList.add("pleine");
    } else if (i >= CODE.longueurMin) {
      caseCode.classList.add("facultative");
    }
    cases.push(caseCode);
  }
  const lecteur = document.createElement("span");
  lecteur.className = "visuellement-cache";
  lecteur.textContent = valeur.length + " chiffre" + (valeur.length > 1 ? "s" : "") + " saisi" + (valeur.length > 1 ? "s" : "");
  cases.push(lecteur);
  $(id).replaceChildren(...cases);
}

function activerCode(id) {
  const clavier = $(id).dataset.clavier;
  cibleClavier[clavier] = id;
  document.querySelectorAll('[data-clavier="' + clavier + '"]').forEach((champ) => {
    champ.classList.toggle("actif", champ.id === id);
  });
}

function saisirChiffre(id, chiffre) {
  if (!/^\d$/.test(chiffre) || codes[id].length >= CODE.longueurMax) return;
  codes[id] += chiffre;
  afficherCode(id);
  effacerErreur($(id));
  vibrer();
  if (CODE_SUIVANT[id] && codes[id].length === CODE.longueurMax) activerCode(CODE_SUIVANT[id]);
}

function effacerChiffre(id) {
  codes[id] = codes[id].slice(0, -1);
  afficherCode(id);
}

function viderCode(id) {
  codes[id] = "";
  afficherCode(id);
}

function creerClavier(idClavier) {
  const touches = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "effacer"];
  const boutons = touches.map((touche) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "touche";
    if (touche === "") {
      bouton.classList.add("touche-vide");
      bouton.disabled = true;
      bouton.tabIndex = -1;
      bouton.setAttribute("aria-hidden", "true");
    } else if (touche === "effacer") {
      bouton.dataset.touche = "effacer";
      bouton.setAttribute("aria-label", "Effacer le dernier chiffre");
      bouton.appendChild(creerIcone("i-effacer"));
    } else {
      bouton.dataset.touche = touche;
      bouton.textContent = touche;
    }
    return bouton;
  });
  $(idClavier).replaceChildren(...boutons);
  $(idClavier).addEventListener("click", surToucheClavierCode);
}

function surToucheClavierCode(evenement) {
  const bouton = evenement.target.closest("[data-touche]");
  if (!bouton) return;
  const id = cibleClavier[evenement.currentTarget.id];
  if (bouton.dataset.touche === "effacer") effacerChiffre(id);
  else saisirChiffre(id, bouton.dataset.touche);
}

function surActivationCode(evenement) {
  activerCode(evenement.currentTarget.id);
}

function surToucheCode(evenement) {
  const id = evenement.currentTarget.id;
  if (/^\d$/.test(evenement.key)) {
    evenement.preventDefault();
    saisirChiffre(id, evenement.key);
  } else if (evenement.key === "Backspace") {
    evenement.preventDefault();
    effacerChiffre(id);
  }
}

function surOeil(evenement) {
  const bouton = evenement.currentTarget;
  const id = bouton.dataset.oeil;
  const visible = !codesVisibles.has(id);
  if (visible) codesVisibles.add(id);
  else codesVisibles.delete(id);
  bouton.setAttribute("aria-pressed", String(visible));
  bouton.setAttribute("aria-label", visible ? "Masquer le code" : "Afficher le code");
  afficherCode(id);
}

/* Refuse 0000, 1111, 1234, 4321, 123456, 1212… */
/* Codes refusés parce qu'ils sont parmi les premiers essayés par un voleur :
   motif répété (0000, 4545, 121212, 123123), suite (1234, 9876, 7890, 3210),
   année à 4 chiffres de 1940 à 2039 (naissance, mariage, année en cours). */
function codeTrivial(code) {
  if (/^(\d{1,3})\1+$/.test(code)) return true;
  const chiffres = [...code].map(Number);
  const montante = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 1) % 10);
  const descendante = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 9) % 10);
  if (montante || descendante) return true;
  return code.length === 4 && /^(19[4-9]\d|20[0-3]\d)$/.test(code);
}

function erreurCodeNeuf(code) {
  if (code.length < CODE.longueurMin || code.length > CODE.longueurMax || !/^\d+$/.test(code)) {
    return "Le code doit comporter de 4 à 6 chiffres.";
  }
  if (codeTrivial(code)) return "Code trop simple (comme 1234, 0000, 1212 ou une année). Choisissez-en un moins évident.";
  return "";
}

/* ---------- Cryptographie (WebCrypto) ---------- */

function cryptoDisponible() {
  return Boolean(window.isSecureContext && window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
}

/* Par tranches de 32 Ko : un PDF de plusieurs centaines de Ko ne sature pas la pile. */
function versBase64(octets) {
  const tableau = octets instanceof Uint8Array ? octets : Uint8Array.from(octets);
  let binaire = "";
  for (let i = 0; i < tableau.length; i += 0x8000) binaire += String.fromCharCode.apply(null, tableau.subarray(i, i + 0x8000));
  return btoa(binaire);
}

function depuisBase64(texte) {
  const binaire = atob(texte);
  return Uint8Array.from(binaire, (c) => c.charCodeAt(0));
}

/* PBKDF2-SHA256, 150 000 itérations, sel aléatoire de 16 octets. */
async function deriverEmpreinte(code, sel, iterations) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sel, iterations }, cle, CODE.bitsEmpreinte);
  return new Uint8Array(bits);
}

function egaliteConstante(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function identifiantAleatoire() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((o) => o.toString(16).padStart(2, "0")).join("");
}

/* ---------- Comptes, session, blocage ---------- */

function compteValide(compte) {
  return Boolean(compte) && typeof compte.id === "string" && typeof compte.telephone === "string"
    && typeof compte.nom === "string" && typeof compte.sel === "string" && typeof compte.empreinte === "string"
    && Number.isInteger(compte.iterations) && compte.iterations >= CODE.iterations
    && PAYS_PAR_ISO.has(compte.pays) && Object.prototype.hasOwnProperty.call(DEVISES, compte.devise)
    && imageFacultative(compte.photo) && imageFacultative(compte.logo)
    && (compte.conditions === undefined || (typeof compte.conditions === "string" && compte.conditions.length <= BORNES.conditionsMax));
}

function imageFacultative(valeur) {
  return valeur === undefined || valeur === "" || (typeof valeur === "string" && valeur.length <= IMAGES.donneesMax && DONNEES_IMAGE.test(valeur));
}

async function lireComptes() {
  const liste = await lireJson(CLES_STOCKAGE.comptes);
  return Array.isArray(liste) ? liste.filter(compteValide) : [];
}

async function ecrireComptes(liste) {
  return ecrireValeur(CLES_STOCKAGE.comptes, JSON.stringify(liste));
}

async function lireSession() {
  const session = await lireJson(CLES_STOCKAGE.session);
  return session && typeof session.compteId === "string" ? session : null;
}

async function ouvrirSession(compte) {
  const maintenant = Date.now();
  await ecrireValeur(CLES_STOCKAGE.session, JSON.stringify({ compteId: compte.id, ouverte: maintenant, derniereActivite: maintenant }));
  activite.derniere = maintenant;
  activite.ecrite = maintenant;
  etat.verrouille = false;
  etat.compte = compte;
  etat.abonnement = await abonnementCourant();
  afficherCompte(compte);
  planifierRappels();
}

async function fermerSession() {
  if (assistant.minuterie) await enregistrerBrouillon();
  if (resultat.minuterie) await enregistrerResultat();
  if (fiche.minuterie) await enregistrerDevis();
  if (mesPrix.minuterie) await enregistrerMesPrix();
  etat.verrouille = false;
  viderCode("ver-code");
  assistant.chantier = null;
  resultat.chantier = null;
  resultat.id = null;
  await supprimerValeur(CLES_STOCKAGE.session);
  etat.compte = null;
  etat.abonnement = { formule: FORMULE_DEFAUT, fin: null, verifie: false };
  etat.abonnement = null;
  etat.travailEnCours = null;
  afficherCompte(null);
  await afficherComptesAppareil();
  choisirOnglet("connexion");
  montrer("connexion");
}

async function lireVerrou() {
  const v = await lireJson(CLES_STOCKAGE.verrou) || {};
  const echecs = Number.isInteger(v.echecs) && v.echecs >= 0 ? v.echecs : 0;
  const maximum = Date.now() + BLOCAGE.durees[BLOCAGE.durees.length - 1];
  const jusqua = Number.isFinite(v.jusqua) ? Math.min(v.jusqua, maximum) : 0;
  return { echecs, jusqua };
}

async function enregistrerEchec() {
  const verrou = await lireVerrou();
  verrou.echecs += 1;
  if (verrou.echecs >= BLOCAGE.essaisLibres) {
    const rang = Math.min(verrou.echecs - BLOCAGE.essaisLibres, BLOCAGE.durees.length - 1);
    verrou.jusqua = Date.now() + BLOCAGE.durees[rang];
  }
  await ecrireValeur(CLES_STOCKAGE.verrou, JSON.stringify(verrou));
  return verrou;
}

async function reinitialiserVerrou() {
  await supprimerValeur(CLES_STOCKAGE.verrou);
}

function formaterDuree(ms) {
  const secondes = Math.ceil(ms / 1000);
  return Math.floor(secondes / 60) + ":" + String(secondes % 60).padStart(2, "0");
}

/* Le même compteur d'échecs sert à la connexion et au déverrouillage : changer d'écran ne remet rien à zéro. */
const ZONES_BLOCAGE = Object.freeze([
  Object.freeze({ message: "msg-blocage", texte: "texte-blocage", bouton: "bouton-connexion" }),
  Object.freeze({ message: "msg-blocage-verrou", texte: "texte-blocage-verrou", bouton: "bouton-deverrouiller" })
]);

function afficherBlocage(jusqua) {
  clearInterval(etat.minuterieBlocage);
  const mettreAJour = () => {
    const reste = jusqua - Date.now();
    if (reste <= 0) {
      clearInterval(etat.minuterieBlocage);
      ZONES_BLOCAGE.forEach((zone) => {
        $(zone.message).hidden = true;
        $(zone.bouton).disabled = false;
      });
      return;
    }
    ZONES_BLOCAGE.forEach((zone) => {
      $(zone.message).hidden = false;
      $(zone.bouton).disabled = true;
      $(zone.texte).textContent = "Trop d'essais. Réessayez dans " + formaterDuree(reste) + ".";
    });
  };
  mettreAJour();
  etat.minuterieBlocage = setInterval(mettreAJour, 1000);
}

/* ---------- Formulaires : erreurs ---------- */

function afficherErreur(idChamp, message) {
  const champ = $(idChamp);
  const bloc = champ.closest(".champ");
  $("err-" + idChamp).textContent = message;
  bloc.classList.add("invalide");
  champ.setAttribute("aria-invalid", "true");
  trembler(bloc);
}

function effacerErreur(champ) {
  const bloc = champ ? champ.closest(".champ") : null;
  if (!bloc) return;
  const erreur = $("err-" + champ.id);
  if (erreur) erreur.textContent = "";
  bloc.classList.remove("invalide");
  champ.removeAttribute("aria-invalid");
}

/* ---------- Saisies numériques : règles partagées (REGLES_SAISIE, contrôle ㊻) ----------
   Tout champ numérique porte data-regle. Un écouteur unique, en phase de capture, contrôle
   chaque frappe AVANT les écouteurs de l'écran : une valeur refusée (lettres, négatif, trop
   de décimales, hors bornes) n'atteint jamais le modèle, un message dit pourquoi, et la
   dernière valeur valide est remise en place quand on quitte le champ. Le moteur borne
   de nouveau tout ce qu'il reçoit (stockage falsifié, sauvegarde, fiche ancienne). */

function regleChamp(entree) {
  const nom = entree && entree.dataset ? entree.dataset.regle : "";
  return nom && Object.prototype.hasOwnProperty.call(REGLE, nom) ? REGLE[nom] : null;
}

function decimalesRegle(regle) {
  return regle.devise ? Math.min(regle.decimales, decimalesDevise(deviseCompte())) : regle.decimales;
}

function borneLisible(nombre, regle) {
  if (regle.devise) return formaterMontant(nombre, deviseCompte());
  return formaterQuantite(nombre) + (regle.unite ? "\u00A0" + regle.unite : "");
}

/* Raison du refus, ou "" si la saisie respecte la règle. Vide = valeur par défaut : accepté. */
function raisonRefus(texte, regle) {
  const brut = String(texte).replace(/[\s\u00A0\u202F]/g, "");
  if (brut === "") return "";
  if (/^[-−]/.test(brut)) return "les nombres négatifs ne sont pas acceptés";
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(brut)) return "chiffres et virgule uniquement";
  const decimales = decimalesRegle(regle);
  if ((brut.split(/[.,]/)[1] || "").length > decimales) {
    if (decimales > 0) return decimales + (decimales > 1 ? " décimales" : " décimale") + " au maximum";
    return regle.devise ? "pas de centimes en " + (DEVISES[deviseCompte()] || DEVISES.XOF).libelle : "nombre entier uniquement";
  }
  const nombre = lireNombre(brut);
  if (!Number.isFinite(nombre) || nombre < regle.min || nombre > regle.max) {
    return regle.libelle.charAt(0).toLowerCase() + regle.libelle.slice(1) + " va de " + borneLisible(regle.min, regle) + " à " + borneLisible(regle.max, regle);
  }
  return "";
}

/* Zone de message du champ : celle de l'écran si elle existe, sinon créée juste après. */
function zoneRefus(entree) {
  const existante = $("err-" + entree.id);
  if (existante) return existante;
  const zone = document.createElement("p");
  zone.className = "champ-erreur erreur-saisie";
  zone.id = "err-" + entree.id;
  (entree.closest(".compteur-saisie") || entree).after(zone);
  const decrit = (entree.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
  if (!decrit.includes(zone.id)) entree.setAttribute("aria-describedby", decrit.concat(zone.id).join(" "));
  return zone;
}

function signalerRefus(entree, texte) {
  zoneRefus(entree).textContent = texte;
  entree.setAttribute("aria-invalid", "true");
  entree.dataset.refus = "1";
  const bloc = entree.closest(".champ");
  if (bloc) bloc.classList.add("invalide");
}

function retirerRefus(entree) {
  if (!entree.dataset.refus) return;
  delete entree.dataset.refus;
  const zone = $("err-" + entree.id);
  if (zone) zone.textContent = "";
  entree.removeAttribute("aria-invalid");
  const bloc = entree.closest(".champ");
  if (bloc) bloc.classList.remove("invalide");
}

/* Lecture groupée d'un écran : un champ dont la saisie a été refusée compte pour sa dernière valeur valide. */
function valeurSaisie(entree) {
  if (entree.dataset.refus && regleChamp(entree)) return (entree.dataset.derniereValide || "").trim();
  return entree.value.trim();
}

function surFocusNumerique(evenement) {
  const entree = evenement.target;
  const regle = regleChamp(entree);
  if (regle && !raisonRefus(entree.value, regle)) entree.dataset.derniereValide = entree.value;
}

function surSaisieNumerique(evenement) {
  const entree = evenement.target;
  const regle = regleChamp(entree);
  if (!regle || entree.tagName !== "INPUT") return;
  const raison = raisonRefus(entree.value, regle);
  if (!raison) {
    entree.dataset.derniereValide = entree.value;
    if (surSaisieNumerique.restauration !== entree) retirerRefus(entree);
    return;
  }
  evenement.stopImmediatePropagation();
  const debut = "Saisie refusée : " + raison + ".";
  if (evenement.type !== "change" || entree.dataset.derniereValide === undefined) {
    signalerRefus(entree, debut);
    return;
  }
  /* En quittant le champ : la dernière valeur valide revient, le message reste affiché. */
  signalerRefus(entree, debut + (entree.dataset.derniereValide === "" ? " Le champ est vidé." : " La valeur précédente est rétablie."));
  entree.value = entree.dataset.derniereValide;
  trembler(entree.closest(".champ") || entree);
  surSaisieNumerique.restauration = entree;
  entree.dispatchEvent(new Event("change", { bubbles: true }));
  surSaisieNumerique.restauration = null;
}
surSaisieNumerique.restauration = null;

function nettoyerTexte(valeur) {
  return String(valeur || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
}

function texteValide(texte, obligatoire) {
  if (!texte) return !obligatoire;
  return texte.length >= BORNES.texteMin && texte.length <= BORNES.texteMax;
}

function allerAuChamp(id) {
  const champ = $(id);
  champ.focus({ preventScroll: true });
  champ.closest(".champ").scrollIntoView({ block: "center", behavior: defilementDoux() });
}

function surSaisieChamp(evenement) {
  effacerErreur(evenement.currentTarget);
}

/* Fait remonter le champ actif au-dessus du clavier du téléphone. */
function surFocusChamp(evenement) {
  if (!tiroirMobileQuery.matches) return;
  /* Seuls les vrais champs ouvrent le clavier du téléphone. Le code secret a son propre
     clavier : le recentrer à chaque touche ferait sauter la page sous le doigt. */
  if (!evenement.target.matches("input:not([type=checkbox]):not([type=file]), textarea, select")) return;
  const champ = evenement.target.closest(".champ");
  if (!champ) return;
  setTimeout(() => champ.scrollIntoView({ block: "center", behavior: defilementDoux() }), 280);
}

/* ---------- Onglets Créer un compte / Se connecter ---------- */

function choisirOnglet(nom) {
  const inscription = nom === "inscription";
  $("onglet-inscription").setAttribute("aria-selected", String(inscription));
  $("onglet-connexion").setAttribute("aria-selected", String(!inscription));
  $("onglet-inscription").tabIndex = inscription ? 0 : -1;
  $("onglet-connexion").tabIndex = inscription ? -1 : 0;
  $("panneau-inscription").hidden = !inscription;
  $("panneau-connexion").hidden = inscription;
}

function surClicOnglet(evenement) {
  choisirOnglet(evenement.currentTarget.id === "onglet-inscription" ? "inscription" : "connexion");
}

function surToucheOnglets(evenement) {
  if (evenement.key !== "ArrowLeft" && evenement.key !== "ArrowRight") return;
  const versInscription = $("onglet-inscription").getAttribute("aria-selected") !== "true";
  choisirOnglet(versInscription ? "inscription" : "connexion");
  $(versInscription ? "onglet-inscription" : "onglet-connexion").focus();
}

/* ---------- Inscription ---------- */

function lireFormulaireInscription() {
  const ids = ["ins-nom", "ins-entreprise", "ins-telephone", "ins-ville", "ins-code", "ins-confirmation", "ins-conditions"];
  ids.forEach((id) => effacerErreur($(id)));
  $("msg-inscription").textContent = "";
  let premier = "";
  const signaler = (id, message) => {
    afficherErreur(id, message);
    premier = premier || id;
  };

  const nom = nettoyerTexte($("ins-nom").value);
  if (!texteValide(nom, true)) signaler("ins-nom", "Indiquez votre nom complet (120 caractères au maximum).");
  const entreprise = nettoyerTexte($("ins-entreprise").value);
  if (!texteValide(entreprise, false)) signaler("ins-entreprise", "120 caractères au maximum.");
  const analyse = analyserTelephone($("ins-telephone").value, $("ins-pays").value);
  if (!telephoneValide(analyse)) signaler("ins-telephone", messageTelephone(analyse));
  const ville = nettoyerTexte($("ins-ville").value);
  if (!texteValide(ville, true)) signaler("ins-ville", "Indiquez votre ville (120 caractères au maximum).");
  const erreurCode = erreurCodeNeuf(codes["ins-code"]);
  if (erreurCode) signaler("ins-code", erreurCode);
  else if (codes["ins-confirmation"] !== codes["ins-code"]) signaler("ins-confirmation", "Les deux codes ne sont pas identiques.");
  if (!$("ins-conditions").checked) signaler("ins-conditions", "Acceptez les conditions pour créer votre compte.");

  if (premier) {
    allerAuChamp(premier);
    return null;
  }
  const devise = Object.prototype.hasOwnProperty.call(DEVISES, $("ins-devise").value) ? $("ins-devise").value : analyse.pays.devise;
  return { nom, entreprise, telephone: versE164(analyse), pays: analyse.pays.iso, devise, ville };
}

async function surInscription(evenement) {
  evenement.preventDefault();
  if (!cryptoDisponible()) {
    $("msg-inscription").textContent = "Cet appareil ne permet pas de protéger votre code. Mettez à jour votre navigateur ou utilisez l'application.";
    return;
  }
  const donnees = lireFormulaireInscription();
  if (!donnees) return;
  const bouton = $("bouton-inscription");
  bouton.setAttribute("aria-busy", "true");
  try {
    const comptes = await lireComptes();
    if (comptes.some((c) => c.telephone === donnees.telephone)) {
      $("msg-inscription").textContent = "Impossible de créer un compte avec ce numéro. Si vous avez déjà un compte, utilisez « Se connecter ».";
      trembler($("msg-inscription"));
      return;
    }
    const sel = crypto.getRandomValues(new Uint8Array(CODE.octetsSel));
    const empreinte = await deriverEmpreinte(codes["ins-code"], sel, CODE.iterations);
    const compte = {
      id: identifiantAleatoire(),
      ...donnees,
      sel: versBase64(sel),
      empreinte: versBase64(empreinte),
      iterations: CODE.iterations,
      creeLe: new Date().toISOString()
    };
    if (!await ecrireComptes([...comptes, compte])) {
      $("msg-inscription").textContent = "Enregistrement impossible sur cet appareil. Libérez de l'espace puis réessayez.";
      return;
    }
    $("panneau-inscription").reset();
    viderCode("ins-code");
    viderCode("ins-confirmation");
    $("apercu-ins-telephone").textContent = "";
    remplirListes("ins", PAYS_DEFAUT, PAYS_PAR_ISO.get(PAYS_DEFAUT).devise);
    await ouvrirSession(compte);
    vibrer();
    montrer(ECRAN_DEPART);
  } finally {
    bouton.removeAttribute("aria-busy");
  }
}

/* ---------- Connexion ---------- */

async function verifierIdentifiants(telephone, code) {
  const comptes = await lireComptes();
  const compte = comptes.find((c) => c.telephone === telephone) || null;
  /* Même calcul, compte trouvé ou non : la durée ne révèle rien. */
  let sel = crypto.getRandomValues(new Uint8Array(CODE.octetsSel));
  let attendue = new Uint8Array(CODE.bitsEmpreinte / 8);
  try {
    if (compte) {
      sel = depuisBase64(compte.sel);
      attendue = depuisBase64(compte.empreinte);
    }
  } catch (erreur) {
    return null;
  }
  const calculee = await deriverEmpreinte(code, sel, compte ? compte.iterations : CODE.iterations);
  return compte && egaliteConstante(calculee, attendue) ? compte : null;
}

async function surConnexion(evenement) {
  evenement.preventDefault();
  $("msg-connexion").textContent = "";
  effacerErreur($("cnx-telephone"));
  effacerErreur($("cnx-code"));
  const verrou = await lireVerrou();
  if (verrou.jusqua > Date.now()) {
    afficherBlocage(verrou.jusqua);
    trembler($("msg-blocage"));
    return;
  }
  if (!cryptoDisponible()) {
    $("msg-connexion").textContent = "Cet appareil ne permet pas de vérifier votre code de façon sûre.";
    return;
  }
  const analyse = analyserTelephone($("cnx-telephone").value, PAYS_DEFAUT);
  let invalide = false;
  if (!telephoneValide(analyse)) {
    afficherErreur("cnx-telephone", messageTelephone(analyse));
    invalide = true;
  }
  const code = codes["cnx-code"];
  if (!/^\d{4,6}$/.test(code)) {
    afficherErreur("cnx-code", "Saisissez votre code de 4 à 6 chiffres.");
    invalide = true;
  }
  if (invalide) return;

  const bouton = $("bouton-connexion");
  bouton.setAttribute("aria-busy", "true");
  try {
    const compte = await verifierIdentifiants(versE164(analyse), code);
    viderCode("cnx-code");
    if (compte) {
      await reinitialiserVerrou();
      $("cnx-telephone").value = "";
      $("apercu-cnx-telephone").textContent = "";
      await ouvrirSession(compte);
      vibrer();
      montrer(ECRAN_DEPART);
      return;
    }
    const nouveau = await enregistrerEchec();
    if (nouveau.jusqua > Date.now()) {
      $("msg-connexion").textContent = "Téléphone ou code incorrect.";
      afficherBlocage(nouveau.jusqua);
    } else {
      const reste = BLOCAGE.essaisLibres - nouveau.echecs;
      $("msg-connexion").textContent = "Téléphone ou code incorrect. Encore " + reste + " essai" + (reste > 1 ? "s" : "") + " avant un blocage temporaire.";
    }
    trembler($("cnx-code").closest(".champ"));
  } finally {
    bouton.removeAttribute("aria-busy");
  }
}

/* ---------- Verrouillage automatique (15 min sans activité) ----------
   La dernière activité (toucher, clavier, saisie) est gardée en mémoire et recopiée dans
   la session au plus toutes les 30 s et au passage en arrière-plan : une application tuée
   puis relancée après 15 min s'ouvre verrouillée. Une session sans date d'activité lisible,
   ou datée dans le futur, est traitée comme expirée. Tant que l'application est verrouillée,
   montrer() ne mène qu'à l'écran de verrouillage ; le travail en cours reste en mémoire et
   les brouillons sont enregistrés. */

const activite = { derniere: 0, ecrite: 0, ecranAvant: null, minuterie: 0 };

function inactiviteDepassee(maintenant) {
  return maintenant - activite.derniere >= VERROUILLAGE.inactiviteMs;
}

/* Au démarrage : reprend la date d'activité enregistrée, verrouille si elle est trop ancienne. */
function reprendreActivite(session) {
  const maintenant = Date.now();
  const lue = Number.isFinite(session.derniereActivite) ? session.derniereActivite : 0;
  activite.derniere = lue > maintenant + VERROUILLAGE.avanceToleree ? 0 : Math.min(lue, maintenant);
  activite.ecrite = activite.derniere;
  if (inactiviteDepassee(maintenant)) {
    etat.verrouille = true;
    activite.ecranAvant = ECRAN_DEPART;
  }
}

async function ecrireActivite(quand) {
  const session = await lireSession();
  if (!session || !etat.compte || session.compteId !== etat.compte.id) return;
  activite.ecrite = Date.now();
  await ecrireValeur(CLES_STOCKAGE.session, JSON.stringify({ compteId: session.compteId, ouverte: session.ouverte, derniereActivite: quand }));
}

function surActiviteUtilisateur() {
  if (!etat.compte || etat.verrouille) return;
  const maintenant = Date.now();
  /* Un geste après 15 min d'absence verrouille, il ne prolonge pas la session. */
  if (inactiviteDepassee(maintenant)) {
    verrouillerApplication();
    return;
  }
  activite.derniere = maintenant;
  if (maintenant - activite.ecrite >= VERROUILLAGE.ecritureMs) ecrireActivite(maintenant);
}

function controlerInactivite() {
  if (etat.compte && !etat.verrouille && inactiviteDepassee(Date.now())) verrouillerApplication();
}

function surVisibiliteVerrou() {
  if (document.visibilityState === "visible") {
    controlerInactivite();
    verifierPaiementEnAttente();
  } else if (etat.compte && !etat.verrouille) ecrireActivite(activite.derniere);
}

function surveillerInactivite() {
  const options = { capture: true, passive: true };
  ["pointerdown", "keydown", "input", "wheel"].forEach((type) => document.addEventListener(type, surActiviteUtilisateur, options));
  document.addEventListener("visibilitychange", surVisibiliteVerrou);
  const app = plugin("App");
  if (app) {
    app.addListener("resume", surRetourApplication);
    app.addListener("pause", surVisibiliteVerrou);
  }
  clearInterval(activite.minuterie);
  activite.minuterie = setInterval(controlerInactivite, VERROUILLAGE.controleMs);
}

async function verrouillerApplication() {
  if (etat.verrouille || !etat.compte) return;
  etat.verrouille = true;
  const courant = montrer.ecranCourant;
  activite.ecranAvant = courant && !estEcranEntree(courant) ? courant : ECRAN_DEPART;
  fermerModale(false);
  fermerRecherche();
  fermerTiroir();
  if (!$("annulation").hidden) terminerAnnulation();
  montrer("verrou");
  if (assistant.minuterie) await enregistrerBrouillon();
  await ecrireActivite(activite.derniere);
}

function preparerVerrou() {
  if (!etat.compte) return;
  viderCode("ver-code");
  activerCode("ver-code");
  effacerErreur($("ver-code"));
  $("msg-verrou").textContent = "";
  $("verrou-telephone").textContent = formaterTelephone(etat.compte.telephone, etat.compte.pays);
  const texte = "Bonjour BRG Électro+, j'ai oublié mon code secret BâtiPlus. Mon numéro : " + formaterTelephone(etat.compte.telephone, etat.compte.pays) + ".";
  $("lien-code-oublie-verrou").href = "https://wa.me/" + WHATSAPP_BRG.replace(/[^0-9]/g, "") + "?text=" + encodeURIComponent(texte);
  lireVerrou().then((blocage) => { if (blocage.jusqua > Date.now()) afficherBlocage(blocage.jusqua); });
}

async function surDeverrouillage(evenement) {
  evenement.preventDefault();
  if (!etat.compte || !etat.verrouille) return;
  $("msg-verrou").textContent = "";
  effacerErreur($("ver-code"));
  const blocage = await lireVerrou();
  if (blocage.jusqua > Date.now()) {
    afficherBlocage(blocage.jusqua);
    trembler($("msg-blocage-verrou"));
    return;
  }
  if (!cryptoDisponible()) {
    $("msg-verrou").textContent = "Cet appareil ne permet pas de vérifier votre code de façon sûre.";
    return;
  }
  const code = codes["ver-code"];
  if (!/^\d{4,6}$/.test(code)) {
    afficherErreur("ver-code", "Saisissez votre code de 4 à 6 chiffres.");
    return;
  }
  const bouton = $("bouton-deverrouiller");
  bouton.setAttribute("aria-busy", "true");
  try {
    const compte = await verifierIdentifiants(etat.compte.telephone, code);
    viderCode("ver-code");
    if (compte && etat.compte && compte.id === etat.compte.id) {
      await reinitialiserVerrou();
      etat.verrouille = false;
      activite.derniere = Date.now();
      await ecrireActivite(activite.derniere);
      vibrer();
      montrer(activite.ecranAvant || ECRAN_DEPART);
      activite.ecranAvant = null;
      return;
    }
    const nouveau = await enregistrerEchec();
    if (nouveau.jusqua > Date.now()) {
      $("msg-verrou").textContent = "Code incorrect.";
      afficherBlocage(nouveau.jusqua);
    } else {
      const reste = BLOCAGE.essaisLibres - nouveau.echecs;
      $("msg-verrou").textContent = "Code incorrect. Encore " + reste + " essai" + (reste > 1 ? "s" : "") + " avant un blocage temporaire.";
    }
    trembler($("ver-code").closest(".champ"));
  } finally {
    bouton.removeAttribute("aria-busy");
  }
}

/* ---------- Identité affichée partout (en-tête, tiroir, accueil, profil) ---------- */

function prenom(nom) {
  return String(nom || "").split(" ").filter(Boolean)[0] || "";
}

function initiales(nom) {
  return initialesDe(nom);
}

/* ==========================================================================
   Abonnement (étape 11). Le front ne croit qu'un jeton SIGNÉ par BâtiPlus et vérifié ici
   avec la clé publique de la balise meta : modifier le stockage local (formule, date de
   fin, compteur) ne donne jamais le Pro. Sans jeton valide : formule Gratuit.
   ========================================================================== */

const abonnementEtat = { cle: undefined, horloge: 0, formuleChoisie: "", rappels: "" };
const CHAMPS_JETON = Object.freeze(["v", "compteId", "telephone", "formule", "debut", "fin", "emisLe"]);

function base64urlEnOctets(texte) {
  if (typeof texte !== "string" || !/^[A-Za-z0-9_-]+$/.test(texte)) return null;
  const base64 = texte.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return depuisBase64(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  } catch (erreur) {
    return null;
  }
}

/* Clé publique ECDSA P-256 (SPKI en base64) : elle vérifie, elle ne peut pas signer. */
async function cleAbonnementPublique() {
  if (abonnementEtat.cle !== undefined) return abonnementEtat.cle;
  let cle = null;
  const meta = document.querySelector("meta[name='batiplus-cle-abonnement']");
  const brut = meta ? (meta.getAttribute("content") || "").trim() : "";
  if (/^[A-Za-z0-9+/]{80,200}={0,2}$/.test(brut) && window.crypto && crypto.subtle) {
    try {
      cle = await crypto.subtle.importKey("spki", depuisBase64(brut), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    } catch (erreur) {
      journal("clé d'abonnement illisible");
    }
  }
  abonnementEtat.cle = cle;
  return cle;
}

/* Instant de référence : jamais avant le plus tard déjà vu sur ce téléphone ni avant
   l'émission du jeton. Reculer l'horloge ne prolonge pas une formule et ne rend pas
   les devis gratuits d'un mois passé. */
function maintenantFiable() {
  return Math.max(Date.now(), abonnementEtat.horloge);
}

async function noterHorloge() {
  const stockee = Number(await lireValeur(CLES_STOCKAGE.horloge));
  const vue = Number.isFinite(stockee) && stockee > 0 ? stockee : 0;
  const maintenant = Date.now();
  abonnementEtat.horloge = Math.max(abonnementEtat.horloge, vue, maintenant);
  if (maintenant > vue + 60000) await ecrireValeur(CLES_STOCKAGE.horloge, String(maintenant));
}

async function verifierJetonAbonnement(jeton, compte) {
  if (typeof jeton !== "string" || jeton.length > ABONNEMENT_JETON.longueurMax || !compte) return null;
  const parties = jeton.split(".");
  if (parties.length !== 2) return null;
  const octetsCharge = base64urlEnOctets(parties[0]);
  const signature = base64urlEnOctets(parties[1]);
  if (!octetsCharge || !signature || signature.length !== 64) return null;
  const cle = await cleAbonnementPublique();
  if (!cle) return null;
  let signe = false;
  try {
    signe = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, cle, signature, new TextEncoder().encode(ABONNEMENT_JETON.prefixe + parties[0]));
  } catch (erreur) {
    signe = false;
  }
  if (!signe) return null;
  let charge = null;
  try {
    charge = JSON.parse(new TextDecoder().decode(octetsCharge));
  } catch (erreur) {
    return null;
  }
  if (!charge || typeof charge !== "object" || Array.isArray(charge)) return null;
  if (Object.keys(charge).some((nom) => !CHAMPS_JETON.includes(nom))) return null;
  const formule = typeof charge.formule === "string" && charge.formule !== FORMULE_DEFAUT
    && Object.prototype.hasOwnProperty.call(FORMULES, charge.formule) ? charge.formule : null;
  if (charge.v !== ABONNEMENT_JETON.version || charge.compteId !== compte.id || charge.telephone !== compte.telephone || !formule) return null;
  if (!dateIsoValide(charge.debut) || !dateIsoValide(charge.emisLe)) return null;
  const sansFin = FORMULES[formule].dureeJours === null;
  if (sansFin ? charge.fin !== null : !dateIsoValide(charge.fin)) return null;
  const emis = Date.parse(charge.emisLe);
  /* Jeton « émis dans le futur » : l'horloge du téléphone a été reculée. */
  if (emis > Date.now() + ABONNEMENT_JETON.avanceHorlogeMs) return null;
  abonnementEtat.horloge = Math.max(abonnementEtat.horloge, emis);
  const fin = sansFin ? null : Date.parse(charge.fin);
  if (fin !== null && (fin <= Date.parse(charge.debut) || fin <= maintenantFiable())) return null;
  return { formule, debut: charge.debut, fin: sansFin ? null : charge.fin, emisLe: charge.emisLe, verifie: true };
}

/* La formule du compte ouvert : jeton signé valide, sinon Gratuit. */
async function abonnementCourant() {
  const gratuit = { formule: FORMULE_DEFAUT, fin: null, verifie: false };
  const compte = etat.compte;
  if (!compte) return gratuit;
  await noterHorloge();
  const jetons = await lireJson(CLES_STOCKAGE.abonnement);
  const jeton = jetons && typeof jetons === "object" && !Array.isArray(jetons)
    && Object.prototype.hasOwnProperty.call(jetons, compte.id) ? jetons[compte.id] : null;
  return (await verifierJetonAbonnement(jeton, compte)) || gratuit;
}

async function actualiserAbonnement() {
  if (!etat.compte) return;
  etat.abonnement = await abonnementCourant();
  afficherDroitsPro();
  planifierRappels();
}

/* Dépôt d'un jeton reçu en ligne après un paiement confirmé (étape 12) : refusé s'il ne se vérifie pas. */
async function enregistrerJetonAbonnement(jeton) {
  const compte = etat.compte;
  if (!compte || !(await verifierJetonAbonnement(jeton, compte))) return false;
  const brut = await lireJson(CLES_STOCKAGE.abonnement);
  const suivant = {};
  if (brut && typeof brut === "object" && !Array.isArray(brut)) {
    for (const [id, valeur] of Object.entries(brut)) if (typeof valeur === "string" && /^[a-z0-9-]{8,64}$/i.test(id)) suivant[id] = valeur;
  }
  suivant[compte.id] = jeton;
  if (!await ecrireValeur(CLES_STOCKAGE.abonnement, JSON.stringify(suivant))) return false;
  await actualiserAbonnement();
  return true;
}

/* LA seule fonction qui produit le nom de la formule : accueil, profil, menu, abonnement. */
function libelleFormule(abonnement) {
  const formule = FORMULES[abonnement && abonnement.formule] || FORMULES[FORMULE_DEFAUT];
  return formule.nom;
}

function joursRestants(abonnement) {
  if (!abonnement || !abonnement.fin) return null;
  const fin = Date.parse(abonnement.fin);
  if (Number.isNaN(fin)) return null;
  return Math.max(0, Math.ceil((fin - maintenantFiable()) / 86400000));
}

function dateLongue(instant, avecAnnee) {
  return dateFrancaise(instant, avecAnnee);
}

function cleMoisLocal(instant) {
  const d = new Date(instant);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function cleJourLocal(instant) {
  const d = new Date(instant);
  return cleMoisLocal(instant) + "-" + String(d.getDate()).padStart(2, "0");
}

function premierDuMoisSuivant(instant) {
  const d = new Date(instant);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

function nomDuMois(instant) {
  return new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date(instant));
}

/* ---------- Quota de la formule Gratuit : 5 devis créés par mois ----------
   Compteur du mois ET devis du mois : supprimer un devis ne rend pas de devis gratuit. */

function compteursPropres(brut) {
  const propres = {};
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return propres;
  for (const [id, valeur] of Object.entries(brut)) {
    if (/^[a-z0-9-]{8,64}$/i.test(id) && valeur && typeof valeur === "object" && typeof valeur.mois === "string"
      && Number.isInteger(valeur.nombre) && valeur.nombre >= 0 && valeur.nombre <= 100000) propres[id] = { mois: valeur.mois, nombre: valeur.nombre };
  }
  return propres;
}

async function devisCreesCeMois(compteId) {
  const mois = cleMoisLocal(maintenantFiable());
  const dansLeMois = (await lireDevis(compteId)).filter((d) => cleMoisLocal(Date.parse(d.creeLe)) === mois).length;
  const compteurs = compteursPropres(await lireJson(CLES_STOCKAGE.devisMois));
  const note = compteurs[compteId] && compteurs[compteId].mois === mois ? compteurs[compteId].nombre : 0;
  return Math.max(dansLeMois, note);
}

async function noterDevisCree(compteId) {
  const mois = cleMoisLocal(maintenantFiable());
  const compteurs = compteursPropres(await lireJson(CLES_STOCKAGE.devisMois));
  const precedent = compteurs[compteId] && compteurs[compteId].mois === mois ? compteurs[compteId].nombre : 0;
  const nombre = Math.max(await devisCreesCeMois(compteId), precedent + 1);
  compteurs[compteId] = { mois, nombre };
  await ecrireValeur(CLES_STOCKAGE.devisMois, JSON.stringify(compteurs));
  return nombre;
}

/* Avant toute création de devis. Gratuit au-delà de 5 devis dans le mois : création
   bloquée, invitation obligatoire ; l'étude et les anciens devis restent intacts. */
async function autoriserNouveauDevis(nomTravail) {
  await actualiserAbonnement();
  if (formulePayante(etat.abonnement.formule)) return true;
  if (await devisCreesCeMois(etat.compte.id) < LIMITE_GRATUITE) return true;
  await inviterAbonnement("bloque", { travail: nomTravail });
  return false;
}

async function apresDevisCree() {
  const nombre = await noterDevisCree(etat.compte.id);
  if (!formulePayante(etat.abonnement.formule) && nombre === RELANCES.devisAvantDernier) inviterAbonnement("quatrieme");
}

/* ---------- Invitations à l'abonnement (relances sans harceler) ---------- */

async function lireRelances() {
  const brut = await lireJson(CLES_STOCKAGE.relances);
  const tout = {};
  if (brut && typeof brut === "object" && !Array.isArray(brut)) {
    for (const [id, valeur] of Object.entries(brut)) {
      if (/^[a-z0-9-]{8,64}$/i.test(id) && valeur && typeof valeur === "object" && !Array.isArray(valeur)) {
        tout[id] = { jour: typeof valeur.jour === "string" ? valeur.jour.slice(0, 10) : "", derniere: Number.isFinite(valeur.derniere) ? valeur.derniere : 0 };
      }
    }
  }
  return tout;
}

async function inviterAbonnement(raison, details) {
  const compte = etat.compte;
  if (!compte || etat.verrouille || !ecranExiste("abonnement")) return;
  if (formulePayante((etat.abonnement || {}).formule)) return;
  const maintenant = Date.now();
  const relances = await lireRelances();
  const propre = relances[compte.id] || { jour: "", derniere: 0 };
  if (RELANCES.facultatives.includes(raison)) {
    if (!$("modale").hidden || maintenant - propre.derniere < RELANCES.intervalleMs) return;
    if (raison === "jour" && (propre.jour === cleJourLocal(maintenant) || cleJourLocal(Date.parse(compte.creeLe)) === cleJourLocal(maintenant))) return;
  }
  relances[compte.id] = { jour: raison === "jour" ? cleJourLocal(maintenant) : propre.jour, derniere: maintenant };
  await ecrireValeur(CLES_STOCKAGE.relances, JSON.stringify(relances));
  const invitation = contenuInvitation(raison, details || {});
  const voir = await new Promise((resoudre) => {
    ouvrirModale(invitation.titre, invitation.contenu, { ok: "Voir les formules", annuler: invitation.annuler, resoudre });
  });
  if (voir) montrer("abonnement");
}

function contenuInvitation(raison, details) {
  const fragment = document.createDocumentFragment();
  const paragraphe = (texte, classe) => {
    const p = document.createElement("p");
    if (classe) p.className = classe;
    p.textContent = texte;
    fragment.appendChild(p);
  };
  const maintenant = maintenantFiable();
  const mois = nomDuMois(maintenant);
  const reprise = dateLongue(premierDuMoisSuivant(maintenant), false);
  let titre = "Passez en Pro";
  let annuler = "Plus tard";
  if (raison === "bloque") {
    titre = "Vos " + LIMITE_GRATUITE + " devis gratuits sont utilisés";
    annuler = "Fermer";
    paragraphe("Vous avez créé " + LIMITE_GRATUITE + " devis en " + mois + " : la création d'un nouveau devis est bloquée jusqu'au " + reprise + ".");
    paragraphe((details.travail ? "Votre étude « " + details.travail + " » est conservée" : "Votre travail est conservé")
      + " et vos anciens devis restent consultables, imprimables et partageables.");
    paragraphe("Passez en Pro pour créer ce devis tout de suite.");
  } else if (raison === "quatrieme") {
    titre = "Il vous reste 1 devis gratuit";
    paragraphe("Vous avez créé " + RELANCES.devisAvantDernier + " devis en " + mois + ". Il vous reste 1 devis gratuit jusqu'au " + reprise + ".");
  } else if (raison === "envoi" || raison === "filigrane") {
    titre = "Vos devis, à votre image";
    paragraphe("Avec le Pro, vos devis partent sans filigrane et avec le logo de votre entreprise.");
  } else if (raison === "logo") {
    titre = "Votre logo sur vos devis";
    paragraphe("Avec le Pro, le logo de votre entreprise apparaît en haut de chaque devis, à l'écran, à l'impression et en PDF.");
  } else if (raison === "stats") {
    titre = "Statistiques détaillées";
    paragraphe("Suivez votre activité jour par jour, votre montant par client et vos devis par statut avec le Pro.");
  } else {
    paragraphe("Devis illimités, sans filigrane, avec votre logo et vos statistiques détaillées.");
  }
  const liste = document.createElement("ul");
  liste.className = "invitation-avantages";
  liste.append(...AVANTAGES_PRO.map((avantage) => {
    const li = document.createElement("li");
    const libelle = document.createElement("span");
    libelle.textContent = avantage.titre;
    li.append(creerIcone("i-coche"), libelle);
    return li;
  }));
  fragment.appendChild(liste);
  paragraphe("À partir de " + formaterMontant(FORMULES.semaine.prix, DEVISE_TARIFS) + " pour 7 jours, sans engagement.", "aide");
  return { titre, contenu: fragment, annuler };
}

/* 1re ouverture du jour de l'accueil (jamais le jour de la création du compte). */
function relanceDuJour() {
  setTimeout(() => {
    if (montrer.ecranCourant === ECRAN_DEPART) inviterAbonnement("jour");
  }, 900);
}

function programmerInvitationEnvoi() {
  setTimeout(() => inviterAbonnement("envoi"), RELANCES.delaiApresEnvoiMs);
}

function surApresImpression() {
  if (document.body.dataset.impression === "recu") {
    delete document.body.dataset.impression;
    $("recu-a4").replaceChildren();
    return;
  }
  if (montrer.ecranCourant === "feuille") programmerInvitationEnvoi();
}

function surClicEnvoiWhatsApp(evenement) {
  const lien = evenement.target.closest("a[href^='https://wa.me/']");
  if (lien && lien.closest("#ecran-feuille, #ecran-fiche-devis, #liste-devis")) programmerInvitationEnvoi();
}

/* Fonctions Pro = cadenas : un toucher ouvre l'invitation. */
function surClicInvitation(evenement) {
  const cible = evenement.target.closest("[data-invitation]");
  if (!cible || cible.disabled) return;
  vibrer();
  inviterAbonnement(cible.dataset.invitation);
}

function afficherDroitsPro() {
  const pro = formulePayante((etat.abonnement || {}).formule);
  document.querySelectorAll(".pastille-pro").forEach((element) => { element.hidden = pro || !etat.compte; });
  document.querySelectorAll("[data-cadenas-pro]").forEach((element) => { element.hidden = pro; });
  document.querySelectorAll("[data-formule]").forEach((element) => { element.textContent = libelleFormule(etat.abonnement); });
}

/* ---------- Écran Mon abonnement ---------- */

async function ouvrirAbonnement() {
  if (!etat.compte) return;
  await actualiserAbonnement();
  await afficherMaFormule();
  afficherFormules();
  if (!$("logos-paiement").childElementCount) {
    $("logos-paiement").replaceChildren(...creerLogosPaiement());
    afficherConfiance();
  }
  afficherAvantagesPro();
  await afficherPaiements();
}

function texteFinFormule(abonnement) {
  const formule = FORMULES[abonnement.formule] || FORMULES[FORMULE_DEFAUT];
  if (!formule.illimite) return "Votre abonnement gratuit n'a pas de date de fin.";
  if (!abonnement.fin) return "Votre formule " + formule.nom + " n'a pas de date de fin : le Pro est à vous pour toujours.";
  return "Votre " + formule.nom + " se termine le " + dateLongue(Date.parse(abonnement.fin), true) + " — "
    + accorderNombre(joursRestants(abonnement), "jour restant", "jours restants") + ".";
}

async function afficherMaFormule() {
  const abonnement = etat.abonnement;
  const id = Object.prototype.hasOwnProperty.call(FORMULES, abonnement.formule) ? abonnement.formule : FORMULE_DEFAUT;
  const formule = FORMULES[id];
  $("carte-ma-formule").dataset.ton = formule.ton;
  $("ma-formule-symbole").setAttribute("href", "#" + formule.icone);
  ecrireInsecable($("ma-formule-fin"), texteFinFormule(abonnement));
  let valeur = 1;
  let maximum = 1;
  let libelle = "Accès Pro à vie, sans renouvellement.";
  let niveau = "ok";
  if (!formule.illimite) {
    const maintenant = maintenantFiable();
    const utilises = Math.min(await devisCreesCeMois(etat.compte.id), LIMITE_GRATUITE);
    const restants = LIMITE_GRATUITE - utilises;
    valeur = utilises;
    maximum = LIMITE_GRATUITE;
    niveau = restants === 0 ? "plein" : restants === 1 ? "presque" : "ok";
    libelle = utilises + " devis sur " + LIMITE_GRATUITE + " utilisés en " + nomDuMois(maintenant) + " — "
      + (restants ? accorderNombre(restants, "devis gratuit restant", "devis gratuits restants") : "plus aucun devis gratuit")
      + " jusqu'au " + dateLongue(premierDuMoisSuivant(maintenant), false) + ".";
  } else if (abonnement.fin) {
    const jours = joursRestants(abonnement);
    maximum = formule.dureeJours;
    valeur = Math.min(jours, maximum);
    niveau = jours <= Math.max(...RELANCES.rappelsJours) ? "presque" : "ok";
    libelle = accorderNombre(jours, "jour restant", "jours restants") + " sur " + maximum + ".";
  }
  const jauge = $("jauge-formule");
  jauge.setAttribute("aria-valuemax", String(maximum));
  jauge.setAttribute("aria-valuenow", String(valeur));
  jauge.dataset.niveau = niveau;
  $("jauge-formule-remplie").style.setProperty("--remplissage", String(Math.min(1, valeur / maximum)));
  ecrireInsecable($("jauge-formule-libelle"), libelle);
  afficherRenouveler();
}

function libelleBoutonFormule(id, actuelle) {
  if (id === actuelle) return "Ma formule actuelle";
  if (id === FORMULE_DEFAUT) return "Formule de base";
  if (FORMULES[actuelle] && FORMULES[actuelle].illimite && FORMULES[actuelle].dureeJours === null) return "Inclus dans votre " + FORMULES[actuelle].nom;
  return "Choisir " + FORMULES[id].nom;
}

function creerCarteFormule(id, actuelle) {
  const formule = FORMULES[id];
  const li = document.createElement("li");
  li.className = "formule formule-" + formule.ton + (formule.vedette ? " formule-vedette" : "") + (id === actuelle ? " formule-actuelle" : "");
  li.dataset.formuleCarte = id;
  const badge = document.createElement("span");
  badge.className = "formule-badge";
  badge.textContent = formule.badge;
  const tete = document.createElement("div");
  tete.className = "formule-tete";
  const icone = document.createElement("span");
  icone.className = "formule-icone";
  icone.appendChild(creerIcone(formule.icone));
  const nom = document.createElement("h3");
  nom.className = "formule-nom";
  nom.textContent = formule.nom;
  tete.append(icone, nom);
  const prix = document.createElement("p");
  prix.className = "formule-prix";
  const montant = document.createElement("strong");
  montant.className = "insecable";
  montant.textContent = formaterMontant(formule.prix, DEVISE_TARIFS);
  const periode = document.createElement("span");
  periode.textContent = formule.periode;
  prix.append(montant, periode);
  const liste = document.createElement("ul");
  liste.className = "formule-arguments";
  liste.append(...formule.arguments.map((argument) => {
    const ligne = document.createElement("li");
    const texte = document.createElement("span");
    ecrireInsecable(texte, argument);
    ligne.append(creerIcone("i-coche"), texte);
    return ligne;
  }));
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "bouton " + (formule.vedette ? "bouton-principal" : "bouton-secondaire");
  bouton.dataset.choisirFormule = id;
  const libelle = document.createElement("span");
  libelle.className = "bouton-libelle";
  libelle.textContent = libelleBoutonFormule(id, actuelle);
  bouton.appendChild(libelle);
  bouton.disabled = libelle.textContent.indexOf("Choisir ") !== 0;
  li.append(badge, tete, prix, liste, bouton);
  return li;
}

function afficherFormules() {
  const actuelle = etat.abonnement.formule;
  $("liste-formules").replaceChildren(...Object.keys(FORMULES).map((id) => creerCarteFormule(id, actuelle)));
}

/* Logo officiel s'il est fourni ; sinon pastille unie à la couleur de la marque, nom en texte. */
function creerLogosPaiement() {
  return MOYENS_PAIEMENT.map((moyen) => {
    const li = document.createElement("li");
    li.className = "paiement";
    if (LOGOS_PAIEMENT_FOURNIS.includes(moyen.id)) {
      const image = document.createElement("img");
      image.alt = moyen.nom;
      image.height = 26;
      image.decoding = "async";
      image.addEventListener("error", () => pastillePaiement(li, moyen), { once: true });
      image.src = "images/paiement/" + moyen.id + ".webp";
      li.appendChild(image);
    } else {
      pastillePaiement(li, moyen);
    }
    return li;
  });
}

function pastillePaiement(li, moyen) {
  li.classList.add("paiement-pastille");
  li.dataset.marque = moyen.id;
  li.replaceChildren(document.createTextNode(moyen.nom));
}

function afficherConfiance() {
  $("bande-confiance").replaceChildren(...CONFIANCE_PAIEMENT.map((engagement) => {
    const li = document.createElement("li");
    const texte = document.createElement("span");
    texte.textContent = engagement.texte;
    li.append(creerIcone(engagement.icone), texte);
    return li;
  }));
}

function afficherAvantagesPro() {
  const pro = formulePayante(etat.abonnement.formule);
  $("avantages-pro").replaceChildren(...AVANTAGES_PRO.map((avantage) => {
    const li = document.createElement("li");
    li.className = "avantage-pro";
    li.dataset.etat = pro ? "inclus" : "verrouille";
    const icone = document.createElement("span");
    icone.className = "avantage-icone";
    icone.appendChild(creerIcone(avantage.icone));
    const texte = document.createElement("div");
    texte.className = "avantage-texte";
    const titre = document.createElement("strong");
    titre.textContent = avantage.titre;
    const detail = document.createElement("span");
    detail.textContent = avantage.texte;
    texte.append(titre, detail);
    let etatAvantage;
    if (pro) {
      etatAvantage = document.createElement("span");
      etatAvantage.className = "avantage-etat";
      etatAvantage.append(creerIcone("i-coche"), document.createTextNode("Inclus"));
    } else {
      etatAvantage = document.createElement("button");
      etatAvantage.type = "button";
      etatAvantage.className = "avantage-etat avantage-cadenas";
      etatAvantage.dataset.invitation = avantage.id;
      etatAvantage.setAttribute("aria-label", "Débloquer : " + avantage.titre);
      etatAvantage.append(creerIcone("i-cadenas"), document.createTextNode("Débloquer"));
    }
    li.append(icone, texte, etatAvantage);
    return li;
  }));
}

/* ---------- Mes paiements et reçus ---------- */

function paiementValide(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (typeof source.reference !== "string" || !PAIEMENTS.reference.test(source.reference)) return null;
  if (typeof source.formule !== "string" || source.formule === FORMULE_DEFAUT || !Object.prototype.hasOwnProperty.call(FORMULES, source.formule)) return null;
  if (!Number.isInteger(source.montant) || source.montant < 0 || source.montant > PAIEMENTS.montantMax) return null;
  if (!dateIsoValide(source.payeLe) || typeof source.statut !== "string" || !Object.prototype.hasOwnProperty.call(PAIEMENTS.statuts, source.statut)) return null;
  const moyen = MOYENS_PAIEMENT.find((m) => m.id === source.moyen);
  return {
    reference: source.reference, formule: source.formule, montant: source.montant, payeLe: source.payeLe, statut: source.statut,
    moyen: moyen ? moyen.nom : "Paiement en ligne",
    debut: dateIsoValide(source.debut) ? source.debut : "",
    fin: dateIsoValide(source.fin) ? source.fin : ""
  };
}

async function lirePaiements() {
  const brut = await lireJson(CLES_STOCKAGE.paiements);
  const id = etat.compte.id;
  const liste = brut && typeof brut === "object" && !Array.isArray(brut) && Object.prototype.hasOwnProperty.call(brut, id) && Array.isArray(brut[id]) ? brut[id] : [];
  return liste.slice(0, PAIEMENTS.max).map(paiementValide).filter(Boolean).sort((a, b) => Date.parse(b.payeLe) - Date.parse(a.payeLe));
}

async function afficherPaiements() {
  const paiements = await lirePaiements();
  $("liste-paiements").replaceChildren(...paiements.map((paiement) => {
    const li = document.createElement("li");
    li.className = "paiement-ligne";
    const texte = document.createElement("div");
    texte.className = "paiement-ligne-texte";
    const nom = document.createElement("strong");
    nom.textContent = FORMULES[paiement.formule].nom;
    const detail = document.createElement("span");
    ecrireInsecable(detail, dateLongue(Date.parse(paiement.payeLe), true) + " · " + paiement.moyen + " · " + PAIEMENTS.statuts[paiement.statut]);
    texte.append(nom, detail);
    const montant = document.createElement("strong");
    montant.className = "paiement-ligne-montant insecable";
    montant.textContent = formaterMontant(paiement.montant, DEVISE_TARIFS);
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "bouton bouton-discret";
    bouton.dataset.recu = paiement.reference;
    bouton.setAttribute("aria-label", "Imprimer le reçu " + paiement.reference);
    const libelle = document.createElement("span");
    libelle.className = "bouton-libelle";
    libelle.textContent = "Reçu";
    bouton.append(creerIcone("i-recu"), libelle);
    li.append(texte, montant, bouton);
    return li;
  }));
  $("paiements-vide").hidden = paiements.length > 0;
}

function remplirRecuA4(m) {
  const element = (balise, classe, texte) => {
    const noeud = document.createElement(balise);
    if (classe) noeud.className = classe;
    if (texte !== undefined) noeud.textContent = texte;
    return noeud;
  };
  const tete = element("header", "recu-tete");
  const marque = element("div", "recu-marque");
  marque.append(element("strong", "", "BâtiPlus"), element("span", "", m.emis));
  const titre = element("div", "recu-titre");
  titre.append(element("h2", "", m.titre), element("span", "", m.numero));
  tete.append(marque, titre);
  const client = element("section", "recu-client");
  client.append(element("h3", "", "Reçu établi pour"), ...m.client.map((ligne) => element("p", "", ligne)));
  const liste = element("dl", "recu-lignes");
  m.lignes.forEach(([libelle, valeur]) => {
    const groupe = element("div");
    groupe.append(element("dt", "", libelle), element("dd", "", valeur));
    liste.appendChild(groupe);
  });
  const total = element("section", "recu-total");
  const ligneTotal = element("div", "recu-total-ligne");
  ligneTotal.append(element("span", "", "Montant payé"), element("strong", "insecable", m.montant));
  total.append(ligneTotal, element("p", "", m.lettres));
  $("recu-a4").replaceChildren(tete, client, liste, total, element("footer", "recu-pied", m.pied));
}

async function imprimerRecu(reference) {
  const paiement = (await lirePaiements()).find((p) => p.reference === reference);
  if (!paiement) return;
  const compte = etat.compte;
  const modele = modeleRecu(paiement, { nom: compte.nom, entreprise: compte.entreprise, telephone: telephoneAffiche(compte.telephone) });
  vibrer();
  if (estNatif()) {
    /* La vue web d'Android n'imprime pas : reçu en PDF, puis partage (impression, WhatsApp…). */
    try {
      const nom = "Recu_" + paiement.reference + ".pdf";
      const { uri } = await enregistrerPdfNatif(creerPdfRecu(modele), nom);
      const partage = plugin("Share");
      if (partage) await partage.share({ title: modele.titrePdf, files: [uri], dialogTitle: "Imprimer ou partager le reçu" });
      else afficherToast("Reçu enregistré : " + nom);
    } catch (erreur) {
      if (!annulationPartage(erreur)) afficherToast("Le reçu n'a pas pu être créé. Réessayez.");
    }
    return;
  }
  remplirRecuA4(modele);
  document.body.dataset.impression = "recu";
  try {
    window.print();
  } catch (erreur) {
    journal("impression impossible");
  }
}

function surClicPaiements(evenement) {
  const bouton = evenement.target.closest("[data-recu]");
  if (bouton) imprimerRecu(bouton.dataset.recu);
}

/* ---------- Choix d'une formule et paiement (3 touchers) ----------
   Le front n'envoie QUE le nom de la formule : le montant est fixé en ligne. */

function surClicFormules(evenement) {
  const bouton = evenement.target.closest("[data-choisir-formule]");
  if (bouton && !bouton.disabled) surChoisirFormule(bouton.dataset.choisirFormule);
}

async function surChoisirFormule(id) {
  if (id === FORMULE_DEFAUT || !Object.prototype.hasOwnProperty.call(FORMULES, id)) return;
  const formule = FORMULES[id];
  const contenu = document.createDocumentFragment();
  const prix = document.createElement("p");
  prix.className = "recap-prix";
  const montant = document.createElement("strong");
  montant.className = "insecable";
  montant.textContent = formaterMontant(formule.prix, DEVISE_TARIFS);
  prix.append(montant, document.createTextNode(" " + formule.periode));
  const liste = document.createElement("ul");
  liste.className = "invitation-avantages";
  liste.append(...formule.arguments.map((argument) => {
    const li = document.createElement("li");
    const texte = document.createElement("span");
    texte.textContent = argument;
    li.append(creerIcone("i-coche"), texte);
    return li;
  }));
  const moyens = document.createElement("ul");
  moyens.className = "paiements paiements-recap";
  moyens.setAttribute("aria-label", "Moyens de paiement acceptés");
  moyens.append(...creerLogosPaiement());
  const aide = document.createElement("p");
  aide.className = "aide";
  aide.textContent = "La page de paiement sécurisée s'ouvre ; votre formule s'active toute seule dès que le paiement est confirmé.";
  contenu.append(prix, liste, moyens, aide);
  const payer = await new Promise((resoudre) => ouvrirModale(formule.nom, contenu, { ok: "Payer maintenant", annuler: "Retour", resoudre }));
  if (payer) await lancerPaiement(id);
}

function adressePaiementSure(texte) {
  if (typeof texte !== "string" || texte.length > 2048) return "";
  try {
    const url = new URL(texte);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch (erreur) {
    return "";
  }
}

function messagePaiement(texte, reessayer) {
  $("msg-paiement").textContent = texte;
  $("bouton-reessayer-paiement").hidden = !reessayer;
  afficherToast(texte);
}

async function lancerPaiement(id) {
  if (id === FORMULE_DEFAUT || !Object.prototype.hasOwnProperty.call(FORMULES, id)) return;
  abonnementEtat.formuleChoisie = id;
  /* Un nouveau lancement arrête le suivi précédent : jamais deux suivis en parallèle. */
  arreterSuiviPaiement();
  if (navigator.onLine === false) {
    messagePaiement("Pas de connexion internet : le paiement demande une connexion. Touchez « Réessayer » une fois connecté.", true);
    return;
  }
  messagePaiement("Préparation du paiement…", false);
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), PAIEMENTS.delaiInitiationMs);
  try {
    const reponse = await fetch(API_URL + "/api/paiements/initier", {
      method: "POST",
      headers: await entetesApi(true),
      body: JSON.stringify({ formule: id }),
      credentials: "omit",
      cache: "no-store",
      signal: controleur.signal
    });
    let donnees = null;
    try {
      donnees = await reponse.json();
    } catch (erreur) {
      donnees = null;
    }
    if (!reponse.ok) {
      /* Seul le CODE d'erreur est lu ; le message affiché vient toujours de l'application. */
      messagePaiement(MESSAGES_PAIEMENT[codeErreurPaiement(donnees)], true);
      return;
    }
    const adresse = donnees ? adressePaiementSure(donnees.urlPaiement) : "";
    const reference = donnees && typeof donnees.reference === "string" && PAIEMENTS.reference.test(donnees.reference) ? donnees.reference : "";
    if (!adresse || !reference) throw new Error("réponse inattendue");
    await noterPaiementEnCours(reference, id);
    const navigateur = plugin("Browser");
    if (navigateur) await navigateur.open({ url: adresse });
    else window.open(adresse, "_blank", "noopener,noreferrer");
    messagePaiement("Page de paiement ouverte (référence " + reference + "). Votre formule s'activera dès la confirmation du paiement.", false);
    suivrePaiement(reference, id);
  } catch (erreur) {
    journal("paiement non démarré", erreur && erreur.message);
    messagePaiement(MESSAGES_PAIEMENT.defaut, true);
  } finally {
    clearTimeout(delai);
  }
}

/* ---------- Suivi automatique du paiement (étape 12) ----------
   Après l'ouverture de la page de paiement : écran « Nous confirmons votre paiement… »,
   consultation de GET /api/paiements/:ref toutes les 3 s pendant 3 min. L'abonnement ne
   s'active QUE par un jeton signé reçu en ligne et vérifié ici (clé publique) : ni le
   retour de la page de paiement, ni un statut seul, ni une saisie ne peuvent l'activer. */

const suiviPaiement = { reference: "", formule: "", debut: 0, minuterie: 0, generation: 0, consultation: false, actif: false };

function objetSimple(valeur) {
  return Boolean(valeur) && typeof valeur === "object" && !Array.isArray(valeur);
}

function formuleAchetable(id) {
  return typeof id === "string" && id !== FORMULE_DEFAUT && Object.prototype.hasOwnProperty.call(FORMULES, id) ? id : "";
}

/* Jeton de session de l'API (déposé à la connexion en ligne, étape 14), rangé par compte. */
async function jetonApiCompte() {
  const compte = etat.compte;
  if (!compte) return "";
  const brut = await lireJson(CLES_STOCKAGE.jetonApi);
  const jeton = objetSimple(brut) && Object.prototype.hasOwnProperty.call(brut, compte.id) ? brut[compte.id] : "";
  return typeof jeton === "string" && PAIEMENTS.jetonApi.test(jeton) ? jeton : "";
}

async function entetesApi(avecCorps) {
  const entetes = avecCorps ? { "Content-Type": "application/json" } : {};
  const jeton = await jetonApiCompte();
  if (jeton) entetes.Authorization = "Bearer " + jeton;
  return entetes;
}

function codeErreurPaiement(donnees) {
  const code = objetSimple(donnees) && typeof donnees.erreur === "string" ? donnees.erreur : "";
  return code && code !== "defaut" && Object.prototype.hasOwnProperty.call(MESSAGES_PAIEMENT, code) ? code : "defaut";
}

/* Paiement en cours mémorisé (référence + formule) : reprise après fermeture de l'application. */
async function lireEnCoursBrut() {
  const brut = await lireJson(CLES_STOCKAGE.paiementEnCours);
  const propre = {};
  if (objetSimple(brut)) {
    for (const [id, valeur] of Object.entries(brut)) {
      if (!/^[a-z0-9-]{8,64}$/i.test(id) || !objetSimple(valeur)) continue;
      if (typeof valeur.reference !== "string" || !PAIEMENTS.reference.test(valeur.reference) || !formuleAchetable(valeur.formule)) continue;
      if (!Number.isFinite(valeur.depuis) || valeur.depuis <= 0) continue;
      propre[id] = { reference: valeur.reference, formule: valeur.formule, depuis: valeur.depuis };
    }
  }
  return propre;
}

async function lirePaiementEnCours() {
  if (!etat.compte) return null;
  const tous = await lireEnCoursBrut();
  return Object.prototype.hasOwnProperty.call(tous, etat.compte.id) ? tous[etat.compte.id] : null;
}

async function noterPaiementEnCours(reference, formule) {
  if (!etat.compte) return;
  const tous = await lireEnCoursBrut();
  tous[etat.compte.id] = { reference, formule, depuis: Date.now() };
  await ecrireValeur(CLES_STOCKAGE.paiementEnCours, JSON.stringify(tous));
}

async function oublierPaiementEnCours(reference) {
  if (!etat.compte) return;
  const tous = await lireEnCoursBrut();
  const present = tous[etat.compte.id];
  if (!present || (reference && present.reference !== reference)) return;
  delete tous[etat.compte.id];
  await ecrireValeur(CLES_STOCKAGE.paiementEnCours, JSON.stringify(tous));
}

/* Réponse de GET /api/paiements/:ref relue champ par champ ; tout écart → ignorée. */
function reponseSuiviValide(source, reference) {
  if (!objetSimple(source) || source.reference !== reference || !PAIEMENTS.statutsSuivi.includes(source.statut)) return null;
  const formule = formuleAchetable(source.formule);
  if (!formule) return null;
  const abonnement = objetSimple(source.abonnement) ? source.abonnement : {};
  return {
    reference,
    statut: source.statut,
    formule,
    montant: Number.isInteger(source.montant) && source.montant >= 0 && source.montant <= PAIEMENTS.montantMax ? source.montant : FORMULES[formule].prix,
    moyen: typeof source.moyen === "string" && /^[a-z0-9_-]{1,40}$/i.test(source.moyen) ? source.moyen : "",
    payeLe: dateIsoValide(source.payeLe) ? source.payeLe : "",
    jeton: typeof source.jeton === "string" && source.jeton.length <= 4096 ? source.jeton : "",
    debut: dateIsoValide(abonnement.debut) ? abonnement.debut : "",
    fin: dateIsoValide(abonnement.fin) ? abonnement.fin : ""
  };
}

/* null = pas de réponse exploitable (réseau, session, réponse inattendue). */
async function consulterPaiement(reference) {
  if (!etat.compte || !PAIEMENTS.reference.test(reference) || typeof fetch !== "function" || navigator.onLine === false) return null;
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), PAIEMENTS.delaiConsultationMs);
  try {
    const reponse = await fetch(API_URL + "/api/paiements/" + encodeURIComponent(reference), {
      method: "GET",
      headers: await entetesApi(false),
      credentials: "omit",
      cache: "no-store",
      signal: controleur.signal
    });
    if (!reponse.ok) return null;
    return reponseSuiviValide(await reponse.json(), reference);
  } catch (erreur) {
    return null;
  } finally {
    clearTimeout(delai);
  }
}

function arreterSuiviPaiement() {
  clearTimeout(suiviPaiement.minuterie);
  suiviPaiement.minuterie = 0;
  suiviPaiement.generation += 1;
  suiviPaiement.actif = false;
}

function suivrePaiement(reference, formule) {
  arreterSuiviPaiement();
  suiviPaiement.reference = reference;
  suiviPaiement.formule = formuleAchetable(formule);
  suiviPaiement.debut = Date.now();
  suiviPaiement.actif = true;
  afficherSuivi("attente");
  montrer("paiement");
  planifierConsultation(0);
}

function planifierConsultation(delai) {
  const generation = suiviPaiement.generation;
  clearTimeout(suiviPaiement.minuterie);
  suiviPaiement.minuterie = setTimeout(() => {
    if (generation === suiviPaiement.generation) tourDeSuivi(generation);
  }, delai);
}

async function tourDeSuivi(generation) {
  if (suiviPaiement.consultation) {
    planifierConsultation(PAIEMENTS.suiviIntervalleMs);
    return;
  }
  suiviPaiement.consultation = true;
  let resultat = null;
  try {
    resultat = await consulterPaiement(suiviPaiement.reference);
  } finally {
    suiviPaiement.consultation = false;
  }
  if (generation !== suiviPaiement.generation) return;
  if (resultat && resultat.statut !== "en_attente") {
    suiviPaiement.actif = false;
    await conclurePaiement(resultat, false);
    return;
  }
  if (Date.now() - suiviPaiement.debut >= PAIEMENTS.suiviDureeMs) {
    suiviPaiement.actif = false;
    afficherSuivi(!resultat && navigator.onLine === false ? "hors_ligne" : "long");
    return;
  }
  planifierConsultation(PAIEMENTS.suiviIntervalleMs);
}

/* Paiement confirmé : ajouté à « Mes paiements » (reçu disponible), une seule fois par référence. */
async function memoriserPaiement(r) {
  const compte = etat.compte;
  const brut = await lireJson(CLES_STOCKAGE.paiements);
  const tous = {};
  if (objetSimple(brut)) {
    for (const [id, liste] of Object.entries(brut)) if (/^[a-z0-9-]{8,64}$/i.test(id) && Array.isArray(liste)) tous[id] = liste.slice(0, PAIEMENTS.max);
  }
  const entree = {
    reference: r.reference, formule: r.formule, montant: r.montant,
    payeLe: r.payeLe || new Date(maintenantFiable()).toISOString(),
    statut: "paye", moyen: r.moyen, debut: r.debut, fin: r.fin
  };
  if (!paiementValide(entree)) return false;
  const anciens = (tous[compte.id] || []).filter((p) => !(objetSimple(p) && p.reference === r.reference));
  tous[compte.id] = [entree, ...anciens].slice(0, PAIEMENTS.max);
  return ecrireValeur(CLES_STOCKAGE.paiements, JSON.stringify(tous));
}

/* discret : vérification au démarrage / au retour → un toast au lieu de l'écran de suivi. */
async function conclurePaiement(r, discret) {
  if (r.statut === "paye") {
    if (!(await enregistrerJetonAbonnement(r.jeton))) {
      if (!discret) afficherSuivi("invalide");
      return false;
    }
    await memoriserPaiement(r);
    await oublierPaiementEnCours(r.reference);
    if (montrer.ecranCourant === "abonnement") await ouvrirAbonnement();
    if (discret || montrer.ecranCourant !== "paiement") afficherToast("Paiement confirmé : votre " + FORMULES[etat.abonnement.formule].nom + " est actif.");
    if (!discret) afficherSuivi("paye");
    return true;
  }
  await oublierPaiementEnCours(r.reference);
  if (!discret) afficherSuivi(r.statut);
  return false;
}

function texteSuiviPaye() {
  const abonnement = etat.abonnement;
  const formule = FORMULES[abonnement.formule] || FORMULES[FORMULE_DEFAUT];
  const debut = abonnement.fin
    ? "Votre " + formule.nom + " est actif jusqu'au " + dateLongue(Date.parse(abonnement.fin), true) + "."
    : "Votre formule " + formule.nom + " est active pour toujours.";
  return debut + " Devis illimités et sans filigrane dès maintenant. Merci pour votre confiance !";
}

function lancerParticules() {
  const conteneur = $("suivi-particules");
  const particules = [];
  for (let i = 0; i < PAIEMENTS.particules; i += 1) particules.push(document.createElement("i"));
  /* Remplacer les particules relance leur animation à chaque confirmation. */
  conteneur.replaceChildren(...particules);
}

function afficherSuivi(issue) {
  const cle = Object.prototype.hasOwnProperty.call(SUIVI_PAIEMENT, issue) ? issue : "long";
  const textes = SUIVI_PAIEMENT[cle];
  $("suivi-paiement").dataset.issue = cle;
  $("titre-suivi").textContent = textes.titre;
  ecrireInsecable($("suivi-texte"), cle === "paye" ? texteSuiviPaye() : textes.texte);
  ecrireInsecable($("suivi-reference"), suiviPaiement.reference ? "Référence : " + suiviPaiement.reference : "");
  $("bouton-suivi-recu").hidden = cle !== "paye";
  $("bouton-suivi-reessayer").hidden = !["echoue", "annule", "expire"].includes(cle) || !suiviPaiement.formule;
  $("bouton-suivi-verifier").hidden = !["long", "hors_ligne", "invalide"].includes(cle);
  if (cle === "paye") {
    lancerParticules();
    vibrer();
  } else {
    $("suivi-particules").replaceChildren();
  }
  if (cle !== "attente" && montrer.ecranCourant === "paiement") $("titre-suivi").focus({ preventScroll: true });
}

function surVerifierSuivi() {
  if (!PAIEMENTS.reference.test(suiviPaiement.reference)) return;
  vibrer();
  arreterSuiviPaiement();
  suiviPaiement.debut = Date.now();
  suiviPaiement.actif = true;
  afficherSuivi("attente");
  planifierConsultation(0);
}

function surReessayerSuivi() {
  if (!suiviPaiement.formule) return;
  vibrer();
  /* Le brouillon du devis en cours n'est jamais touché : on relance seulement la même formule. */
  lancerPaiement(suiviPaiement.formule);
}

/* Retour de la page de paiement : #paiement-retour?ref=BP-… (format vérifié, puis effacé de l'adresse). */
async function surRetourPaiement() {
  const adresse = location.hash || "";
  if (!adresse.startsWith("#paiement-retour")) return;
  const trouve = /^#paiement-retour\?ref=(BP-[A-Z0-9]{6,20})$/.exec(adresse);
  history.replaceState(null, "", location.pathname + location.search);
  if (!trouve || !etat.compte || etat.verrouille) return;
  const enCours = await lirePaiementEnCours();
  suivrePaiement(trouve[1], enCours && enCours.reference === trouve[1] ? enCours.formule : "");
}

/* Retour dans l'application (navigateur fermé, reprise, démarrage) : vérification discrète
   d'un paiement en cours de moins de 24 h. */
async function verifierPaiementEnAttente() {
  if (!etat.compte || etat.verrouille) return;
  if (suiviPaiement.actif) {
    planifierConsultation(0);
    return;
  }
  const enCours = await lirePaiementEnCours();
  if (!enCours) return;
  if (Date.now() - enCours.depuis >= PAIEMENTS.enCoursMaxMs) {
    await oublierPaiementEnCours(enCours.reference);
    return;
  }
  const resultat = await consulterPaiement(enCours.reference);
  if (resultat && resultat.statut !== "en_attente" && !suiviPaiement.actif) {
    if (resultat.statut === "paye") await conclurePaiement(resultat, true);
    else await oublierPaiementEnCours(enCours.reference);
  }
}

function ecouterRetourPaiement() {
  window.addEventListener("hashchange", surRetourPaiement);
  const navigateur = plugin("Browser");
  if (navigateur && typeof navigateur.addListener === "function") {
    Promise.resolve(navigateur.addListener("browserFinished", verifierPaiementEnAttente)).catch(() => journal("écoute du navigateur impossible"));
  }
}

function surRetourApplication() {
  controlerInactivite();
  verifierPaiementEnAttente();
}

/* Renouveler en 1 toucher : même formule, même parcours de paiement. */
function renouvelerFormule() {
  const id = formuleAchetable(etat.abonnement && etat.abonnement.formule);
  if (!id || id === "vie" || !texteRappel(etat.abonnement)) return;
  vibrer();
  lancerPaiement(id);
}

function surClicPasserPro() {
  /* La navigation vers « Mon abonnement » est faite par [data-ecran] ; en mode rappel, le paiement part aussitôt. */
  if ($("bouton-passer-pro").dataset.renouveler) renouvelerFormule();
}

function afficherRenouveler() {
  const id = formuleAchetable(etat.abonnement && etat.abonnement.formule);
  const visible = Boolean(id) && id !== "vie" && Boolean(texteRappel(etat.abonnement));
  $("bouton-renouveler").hidden = !visible;
  $("libelle-renouveler").textContent = visible ? "Renouveler mon " + FORMULES[id].nom : "Renouveler";
}

/* Interrupteur « renouvellement automatique par carte » : enregistré en ligne d'abord ;
   en cas d'échec, il revient à sa position précédente. */
async function lireRenouvellementLocal() {
  const brut = await lireJson(CLES_STOCKAGE.renouvellement);
  return objetSimple(brut) ? brut : {};
}

async function afficherRenouvellement() {
  const id = etat.abonnement ? etat.abonnement.formule : FORMULE_DEFAUT;
  $("carte-renouvellement").hidden = id === "vie";
  const local = await lireRenouvellementLocal();
  $("renouvellement-auto").checked = local[etat.compte.id] === true;
  $("renouvellement-auto").disabled = false;
  message("msg-renouvellement", "");
}

async function surChangementRenouvellement() {
  const interrupteur = $("renouvellement-auto");
  const actif = interrupteur.checked;
  interrupteur.disabled = true;
  message("msg-renouvellement", "Enregistrement…");
  let enregistre = false;
  if (typeof fetch === "function" && navigator.onLine !== false && etat.compte) {
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), PAIEMENTS.delaiConsultationMs);
    try {
      const reponse = await fetch(API_URL + "/api/abonnement/renouvellement-auto", {
        method: "POST",
        headers: await entetesApi(true),
        body: JSON.stringify({ actif }),
        credentials: "omit",
        cache: "no-store",
        signal: controleur.signal
      });
      enregistre = reponse.ok;
    } catch (erreur) {
      enregistre = false;
    } finally {
      clearTimeout(delai);
    }
  }
  if (enregistre) {
    const local = await lireRenouvellementLocal();
    const propre = {};
    for (const [id, valeur] of Object.entries(local)) if (/^[a-z0-9-]{8,64}$/i.test(id) && valeur === true) propre[id] = true;
    if (actif) propre[etat.compte.id] = true;
    else delete propre[etat.compte.id];
    await ecrireValeur(CLES_STOCKAGE.renouvellement, JSON.stringify(propre));
    message("msg-renouvellement", actif
      ? "Activé : votre Pro payé par carte sera renouvelé la veille de sa fin. Vous pouvez l'arrêter ici à tout moment."
      : "Désactivé : vous confirmerez vous-même chaque renouvellement.", true);
  } else {
    interrupteur.checked = !actif;
    message("msg-renouvellement", "Le réglage n'a pas pu être enregistré. Vérifiez votre connexion internet puis réessayez.");
  }
  interrupteur.disabled = false;
}

/* ---------- Rappels J-3, veille et jour J (seules relances d'un abonné) ---------- */

function texteRappel(abonnement) {
  const formule = FORMULES[abonnement && abonnement.formule];
  if (!formule || !formule.illimite || !abonnement.fin) return "";
  const jours = joursRestants(abonnement);
  if (jours > Math.max(...RELANCES.rappelsJours)) return "";
  const fin = Date.parse(abonnement.fin);
  const echeance = cleJourLocal(fin) === cleJourLocal(maintenantFiable())
    ? " se termine aujourd'hui, le "
    : " se termine dans " + accorderNombre(Math.max(1, jours), "jour", "jours") + ", le ";
  return "Votre " + formule.nom + echeance + dateLongue(fin, false) + ". Renouvelez en 1 toucher pour garder vos devis illimités.";
}

/* Heure d'un rappel : 9 h le jour voulu ; le jour J, au plus tard 1 h avant la fin. */
function heureRappel(fin, jours) {
  const jour = new Date(fin - jours * 86400000);
  jour.setHours(RELANCES.heureRappel, 0, 0, 0);
  if (jours === 0 && jour.getTime() > fin - 3600000) return new Date(fin - 3600000);
  return jour;
}

async function planifierRappels() {
  const notifications = plugin("LocalNotifications");
  if (!notifications || !etat.compte || !etat.abonnement) return;
  const abonnement = etat.abonnement;
  const formule = FORMULES[abonnement.formule] || FORMULES[FORMULE_DEFAUT];
  const cle = etat.compte.id + "|" + abonnement.formule + "|" + (abonnement.fin || "");
  if (abonnementEtat.rappels === cle) return;
  abonnementEtat.rappels = cle;
  try {
    await notifications.cancel({ notifications: RELANCES.rappelsJours.map((j) => ({ id: RELANCES.idNotification + j })) });
    if (!formule.illimite || !abonnement.fin) return;
    const fin = Date.parse(abonnement.fin);
    const aPlanifier = RELANCES.rappelsJours.map((j) => ({
      id: RELANCES.idNotification + j,
      title: "BâtiPlus",
      body: "Votre " + formule.nom + (j === 0 ? " se termine aujourd'hui" : " se termine dans " + accorderNombre(j, "jour", "jours") + ", le " + dateLongue(fin, false))
        + ". Renouvelez en 1 toucher depuis Mon abonnement.",
      schedule: { at: heureRappel(fin, j), allowWhileIdle: true }
    })).filter((n) => n.schedule.at.getTime() > Date.now());
    if (!aPlanifier.length) return;
    let permission = await notifications.checkPermissions();
    if (permission.display === "prompt" || permission.display === "prompt-with-rationale") permission = await notifications.requestPermissions();
    if (permission.display === "granted") await notifications.schedule({ notifications: aPlanifier });
  } catch (erreur) {
    journal("rappels non planifiés");
  }
}

function afficherImage(img, donnees) {
  if (donnees && DONNEES_IMAGE.test(donnees)) {
    img.src = donnees;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
}

function afficherCompte(compte) {
  const nom = compte ? compte.nom : "";
  /* Nom composé (« Ouédraogo-Kaboré ») jamais coupé au trait d'union, même dans la carte étroite du verrou. */
  document.querySelectorAll("[data-nom]").forEach((el) => { ecrireInsecable(el, nom); });
  document.querySelectorAll("[data-initiales]").forEach((el) => { el.textContent = compte ? initiales(nom) : ""; });
  document.querySelectorAll("[data-photo]").forEach((img) => afficherImage(img, compte ? compte.photo : ""));
  afficherDroitsPro();
  $("bouton-avatar").setAttribute("aria-label", compte ? "Mon profil — " + nom : "Mon profil");
  $("profil-telephone").textContent = compte ? formaterTelephone(compte.telephone, compte.pays) : "";
}

/* ---------- Devis enregistrés (étape 7) ----------
   Chaque devis relu est nettoyé champ par champ. Le total d'un devis complet est TOUJOURS
   recalculé depuis son contenu : un total falsifié dans le stockage n'entre jamais dans les
   statistiques. Les devis anciens (sans lignes) restent listés mais ne s'ouvrent pas. */

const MOTIF_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MOTIF_REF_ARTICLE = /^(?:[a-z0-9.-]{1,40}|perso-[a-f0-9]{8})$/;
const MOTIF_NUMERO_DEVIS = /^BP-\d{4}-\d{4,6}$/;

function dateIsoValide(valeur) {
  return typeof valeur === "string" && valeur.length <= 40 && !Number.isNaN(Date.parse(valeur));
}

function ligneDevisValide(source, decimales) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const ref = typeof source.ref === "string" && MOTIF_REF_ARTICLE.test(source.ref) ? source.ref : null;
  return {
    id: typeof source.id === "string" && /^l\d{1,4}$/.test(source.id) ? source.id : "",
    ref,
    designation: texteBorne(source.designation, BORNES_CATALOGUE.designationMax),
    unite: typeof source.unite === "string" && Object.prototype.hasOwnProperty.call(UNITES, source.unite) ? source.unite : "u",
    categorie: typeof source.categorie === "string" && Object.prototype.hasOwnProperty.call(CATEGORIES_MATERIEL, source.categorie) ? source.categorie : "autres",
    quantite: entierBorne(source.quantite, 0, BORNES_DEVIS.quantiteMax, 0),
    prix: montantBorne(source.prix, decimales, 0),
    fournisseur: texteBorne(source.fournisseur, BORNES_CATALOGUE.fournisseurMax),
    supprimee: source.supprimee === true
  };
}

function mainOeuvreDevisValide(source, decimales) {
  const mo = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const points = mo.points && typeof mo.points === "object" && !Array.isArray(mo.points) ? mo.points : {};
  const auto = mo.auto && typeof mo.auto === "object" && !Array.isArray(mo.auto) ? mo.auto : {};
  const journees = mo.journees && typeof mo.journees === "object" && !Array.isArray(mo.journees) ? mo.journees : {};
  const propre = { points: {}, auto: {}, forfait: montantBorne(mo.forfait, decimales, 0), journees: {
    ouvriers: entierBorne(journees.ouvriers, 0, BORNES_CHANTIER.ouvriersMax, 0),
    jours: arrondi(borner(journees.jours, 0, BORNES_CHANTIER.joursMax, 0), 1),
    tarif: montantBorne(journees.tarif, decimales, 0)
  }, libres: (Array.isArray(mo.libres) ? mo.libres : []).slice(0, BORNES_CHANTIER.lignesLibresMax)
    .filter((l) => l && typeof l === "object" && !Array.isArray(l))
    .map((l) => ({ libelle: texteBorne(l.libelle, 120), montant: montantBorne(l.montant, decimales, 0) })) };
  Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => {
    const point = Object.prototype.hasOwnProperty.call(points, id) && points[id] && typeof points[id] === "object" ? points[id] : {};
    propre.points[id] = { quantite: entierBorne(point.quantite, 0, BORNES_CHANTIER.quantiteMax, 0), prix: montantBorne(point.prix, decimales, 0) };
    propre.auto[id] = Object.prototype.hasOwnProperty.call(auto, id) ? entierBorne(auto[id], 0, BORNES_CHANTIER.quantiteMax, 0) : 0;
  });
  return propre;
}

function devisValide(source, codeDevise) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (typeof source.id !== "string" || !MOTIF_ID.test(source.id) || typeof source.compteId !== "string" || !source.compteId
    || !Object.prototype.hasOwnProperty.call(STATUTS_DEVIS, source.statut) || !dateIsoValide(source.creeLe)
    || typeof source.titre !== "string" || typeof source.client !== "string") return null;
  const base = {
    id: source.id, compteId: source.compteId, statut: source.statut, creeLe: source.creeLe,
    modifieLe: dateIsoValide(source.modifieLe) ? source.modifieLe : source.creeLe,
    titre: texteBorne(source.titre, BORNES_DEVIS.titreMax), client: texteBorne(source.client, BORNES.texteMax)
  };
  if (!Array.isArray(source.lignes)) {
    /* Devis ancien (étapes 1 à 6) : liste et statistiques seulement. */
    if (!Number.isFinite(source.total) || source.total < 0 || source.total > 1e13) return null;
    return { ...base, complet: false, numero: "", total: source.total };
  }
  if (typeof source.numero !== "string" || !MOTIF_NUMERO_DEVIS.test(source.numero)) return null;
  const dec = decimalesDevise(codeDevise);
  const lignes = source.lignes.slice(0, BORNES_DEVIS.lignesMax).map((l) => ligneDevisValide(l, dec)).filter(Boolean);
  const ids = new Set(lignes.map((l) => l.id));
  if (ids.has("") || ids.size !== lignes.length) lignes.forEach((l, index) => { l.id = "l" + (index + 1); });
  lignes.forEach((l) => { if (!l.designation) l.designation = "Article"; });
  const devis = {
    ...base,
    complet: true,
    numero: source.numero,
    chantierId: typeof source.chantierId === "string" && MOTIF_ID.test(source.chantierId) ? source.chantierId : null,
    clientTelephone: typeof source.clientTelephone === "string" && /^\+?\d{0,15}$/.test(source.clientTelephone) ? source.clientTelephone : "",
    lieu: texteBorne(source.lieu, BORNES.texteMax),
    lignes,
    mainOeuvre: mainOeuvreDevisValide(source.mainOeuvre, dec),
    totaux: reglagesTotauxValides(source.totaux),
    conditions: nettoyerParagraphes(source.conditions).slice(0, BORNES.conditionsMax),
    note: nettoyerParagraphes(source.note).slice(0, BORNES_DEVIS.noteMax)
  };
  devis.total = calculerDevis(devis, codeDevise).total.totalGeneral;
  return devis;
}

/* Liste brute : les devis de tous les comptes, jamais modifiés sauf celui qu'on enregistre. */
async function lireDevisBruts() {
  const liste = await lireJson(CLES_STOCKAGE.devis);
  return Array.isArray(liste) ? liste : [];
}

async function lireDevis(compteId) {
  const devise = deviseCompte();
  return (await lireDevisBruts()).filter((d) => d && typeof d === "object" && d.compteId === compteId)
    .map((d) => devisValide(d, devise)).filter(Boolean);
}

/* Numéro BP-AAAA-NNNN : compteur par compte et par année, jamais réutilisé (même après suppression). */
async function prochainNumeroDevis(compteId, existants) {
  const annee = new Date().getFullYear();
  const brut = await lireJson(CLES_STOCKAGE.numerosDevis);
  const compteurs = brut && typeof brut === "object" && !Array.isArray(brut) ? brut : {};
  const cle = compteId + ":" + annee;
  const prefixe = PREFIXE_NUMERO_DEVIS + "-" + annee + "-";
  const stocke = Object.prototype.hasOwnProperty.call(compteurs, cle) ? entierBorne(compteurs[cle], 0, 999998, 0) : 0;
  const plusGrand = existants.reduce((max, d) => (d.numero && d.numero.startsWith(prefixe)
    ? Math.max(max, Number(d.numero.slice(prefixe.length)) || 0) : max), stocke);
  const suivant = Math.min(plusGrand + 1, 999999);
  compteurs[cle] = suivant;
  await ecrireValeur(CLES_STOCKAGE.numerosDevis, JSON.stringify(compteurs));
  return prefixe + String(suivant).padStart(4, "0");
}

/* Compteurs de l'accueil et du profil : mêmes définitions que l'écran Statistiques
   (une seule fonction de calcul, statistiquesDetaillees). */
function statistiques(devis) {
  const s = statistiquesDetaillees(devis, new Date(), 0);
  return { total: s.total, mois: s.mois.nombre, acceptes: s.acceptes, montant: s.montant, clients: s.clients, taux: s.taux };
}

/* ---------- Tableau de bord ---------- */

function formaterEntier(valeur) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(valeur);
}

/* Les chiffres comptent de 0 à leur valeur en 700 ms (immédiat si mouvement réduit). */
function animerCompteur(element, valeur, formater) {
  const precedente = animationsCompteurs.get(element);
  if (precedente) cancelAnimationFrame(precedente);
  if (mouvementReduitQuery.matches || valeur === 0) {
    element.textContent = formater(valeur);
    return;
  }
  const debut = performance.now();
  const etape = (instant) => {
    const t = Math.min(1, (instant - debut) / DUREE_COMPTEUR);
    const adouci = 1 - Math.pow(1 - t, 3);
    element.textContent = formater(t < 1 ? Math.round(valeur * adouci) : valeur);
    if (t < 1) animationsCompteurs.set(element, requestAnimationFrame(etape));
    else animationsCompteurs.delete(element);
  };
  element.textContent = formater(0);
  animationsCompteurs.set(element, requestAnimationFrame(etape));
}

function dateDuJour() {
  const texte = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return texte.charAt(0).toLocaleUpperCase("fr-FR") + texte.slice(1);
}

function astuceDuJour() {
  const aujourdhui = new Date();
  const jour = Math.floor(Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate()) / 86400000);
  return ASTUCES[jour % ASTUCES.length];
}

function creerLigneDevis(devis, codeDevise) {
  const li = document.createElement("li");
  const texte = document.createElement("div");
  texte.className = "devis-texte";
  const titre = document.createElement("strong");
  titre.textContent = devis.titre || "Devis";
  const client = document.createElement("span");
  client.textContent = [devis.numero, devis.client].filter(Boolean).join(" · ");
  texte.append(titre, client);
  const droite = document.createElement("div");
  droite.className = "devis-droite";
  const montant = document.createElement("span");
  montant.className = "devis-montant";
  montant.textContent = formaterMontant(devis.total, codeDevise);
  const statut = document.createElement("span");
  statut.className = "statut";
  statut.dataset.ton = STATUTS_DEVIS[devis.statut].ton;
  statut.textContent = STATUTS_DEVIS[devis.statut].libelle;
  droite.append(montant, statut);
  if (devis.complet) {
    /* Devis complet : toute la ligne ouvre la fiche du devis. */
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "ligne-etude";
    bouton.dataset.devis = devis.id;
    bouton.setAttribute("aria-label", "Ouvrir le devis " + devis.numero + " : " + (devis.titre || "Devis") + ", " + devis.client);
    bouton.append(texte, droite);
    li.className = "ligne-cliquable";
    li.appendChild(bouton);
  } else {
    li.append(texte, droite);
  }
  return li;
}

async function afficherAccueil() {
  const compte = etat.compte;
  if (!compte) return;
  const devis = await lireDevis(compte.id);
  const stats = statistiques(devis);
  const formule = FORMULES[etat.abonnement.formule] || FORMULES[FORMULE_DEFAUT];
  $("accueil-prenom").textContent = prenom(compte.nom);
  $("accueil-telephone").textContent = formaterTelephone(compte.telephone, compte.pays);
  $("accueil-ville").textContent = compte.ville;
  $("accueil-date").textContent = dateDuJour();
  await afficherQuotaAccueil(formule);

  animerCompteur($("cpt-montant"), stats.montant, (v) => formaterMontant(v, compte.devise));
  animerCompteur($("cpt-devis"), stats.mois, formaterEntier);
  animerCompteur($("cpt-acceptes"), stats.acceptes, formaterEntier);
  const jours = joursRestants(etat.abonnement);
  if (jours === null) {
    $("cpt-jours").textContent = "∞";
    $("cpt-jours-libelle").textContent = "Sans date de fin";
  } else {
    animerCompteur($("cpt-jours"), jours, formaterEntier);
    $("cpt-jours-libelle").textContent = "Jours restants";
  }

  const derniers = [...devis].sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe)).slice(0, 3);
  $("accueil-devis").replaceChildren(...derniers.map((d) => creerLigneDevis(d, compte.devise)));
  $("accueil-devis-vide").hidden = derniers.length > 0;
  ecrireInsecable($("astuce-texte"), astuceDuJour());
  await afficherEtudesAccueil(compte);
  relanceDuJour();
}

/* Bandeau d'abonnement de l'accueil : quota du mois (Gratuit), date de fin (Pro),
   rappel J-3 / J-1 avec bouton « Renouveler ». */
async function afficherQuotaAccueil(formule) {
  const abonnement = etat.abonnement;
  const rappel = texteRappel(abonnement);
  let valeur = 1;
  let maximum = 1;
  let quota;
  if (!formule.illimite) {
    valeur = Math.min(await devisCreesCeMois(etat.compte.id), LIMITE_GRATUITE);
    maximum = LIMITE_GRATUITE;
    quota = valeur + " / " + LIMITE_GRATUITE + " devis ce mois";
  } else if (abonnement.fin) {
    quota = "Devis illimités jusqu'au " + dateLongue(Date.parse(abonnement.fin), true);
    maximum = formule.dureeJours;
    valeur = Math.min(joursRestants(abonnement), maximum);
  } else {
    quota = "Devis illimités, à vie";
  }
  ecrireInsecable($("accueil-quota"), quota);
  const jauge = $("accueil-jauge");
  jauge.setAttribute("aria-valuemax", String(maximum));
  jauge.setAttribute("aria-valuenow", String(valeur));
  jauge.dataset.niveau = !formule.illimite ? (valeur >= LIMITE_GRATUITE ? "plein" : valeur === LIMITE_GRATUITE - 1 ? "presque" : "ok") : rappel ? "presque" : "ok";
  $("accueil-jauge-remplie").style.setProperty("--remplissage", String(Math.min(1, valeur / maximum)));
  $("accueil-rappel").hidden = !rappel;
  $("accueil-rappel").textContent = rappel;
  $("libelle-passer-pro").textContent = rappel ? "Renouveler" : "Passer en Pro";
  if (rappel) $("bouton-passer-pro").dataset.renouveler = "1";
  else delete $("bouton-passer-pro").dataset.renouveler;
  $("bouton-passer-pro").hidden = !ecranExiste("abonnement") || (formule.illimite && !rappel);
}

/* ---------- Recherche ---------- */

function ouvrirRecherche() {
  etat.elementAvantRecherche = document.activeElement;
  $("recherche-saisie").value = "";
  afficherResultats("");
  $("recherche").hidden = false;
  $("recherche-saisie").focus({ preventScroll: true });
}

function fermerRecherche() {
  if ($("recherche").hidden) return;
  $("recherche").hidden = true;
  const precedent = etat.elementAvantRecherche;
  etat.elementAvantRecherche = null;
  if (precedent && typeof precedent.focus === "function") precedent.focus({ preventScroll: true });
}

function resultatsRecherche(requete) {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean);
  return RECHERCHE.map((entree, index) => ({ entree, index }))
    .filter(({ entree }) => ecranExiste(entree.ecran))
    .filter(({ entree }) => {
      const texte = normaliser(entree.libelle + " " + entree.detail + " " + entree.mots);
      return mots.every((mot) => texte.includes(mot));
    });
}

function afficherResultats(requete) {
  const resultats = resultatsRecherche(requete);
  const elements = resultats.map(({ entree, index }) => {
    const li = document.createElement("li");
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "recherche-resultat";
    bouton.dataset.index = String(index);
    const texte = document.createElement("span");
    const titre = document.createElement("strong");
    titre.textContent = entree.libelle;
    const detail = document.createElement("small");
    detail.textContent = entree.detail;
    texte.append(titre, detail);
    bouton.append(creerIcone("i-fleche"), texte);
    li.appendChild(bouton);
    return li;
  });
  $("recherche-resultats").replaceChildren(...elements);
  $("recherche-vide").hidden = resultats.length > 0;
}

function surSaisieRecherche(evenement) {
  afficherResultats(evenement.currentTarget.value);
}

function surToucheRecherche(evenement) {
  if (evenement.key !== "Enter") return;
  evenement.preventDefault();
  const premier = $("recherche-resultats").querySelector(".recherche-resultat");
  if (premier) premier.click();
}

function surChoixResultat(evenement) {
  const bouton = evenement.target.closest(".recherche-resultat");
  if (!bouton) return;
  const entree = RECHERCHE[Number(bouton.dataset.index)];
  fermerRecherche();
  montrer(entree.ecran);
  if (entree.cible && $(entree.cible)) reperer($(entree.cible));
}

function surClicFondRecherche(evenement) {
  if (evenement.target === evenement.currentTarget) fermerRecherche();
}

function reperer(element) {
  element.scrollIntoView({ block: "start", behavior: defilementDoux() });
  element.classList.remove("reperee");
  void element.offsetWidth;
  element.classList.add("reperee");
}

/* ---------- Profil ---------- */

async function enregistrerCompte(modifie) {
  if (!etat.compte) return false;
  const comptes = await lireComptes();
  const index = comptes.findIndex((c) => c.id === modifie.id);
  if (index < 0 || !compteValide(modifie)) return false;
  comptes[index] = modifie;
  if (!await ecrireComptes(comptes)) return false;
  etat.compte = modifie;
  afficherCompte(modifie);
  return true;
}

function message(id, texte, reussi) {
  const element = $(id);
  element.textContent = texte;
  element.classList.toggle("ok", Boolean(reussi));
}

function majCompteurConditions() {
  $("compteur-conditions").textContent = $("pro-conditions").value.length + " / " + BORNES.conditionsMax;
}

async function afficherStatistiques() {
  if (!etat.compte) return;
  const compte = etat.compte;
  const stats = statistiques(await lireDevis(compte.id));
  $("stat-devis").textContent = formaterEntier(stats.total);
  $("stat-acceptes").textContent = formaterEntier(stats.acceptes);
  $("stat-taux").textContent = stats.taux === null ? "—" : stats.taux + "\u00A0%";
  $("stat-montant").textContent = formaterMontant(stats.montant, compte.devise);
  $("stat-clients").textContent = formaterEntier(stats.clients);
}

function remplirProfil() {
  const compte = etat.compte;
  if (!compte) return;
  ["pro-nom", "pro-entreprise", "pro-telephone", "pro-ville", "pro-conditions", "pro-ancien", "pro-nouveau", "pro-confirmation"]
    .forEach((id) => effacerErreur($(id)));
  ["msg-profil", "msg-photo", "msg-logo", "msg-conditions", "msg-code", "msg-sauvegarde"].forEach((id) => message(id, ""));
  $("pro-nom").value = compte.nom;
  $("pro-entreprise").value = compte.entreprise || "";
  $("pro-telephone").value = formaterTelephone(compte.telephone, compte.pays);
  $("pro-ville").value = compte.ville;
  remplirListes("pro", compte.pays, compte.devise);
  $("apercu-pro-telephone").replaceChildren();
  $("pro-conditions").value = typeof compte.conditions === "string" ? compte.conditions : CONDITIONS_DEFAUT;
  majCompteurConditions();
  afficherImage($("apercu-logo"), compte.logo);
  $("logo-vide").hidden = Boolean(compte.logo);
  $("bouton-retirer-logo").hidden = !compte.logo;
  $("bouton-retirer-photo").hidden = !compte.photo;
  ["pro-ancien", "pro-nouveau", "pro-confirmation"].forEach(viderCode);
  activerCode("pro-ancien");
  afficherStatistiques();
  afficherRenouvellement();
}

function lireFormulaireProfil() {
  let premier = "";
  const signaler = (id, texte) => {
    afficherErreur(id, texte);
    premier = premier || id;
  };
  ["pro-nom", "pro-entreprise", "pro-telephone", "pro-ville"].forEach((id) => effacerErreur($(id)));
  const nom = nettoyerTexte($("pro-nom").value);
  if (!texteValide(nom, true)) signaler("pro-nom", "Indiquez votre nom complet (120 caractères au maximum).");
  const entreprise = nettoyerTexte($("pro-entreprise").value);
  if (!texteValide(entreprise, false)) signaler("pro-entreprise", "120 caractères au maximum.");
  const analyse = analyserTelephone($("pro-telephone").value, $("pro-pays").value);
  if (!telephoneValide(analyse)) signaler("pro-telephone", messageTelephone(analyse));
  const ville = nettoyerTexte($("pro-ville").value);
  if (!texteValide(ville, true)) signaler("pro-ville", "Indiquez votre ville (120 caractères au maximum).");
  if (premier) {
    allerAuChamp(premier);
    return null;
  }
  const devise = Object.prototype.hasOwnProperty.call(DEVISES, $("pro-devise").value) ? $("pro-devise").value : analyse.pays.devise;
  return { nom, entreprise, telephone: versE164(analyse), pays: analyse.pays.iso, devise, ville };
}

async function surEnregistrerProfil(evenement) {
  evenement.preventDefault();
  if (!etat.compte) return;
  message("msg-profil", "");
  const donnees = lireFormulaireProfil();
  if (!donnees) return;
  const comptes = await lireComptes();
  if (comptes.some((c) => c.id !== etat.compte.id && c.telephone === donnees.telephone)) {
    afficherErreur("pro-telephone", "Ce numéro ne peut pas être utilisé pour ce compte.");
    return;
  }
  const ok = await enregistrerCompte({ ...etat.compte, ...donnees });
  message("msg-profil", ok ? "Informations enregistrées." : "Enregistrement impossible. Réessayez.", ok);
  if (ok) {
    vibrer();
    $("pro-telephone").value = formaterTelephone(donnees.telephone, donnees.pays);
    afficherStatistiques();
  }
}

function nettoyerParagraphes(valeur) {
  return String(valeur || "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function surEnregistrerConditions(evenement) {
  evenement.preventDefault();
  if (!etat.compte) return;
  effacerErreur($("pro-conditions"));
  const conditions = nettoyerParagraphes($("pro-conditions").value);
  if (conditions.length > BORNES.conditionsMax) {
    afficherErreur("pro-conditions", BORNES.conditionsMax + " caractères au maximum.");
    return;
  }
  const ok = await enregistrerCompte({ ...etat.compte, conditions });
  message("msg-conditions", ok ? "Conditions enregistrées." : "Enregistrement impossible. Réessayez.", ok);
  if (ok) $("pro-conditions").value = conditions;
}

async function surChangerCode(evenement) {
  evenement.preventDefault();
  if (!etat.compte) return;
  ["pro-ancien", "pro-nouveau", "pro-confirmation"].forEach((id) => effacerErreur($(id)));
  message("msg-code", "");
  const verrou = await lireVerrou();
  if (verrou.jusqua > Date.now()) {
    message("msg-code", "Trop d'essais. Réessayez dans " + formaterDuree(verrou.jusqua - Date.now()) + ".");
    return;
  }
  if (!cryptoDisponible()) {
    message("msg-code", "Cet appareil ne permet pas de protéger votre code.");
    return;
  }
  const ancien = codes["pro-ancien"];
  const nouveau = codes["pro-nouveau"];
  if (!/^\d{4,6}$/.test(ancien)) {
    afficherErreur("pro-ancien", "Saisissez votre code actuel.");
    return;
  }
  const erreur = erreurCodeNeuf(nouveau);
  if (erreur) {
    afficherErreur("pro-nouveau", erreur);
    return;
  }
  if (nouveau === ancien) {
    afficherErreur("pro-nouveau", "Le nouveau code doit être différent de l'actuel.");
    return;
  }
  if (codes["pro-confirmation"] !== nouveau) {
    afficherErreur("pro-confirmation", "Les deux codes ne sont pas identiques.");
    return;
  }
  const bouton = $("bouton-changer-code");
  bouton.setAttribute("aria-busy", "true");
  try {
    const compte = await verifierIdentifiants(etat.compte.telephone, ancien);
    if (!compte) {
      const apres = await enregistrerEchec();
      viderCode("pro-ancien");
      activerCode("pro-ancien");
      afficherErreur("pro-ancien", apres.jusqua > Date.now()
        ? "Code actuel incorrect. Trop d'essais : réessayez dans " + formaterDuree(apres.jusqua - Date.now()) + "."
        : "Code actuel incorrect.");
      return;
    }
    await reinitialiserVerrou();
    const sel = crypto.getRandomValues(new Uint8Array(CODE.octetsSel));
    const empreinte = await deriverEmpreinte(nouveau, sel, CODE.iterations);
    const ok = await enregistrerCompte({ ...etat.compte, sel: versBase64(sel), empreinte: versBase64(empreinte), iterations: CODE.iterations });
    ["pro-ancien", "pro-nouveau", "pro-confirmation"].forEach(viderCode);
    activerCode("pro-ancien");
    message("msg-code", ok ? "Code secret changé. Utilisez-le dès la prochaine connexion." : "Enregistrement impossible. Réessayez.", ok);
    if (ok) vibrer();
  } finally {
    bouton.removeAttribute("aria-busy");
  }
}

/* ---------- Images importées : type vérifié, 5 Mo max, REDESSINÉES (métadonnées et
   position GPS supprimées), puis compressées. Le SVG est refusé. ---------- */

async function lireOctets(blob, longueur) {
  const morceau = blob.slice(0, longueur);
  if (typeof morceau.arrayBuffer === "function") return new Uint8Array(await morceau.arrayBuffer());
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.addEventListener("load", () => resoudre(new Uint8Array(lecteur.result)));
    lecteur.addEventListener("error", () => rejeter(new Error("illisible")));
    lecteur.readAsArrayBuffer(morceau);
  });
}

/* Le type est lu dans les premiers octets du fichier, pas dans son nom. */
function typeReel(octets) {
  const texte = (debut, fin) => String.fromCharCode(...octets.slice(debut, fin));
  if (octets[0] === 0xFF && octets[1] === 0xD8 && octets[2] === 0xFF) return "image/jpeg";
  if (octets[0] === 0x89 && texte(1, 4) === "PNG") return "image/png";
  if (texte(0, 4) === "RIFF" && texte(8, 12) === "WEBP") return "image/webp";
  return "";
}

async function decoderImage(blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const adresse = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = adresse;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(adresse);
  }
}

function exporterImage(toile, mode, qualite) {
  const webp = toile.toDataURL("image/webp", qualite);
  if (webp.startsWith("data:image/webp")) return webp;
  return mode === "logo" ? toile.toDataURL("image/png") : toile.toDataURL("image/jpeg", qualite);
}

async function preparerImage(blob, mode) {
  if (!blob || blob.size > IMAGES.octetsMax) throw new Error("taille");
  if (!IMAGES.types.includes(typeReel(await lireOctets(blob, 12)))) throw new Error("type");
  let source;
  try {
    source = await decoderImage(blob);
  } catch (erreur) {
    throw new Error("illisible");
  }
  const largeur = source.width;
  const hauteur = source.height;
  if (!largeur || !hauteur || largeur * hauteur > IMAGES.pixelsMax) throw new Error("illisible");
  const toile = document.createElement("canvas");
  const ctx = toile.getContext("2d");
  if (mode === "tableau") {
    /* Photo du tableau électrique : proportions gardées, fond blanc, JPEG. */
    const echelle = Math.min(1, PHOTO_TABLEAU.cote / Math.max(largeur, hauteur));
    toile.width = Math.max(1, Math.round(largeur * echelle));
    toile.height = Math.max(1, Math.round(hauteur * echelle));
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, toile.width, toile.height);
    ctx.drawImage(source, 0, 0, toile.width, toile.height);
  } else if (mode === "photo") {
    const cote = IMAGES.photo.cote;
    const coupe = Math.min(largeur, hauteur);
    toile.width = cote;
    toile.height = cote;
    ctx.drawImage(source, (largeur - coupe) / 2, (hauteur - coupe) / 2, coupe, coupe, 0, 0, cote, cote);
  } else {
    const echelle = Math.min(1, IMAGES.logo.largeur / largeur, IMAGES.logo.hauteur / hauteur);
    toile.width = Math.max(1, Math.round(largeur * echelle));
    toile.height = Math.max(1, Math.round(hauteur * echelle));
    ctx.drawImage(source, 0, 0, toile.width, toile.height);
  }
  if (typeof source.close === "function") source.close();
  if (mode === "tableau") return exporterPhotoTableau(toile);
  let qualite = IMAGES.qualite;
  let donnees = exporterImage(toile, mode, qualite);
  while (donnees.length > IMAGES.donneesMax && qualite > 0.4) {
    qualite -= 0.14;
    donnees = toile.toDataURL(mode === "logo" ? "image/webp" : "image/jpeg", qualite);
  }
  if (donnees.length > IMAGES.donneesMax || !DONNEES_IMAGE.test(donnees)) throw new Error("taille");
  return donnees;
}

/* JPEG seulement (le PDF l'intègre tel quel), qualité baissée jusqu'à passer sous 300 Ko. */
function exporterPhotoTableau(toile) {
  let qualite = PHOTO_TABLEAU.qualite;
  let donnees = toile.toDataURL("image/jpeg", qualite);
  while (donnees.length > PHOTO_TABLEAU.donneesMax && qualite > PHOTO_TABLEAU.qualiteMin) {
    qualite -= 0.1;
    donnees = toile.toDataURL("image/jpeg", qualite);
  }
  if (!photoTableauValide(donnees)) throw new Error("taille");
  return donnees;
}

function messageImage(erreur) {
  const raison = erreur && erreur.message;
  if (raison === "type") return "Format refusé : choisissez une image JPEG, PNG ou WebP.";
  if (raison === "taille") return "Image trop lourde : 5 Mo maximum.";
  return "Image illisible. Essayez une autre image.";
}

async function importerImage(evenement, champ, idMessage) {
  const entree = evenement.currentTarget;
  const fichier = entree.files && entree.files[0];
  entree.value = "";
  if (!fichier) return;
  message(idMessage, "");
  try {
    const donnees = await preparerImage(fichier, champ === "photo" ? "photo" : "logo");
    const ok = await enregistrerCompte({ ...etat.compte, [champ]: donnees });
    message(idMessage, ok ? (champ === "photo" ? "Photo mise à jour." : "Logo mis à jour.") : "Enregistrement impossible. Réessayez.", ok);
    if (ok) remplirImagesProfil();
  } catch (erreur) {
    message(idMessage, messageImage(erreur));
  }
}

/* ---------- Photo du tableau électrique (étape 13) ----------
   Une clé par devis : { compteId, donnees (JPEG data:), ajouteLe }. Relue et vérifiée à
   chaque ouverture : une photo d'un autre compte ou mal formée n'est jamais affichée. */

const DONNEES_PHOTO_TABLEAU = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

function photoTableauValide(donnees) {
  return typeof donnees === "string" && donnees.length <= PHOTO_TABLEAU.donneesMax && DONNEES_PHOTO_TABLEAU.test(donnees);
}

function clePhotoTableau(devisId) {
  return MOTIF_ID.test(String(devisId)) ? CLES_STOCKAGE.photoTableau + devisId : "";
}

async function lirePhotoTableau(devisId) {
  const cle = clePhotoTableau(devisId);
  if (!cle || !etat.compte) return "";
  const brut = await lireJson(cle);
  if (!brut || typeof brut !== "object" || brut.compteId !== etat.compte.id || !photoTableauValide(brut.donnees)) return "";
  return brut.donnees;
}

async function ecrirePhotoTableau(devisId, donnees) {
  const cle = clePhotoTableau(devisId);
  if (!cle || !etat.compte || !photoTableauValide(donnees)) return false;
  return ecrireValeur(cle, JSON.stringify({ compteId: etat.compte.id, donnees, ajouteLe: new Date().toISOString() }));
}

/* Au démarrage : les photos dont le devis n'existe plus (supprimé, annulation passée) sont effacées. */
async function purgerPhotosOrphelines() {
  const cles = (await listerCles()).filter((cle) => typeof cle === "string" && cle.startsWith(CLES_STOCKAGE.photoTableau));
  if (!cles.length) return;
  /* Liste des devis illisible : on ne touche à rien (jamais d'effacement par erreur de lecture). */
  const devis = await lireJson(CLES_STOCKAGE.devis);
  if (!Array.isArray(devis)) return;
  const existants = new Set(devis.filter((d) => d && typeof d === "object").map((d) => CLES_STOCKAGE.photoTableau + d.id));
  for (const cle of cles) {
    if (!existants.has(cle)) await supprimerValeur(cle);
  }
}

/* data:image/…;base64 (appareil photo natif) → Blob, sans fetch (la CSP n'autorise pas data: en connexion). */
function blobDepuisDataUrl(donnees) {
  const morceaux = typeof donnees === "string" ? donnees.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/) : null;
  if (!morceaux || morceaux[2].length > Math.ceil(IMAGES.octetsMax / 3) * 4) return null;
  try {
    return new Blob([depuisBase64(morceaux[2])], { type: morceaux[1] });
  } catch (erreur) {
    return null;
  }
}

function afficherPhotoTableau(donnees) {
  const avecPhoto = photoTableauValide(donnees);
  const apercu = $("apercu-photo-tableau");
  if (avecPhoto) apercu.src = donnees;
  else apercu.removeAttribute("src");
  apercu.hidden = !avecPhoto;
  $("photo-tableau-vide").hidden = avecPhoto;
  $("bouton-retirer-photo-tableau").hidden = !avecPhoto;
  $("libelle-photo-tableau").textContent = avecPhoto ? "Changer la photo" : "Prendre la photo";
}

async function chargerPhotoTableau(devis) {
  afficherPhotoTableau("");
  message("msg-photo-tableau", "");
  const donnees = await lirePhotoTableau(devis.id);
  if (fiche.devis === devis) afficherPhotoTableau(donnees);
}

async function enregistrerPhotoTableau(blob) {
  const devis = fiche.devis;
  if (!devis) return;
  try {
    const donnees = await preparerImage(blob, "tableau");
    if (fiche.devis !== devis) return;
    const ok = await ecrirePhotoTableau(devis.id, donnees);
    message("msg-photo-tableau", ok ? "Photo du tableau jointe au devis " + devis.numero + "."
      : "Photo non enregistrée : la mémoire de l'appareil est pleine. Retirez d'anciennes photos ou supprimez des devis.", ok);
    if (ok) {
      vibrer();
      afficherPhotoTableau(donnees);
    }
  } catch (erreur) {
    message("msg-photo-tableau", messageImage(erreur));
  }
}

/* Téléphone : l'application Appareil photo s'ouvre (aucune permission demandée par BâtiPlus).
   Navigateur : sélecteur de fichier, appareil photo arrière proposé sur mobile. */
async function surPrendrePhotoTableau() {
  if (!fiche.devis) return;
  const camera = plugin("Camera");
  if (!camera || typeof camera.getPhoto !== "function") {
    $("fichier-photo-tableau").click();
    return;
  }
  message("msg-photo-tableau", "");
  let resultat;
  try {
    resultat = await camera.getPhoto({
      source: "CAMERA", resultType: "dataUrl", quality: PHOTO_TABLEAU.qualiteCapture, width: PHOTO_TABLEAU.largeurCapture,
      correctOrientation: true, saveToGallery: false, allowEditing: false
    });
  } catch (erreur) {
    /* Annulé par l'électricien : rien à dire. */
    if (!/cancel|annul/i.test(String(erreur && erreur.message))) message("msg-photo-tableau", "L'appareil photo n'a pas pu s'ouvrir. Réessayez.");
    return;
  }
  const blob = blobDepuisDataUrl(resultat && resultat.dataUrl);
  if (!blob) {
    message("msg-photo-tableau", "Photo illisible. Réessayez.");
    return;
  }
  await enregistrerPhotoTableau(blob);
}

function surFichierPhotoTableau(evenement) {
  const entree = evenement.currentTarget;
  const fichier = entree.files && entree.files[0];
  entree.value = "";
  if (!fichier || !fiche.devis) return;
  message("msg-photo-tableau", "");
  enregistrerPhotoTableau(fichier);
}

async function surRetirerPhotoTableau() {
  const devis = fiche.devis;
  if (!devis) return;
  const ok = await demanderConfirmation("Retirer la photo ?", "La photo du tableau électrique ne sera plus jointe au devis " + devis.numero + ".", "Retirer", "Garder la photo");
  if (!ok || fiche.devis !== devis) return;
  await supprimerValeur(clePhotoTableau(devis.id));
  afficherPhotoTableau("");
  message("msg-photo-tableau", "Photo retirée du devis.", true);
}

function remplirImagesProfil() {
  const compte = etat.compte;
  afficherImage($("apercu-logo"), compte.logo);
  $("logo-vide").hidden = Boolean(compte.logo);
  $("bouton-retirer-logo").hidden = !compte.logo;
  $("bouton-retirer-photo").hidden = !compte.photo;
}

function surFichierPhoto(evenement) {
  if (!etat.compte) return;
  importerImage(evenement, "photo", "msg-photo");
}

function surFichierLogo(evenement) {
  if (!etat.compte) return;
  importerImage(evenement, "logo", "msg-logo");
}

function surChoisirPhoto() {
  $("fichier-photo").click();
}

function surChoisirLogo() {
  $("fichier-logo").click();
}

async function surRetirerPhoto() {
  if (!etat.compte) return;
  const ok = await enregistrerCompte({ ...etat.compte, photo: "" });
  message("msg-photo", ok ? "Photo retirée." : "Enregistrement impossible. Réessayez.", ok);
  if (ok) remplirImagesProfil();
}

async function surRetirerLogo() {
  if (!etat.compte) return;
  const ok = await enregistrerCompte({ ...etat.compte, logo: "" });
  message("msg-logo", ok ? "Logo retiré." : "Enregistrement impossible. Réessayez.", ok);
  if (ok) remplirImagesProfil();
}

/* ---------- Sauvegarde : export et import contrôlé ---------- */

function construireSauvegarde(compte) {
  return {
    format: SAUVEGARDE.format,
    version: SAUVEGARDE.version,
    exporteLe: new Date().toISOString(),
    profil: {
      nom: compte.nom,
      entreprise: compte.entreprise || "",
      ville: compte.ville,
      pays: compte.pays,
      devise: compte.devise,
      conditions: typeof compte.conditions === "string" ? compte.conditions : CONDITIONS_DEFAUT,
      photo: compte.photo || "",
      logo: compte.logo || ""
    }
  };
}

async function surExporter() {
  if (!etat.compte) return;
  const json = JSON.stringify(construireSauvegarde(etat.compte), null, 2);
  const nom = "batiplus-sauvegarde-" + new Date().toISOString().slice(0, 10) + ".json";
  const fichiers = plugin("Filesystem");
  try {
    if (fichiers) {
      await fichiers.writeFile({ path: "BatiPlus/" + nom, data: json, directory: "DOCUMENTS", encoding: "utf8", recursive: true });
      message("msg-sauvegarde", "Sauvegarde enregistrée dans Documents/BatiPlus.", true);
    } else {
      const adresse = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const lien = document.createElement("a");
      lien.href = adresse;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      setTimeout(() => URL.revokeObjectURL(adresse), 1000);
      message("msg-sauvegarde", "Sauvegarde téléchargée : " + nom, true);
    }
    vibrer();
  } catch (erreur) {
    message("msg-sauvegarde", "Impossible d'enregistrer la sauvegarde sur cet appareil.");
  }
}

function estObjetSimple(valeur) {
  return Boolean(valeur) && typeof valeur === "object" && !Array.isArray(valeur) && Object.getPrototypeOf(valeur) === Object.prototype;
}

function verifierCles(objet, autorisees, nomBloc) {
  const inconnue = Object.keys(objet).find((cle) => !autorisees.includes(cle));
  if (inconnue) throw new Error("Fichier refusé : champ inattendu « " + inconnue.slice(0, 30) + " » dans " + nomBloc + ".");
}

/* Structure validée champ par champ, valeurs typées, clés inconnues rejetées.
   Une sauvegarde ne peut JAMAIS toucher au code secret, au téléphone ni à l'abonnement. */
function validerSauvegarde(donnees) {
  const refus = (texte) => { throw new Error(texte); };
  if (!estObjetSimple(donnees)) refus("Ce fichier n'est pas une sauvegarde BâtiPlus.");
  verifierCles(donnees, ["format", "version", "exporteLe", "profil"], "la sauvegarde");
  if (donnees.format !== SAUVEGARDE.format) refus("Ce fichier n'est pas une sauvegarde BâtiPlus.");
  if (donnees.version !== SAUVEGARDE.version) refus("Version de sauvegarde non prise en charge.");
  if (typeof donnees.exporteLe !== "string" || Number.isNaN(Date.parse(donnees.exporteLe))) refus("Date de sauvegarde invalide.");
  const p = donnees.profil;
  if (!estObjetSimple(p)) refus("Profil absent de la sauvegarde.");
  verifierCles(p, ["nom", "entreprise", "ville", "pays", "devise", "conditions", "photo", "logo"], "le profil");
  const texte = (valeur, obligatoire, nomChamp) => {
    if (valeur === undefined && !obligatoire) return "";
    if (typeof valeur !== "string") refus("Champ « " + nomChamp + " » invalide.");
    const propre = nettoyerTexte(valeur);
    if (!texteValide(propre, obligatoire)) refus("Champ « " + nomChamp + " » invalide.");
    return propre;
  };
  const image = (valeur, nomChamp) => {
    if (valeur === undefined || valeur === "") return "";
    if (typeof valeur !== "string" || valeur.length > IMAGES.donneesMax || !DONNEES_IMAGE.test(valeur)) refus("Image « " + nomChamp + " » invalide.");
    return valeur;
  };
  const profil = {
    nom: texte(p.nom, true, "nom"),
    entreprise: texte(p.entreprise, false, "entreprise"),
    ville: texte(p.ville, true, "ville"),
    pays: p.pays,
    devise: p.devise,
    conditions: CONDITIONS_DEFAUT,
    photo: image(p.photo, "photo"),
    logo: image(p.logo, "logo")
  };
  if (typeof p.pays !== "string" || !PAYS_PAR_ISO.has(p.pays)) refus("Pays inconnu dans la sauvegarde.");
  if (typeof p.devise !== "string" || !Object.prototype.hasOwnProperty.call(DEVISES, p.devise)) refus("Devise inconnue dans la sauvegarde.");
  if (p.conditions !== undefined) {
    if (typeof p.conditions !== "string") refus("Champ « conditions » invalide.");
    profil.conditions = nettoyerParagraphes(p.conditions);
    if (profil.conditions.length > BORNES.conditionsMax) refus("Conditions trop longues.");
  }
  return profil;
}

function dataUrlVersBlob(donnees) {
  const [entete, base64] = donnees.split(",");
  const type = entete.slice(5, entete.indexOf(";"));
  return new Blob([depuisBase64(base64)], { type });
}

async function lireTexte(fichier) {
  if (typeof fichier.text === "function") return fichier.text();
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.addEventListener("load", () => resoudre(String(lecteur.result)));
    lecteur.addEventListener("error", () => rejeter(new Error("illisible")));
    lecteur.readAsText(fichier);
  });
}

function surChoisirSauvegarde() {
  $("fichier-sauvegarde").click();
}

async function surFichierSauvegarde(evenement) {
  if (!etat.compte) return;
  const entree = evenement.currentTarget;
  const fichier = entree.files && entree.files[0];
  entree.value = "";
  if (!fichier) return;
  message("msg-sauvegarde", "");
  if (fichier.size > SAUVEGARDE.octetsMax) {
    message("msg-sauvegarde", "Fichier trop lourd : 2 Mo maximum.");
    return;
  }
  let profil;
  try {
    let donnees;
    try {
      donnees = JSON.parse(await lireTexte(fichier));
    } catch (erreur) {
      throw new Error("Ce fichier n'est pas une sauvegarde BâtiPlus.");
    }
    profil = validerSauvegarde(donnees);
  } catch (erreur) {
    message("msg-sauvegarde", erreur.message);
    return;
  }
  const accord = await demanderConfirmation("Importer cette sauvegarde ?",
    "Votre nom, votre entreprise, votre ville, votre pays, votre devise, vos conditions, votre photo et votre logo seront remplacés. Votre téléphone, votre code secret et votre abonnement ne changent pas.",
    "Importer");
  if (!accord) return;
  try {
    /* Les images importées repassent par le même contrôle que les images choisies. */
    if (profil.photo) profil.photo = await preparerImage(dataUrlVersBlob(profil.photo), "photo");
    if (profil.logo) profil.logo = await preparerImage(dataUrlVersBlob(profil.logo), "logo");
  } catch (erreur) {
    message("msg-sauvegarde", "Fichier refusé : " + messageImage(erreur).toLocaleLowerCase("fr-FR"));
    return;
  }
  const ok = await enregistrerCompte({ ...etat.compte, ...profil });
  if (ok) remplirProfil();
  message("msg-sauvegarde", ok ? "Sauvegarde importée." : "Import impossible. Réessayez.", ok);
}

/* ---------- Session : déconnexion et changement de compte ---------- */

function masquerTelephone(e164, iso) {
  const affiche = formaterTelephone(e164, iso);
  const pays = PAYS_PAR_ISO.get(iso);
  const debut = pays ? pays.indicatif.length + 2 : 0;
  const chiffres = affiche.slice(debut).replace(/\D/g, "").length;
  let rang = 0;
  return affiche.slice(0, debut) + affiche.slice(debut).replace(/\d/g, (chiffre) => (rang++ < chiffres - 4 ? "•" : chiffre));
}

async function afficherComptesAppareil() {
  const comptes = await lireComptes();
  const puces = comptes.map((compte) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "compte-puce";
    bouton.dataset.compte = compte.id;
    const nom = document.createElement("strong");
    nom.textContent = compte.nom;
    const telephone = document.createElement("span");
    telephone.textContent = masquerTelephone(compte.telephone, compte.pays);
    bouton.append(nom, telephone);
    return bouton;
  });
  $("comptes-liste").replaceChildren(...puces);
  $("comptes-appareil").hidden = puces.length === 0;
}

async function surChoixCompte(evenement) {
  const bouton = evenement.target.closest(".compte-puce");
  if (!bouton) return;
  const compte = (await lireComptes()).find((c) => c.id === bouton.dataset.compte);
  if (!compte) return;
  $("cnx-telephone").value = formaterTelephone(compte.telephone, compte.pays);
  surSaisieTelephoneConnexion();
  viderCode("cnx-code");
  $("cnx-code").focus({ preventScroll: true });
}

function surDeconnexion() {
  fermerSession();
}

async function surChangerCompte() {
  await fermerSession();
  const premier = $("comptes-liste").querySelector(".compte-puce");
  if (premier) premier.focus({ preventScroll: true });
}

/* ---------- Administration (accès caché) ----------
   Appui long de 3 s sur le logo de « À propos ». Le code est envoyé en HTTPS à
   l'API qui seule le vérifie : rien n'est comparé ni stocké sur le téléphone. */

function surDebutAppuiAdmin(evenement) {
  if (evenement.pointerType === "mouse" && evenement.button !== 0) return;
  clearTimeout(etat.minuterieAdmin);
  etat.minuterieAdmin = setTimeout(ouvrirAdmin, DUREE_APPUI_ADMIN);
}

function surFinAppuiAdmin() {
  clearTimeout(etat.minuterieAdmin);
}

function surMenuContextuelLogo(evenement) {
  evenement.preventDefault();
}

function ouvrirAdmin() {
  vibrer();
  montrer("admin");
}

function reinitialiserAdmin() {
  $("adm-code").value = "";
  effacerErreur($("adm-code"));
  message("msg-admin", "");
}

async function surAdmin(evenement) {
  evenement.preventDefault();
  const champ = $("adm-code");
  const code = champ.value;
  champ.value = "";
  effacerErreur(champ);
  message("msg-admin", "");
  if (code.length < ADMIN.codeMin || code.length > ADMIN.codeMax) {
    afficherErreur("adm-code", "Code incomplet.");
    return;
  }
  if (etat.adminBloqueJusqua > Date.now()) {
    message("msg-admin", "Trop d'essais. Réessayez dans " + formaterDuree(etat.adminBloqueJusqua - Date.now()) + ".");
    return;
  }
  if (!navigator.onLine) {
    message("msg-admin", "Connexion Internet nécessaire pour vérifier ce code.");
    return;
  }
  if (typeof fetch !== "function" || typeof AbortController !== "function") {
    message("msg-admin", "Vérification impossible sur cet appareil.");
    return;
  }
  const bouton = $("bouton-admin");
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), ADMIN.delaiMs);
  bouton.setAttribute("aria-busy", "true");
  try {
    const reponse = await fetch(API_URL + ADMIN.chemin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: arret.signal
    });
    if (reponse.status === 401 || reponse.status === 403) {
      etat.adminEchecs += 1;
      if (etat.adminEchecs >= 3) etat.adminBloqueJusqua = Date.now() + 60000;
      message("msg-admin", "Code incorrect.");
    } else if (!reponse.ok) {
      message("msg-admin", "Vérification impossible pour le moment. Réessayez plus tard.");
    } else {
      etat.adminEchecs = 0;
      message("msg-admin", "Code accepté.", true);
    }
  } catch (erreur) {
    message("msg-admin", "Vérification impossible pour le moment. Vérifiez votre connexion puis réessayez.");
  } finally {
    clearTimeout(minuterie);
    bouton.removeAttribute("aria-busy");
  }
}

/* ==== MOTEUR NF C 15-100 ==== */
/* Fonctions pures : aucune lecture du DOM ni du stockage. Elles ne dépendent que des
   constantes de donnees.js, ce qui permet de les tester hors de la page
   (src/scripts/valider-moteur.mjs). Toute entrée est bornée : le résultat ne contient
   jamais NaN, Infinity ni valeur négative, même avec des données falsifiées. */

/* Texte saisi → nombre. Refusés (NaN) : signe, exposant, « Infinity », lettres et plus de
   REGLES_SAISIE.decimalesMax décimales. Espaces de milliers et virgule française acceptés ;
   « 12, » (saisie en cours) vaut 12. Un nombre déjà typé passe : l'appelant le borne. */
function lireNombre(valeur) {
  if (typeof valeur === "number") return valeur;
  if (typeof valeur !== "string") return NaN;
  const texte = valeur.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(texte)) return NaN;
  if ((texte.split(".")[1] || "").length > REGLES_SAISIE.decimalesMax) return NaN;
  return Number(texte);
}

function borner(valeur, min, max, defaut) {
  const nombre = lireNombre(valeur);
  if (!Number.isFinite(nombre)) return defaut;
  return Math.min(max, Math.max(min, nombre));
}

function entierBorne(valeur, min, max, defaut) {
  return Math.round(borner(valeur, min, max, defaut));
}

/* « + 0 » : jamais de « -0 » affiché. */
function arrondi(valeur, decimales) {
  const facteur = Math.pow(10, decimales);
  return Math.round(valeur * facteur) / facteur + 0;
}

function decimalesDevise(codeDevise) {
  return Object.prototype.hasOwnProperty.call(DEVISES, codeDevise) ? DEVISES[codeDevise].decimales : 0;
}

/* Montant borné de 0 au plafond, arrondi aux décimales de la devise (0 en FCFA, 2 sinon). */
function montantBorne(valeur, decimales, defaut) {
  return arrondi(borner(valeur, 0, BORNES_CHANTIER.prixMax, defaut), decimales);
}

function saisieManuelle(valeur) {
  return valeur !== null && valeur !== undefined && valeur !== "";
}

/* Arrondi supérieur protégé contre les erreurs de virgule flottante (28,000000001 → 28). */
function plafond(valeur) {
  return Math.ceil(arrondi(valeur, 6));
}

function texteBorne(valeur, max) {
  if (typeof valeur !== "string") return "";
  return valeur.replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function surfaceValide(valeur) {
  const nombre = lireNombre(valeur);
  return Number.isFinite(nombre) && nombre >= BORNES_CHANTIER.surfaceMin && nombre <= BORNES_CHANTIER.surfaceMax;
}

/* Prises et points lumineux proposés pour une pièce. */
function propositionPiece(type, surface) {
  const regle = TYPES_PIECES[type];
  if (!regle) return { prises: 0, points: 0 };
  const s = borner(surface, BORNES_CHANTIER.surfaceMin, BORNES_CHANTIER.surfaceMax, BORNES_CHANTIER.surfaceMin);
  let prises = regle.prisesMin;
  if (regle.m2ParPrise > 0) prises = Math.max(prises, plafond(s / regle.m2ParPrise));
  if (type === "sejour" && s > SEJOUR_GRAND.surface) prises = Math.max(prises, SEJOUR_GRAND.prisesMin);
  const points = Math.max(1, plafond(s / regle.m2ParPoint));
  return {
    prises: Math.min(prises, BORNES_CHANTIER.prisesMax),
    points: Math.min(points, BORNES_CHANTIER.pointsMax)
  };
}

/* Pièces nettoyées et numérotées (« Chambre 1 », « Chambre 2 »…). null = valeur proposée. */
function normaliserPieces(pieces) {
  const liste = (Array.isArray(pieces) ? pieces : [])
    .filter((p) => p && typeof p === "object" && Object.prototype.hasOwnProperty.call(TYPES_PIECES, p.type))
    .slice(0, BORNES_CHANTIER.piecesMax);
  const totaux = {};
  liste.forEach((p) => { totaux[p.type] = (totaux[p.type] || 0) + 1; });
  const rangs = {};
  return liste.map((p, index) => {
    rangs[p.type] = (rangs[p.type] || 0) + 1;
    const surface = arrondi(borner(p.surface, BORNES_CHANTIER.surfaceMin, BORNES_CHANTIER.surfaceMax, BORNES_CHANTIER.surfaceMin), 2);
    const proposition = propositionPiece(p.type, surface);
    const manuel = (valeur) => valeur !== null && valeur !== undefined && valeur !== "";
    return {
      id: typeof p.id === "string" && /^[a-z0-9-]{1,40}$/i.test(p.id) ? p.id : "piece-" + (index + 1),
      type: p.type,
      nom: TYPES_PIECES[p.type].libelle + (totaux[p.type] > 1 ? " " + rangs[p.type] : ""),
      surface,
      proposition,
      prises: manuel(p.prises) ? entierBorne(p.prises, 0, BORNES_CHANTIER.prisesMax, proposition.prises) : proposition.prises,
      points: manuel(p.points) ? entierBorne(p.points, 0, BORNES_CHANTIER.pointsMax, proposition.points) : proposition.points
    };
  });
}

function normaliserAppareils(appareils) {
  const source = appareils && typeof appareils === "object" ? appareils : {};
  const resultat = {};
  Object.keys(APPAREILS).forEach((id) => {
    const quantite = entierBorne(source[id], 0, BORNES_CHANTIER.appareilsMax, 0);
    if (quantite > 0) resultat[id] = quantite;
  });
  return resultat;
}

function normaliserOptions(options) {
  const o = options && typeof options === "object" ? options : {};
  return {
    distance: arrondi(borner(o.distance, 0, BORNES_CHANTIER.distanceMax, 0), 1),
    hauteur: arrondi(borner(o.hauteur, BORNES_CHANTIER.hauteurMin, BORNES_CHANTIER.hauteurMax, BORNES_CHANTIER.hauteurDefaut), 2),
    parafoudre: o.parafoudre === true,
    terreNeuve: o.terreNeuve === true,
    tableauARemplacer: o.tableauARemplacer === true
  };
}

/* Remplit des circuits de « max » points au plus, pièce après pièce, dans l'ordre de saisie.
   Une grande pièce peut être répartie sur deux circuits. */
function remplirCircuits(pieces, champ, genre, regle, prefixe) {
  const groupes = [];
  let courant = null;
  pieces.forEach((piece) => {
    let reste = piece[champ];
    while (reste > 0) {
      if (!courant || courant.points >= regle.max) {
        courant = { genre, section: regle.section, calibre: regle.calibre, points: 0, morceaux: [] };
        groupes.push(courant);
      }
      const pris = Math.min(reste, regle.max - courant.points);
      courant.points += pris;
      courant.morceaux.push({ piece: piece.nom, surface: piece.surface * (pris / piece[champ]) });
      reste -= pris;
    }
  });
  groupes.forEach((groupe, index) => {
    groupe.nom = prefixe + (groupes.length > 1 ? " " + (index + 1) : "");
  });
  return groupes;
}

/* Longueur d'un circuit : trajet horizontal estimé (4 × √surface par pièce desservie),
   descentes (hauteur par point), trajet tableau → pièces (√ surface totale), +12 % de marge. */
function longueurCircuit(morceaux, descentes, hauteur, depuisTableau) {
  const horizontal = morceaux.reduce((somme, m) => somme + 4 * Math.sqrt(m.surface), 0);
  return plafond((horizontal + hauteur * descentes + depuisTableau) * (1 + REGLES_CIRCUITS.margeCable));
}

const ORDRE_GENRES = Object.freeze({ eclairage: 0, prises: 1, cuisine: 2, dedie: 3 });

/* Différentiels 30 mA : au plus 8 circuits chacun, 2 au minimum dès 2 circuits.
   Type A pour la cuisinière et le lave-linge, type AC pour le reste.
   Les circuits sont distribués à tour de rôle pour répartir l'éclairage. */
function repartirDifferentiels(circuits, tri) {
  const regle = REGLES_CIRCUITS.differentiel;
  const typeA = circuits.filter((c) => c.typeA);
  const typeAC = circuits.filter((c) => !c.typeA);
  let nombreA = Math.ceil(typeA.length / regle.circuitsMax);
  let nombreAC = Math.ceil(typeAC.length / regle.circuitsMax);
  const minimum = Math.min(regle.minimum, circuits.length);
  while (nombreA + nombreAC < minimum) {
    if (typeAC.length > nombreAC) nombreAC += 1;
    else if (typeA.length > nombreA) nombreA += 1;
    else break;
  }
  const differentiels = [];
  const distribuer = (liste, nombre, type) => {
    const groupes = Array.from({ length: nombre }, () => []);
    [...liste].sort((a, b) => ORDRE_GENRES[a.genre] - ORDRE_GENRES[b.genre])
      .forEach((circuit, index) => groupes[index % nombre].push(circuit));
    groupes.forEach((groupe) => {
      const fort = groupe.some((c) => c.calibre >= 32) || groupe.filter((c) => c.genre === "dedie").length >= 2;
      differentiels.push({
        type,
        calibre: fort ? 63 : 40,
        sensibilite: regle.sensibilite,
        poles: tri ? 4 : 2,
        circuits: groupe.map((c) => c.nom)
      });
    });
  };
  distribuer(typeAC, nombreAC, "AC");
  distribuer(typeA, nombreA, "A");
  differentiels.forEach((d, index) => { d.nom = "Différentiel " + (index + 1); });
  return differentiels;
}

function ajouterMateriel(liste, categorie, ref, designation, unite, quantite) {
  if (quantite > 0) liste.push({ categorie, ref, designation, unite, quantite });
}

function formaterSection(section) {
  return String(section).replace(".", ",");
}

function prixDefautMainOeuvre(id, codeDevise) {
  return DEVISES_PRIX_DEFAUT.includes(codeDevise) ? MAIN_OEUVRE_POINTS[id].prix : 0;
}

/* Prix habituels de l'électricien (« Mes prix ») ; à défaut, les prix de départ. */
function prixMainOeuvreHabituel(id, codeDevise, habituels) {
  const points = habituels && typeof habituels === "object" && habituels.points && typeof habituels.points === "object" ? habituels.points : {};
  const defaut = prixDefautMainOeuvre(id, codeDevise);
  return Object.prototype.hasOwnProperty.call(points, id) && saisieManuelle(points[id])
    ? montantBorne(points[id], decimalesDevise(codeDevise), defaut) : defaut;
}

function tarifJourneeHabituel(codeDevise, habituels) {
  const defaut = DEVISES_PRIX_DEFAUT.includes(codeDevise) ? TARIF_JOURNEE_DEFAUT : 0;
  return habituels && typeof habituels === "object" && saisieManuelle(habituels.journee)
    ? montantBorne(habituels.journee, decimalesDevise(codeDevise), defaut) : defaut;
}

/* « − 10 % » / « + 10 % » : toute la main-d'œuvre calculée est multipliée par le facteur
   (prix au point, tarif journée, forfait, lignes libres), arrondie à la devise. Les quantités
   corrigées à la main sont conservées. Fonction pure : renvoie une nouvelle saisie. */
function ajusterMainOeuvre(saisie, calcul, facteur, codeDevise) {
  const dec = decimalesDevise(codeDevise);
  const f = (valeur) => montantBorne(arrondi(valeur * facteur, dec), dec, 0);
  const anciens = saisie && typeof saisie === "object" && saisie.points && typeof saisie.points === "object" ? saisie.points : {};
  const points = {};
  calcul.lignes.forEach((ligne) => {
    const ancien = Object.prototype.hasOwnProperty.call(anciens, ligne.id) && anciens[ligne.id] && typeof anciens[ligne.id] === "object" ? anciens[ligne.id] : {};
    points[ligne.id] = { quantite: saisieManuelle(ancien.quantite) ? ligne.quantite : null, prix: f(ligne.prix) };
  });
  const resultat = {
    points,
    forfait: f(calcul.forfait),
    journees: { ouvriers: calcul.journees.ouvriers, jours: calcul.journees.jours, tarif: f(calcul.journees.tarif) },
    libres: calcul.libres.map((ligne) => ({ libelle: ligne.libelle, montant: f(ligne.montant) }))
  };
  if (saisie && typeof saisie === "object" && saisie.auto && typeof saisie.auto === "object") resultat.auto = { ...saisie.auto };
  return resultat;
}

/* Main-d'œuvre : 4 modes cumulables (au point, forfait, journées, lignes libres). */
function calculerMainOeuvre(saisie, quantitesAuto, codeDevise, habituels) {
  const mo = saisie && typeof saisie === "object" ? saisie : {};
  const points = mo.points && typeof mo.points === "object" ? mo.points : {};
  const dec = decimalesDevise(codeDevise);
  const lignes = Object.keys(MAIN_OEUVRE_POINTS).map((id) => {
    const reglage = points[id] && typeof points[id] === "object" ? points[id] : {};
    /* Quantité calculée elle aussi plafonnée à la règle « quantité » : le devis reprend le même nombre. */
    const auto = Math.min(quantitesAuto[id] || 0, BORNES_CHANTIER.quantiteMax);
    const quantite = saisieManuelle(reglage.quantite) ? entierBorne(reglage.quantite, 0, BORNES_CHANTIER.quantiteMax, auto) : auto;
    const prix = saisieManuelle(reglage.prix) ? montantBorne(reglage.prix, dec, 0) : prixMainOeuvreHabituel(id, codeDevise, habituels);
    return { id, libelle: MAIN_OEUVRE_POINTS[id].libelle, auto, quantite, prix, montant: arrondi(quantite * prix, dec) };
  });
  const journees = mo.journees && typeof mo.journees === "object" ? mo.journees : {};
  const ouvriers = entierBorne(journees.ouvriers, 0, BORNES_CHANTIER.ouvriersMax, 0);
  const jours = arrondi(borner(journees.jours, 0, BORNES_CHANTIER.joursMax, 0), 1);
  const tarif = saisieManuelle(journees.tarif) ? montantBorne(journees.tarif, dec, 0) : tarifJourneeHabituel(codeDevise, habituels);
  const libres = (Array.isArray(mo.libres) ? mo.libres : []).slice(0, BORNES_CHANTIER.lignesLibresMax)
    .filter((l) => l && typeof l === "object")
    .map((l) => ({ libelle: texteBorne(l.libelle, 120), montant: montantBorne(l.montant, dec, 0) }));
  const totalPoints = arrondi(lignes.reduce((s, l) => s + l.montant, 0), dec);
  const forfait = montantBorne(mo.forfait, dec, 0);
  const totalJournees = arrondi(ouvriers * jours * tarif, dec);
  const totalLibres = arrondi(libres.reduce((s, l) => s + l.montant, 0), dec);
  return {
    lignes, totalPoints, forfait,
    journees: { ouvriers, jours, tarif, total: totalJournees },
    libres, totalLibres,
    total: arrondi(totalPoints + forfait + totalJournees + totalLibres, dec)
  };
}

/* Disposition du tableau : chaque différentiel est suivi de ses disjoncteurs, et un groupe
   n'est jamais coupé entre deux rangées (au plus 4 + 8 = 12 modules, une rangée en a 13).
   Un groupe suit le précédent s'il tient dans la même rangée ; sinon il comble la place
   libre d'une rangée précédente avant d'en ouvrir une nouvelle : pas de rangée gaspillée. */
function disposerTableau(circuits, differentiels, parafoudre, tri) {
  const largeurDouble = tri ? 4 : 2;
  const groupes = [];
  if (parafoudre) groupes.push([{ type: "parafoudre", largeur: largeurDouble }]);
  differentiels.forEach((d, index) => {
    const groupe = [{ type: "differentiel", largeur: largeurDouble, numero: index + 1, calibre: d.calibre, typeDifferentiel: d.type }];
    d.circuits.forEach((nom) => {
      const circuit = circuits.find((c) => c.nom === nom);
      if (circuit) groupe.push({ type: "disjoncteur", largeur: 1, numero: circuit.numero, calibre: circuit.calibre, genre: circuit.genre, differentiel: index + 1 });
    });
    groupes.push(groupe);
  });
  const N = REGLES_CIRCUITS.modulesParRangee;
  const rangees = [];
  groupes.forEach((groupe) => {
    const largeur = groupe.reduce((s, m) => s + m.largeur, 0);
    const derniere = rangees[rangees.length - 1];
    let courante = derniere && derniere.occupe + largeur <= N ? derniere : rangees.find((r) => r.occupe + largeur <= N);
    if (!courante) {
      courante = { modules: [], occupe: 0 };
      rangees.push(courante);
    }
    groupe.forEach((module) => {
      courante.modules.push({ ...module, position: courante.occupe });
      courante.occupe += module.largeur;
    });
  });
  return rangees;
}

/* Complète chaque rangée par des emplacements libres (réserve) et ajoute les rangées vides. */
function completerTableau(disposition, nombreRangees) {
  const N = REGLES_CIRCUITS.modulesParRangee;
  return Array.from({ length: nombreRangees }, (_, index) => {
    const rangee = disposition[index] || { modules: [], occupe: 0 };
    const modules = [...rangee.modules];
    for (let position = rangee.occupe; position < N; position += 1) modules.push({ type: "libre", largeur: 1, position });
    return { numero: index + 1, occupe: rangee.occupe, modules };
  });
}

/* Liste de conformité : chaque point est « conforme » ou « à vérifier », expliqué simplement. */
function verifierConformite(etude) {
  const liste = [];
  const ajouter = (conforme, titre, explication) => liste.push({ etat: conforme ? "conforme" : "verifier", titre, explication });
  const R = REGLES_CIRCUITS;
  const minimum = { sejour: true, chambre: true, cuisine: true };
  const manquePrises = etude.pieces.filter((p) => minimum[p.type] && p.prises < p.proposition.prises);
  ajouter(!manquePrises.length, "Nombre de prises par pièce", manquePrises.length
    ? "Pas assez de prises : " + manquePrises.map((p) => p.nom + " " + p.prises + " au lieu de " + p.proposition.prises).join(", ") + ". Ajoutez-en pour éviter les multiprises."
    : "Chaque pièce a assez de prises : séjour 1 pour 4 m² (5 au minimum), chambre 3, cuisine 6 dont 4 au-dessus du plan de travail.");
  const sansLumiere = etude.pieces.filter((p) => p.points < 1);
  ajouter(!sansLumiere.length, "Éclairage dans chaque pièce", sansLumiere.length
    ? "Pièce sans point lumineux : " + sansLumiere.map((p) => p.nom).join(", ") + ". Chaque pièce doit avoir au moins une lampe commandée par un interrupteur."
    : "Chaque pièce a au moins un point lumineux commandé par un interrupteur.");
  const eclairages = etude.circuits.filter((c) => c.genre === "eclairage");
  ajouter(eclairages.every((c) => c.points <= R.eclairage.max), "Circuits d'éclairage",
    eclairages.length + (eclairages.length > 1 ? " circuits" : " circuit") + " : 8 lampes au plus par circuit, fil de 1,5 mm², disjoncteur de 10 A.");
  const prises = etude.circuits.filter((c) => c.genre === "prises");
  const cuisine = etude.circuits.filter((c) => c.genre === "cuisine");
  ajouter(prises.every((c) => c.points <= R.prises.max) && cuisine.every((c) => c.points <= R.prisesCuisine.max), "Circuits de prises",
    "8 prises au plus par circuit en 1,5 mm² avec un disjoncteur de 16 A" + (cuisine.length ? " ; cuisine sur son propre circuit en 2,5 mm² et 20 A, 6 prises au plus." : "."));
  const dedies = etude.circuits.filter((c) => c.genre === "dedie");
  if (dedies.length) ajouter(true, "Gros appareils", "Chaque gros appareil (" + dedies.map((c) => c.nom).join(", ") + ") a sa propre ligne et son propre disjoncteur.");
  const coherence = { 1.5: [10, 16], 2.5: [20], 6: [32] };
  ajouter(etude.circuits.every((c) => (coherence[c.section] || []).includes(c.calibre)), "Fils et disjoncteurs assortis",
    "Chaque disjoncteur est adapté à la grosseur du fil qu'il protège : le fil ne peut pas chauffer.");
  const protegees = new Set(etude.differentiels.flatMap((d) => d.circuits));
  const assez = etude.circuits.length < 2 || etude.differentiels.length >= R.differentiel.minimum;
  ajouter(protegees.size === etude.circuits.length && assez && etude.differentiels.every((d) => d.circuits.length <= R.differentiel.circuitsMax),
    "Protection des personnes (30 mA)", "Tous les circuits passent par un différentiel 30 mA qui coupe le courant en cas de fuite : "
      + etude.differentiels.length + (etude.differentiels.length > 1 ? " différentiels" : " différentiel") + ", 8 circuits au plus chacun.");
  const typeA = etude.circuits.filter((c) => c.typeA);
  if (typeA.length) {
    const bienProteges = typeA.every((c) => etude.differentiels.some((d) => d.type === "A" && d.circuits.includes(c.nom)));
    ajouter(bienProteges, "Différentiel de type A", "La plaque de cuisson et le lave-linge sont sur un différentiel de type A, le seul qui détecte leurs fuites particulières.");
  }
  ajouter(true, "Fil de terre partout", "Tous les câbles sont des 3G (phase, neutre et terre) : chaque prise et chaque lampe est reliée à la terre.");
  ajouter(etude.options.terreNeuve, "Prise de terre", etude.options.terreNeuve
    ? "Une prise de terre neuve est prévue. Mesurez sa résistance après la pose : elle doit être inférieure à 100 ohms."
    : "La terre existante n'est pas refaite : mesurez sa résistance sur place (moins de 100 ohms), sinon prévoyez une terre neuve.");
  if (etude.pieces.some((p) => p.type === "salle-eau")) {
    ajouter(false, "Salle d'eau", "À vérifier sur place : aucune prise ni interrupteur à moins de 60 cm de la douche, prise étanche, et toutes les parties métalliques reliées à la terre.");
  }
  ajouter(etude.options.parafoudre, "Parafoudre", etude.options.parafoudre
    ? "Un parafoudre protège les appareils contre les surtensions dues à la foudre."
    : "Pas de parafoudre : il est fortement conseillé dans les zones à orages pour protéger les appareils.");
  ajouter(etude.coffret.capacite >= etude.coffret.modules * (1 + R.reserveModules) - 1e-9, "Place libre dans le tableau",
    etude.coffret.capacite - etude.coffret.modules + " emplacements libres sur " + etude.coffret.capacite + " : au moins 20 % de réserve pour ajouter des circuits plus tard.");
  ajouter(etude.options.distance > 0, "Câble d'alimentation", etude.options.distance > 0
    ? etude.cableAlimentation + " m de câble entre le compteur et le tableau sont comptés."
    : "Distance compteur – tableau non indiquée : le câble d'alimentation n'est pas compté. Mesurez-la et corrigez le chantier.");
  return liste;
}

/* Remise (% ou montant), TVA activable, acompte : tout est borné et arrondi à la devise. */
function calculerTotal(totalMateriel, totalMainOeuvre, reglages, decimales) {
  const r = reglages && typeof reglages === "object" ? reglages : {};
  const sousTotal = arrondi(totalMateriel + totalMainOeuvre, decimales);
  const typeRemise = r.remiseType === "montant" ? "montant" : "pourcent";
  const valeurRemise = typeRemise === "pourcent" ? arrondi(borner(r.remise, 0, 100, 0), 2) : montantBorne(r.remise, decimales, 0);
  const remise = typeRemise === "pourcent" ? arrondi(sousTotal * valeurRemise / 100, decimales) : Math.min(valeurRemise, sousTotal);
  const base = arrondi(sousTotal - remise, decimales);
  const tvaActive = r.tva === true;
  const tauxTva = arrondi(borner(r.tauxTva, 0, TVA_MAX, TVA_DEFAUT), 2);
  const tva = tvaActive ? arrondi(base * tauxTva / 100, decimales) : 0;
  const totalGeneral = arrondi(base + tva, decimales);
  const tauxAcompte = arrondi(borner(r.acompte, 0, 100, ACOMPTE_DEFAUT), 2);
  const acompte = arrondi(totalGeneral * tauxAcompte / 100, decimales);
  return {
    materiel: totalMateriel, mainOeuvre: totalMainOeuvre, sousTotal, typeRemise, valeurRemise, remise, base,
    tvaActive, tauxTva, tva, totalGeneral, tauxAcompte, acompte, reste: arrondi(totalGeneral - acompte, decimales)
  };
}

/* Chiffrage complet : étude + prix du catalogue (ou prix modifiés sur la ligne) + totaux.
   catalogue = { ref: { prix, designation?, unite?, fournisseur? } } (lireCatalogue().articles),
   habituels = prix de main-d'œuvre habituels (lireCatalogue().mainOeuvre). */
function chiffrerChantier(chantier, catalogue, codeDevise, habituels) {
  const c = chantier && typeof chantier === "object" ? chantier : {};
  const etude = etudierChantier(c, codeDevise, habituels);
  const dec = decimalesDevise(codeDevise);
  const cat = catalogue && typeof catalogue === "object" ? catalogue : {};
  const reglages = c.materiel && typeof c.materiel === "object" ? c.materiel : {};
  const materiel = etude.materiel.map((ligne) => {
    const reglage = Object.prototype.hasOwnProperty.call(reglages, ligne.ref) && reglages[ligne.ref] && typeof reglages[ligne.ref] === "object" ? reglages[ligne.ref] : {};
    const article = Object.prototype.hasOwnProperty.call(cat, ligne.ref) && cat[ligne.ref] && typeof cat[ligne.ref] === "object" ? cat[ligne.ref] : null;
    const prixCatalogue = article ? montantBorne(article.prix, dec, 0) : 0;
    const designation = article ? texteBorne(article.designation, BORNES_CATALOGUE.designationMax) || ligne.designation : ligne.designation;
    const fournisseur = article ? texteBorne(article.fournisseur, BORNES_CATALOGUE.fournisseurMax) : "";
    const auto = Math.min(ligne.quantite, BORNES_CHANTIER.quantiteMax);
    const quantite = saisieManuelle(reglage.quantite) ? entierBorne(reglage.quantite, 0, BORNES_CHANTIER.quantiteMax, auto) : auto;
    const prix = saisieManuelle(reglage.prix) ? montantBorne(reglage.prix, dec, prixCatalogue) : prixCatalogue;
    return { ...ligne, designation, fournisseur, auto, quantite, prixCatalogue, prix, montant: arrondi(quantite * prix, dec), aCompleter: prix === 0 };
  });
  const totalMateriel = arrondi(materiel.reduce((s, l) => s + l.montant, 0), dec);
  return {
    etude,
    materiel,
    totalMateriel,
    conformite: verifierConformite(etude),
    total: calculerTotal(totalMateriel, etude.mainOeuvre.total, c.totaux, dec)
  };
}

/* Devis tiré d'un chiffrage : les prix sont FIGÉS dans le devis (deux devis ne s'influencent
   jamais), la main-d'œuvre est entièrement explicite. Fonction pure : le total du devis obtenu
   est exactement celui du chiffrage. */
function devisDepuisChiffrage(chiffrage) {
  const mo = chiffrage.etude.mainOeuvre;
  const t = chiffrage.total;
  return {
    lignes: chiffrage.materiel.map((ligne, index) => ({
      id: "l" + (index + 1), ref: ligne.ref, designation: ligne.designation, unite: ligne.unite, categorie: ligne.categorie,
      quantite: ligne.quantite, prix: ligne.prix, fournisseur: ligne.fournisseur || "", supprimee: false
    })),
    mainOeuvre: {
      points: Object.fromEntries(mo.lignes.map((ligne) => [ligne.id, { quantite: ligne.quantite, prix: ligne.prix }])),
      auto: Object.fromEntries(mo.lignes.map((ligne) => [ligne.id, ligne.auto])),
      forfait: mo.forfait,
      journees: { ouvriers: mo.journees.ouvriers, jours: mo.journees.jours, tarif: mo.journees.tarif },
      libres: mo.libres.map((ligne) => ({ libelle: ligne.libelle, montant: ligne.montant }))
    },
    totaux: { remiseType: t.typeRemise, remise: t.valeurRemise, tva: t.tvaActive, tauxTva: t.tauxTva, acompte: t.tauxAcompte }
  };
}

/* Calcul d'un devis : lignes de matériel (les supprimées sont exclues du total),
   main-d'œuvre 4 modes, remise, TVA, acompte. Tout est borné et arrondi à la devise. */
function calculerDevis(devis, codeDevise) {
  const d = devis && typeof devis === "object" ? devis : {};
  const dec = decimalesDevise(codeDevise);
  const lignes = (Array.isArray(d.lignes) ? d.lignes : []).slice(0, BORNES_DEVIS.lignesMax)
    .filter((ligne) => ligne && typeof ligne === "object")
    .map((ligne) => {
      const quantite = entierBorne(ligne.quantite, 0, BORNES_DEVIS.quantiteMax, 0);
      const prix = montantBorne(ligne.prix, dec, 0);
      return { ...ligne, supprimee: ligne.supprimee === true, quantite, prix, montant: arrondi(quantite * prix, dec), aCompleter: prix === 0 };
    });
  const totalMateriel = arrondi(lignes.filter((ligne) => !ligne.supprimee).reduce((s, ligne) => s + ligne.montant, 0), dec);
  const mo = d.mainOeuvre && typeof d.mainOeuvre === "object" ? d.mainOeuvre : {};
  const auto = mo.auto && typeof mo.auto === "object" ? mo.auto : {};
  const quantitesAuto = Object.fromEntries(Object.keys(MAIN_OEUVRE_POINTS)
    .map((id) => [id, Object.prototype.hasOwnProperty.call(auto, id) ? entierBorne(auto[id], 0, BORNES_CHANTIER.quantiteMax, 0) : 0]));
  const mainOeuvre = calculerMainOeuvre(mo, quantitesAuto, codeDevise, null);
  return { lignes, totalMateriel, mainOeuvre, total: calculerTotal(totalMateriel, mainOeuvre.total, d.totaux, dec) };
}

/* Étude complète d'un chantier : circuits, protections, coffret, câbles, matériel, main-d'œuvre. */
function etudierChantier(chantier, codeDevise, habituels) {
  const c = chantier && typeof chantier === "object" ? chantier : {};
  const tri = c.alimentation === "tri";
  const pieces = normaliserPieces(c.pieces);
  const appareils = normaliserAppareils(c.appareils);
  const options = normaliserOptions(c.options);
  const surfaceTotale = arrondi(pieces.reduce((s, p) => s + p.surface, 0), 2);
  const depuisTableau = Math.sqrt(surfaceTotale);

  const eclairage = remplirCircuits(pieces, "points", "eclairage", REGLES_CIRCUITS.eclairage, "Éclairage");
  const prises = remplirCircuits(pieces.filter((p) => !TYPES_PIECES[p.type].circuitCuisine), "prises", "prises", REGLES_CIRCUITS.prises, "Prises");
  const cuisine = remplirCircuits(pieces.filter((p) => TYPES_PIECES[p.type].circuitCuisine), "prises", "cuisine", REGLES_CIRCUITS.prisesCuisine, "Prises cuisine");
  const dedies = [];
  Object.entries(appareils).forEach(([id, quantite]) => {
    const appareil = APPAREILS[id];
    for (let i = 1; i <= quantite; i += 1) {
      dedies.push({
        genre: "dedie", section: appareil.section, calibre: appareil.calibre, points: 1, morceaux: [],
        typeA: appareil.typeA === true,
        nom: appareil.libelle + (quantite > 1 ? " " + i : "")
      });
    }
  });
  const circuits = [...eclairage, ...prises, ...cuisine, ...dedies].map((circuit, index) => ({
    numero: index + 1,
    nom: circuit.nom,
    genre: circuit.genre,
    section: circuit.section,
    calibre: circuit.calibre,
    points: circuit.points,
    typeA: circuit.typeA === true,
    pieces: [...new Set(circuit.morceaux.map((m) => m.piece))],
    longueur: longueurCircuit(circuit.morceaux, circuit.points, options.hauteur, depuisTableau)
  }));

  const differentiels = repartirDifferentiels(circuits, tri);
  const modulesDifferentiel = tri ? 4 : 2;
  const modules = circuits.length + differentiels.length * modulesDifferentiel + (options.parafoudre ? modulesDifferentiel : 0);
  const modulesReserves = plafond(modules * (1 + REGLES_CIRCUITS.reserveModules));
  const disposition = disposerTableau(circuits, differentiels, options.parafoudre, tri);
  const rangees = modules > 0 ? Math.max(1, plafond(modulesReserves / REGLES_CIRCUITS.modulesParRangee), disposition.length) : 0;
  const coffret = { modules, modulesReserves, rangees, capacite: rangees * REGLES_CIRCUITS.modulesParRangee };
  const tableau = completerTableau(disposition, rangees);

  const cables = {};
  circuits.forEach((circuit) => {
    cables[circuit.section] = (cables[circuit.section] || 0) + circuit.longueur;
  });
  const alimentation = options.distance > 0 ? plafond(options.distance * (1 + REGLES_CIRCUITS.margeCable)) : 0;

  const prisesEtanches = pieces.filter((p) => TYPES_PIECES[p.type].etanche).reduce((s, p) => s + p.prises, 0);
  const prisesTotal = pieces.reduce((s, p) => s + p.prises, 0);
  const pointsTotal = pieces.reduce((s, p) => s + p.points, 0);
  const avecPoints = pieces.filter((p) => p.points > 0);
  const interrupteurs = avecPoints.filter((p) => TYPES_PIECES[p.type].commande === "simple").length;
  const vaEtVient = avecPoints.filter((p) => TYPES_PIECES[p.type].commande === "va-et-vient").length;

  const materiel = [];
  const poles = tri ? "4p" : "2p";
  if (rangees > 0) {
    ajouterMateriel(materiel, "tableau", "coffret-" + rangees + "r", "Coffret " + rangees + (rangees > 1 ? " rangées" : " rangée") + " de " + REGLES_CIRCUITS.modulesParRangee + " modules", "u", 1);
    ajouterMateriel(materiel, "tableau", "peigne", "Peigne d'alimentation " + REGLES_CIRCUITS.modulesParRangee + " modules", "u", rangees);
    ajouterMateriel(materiel, "tableau", "bornier", "Bornier de terre et de neutre", "u", rangees);
  }
  const parCalibre = {};
  circuits.forEach((circuit) => { parCalibre[circuit.calibre] = (parCalibre[circuit.calibre] || 0) + 1; });
  Object.keys(parCalibre).map(Number).sort((a, b) => a - b).forEach((calibre) => {
    ajouterMateriel(materiel, "tableau", "disjoncteur-" + calibre, "Disjoncteur divisionnaire 1P+N " + calibre + " A", "u", parCalibre[calibre]);
  });
  const parDifferentiel = {};
  differentiels.forEach((d) => {
    const cle = d.calibre + "-" + d.type;
    parDifferentiel[cle] = parDifferentiel[cle] || { d, quantite: 0 };
    parDifferentiel[cle].quantite += 1;
  });
  Object.keys(parDifferentiel).sort().forEach((cle) => {
    const { d, quantite } = parDifferentiel[cle];
    ajouterMateriel(materiel, "tableau", "differentiel-" + poles + "-" + cle, "Interrupteur différentiel " + poles.toUpperCase() + " " + d.calibre + " A 30 mA type " + d.type, "u", quantite);
  });
  if (options.parafoudre && rangees > 0) {
    ajouterMateriel(materiel, "tableau", "parafoudre-" + poles, "Parafoudre " + poles.toUpperCase() + " avec protection intégrée", "u", 1);
  }
  Object.keys(cables).map(Number).sort((a, b) => a - b).forEach((section) => {
    ajouterMateriel(materiel, "cables", "cable-" + section, "Câble 3G" + formaterSection(section) + " mm²", "m", cables[section]);
  });
  const gaine20 = circuits.filter((ci) => ci.section < 6).reduce((s, ci) => s + ci.longueur, 0);
  const gaine25 = circuits.filter((ci) => ci.section >= 6).reduce((s, ci) => s + ci.longueur, 0);
  ajouterMateriel(materiel, "cables", "gaine-20", "Gaine ICTA 20", "m", gaine20);
  ajouterMateriel(materiel, "cables", "gaine-25", "Gaine ICTA 25", "m", gaine25);
  ajouterMateriel(materiel, "cables", "alimentation-" + (tri ? "5g10" : "3g10"), "Câble d'alimentation " + (tri ? "5G10" : "3G10") + " mm²", "m", alimentation);
  ajouterMateriel(materiel, "appareillage", "prise", "Prise 2P+T 16 A", "u", prisesTotal - prisesEtanches);
  ajouterMateriel(materiel, "appareillage", "prise-etanche", "Prise 2P+T 16 A étanche IP44", "u", prisesEtanches);
  ajouterMateriel(materiel, "appareillage", "interrupteur", "Interrupteur simple allumage", "u", interrupteurs);
  ajouterMateriel(materiel, "appareillage", "va-et-vient", "Interrupteur va-et-vient", "u", vaEtVient * 2);
  ajouterMateriel(materiel, "appareillage", "point", "Point lumineux (DCL et douille)", "u", pointsTotal);
  ajouterMateriel(materiel, "appareillage", "boite", "Boîte d'encastrement", "u", prisesTotal + interrupteurs + vaEtVient * 2 + pointsTotal);
  ajouterMateriel(materiel, "appareillage", "derivation", "Boîte de dérivation", "u", avecPoints.length);
  if (options.terreNeuve) {
    ajouterMateriel(materiel, "terre", "piquet", "Piquet de terre 1,5 m", "u", 1);
    ajouterMateriel(materiel, "terre", "cable-terre", "Câble de terre vert-jaune 16 mm²", "m", 5);
    ajouterMateriel(materiel, "terre", "barrette", "Barrette de mesure de terre", "u", 1);
    ajouterMateriel(materiel, "terre", "regard", "Regard de visite", "u", 1);
  }

  const quantitesAuto = {
    prise: prisesTotal,
    interrupteur: interrupteurs,
    "va-et-vient": vaEtVient,
    point: pointsTotal,
    dedie: dedies.length,
    tableau: circuits.length > 0 ? 1 : 0,
    depose: options.tableauARemplacer ? 1 : 0,
    terre: options.terreNeuve ? 1 : 0
  };

  return {
    pieces,
    appareils,
    options,
    alimentation: tri ? "tri" : "mono",
    surfaceTotale,
    totaux: { prises: prisesTotal, prisesEtanches, points: pointsTotal, interrupteurs, vaEtVient },
    circuits,
    comptes: { eclairage: eclairage.length, prises: prises.length, cuisine: cuisine.length, dedies: dedies.length },
    differentiels,
    coffret,
    tableau,
    cables,
    cableTotal: circuits.reduce((s, ci) => s + ci.longueur, 0),
    cableAlimentation: alimentation,
    materiel,
    mainOeuvre: calculerMainOeuvre(c.mainOeuvre, quantitesAuto, codeDevise, habituels)
  };
}
/* ==== FIN DU MOTEUR ==== */

/* ==== DOCUMENT DEVIS ==== */
/* Fonctions pures de l'étape 8 : montant en lettres, modèle de la feuille A4 (partagé par
   l'aperçu, l'impression et le PDF), message et lien WhatsApp, nom du fichier, PDF.
   Aucune lecture du DOM ni du stockage : testées hors de la page (verifier.mjs). */

function formaterMontant(montant, codeDevise) {
  const devise = DEVISES[codeDevise] || DEVISES.XOF;
  const nombre = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: devise.decimales,
    maximumFractionDigits: devise.decimales
  }).format(montant);
  return nombre + "\u00A0" + devise.libelle;
}

function formaterDecimal(nombre) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, useGrouping: false }).format(nombre);
}

/* Quantité affichée : séparateur de milliers insécable, virgule décimale (2,5 jours). */
function formaterQuantite(nombre) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(nombre);
}

/* Un nombre et son unité restent sur la même ligne (10 A, 30 mA, 1,5 mm², 25 m). */
function lierUnites(texte) {
  return String(texte).replace(/(\d) (?=(A|mA|mm²|m|m²|modules)(?![\wÀ-ÿ]))/g, "$1\u00A0");
}

/* ----- Montant en lettres (orthographe traditionnelle) ----- */

const UNITES_LETTRES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const DIZAINES_LETTRES = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function moinsDeCent(n, final) {
  if (n <= 16) return UNITES_LETTRES[n];
  if (n < 20) return "dix-" + UNITES_LETTRES[n - 10];
  const dizaine = Math.floor(n / 10);
  const unite = n % 10;
  if (dizaine === 7 || dizaine === 9) {
    const base = dizaine === 7 ? "soixante" : "quatre-vingt";
    const reste = moinsDeCent(10 + unite, false);
    return base + (dizaine === 7 && unite === 1 ? " et " : "-") + reste;
  }
  if (dizaine === 8) return unite === 0 ? (final ? "quatre-vingts" : "quatre-vingt") : "quatre-vingt-" + UNITES_LETTRES[unite];
  const base = DIZAINES_LETTRES[dizaine];
  if (unite === 0) return base;
  return base + (unite === 1 ? " et un" : "-" + UNITES_LETTRES[unite]);
}

/* 1 à 999. final : rien ne suit, ou « million(s) / milliard(s) » (noms) → « deux cents »,
   « quatre-vingts » ; devant « mille » (adjectif) ou un autre nombre → « deux cent », « quatre-vingt ». */
function moinsDeMille(n, final) {
  const centaines = Math.floor(n / 100);
  const reste = n % 100;
  const morceaux = [];
  if (centaines === 1) morceaux.push("cent");
  else if (centaines > 1) morceaux.push(UNITES_LETTRES[centaines] + (reste === 0 && final ? " cents" : " cent"));
  if (reste > 0) morceaux.push(moinsDeCent(reste, final));
  return morceaux.join(" ");
}

function nombreEnLettres(valeur) {
  const n = Math.floor(Math.max(0, Number(valeur) || 0));
  if (n === 0) return "zéro";
  const morceaux = [];
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const reste = n % 1e3;
  if (milliards > 0) morceaux.push((milliards < 1000 ? moinsDeMille(milliards, true) : nombreEnLettres(milliards)) + (milliards > 1 ? " milliards" : " milliard"));
  if (millions > 0) morceaux.push(moinsDeMille(millions, true) + (millions > 1 ? " millions" : " million"));
  if (milliers > 0) morceaux.push(milliers === 1 ? "mille" : moinsDeMille(milliers, false) + " mille");
  if (reste > 0) morceaux.push(moinsDeMille(reste, true));
  return morceaux.join(" ");
}

/* « un million deux cent mille francs CFA », « un million de francs CFA »,
   « mille deux cent cinquante euros et cinquante centimes ». */
function montantEnLettres(montant, codeDevise) {
  const devise = DEVISES[codeDevise] || DEVISES.XOF;
  const [un, plusieurs, sousUn, sousPlusieurs] = devise.lettres;
  const facteur = Math.pow(10, devise.decimales);
  const total = Math.round(Math.max(0, Number(montant) || 0) * facteur);
  const entier = Math.floor(total / facteur);
  const fraction = total - entier * facteur;
  const de = entier >= 1e6 && entier % 1e6 === 0 ? " de " : " ";
  let texte = nombreEnLettres(entier) + de + (entier >= 2 ? plusieurs : un);
  if (fraction > 0) texte += " et " + nombreEnLettres(fraction) + " " + (fraction >= 2 ? sousPlusieurs : sousUn);
  return texte;
}

/* ----- Modèle de la feuille A4 ----- */

function libelleTotal(base, valeur) {
  return base + " (" + formaterDecimal(valeur) + "\u00A0%)";
}

/* Le seul endroit qui décide du pied de page et du logo : formule payante → pas de pied,
   logo de l'électricien ; gratuite → pied en filigrane, initiales. */
function formulePayante(formule) {
  return Object.prototype.hasOwnProperty.call(FORMULES, formule) && FORMULES[formule].illimite === true;
}

/* emetteur = { nom, entreprise, telephone (affiché), ville, pays (nom) } ; clientTelephone affiché. */
function modeleFeuille(devis, codeDevise, formule, emetteur, clientTelephone) {
  const d = devis && typeof devis === "object" ? devis : {};
  const e = emetteur && typeof emetteur === "object" ? emetteur : {};
  const calcul = calculerDevis(d, codeDevise);
  const montant = (valeur) => formaterMontant(valeur, codeDevise);
  const payante = formulePayante(formule);
  const materiel = calcul.lignes.filter((l) => !l.supprimee && l.quantite > 0).map((l) => ({
    designation: texteBorne(l.designation, BORNES_CATALOGUE.designationMax) || "Article",
    unite: Object.prototype.hasOwnProperty.call(UNITES, l.unite) ? UNITES[l.unite] : UNITES.u,
    quantite: formaterQuantite(l.quantite), prix: montant(l.prix), montant: montant(l.montant), aCompleter: l.prix === 0
  }));
  const mo = calcul.mainOeuvre;
  const mainOeuvre = mo.lignes.filter((l) => l.quantite > 0 && l.montant > 0).map((l) => ({
    designation: /^(Pose|Dépose)/.test(l.libelle) ? l.libelle : "Pose : " + l.libelle.charAt(0).toLocaleLowerCase("fr-FR") + l.libelle.slice(1), unite: UNITES.u,
    quantite: formaterQuantite(l.quantite), prix: montant(l.prix), montant: montant(l.montant)
  }));
  if (mo.forfait > 0) mainOeuvre.push({ designation: "Forfait main-d'œuvre", unite: UNITES.forfait, quantite: "1", prix: montant(mo.forfait), montant: montant(mo.forfait) });
  if (mo.journees.total > 0) {
    const j = mo.journees;
    mainOeuvre.push({
      designation: "Travail à la journée : " + j.ouvriers + (j.ouvriers > 1 ? " ouvriers" : " ouvrier") + " × " + formaterQuantite(j.jours) + (j.jours > 1 ? " jours" : " jour"),
      unite: "jour", quantite: formaterQuantite(arrondi(j.ouvriers * j.jours, 2)), prix: montant(j.tarif), montant: montant(j.total)
    });
  }
  mo.libres.filter((l) => l.montant > 0).forEach((l) => {
    mainOeuvre.push({ designation: l.libelle || "Prestation", unite: UNITES.forfait, quantite: "1", prix: montant(l.montant), montant: montant(l.montant) });
  });
  const t = calcul.total;
  const totaux = [
    { libelle: "Total matériel", valeur: montant(t.materiel) },
    { libelle: "Total main-d'œuvre", valeur: montant(t.mainOeuvre) }
  ];
  if (t.remise > 0 || t.tvaActive) totaux.push({ libelle: "Sous-total", valeur: montant(t.sousTotal) });
  if (t.remise > 0) totaux.push({ libelle: t.typeRemise === "pourcent" ? libelleTotal("Remise", t.valeurRemise) : "Remise", valeur: "−\u00A0" + montant(t.remise) });
  if (t.tvaActive) totaux.push({ libelle: libelleTotal("TVA", t.tauxTva), valeur: montant(t.tva) });
  const titre = texteBorne(e.entreprise, BORNES.texteMax) || texteBorne(e.nom, BORNES.texteMax) || "Électricien";
  const lignesEmetteur = [
    texteBorne(e.entreprise, BORNES.texteMax) ? texteBorne(e.nom, BORNES.texteMax) : "",
    texteBorne(e.telephone, 30) ? "Tél. : " + texteBorne(e.telephone, 30) : "",
    [texteBorne(e.ville, BORNES.texteMax), texteBorne(e.pays, BORNES.texteMax)].filter(Boolean).join(", ")
  ].filter(Boolean);
  const date = Date.parse(d.creeLe);
  return {
    numero: typeof d.numero === "string" ? d.numero : "",
    date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(Number.isFinite(date) ? new Date(date) : new Date(0)),
    objet: texteBorne(d.titre, BORNES_DEVIS.titreMax) || "Installation électrique",
    emetteur: { titre, lignes: lignesEmetteur, initiales: initialesDe(texteBorne(e.nom, BORNES.texteMax) || titre), logo: payante },
    client: { nom: texteBorne(d.client, BORNES.texteMax), telephone: texteBorne(clientTelephone, 30), lieu: texteBorne(d.lieu, BORNES.texteMax) },
    materiel, sousTotalMateriel: montant(calcul.totalMateriel),
    mainOeuvre, sousTotalMainOeuvre: montant(mo.total),
    totaux,
    totalGeneral: montant(t.totalGeneral),
    acompte: { libelle: libelleTotal("Acompte à la commande", t.tauxAcompte), valeur: montant(t.acompte) },
    reste: { libelle: "Reste à payer", valeur: montant(t.reste) },
    lettres: "Arrêté le présent devis à la somme de " + montantEnLettres(t.totalGeneral, codeDevise) + ".",
    note: nettoyerTexteDocument(d.note, BORNES_DEVIS.noteMax),
    conditions: nettoyerTexteDocument(d.conditions, BORNES.conditionsMax),
    signatures: SIGNATURES_DEVIS,
    mention: MENTION_ETUDE,
    pied: payante ? null : PIED_DEVIS,
    aCompleter: materiel.filter((l) => l.aCompleter).length,
    resume: resumeDevis(calcul),
    brut: { totalGeneral: t.totalGeneral, acompte: t.acompte, tauxAcompte: t.tauxAcompte }
  };
}

function initialesDe(nom) {
  const lettres = String(nom || "").split(" ").filter(Boolean)
    .map((mot) => (mot.match(/\p{L}|\p{N}/u) || [""])[0]).filter(Boolean);
  return (lettres.slice(0, 2).join("") || "?").toLocaleUpperCase("fr-FR");
}

function nettoyerTexteDocument(valeur, max) {
  return String(typeof valeur === "string" ? valeur : "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

/* Résumé tiré des lignes du devis (donc juste même après modification) :
   un disjoncteur divisionnaire par circuit, les prises (étanches comprises), les points lumineux. */
function resumeDevis(calcul) {
  const lignes = calcul.lignes.filter((l) => !l.supprimee);
  const somme = (test) => lignes.filter((l) => typeof l.ref === "string" && test(l.ref)).reduce((s, l) => s + l.quantite, 0);
  return {
    circuits: somme((ref) => ref.startsWith("disjoncteur-")),
    prises: somme((ref) => ref === "prise" || ref === "prise-etanche"),
    points: somme((ref) => ref === "point")
  };
}

/* ----- WhatsApp ----- */

function accorderNombre(nombre, singulier, plurielTexte) {
  return formaterQuantite(nombre) + " " + (nombre > 1 ? plurielTexte : singulier);
}

/* Texte brut : espaces insécables remplacées par des espaces simples (lisibles partout). */
function messageWhatsApp(modele) {
  const r = modele.resume;
  const resume = [
    r.circuits ? accorderNombre(r.circuits, "circuit", "circuits") : "",
    r.prises ? accorderNombre(r.prises, "prise", "prises") : "",
    r.points ? accorderNombre(r.points, "point lumineux", "points lumineux") : ""
  ].filter(Boolean);
  const e = modele.emetteur;
  const signature = [e.titre, ...e.lignes.filter((l) => l.startsWith("Tél. : ")).map((l) => l.slice(7))].join(" — ");
  return [
    modele.client.nom ? "Bonjour " + modele.client.nom + "," : "Bonjour,",
    "Voici votre devis " + modele.numero + " : " + modele.objet + ".",
    resume.length ? "Résumé : " + resume.join(", ") + "." : "",
    "Total : " + modele.totalGeneral,
    modele.acompte.libelle + " : " + modele.acompte.valeur,
    signature,
    SIGNATURE_WHATSAPP
  ].filter(Boolean).join("\n").replace(/[\u00A0\u202F\u2007\u2009]/g, " ");
}

/* Numéro nettoyé (chiffres uniquement) ; sans numéro valable, WhatsApp laisse choisir le contact.
   Le texte passe TOUJOURS par encodeURIComponent. */
function lienWhatsApp(telephone, message) {
  const numero = String(telephone || "").replace(/[^0-9]/g, "");
  const valable = numero.length >= 8 && numero.length <= 15;
  return "https://wa.me/" + (valable ? numero : "") + "?text=" + encodeURIComponent(String(message || ""));
}

/* Devis_BP-2026-0042_Mme_Sawadogo_Aminata.pdf : lettres sans accents, chiffres, tirets. */
function nomFichierDevis(numero, client) {
  const propre = (texte) => String(texte || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "");
  return "Devis_" + (propre(numero) || "BP") + "_" + (propre(client).slice(0, 40).replace(/[_-]+$/, "") || "Client") + ".pdf";
}

/* ----- PDF (polices standard Helvetica, encodage WinAnsi) ----- */

function codeWinAnsi(caractere) {
  const point = caractere.codePointAt(0);
  if ((point >= 32 && point <= 126) || (point >= 160 && point <= 255)) return point;
  if (Object.prototype.hasOwnProperty.call(WINANSI_SPECIAUX, point)) return WINANSI_SPECIAUX[point];
  const simple = caractere.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const code = simple.length === 1 ? simple.codePointAt(0) : 0;
  return code >= 32 && code <= 126 ? code : 63;
}

function codesPdf(texte) {
  return Array.from(String(texte), codeWinAnsi);
}

function largeurPdf(texte, gras, taille) {
  const table = gras ? POLICES_PDF.grasse : POLICES_PDF.normale;
  return codesPdf(texte).reduce((s, code) => s + (table[code - 32] || 556), 0) * taille / 1000;
}

/* Chaîne littérale PDF entièrement ASCII : ( ) \ échappés, le reste en octal. */
function chainePdf(texte) {
  return "(" + codesPdf(texte).map((code) => {
    if (code === 40 || code === 41 || code === 92) return "\\" + String.fromCharCode(code);
    if (code < 32 || code > 126) return "\\" + code.toString(8).padStart(3, "0");
    return String.fromCharCode(code);
  }).join("") + ")";
}

/* Retour à la ligne aux espaces seulement : un montant, un mot composé ou « 16 A » n'est
   jamais coupé. Un mot plus large que la colonne entière est le seul cas coupé. */
function couperPdf(texte, largeurMax, gras, taille) {
  const lignes = [];
  lierUnites(String(texte || "")).split("\n").forEach((paragraphe) => {
    let courante = "";
    paragraphe.split(" ").filter(Boolean).forEach((mot) => {
      const essai = courante ? courante + " " + mot : mot;
      if (largeurPdf(essai, gras, taille) <= largeurMax) {
        courante = essai;
        return;
      }
      if (courante) lignes.push(courante);
      let reste = mot;
      while (reste.length > 1 && largeurPdf(reste, gras, taille) > largeurMax) {
        let n = reste.length - 1;
        while (n > 1 && largeurPdf(reste.slice(0, n), gras, taille) > largeurMax) n -= 1;
        lignes.push(reste.slice(0, n));
        reste = reste.slice(n);
      }
      courante = reste;
    });
    lignes.push(courante);
  });
  return lignes;
}

/* Taille de police réduite (jusqu'à 5 pt) pour qu'un montant tienne entier dans sa colonne. */
function taillePourLargeur(texte, gras, taille, largeurMax) {
  let t = taille;
  while (t > 5 && largeurPdf(texte, gras, t) > largeurMax) t -= 0.25;
  return t;
}

function logoJpegValide(logo) {
  return Boolean(logo && typeof logo === "object" && ArrayBuffer.isView(logo.octets) && logo.octets.length > 4
    && logo.octets[0] === 0xFF && logo.octets[1] === 0xD8
    && Number.isInteger(logo.largeur) && Number.isInteger(logo.hauteur)
    && logo.largeur > 0 && logo.hauteur > 0 && logo.largeur <= 4000 && logo.hauteur <= 4000);
}

/* PDF A4 du devis (octets). logo : { octets JPEG, largeur, hauteur } ou null.
   Même contenu que la feuille imprimée ; en-tête de tableau répété à chaque page. */
function creerPdfDevis(modele, logo, photo) {
  /* Deux passes : si le devis dépasse une page, une mise en page plus serrée (lignes et
     espacements réduits, mêmes tailles de texte) est essayée ; la plus courte est gardée.
     Ainsi un devis ne déborde jamais sur une page de plus pour quelques points.
     photo : { octets JPEG, largeur, hauteur, composantes } ou null — page d'annexe en plus. */
  const normale = mettreEnPagePdf(modele, logo, false, photo);
  if (normale.pages.length === (normale.avecPhoto ? 2 : 1)) return assemblerPdf(modele, logo, normale, photo);
  const serree = mettreEnPagePdf(modele, logo, true, photo);
  return assemblerPdf(modele, logo, serree.pages.length < normale.pages.length ? serree : normale, photo);
}

/* Dimensions et nombre de composantes d'un JPEG, lus dans son marqueur SOF (sans le décoder). */
function dimensionsJpeg(octets) {
  if (!octets || octets.length < 4 || octets[0] !== 0xFF || octets[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < octets.length) {
    if (octets[i] !== 0xFF) return null;
    const marqueur = octets[i + 1];
    if (marqueur === 0xFF) {
      i += 1;
      continue;
    }
    if (marqueur === 0x01 || (marqueur >= 0xD0 && marqueur <= 0xD8)) {
      i += 2;
      continue;
    }
    if (marqueur === 0xD9 || marqueur === 0xDA) return null;
    const longueur = (octets[i + 2] << 8) | octets[i + 3];
    if (longueur < 2) return null;
    if (marqueur >= 0xC0 && marqueur <= 0xCF && marqueur !== 0xC4 && marqueur !== 0xC8 && marqueur !== 0xCC) {
      const hauteur = (octets[i + 5] << 8) | octets[i + 6];
      const largeur = (octets[i + 7] << 8) | octets[i + 8];
      return largeur > 0 && hauteur > 0 ? { largeur, hauteur, composantes: octets[i + 9] } : null;
    }
    i += 2 + longueur;
  }
  return null;
}

function photoJpegValide(photo) {
  return logoJpegValide(photo) && (photo.composantes === 1 || photo.composantes === 3);
}

/* Photo du tableau enregistrée (data:image/jpeg) → objet prêt pour le PDF, ou null. */
function photoTableauPdf(donnees) {
  if (typeof donnees !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(donnees)) return null;
  let octets;
  try {
    octets = depuisBase64(donnees.slice(23));
  } catch (erreur) {
    return null;
  }
  const dimensions = dimensionsJpeg(octets);
  if (!dimensions) return null;
  const photo = { octets, largeur: dimensions.largeur, hauteur: dimensions.hauteur, composantes: dimensions.composantes };
  return photoJpegValide(photo) ? photo : null;
}

function mettreEnPagePdf(modele, logo, serre, photo) {
  const W = PDF_A4.largeur;
  const H = PDF_A4.hauteur;
  const M = PDF_A4.marge;
  const CW = W - 2 * M;
  const BAS = H - M - 16;
  const C = { violet: "#6A0DAD", doux: "#F3E9FD", texte: "#17131F", texte2: "#5F5870", ligne: "#DCD3EA", blanc: "#FFFFFF" };
  const n = (v) => String(Math.round(v * 100) / 100);
  const rgb = (hex) => [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");
  const pas = serre ? 8.4 : 9.5;
  const ligneBase = serre ? 8.2 : 9.5;
  const hauteurEntete = serre ? 15 : 17;
  const hauteurSignature = serre ? 44 : 52;
  const pages = [];
  let ops = [];
  let y = M;
  const nouvellePage = () => {
    ops = [];
    pages.push(ops);
    y = M;
  };
  const rect = (x, haut, w, h, hex) => ops.push(rgb(hex) + " rg " + n(x) + " " + n(H - haut - h) + " " + n(w) + " " + n(h) + " re f");
  const cadre = (x, haut, w, h, hex) => ops.push("0.8 w " + rgb(hex) + " RG " + n(x) + " " + n(H - haut - h) + " " + n(w) + " " + n(h) + " re S");
  const trait = (x1, y1, x2, epaisseur, hex) => ops.push(n(epaisseur) + " w " + rgb(hex) + " RG " + n(x1) + " " + n(H - y1) + " m " + n(x2) + " " + n(H - y1) + " l S");
  const ecrire = (texte, x, base, taille, gras, hex, alignement, boite) => {
    const largeur = largeurPdf(texte, gras, taille);
    const xx = alignement === "droite" ? x + boite - largeur : alignement === "centre" ? x + (boite - largeur) / 2 : x;
    ops.push("BT /" + (gras ? "F2" : "F1") + " " + n(taille) + " Tf " + rgb(hex) + " rg " + n(xx) + " " + n(H - base) + " Td " + chainePdf(texte) + " Tj ET");
  };
  const cercle = (cx, cy, r, hex) => {
    const k = 0.5523 * r;
    const Y = H - cy;
    ops.push(rgb(hex) + " rg " + n(cx + r) + " " + n(Y) + " m "
      + [n(cx + r), n(Y + k), n(cx + k), n(Y + r), n(cx), n(Y + r)].join(" ") + " c "
      + [n(cx - k), n(Y + r), n(cx - r), n(Y + k), n(cx - r), n(Y)].join(" ") + " c "
      + [n(cx - r), n(Y - k), n(cx - k), n(Y - r), n(cx), n(Y - r)].join(" ") + " c "
      + [n(cx + k), n(Y - r), n(cx + r), n(Y - k), n(cx + r), n(Y)].join(" ") + " c f");
  };
  const assurer = (hauteur) => {
    if (y + hauteur > BAS && y > M + 1) nouvellePage();
  };

  nouvellePage();
  /* En-tête : logo (abonné) ou initiales, émetteur, référence du devis. */
  const e = modele.emetteur;
  const avecLogo = e.logo && logoJpegValide(logo);
  if (avecLogo) {
    const echelle = Math.min(56 / logo.largeur, 56 / logo.hauteur);
    const lw = logo.largeur * echelle;
    const lh = logo.hauteur * echelle;
    ops.push("q " + n(lw) + " 0 0 " + n(lh) + " " + n(M) + " " + n(H - y - lh) + " cm /Im1 Do Q");
  } else {
    cercle(M + 26, y + 26, 26, C.violet);
    ecrire(e.initiales, M, y + 32, taillePourLargeur(e.initiales, true, 18, 44), true, C.blanc, "centre", 52);
  }
  const xInfo = M + 66;
  const largeurInfo = CW - 66 - 180;
  let yInfo = y + 12;
  couperPdf(e.titre, largeurInfo, true, 12).forEach((ligne) => { ecrire(ligne, xInfo, yInfo, 12, true, C.texte); yInfo += 14; });
  e.lignes.forEach((texte) => couperPdf(texte, largeurInfo, false, 8.5).forEach((ligne) => { ecrire(ligne, xInfo, yInfo, 8.5, false, C.texte2); yInfo += 11; }));
  ecrire("DEVIS", M + CW - 180, y + 20, 22, true, C.violet, "droite", 180);
  ecrire(modele.numero, M + CW - 180, y + 35, 10, true, C.texte, "droite", 180);
  ecrire("Date : " + modele.date, M + CW - 180, y + 48, 8.5, false, C.texte2, "droite", 180);
  y = Math.max(y + 54, yInfo) + 2;
  trait(M, y, M + CW, 1.4, C.violet);
  y += 13;
  couperPdf("Objet : " + modele.objet, CW, true, 10.5).forEach((ligne) => { ecrire(ligne, M, y, 10.5, true, C.texte); y += 13; });
  y += 2;

  /* Client et chantier, côte à côte. */
  const largeurBloc = (CW - 10) / 2;
  const blocs = [
    { titre: "CLIENT", lignes: [[modele.client.nom || "—", true]].concat(modele.client.telephone ? [["Tél. : " + modele.client.telephone, false]] : []) },
    { titre: "CHANTIER", lignes: [[modele.client.lieu || "—", true]] }
  ].map((bloc) => ({ ...bloc, coupees: bloc.lignes.flatMap(([texte, gras]) => couperPdf(texte, largeurBloc - 16, gras, 9.5).map((l) => [l, gras])) }));
  const hauteurBloc = 22 + Math.max(...blocs.map((b) => b.coupees.length)) * 12;
  blocs.forEach((bloc, i) => {
    const x = M + i * (largeurBloc + 10);
    rect(x, y, largeurBloc, hauteurBloc, C.doux);
    ecrire(bloc.titre, x + 8, y + 12, 7, true, C.violet);
    bloc.coupees.forEach(([ligne, gras], k) => ecrire(ligne, x + 8, y + 25 + k * 12, gras ? 9.5 : 8.5, gras, C.texte));
  });
  y += hauteurBloc + 12;

  /* Tableaux Matériel et Main-d'œuvre : en-tête violet répété, lignes alternées, sous-total. */
  const colonnes = [
    { titre: "Désignation", largeur: CW - 280, alignement: "gauche" },
    { titre: "Unité", largeur: 46, alignement: "gauche" },
    { titre: "Qté", largeur: 44, alignement: "droite" },
    { titre: "Prix unitaire", largeur: 92, alignement: "droite" },
    { titre: "Montant", largeur: 98, alignement: "droite" }
  ];
  const entete = () => {
    rect(M, y, CW, hauteurEntete, C.violet);
    let x = M;
    colonnes.forEach((c) => { ecrire(c.titre, x + 5, y + hauteurEntete - 5.5, 7.5, true, C.blanc, c.alignement, c.largeur - 10); x += c.largeur; });
    y += hauteurEntete;
  };
  const tableau = (titre, lignes, libelleSousTotal, sousTotal) => {
    assurer(13 + 17 + 16 + 18);
    ecrire(titre, M, y + 9, 9, true, C.violet);
    y += 13;
    entete();
    if (!lignes.length) {
      ecrire("Aucune ligne", M + 5, y + 10, 8, false, C.texte2);
      y += 15;
    }
    lignes.forEach((ligne, i) => {
      const designation = couperPdf(ligne.designation, colonnes[0].largeur - 10, false, 8);
      const hauteur = designation.length * pas + (serre ? 3 : 4.5);
      if (y + hauteur > BAS) {
        nouvellePage();
        entete();
      }
      if (i % 2 === 1) rect(M, y, CW, hauteur, C.doux);
      designation.forEach((texte, k) => ecrire(texte, M + 5, y + ligneBase + k * pas, 8, false, C.texte));
      let x = M + colonnes[0].largeur;
      [ligne.unite, ligne.quantite, ligne.prix, ligne.montant].forEach((valeur, j) => {
        const c = colonnes[j + 1];
        const gras = j === 3;
        ecrire(valeur, x + 5, y + ligneBase, taillePourLargeur(valeur, gras, 8, c.largeur - 10), gras, C.texte, c.alignement, c.largeur - 10);
        x += c.largeur;
      });
      y += hauteur;
    });
    if (y + 18 > BAS) nouvellePage();
    trait(M, y, M + CW, 0.9, C.violet);
    const lm = colonnes[4].largeur;
    ecrire(libelleSousTotal, M, y + 12, 8.5, true, C.texte, "droite", CW - lm - 5);
    ecrire(sousTotal, M + CW - lm, y + 12, taillePourLargeur(sousTotal, true, 9, lm - 5), true, C.violet, "droite", lm - 5);
    y += serre ? 18 : 24;
  };
  tableau("MATÉRIEL", modele.materiel, "Sous-total matériel", modele.sousTotalMateriel);
  tableau("MAIN-D'ŒUVRE", modele.mainOeuvre, "Sous-total main-d'œuvre", modele.sousTotalMainOeuvre);

  /* Totaux à droite ; à gauche le montant en lettres, la note et les conditions.
     Un seul bloc, jamais coupé. */
  const largeurTotaux = 250;
  const xTotaux = M + CW - largeurTotaux;
  const largeurGauche = CW - largeurTotaux - 16;
  const gauche = [];
  [["MONTANT EN LETTRES", modele.lettres, 8.5], ["NOTE", modele.note, 8], ["CONDITIONS", modele.conditions, 8]].forEach(([titre, texte, taille]) => {
    if (!texte) return;
    gauche.push({ texte: titre, taille: 7, gras: true, hex: C.violet, avant: gauche.length ? 7 : 0, hauteur: 12 });
    couperPdf(texte, largeurGauche, false, taille).forEach((ligne) => gauche.push({ texte: ligne, taille, gras: false, hex: C.texte, avant: 0, hauteur: taille + 2.5 }));
  });
  const hauteurTotaux = modele.totaux.length * 14 + 30 + 2 * 14 + 4;
  const hauteurGauche = gauche.reduce((s, l) => s + l.avant + l.hauteur, 0);
  assurer(Math.max(hauteurTotaux, hauteurGauche) + 8);
  const debut = y;
  let yGauche = y;
  gauche.forEach((l) => {
    yGauche += l.avant;
    ecrire(l.texte, M, yGauche + l.taille + 1, l.taille, l.gras, l.hex);
    yGauche += l.hauteur;
  });
  const ligneTotal = (libelle, valeur, gras, hex) => {
    ecrire(libelle, xTotaux + 6, y + 10, 8.5, gras, hex);
    ecrire(valeur, xTotaux + 120, y + 10, taillePourLargeur(valeur, gras, 8.5, largeurTotaux - 126), gras, hex, "droite", largeurTotaux - 126);
    y += 14;
  };
  modele.totaux.forEach((t) => ligneTotal(t.libelle, t.valeur, false, C.texte));
  y += 2;
  rect(xTotaux, y, largeurTotaux, 26, C.violet);
  ecrire("TOTAL GÉNÉRAL", xTotaux + 8, y + 16.5, 9.5, true, C.blanc);
  ecrire(modele.totalGeneral, xTotaux + 96, y + 17, taillePourLargeur(modele.totalGeneral, true, 12, largeurTotaux - 104), true, C.blanc, "droite", largeurTotaux - 104);
  y += 30;
  ligneTotal(modele.acompte.libelle, modele.acompte.valeur, false, C.texte);
  ligneTotal(modele.reste.libelle, modele.reste.valeur, true, C.texte);
  y = Math.max(y, debut + hauteurGauche) + 12;

  /* Deux signatures et la mention de responsabilité, ensemble. */
  const mention = couperPdf(modele.mention, CW, false, 7.5);
  assurer(hauteurSignature + 12 + mention.length * 9.5);
  const largeurSignature = (CW - 16) / 2;
  modele.signatures.forEach((s, i) => {
    const x = M + i * (largeurSignature + 16);
    cadre(x, y, largeurSignature, hauteurSignature, C.ligne);
    ecrire(s.titre, x + 8, y + 13, 8.5, true, C.texte);
    ecrire(s.aide, x + 8, y + 24, 7, false, C.texte2);
  });
  y += hauteurSignature + 6;
  mention.forEach((ligne) => { ecrire(ligne, M, y + 7, 7.5, false, C.texte2); y += 9.5; });

  /* Annexe : photo du tableau électrique, seule sur sa page, proportions gardées. */
  const avecPhoto = photoJpegValide(photo);
  if (avecPhoto) {
    nouvellePage();
    ecrire("Annexe — Photo du tableau électrique", M, y + 14, 13, true, C.violet);
    ecrire("Devis " + modele.numero, M, y + 30, 8.5, false, C.texte2);
    y += 44;
    const echelle = Math.min(CW / photo.largeur, (BAS - y - 8) / photo.hauteur);
    const pw = photo.largeur * echelle;
    const ph = photo.hauteur * echelle;
    const px = M + (CW - pw) / 2;
    ops.push("q " + n(pw) + " 0 0 " + n(ph) + " " + n(px) + " " + n(H - y - ph) + " cm /Im2 Do Q");
    cadre(px, y, pw, ph, C.ligne);
  }

  /* Pied : filigrane discret (formule gratuite) et numéro de page si plusieurs pages. */
  pages.forEach((page, index) => {
    ops = page;
    if (modele.pied) {
      ops.push("q /GS1 gs");
      ecrire(modele.pied, M, H - M + 2, taillePourLargeur(modele.pied, false, 7, CW - 70), false, C.texte, "centre", CW);
      ops.push("Q");
    }
    if (pages.length > 1) ecrire("Page " + (index + 1) + " / " + pages.length, M, H - M + 2, 7, false, C.texte2, "droite", CW);
  });
  return { pages, avecLogo, avecPhoto };
}

/* Assemblage : objets, table des positions (xref), trailer. */
function assemblerPdf(modele, logo, mise, photo) {
  const W = PDF_A4.largeur;
  const H = PDF_A4.hauteur;
  const { pages, avecLogo } = mise;
  const avecPhoto = Boolean(mise.avecPhoto) && photoJpegValide(photo);
  const morceaux = [];
  let taille = 0;
  const positions = [];
  const ajouter = (contenu) => {
    const octets = typeof contenu === "string" ? Uint8Array.from(contenu, (c) => c.charCodeAt(0) & 255) : contenu;
    morceaux.push(octets);
    taille += octets.length;
  };
  const objet = (numero, dictionnaire, flux) => {
    positions[numero] = taille;
    if (flux === undefined) {
      ajouter(numero + " 0 obj\n" + dictionnaire + "\nendobj\n");
      return;
    }
    const longueur = typeof flux === "string" ? flux.length : flux.length;
    ajouter(numero + " 0 obj\n" + dictionnaire.replace("«LONGUEUR»", String(longueur)) + "\nstream\n");
    ajouter(flux);
    ajouter("\nendstream\nendobj\n");
  };
  let suivant = 6;
  const idLogo = avecLogo ? suivant++ : 0;
  const idPhoto = avecPhoto ? suivant++ : 0;
  const premierePage = suivant;
  const idsPages = pages.map((_, i) => premierePage + i * 2);
  ajouter("%PDF-1.4\n");
  ajouter(Uint8Array.from([37, 226, 227, 207, 211, 10]));
  objet(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objet(2, "<< /Type /Pages /Kids [" + idsPages.map((id) => id + " 0 R").join(" ") + "] /Count " + pages.length + " >>");
  objet(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objet(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objet(5, "<< /Type /ExtGState /ca " + OPACITE_FILIGRANE + " /CA " + OPACITE_FILIGRANE + " >>");
  if (avecLogo) {
    objet(idLogo, "<< /Type /XObject /Subtype /Image /Width " + logo.largeur + " /Height " + logo.hauteur
      + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length «LONGUEUR» >>", Uint8Array.from(logo.octets));
  }
  if (avecPhoto) {
    objet(idPhoto, "<< /Type /XObject /Subtype /Image /Width " + photo.largeur + " /Height " + photo.hauteur
      + " /ColorSpace " + (photo.composantes === 1 ? "/DeviceGray" : "/DeviceRGB") + " /BitsPerComponent 8 /Filter /DCTDecode /Length «LONGUEUR» >>", Uint8Array.from(photo.octets));
  }
  const images = (avecLogo ? " /Im1 " + idLogo + " 0 R" : "") + (avecPhoto ? " /Im2 " + idPhoto + " 0 R" : "");
  const ressources = "<< /Font << /F1 3 0 R /F2 4 0 R >> /ExtGState << /GS1 5 0 R >>" + (images ? " /XObject <<" + images + " >>" : "") + " >>";
  pages.forEach((page, i) => {
    const id = idsPages[i];
    objet(id, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources " + ressources + " /Contents " + (id + 1) + " 0 R >>");
    objet(id + 1, "<< /Length «LONGUEUR» >>", page.join("\n"));
  });
  const idInfo = premierePage + pages.length * 2;
  objet(idInfo, "<< /Title " + chainePdf(modele.titrePdf || "Devis " + modele.numero) + " >>");
  const debutXref = taille;
  const total = idInfo + 1;
  let xref = "xref\n0 " + total + "\n0000000000 65535 f \n";
  for (let i = 1; i < total; i += 1) xref += String(positions[i]).padStart(10, "0") + " 00000 n \n";
  ajouter(xref + "trailer\n<< /Size " + total + " /Root 1 0 R /Info " + idInfo + " 0 R >>\nstartxref\n" + debutXref + "\n%%EOF\n");
  const resultat = new Uint8Array(taille);
  let position = 0;
  morceaux.forEach((m) => { resultat.set(m, position); position += m.length; });
  return resultat;
}
/* ---------- Reçu de paiement (étape 11) ----------
   Même contenu à l'écran imprimé (navigateur) et en PDF (téléphone) : modeleRecu() décide
   du texte, creerPdfRecu() le met en page sur une feuille A4. */

/* « 1er novembre 2026 », « 12 novembre » : date en toutes lettres. */
function dateFrancaise(instant, avecAnnee) {
  const options = avecAnnee ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "long" };
  return new Intl.DateTimeFormat("fr-FR", options).format(new Date(instant)).replace(/^1 /, "1er ");
}

function modeleRecu(paiement, emetteur) {
  const formule = FORMULES[paiement.formule] || FORMULES[FORMULE_DEFAUT];
  const lignes = [
    ["Référence", paiement.reference],
    ["Date du paiement", dateFrancaise(Date.parse(paiement.payeLe), true)],
    ["Formule", formule.nom]
  ];
  if (paiement.debut && paiement.fin) {
    lignes.push(["Période", "du " + dateFrancaise(Date.parse(paiement.debut), true) + " au " + dateFrancaise(Date.parse(paiement.fin), true)]);
  }
  lignes.push(["Moyen de paiement", paiement.moyen], ["Statut", PAIEMENTS.statuts[paiement.statut] || ""]);
  return {
    titre: "Reçu de paiement",
    numero: paiement.reference,
    titrePdf: "Reçu " + paiement.reference,
    client: [emetteur.nom, emetteur.entreprise, emetteur.telephone].filter((t) => typeof t === "string" && t.trim()),
    lignes,
    montant: formaterMontant(paiement.montant, DEVISE_TARIFS),
    lettres: montantEnLettres(paiement.montant, DEVISE_TARIFS),
    emis: "Application conçue par BRG Électro+",
    pied: PIED_RECU
  };
}

function couleurPdf(hex, trait) {
  const [r, v, b] = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3));
  return r + " " + v + " " + b + (trait ? " RG" : " rg");
}

function creerPdfRecu(m) {
  const W = PDF_A4.largeur;
  const H = PDF_A4.hauteur;
  const M = PDF_A4.marge;
  const CW = W - 2 * M;
  const ops = [];
  const texte = (x, y, chaine, gras, taille, hex) => {
    ops.push(couleurPdf(hex || "#17131F") + " BT /" + (gras ? "F2" : "F1") + " " + taille + " Tf " + x.toFixed(2) + " " + y.toFixed(2) + " Td " + chainePdf(chaine) + " Tj ET");
  };
  const aDroite = (chaine, y, gras, taille, hex, marge) => texte(W - M - (marge || 0) - largeurPdf(chaine, gras, taille), y, chaine, gras, taille, hex);
  let y = H - M;
  ops.push(couleurPdf("#6A0DAD") + " " + M.toFixed(2) + " " + (y - 74).toFixed(2) + " " + CW.toFixed(2) + " 74 re f");
  texte(M + 18, y - 34, "BâtiPlus", true, 24, "#FFFFFF");
  texte(M + 18, y - 56, m.emis, false, 10, "#FFFFFF");
  aDroite(m.titre, y - 34, true, 16, "#FFD400", 18);
  aDroite(m.numero, y - 56, false, 10, "#FFFFFF", 18);
  y -= 106;
  texte(M, y, "Reçu établi pour", true, 10, "#5F5870");
  y -= 18;
  m.client.forEach((ligne) => {
    couperPdf(ligne, CW, false, 12).forEach((morceau) => { texte(M, y, morceau, false, 12); y -= 16; });
  });
  y -= 16;
  m.lignes.forEach(([libelle, valeur]) => {
    const morceaux = couperPdf(valeur, CW * 0.62, true, 11);
    texte(M, y, libelle, false, 11, "#5F5870");
    morceaux.forEach((morceau, i) => aDroite(morceau, y - i * 14, true, 11));
    y -= 14 * (morceaux.length - 1) + 10;
    ops.push(couleurPdf("#DCD3EA", true) + " 0.8 w " + M.toFixed(2) + " " + y.toFixed(2) + " m " + (W - M).toFixed(2) + " " + y.toFixed(2) + " l S");
    y -= 18;
  });
  const lettres = couperPdf(m.lettres, CW - 28, false, 10);
  const hauteur = 46 + lettres.length * 13;
  ops.push(couleurPdf("#F3E9FD") + " " + M.toFixed(2) + " " + (y - hauteur + 14).toFixed(2) + " " + CW.toFixed(2) + " " + hauteur.toFixed(2) + " re f");
  texte(M + 14, y - 8, "Montant payé", true, 12, "#4E0A80");
  aDroite(m.montant, y - 10, true, 18, "#6A0DAD", 14);
  lettres.forEach((morceau, i) => texte(M + 14, y - 30 - i * 13, morceau, false, 10, "#5F5870"));
  couperPdf(m.pied, CW, false, 8).reverse().forEach((morceau, i) => texte(M, M + i * 11, morceau, false, 8, "#5F5870"));
  return assemblerPdf({ numero: m.numero, titrePdf: m.titrePdf }, null, { pages: [ops], avecLogo: false });
}
/* ==== FIN DU DOCUMENT ==== */

/* ==== LISTES ET STATISTIQUES ==== */
/* Fonctions pures de l'étape 9 (aucun accès à l'écran ni au stockage) : recherche,
   filtre et tri des devis, carnet de clients, statistiques. Testées hors navigateur. */

/* Texte comparable : sans accents, en minuscules, espaces simples. */
function cleTexte(texte) {
  return String(texte || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/* Tous les mots de la requête doivent se trouver dans l'un des champs (ordre libre). */
function correspondRecherche(champs, requete) {
  const mots = cleTexte(texteBorne(String(requete || ""), BORNES_LISTES.rechercheMax)).split(" ").filter(Boolean);
  if (!mots.length) return true;
  const texte = cleTexte(champs.filter((c) => typeof c === "string").join(" "));
  return mots.every((mot) => texte.includes(mot));
}

function champsRechercheDevis(d) {
  return [d.numero, d.titre, d.client, d.lieu, STATUTS_DEVIS[d.statut] ? STATUTS_DEVIS[d.statut].libelle : ""];
}

/* Devis affichés : recherche (numéro, titre, client, lieu, statut), filtre de statut, tri.
   Le tri est stable : à égalité, le plus récent d'abord, puis le numéro. */
function filtrerDevis(devis, options) {
  const o = options && typeof options === "object" ? options : {};
  const statut = Object.prototype.hasOwnProperty.call(STATUTS_DEVIS, o.statut) ? o.statut : "tous";
  const tri = Object.prototype.hasOwnProperty.call(TRIS_DEVIS, o.tri) ? o.tri : "recents";
  const date = (d) => Date.parse(d.creeLe) || 0;
  const departage = (a, b) => (date(b) - date(a)) || String(b.numero).localeCompare(String(a.numero));
  const comparateurs = {
    recents: departage,
    anciens: (a, b) => (date(a) - date(b)) || String(a.numero).localeCompare(String(b.numero)),
    "montant-desc": (a, b) => (b.total - a.total) || departage(a, b),
    "montant-asc": (a, b) => (a.total - b.total) || departage(a, b)
  };
  return (Array.isArray(devis) ? devis : [])
    .filter((d) => d && (statut === "tous" || d.statut === statut))
    .filter((d) => correspondRecherche(champsRechercheDevis(d), o.requete))
    .sort(comparateurs[tri]);
}

/* Nombre de devis par statut (pour les puces du filtre). */
function comptesParStatut(devis) {
  const comptes = { tous: 0 };
  Object.keys(STATUTS_DEVIS).forEach((s) => { comptes[s] = 0; });
  (Array.isArray(devis) ? devis : []).forEach((d) => {
    if (!d || !Object.prototype.hasOwnProperty.call(STATUTS_DEVIS, d.statut)) return;
    comptes.tous += 1;
    comptes[d.statut] += 1;
  });
  return comptes;
}

function estAccepte(d) {
  /* Un devis payé a forcément été accepté. */
  return d.statut === "accepte" || d.statut === "paye";
}

/* Carnet de clients construit depuis les devis et les chantiers, plus les clients ajoutés à la main.
   Un client = un nom (comparé sans accents ni majuscules). Téléphone : celui saisi à la main,
   sinon celui du devis le plus récent, sinon celui du chantier le plus récent. */
function carnetClients(manuels, devis, chantiers) {
  const carnet = new Map();
  const entree = (nom) => {
    const propre = texteBorne(nom, BORNES.texteMax);
    const cle = cleTexte(propre);
    if (!cle) return null;
    if (!carnet.has(cle)) {
      carnet.set(cle, { cle, nom: propre, telephone: "", manuelId: null, nombreDevis: 0, total: 0, totalAccepte: 0, nombreChantiers: 0, dernier: "" });
    }
    return carnet.get(cle);
  };
  const plusRecent = (a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0);
  const telephoneValideE164 = (t) => typeof t === "string" && /^\+\d{6,15}$/.test(t);
  /* Ordre : devis (du plus récent au plus ancien), chantiers, puis clients saisis à la main.
     Le nom affiché est donc celui du devis le plus récent (dernière orthographe utilisée). */
  const telephonesAuto = new Map();
  [...(Array.isArray(devis) ? devis : [])].filter(Boolean).sort((a, b) => plusRecent(a.creeLe, b.creeLe)).forEach((d) => {
    const c = entree(d.client);
    if (!c) return;
    c.nombreDevis += 1;
    c.total += Number.isFinite(d.total) ? d.total : 0;
    if (estAccepte(d)) c.totalAccepte += Number.isFinite(d.total) ? d.total : 0;
    if (!c.dernier || plusRecent(d.creeLe, c.dernier) < 0) c.dernier = d.creeLe;
    if (!telephonesAuto.has(c.cle) && telephoneValideE164(d.clientTelephone)) telephonesAuto.set(c.cle, d.clientTelephone);
  });
  [...(Array.isArray(chantiers) ? chantiers : [])].filter(Boolean).sort((a, b) => plusRecent(a.modifieLe, b.modifieLe)).forEach((ch) => {
    const client = ch.client && typeof ch.client === "object" ? ch.client : {};
    const c = entree(client.nom);
    if (!c) return;
    c.nombreChantiers += 1;
    if (!c.dernier || plusRecent(ch.modifieLe, c.dernier) < 0) c.dernier = ch.modifieLe;
    if (!telephonesAuto.has(c.cle) && telephoneValideE164(client.telephone)) telephonesAuto.set(c.cle, client.telephone);
  });
  (Array.isArray(manuels) ? manuels : []).forEach((m) => {
    if (!m || typeof m !== "object") return;
    const c = entree(m.nom);
    if (!c) return;
    c.manuelId = typeof m.id === "string" ? m.id : null;
    /* Le numéro saisi à la main est prioritaire. */
    if (telephoneValideE164(m.telephone)) c.telephone = m.telephone;
    if (m.creeLe && (!c.dernier || plusRecent(m.creeLe, c.dernier) < 0)) c.dernier = m.creeLe;
  });
  carnet.forEach((c) => { if (!c.telephone && telephonesAuto.has(c.cle)) c.telephone = telephonesAuto.get(c.cle); });
  return [...carnet.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

function filtrerClients(clients, requete) {
  return clients.filter((c) => correspondRecherche([c.nom, c.telephone, c.telephone.replace(/\D/g, "")], requete));
}

/* Statistiques de l'écran « Statistiques » (et des compteurs de l'accueil et du profil).
   maintenant : date de référence (le mois en cours est celui de cette date, heure locale). */
function statistiquesDetaillees(devis, maintenant, nombreClientsMax) {
  const liste = (Array.isArray(devis) ? devis : []).filter((d) => d && Number.isFinite(d.total));
  /* Pas d'instanceof : une date venue d'un autre contexte JavaScript reste acceptée. */
  const temps = maintenant && typeof maintenant.getTime === "function" ? maintenant.getTime() : NaN;
  const ref = Number.isFinite(temps) ? new Date(temps) : new Date();
  const annee = ref.getFullYear();
  const mois = ref.getMonth();
  const jourCourant = ref.getDate();
  const joursDansMois = new Date(annee, mois + 1, 0).getDate();
  const debutPrecedent = new Date(annee, mois - 1, 1);
  const joursPrecedent = new Date(annee, mois, 0).getDate();
  const parJour = Array.from({ length: joursDansMois }, () => ({ montant: 0, nombre: 0 }));
  const precedent = { montant: 0, nombre: 0, montantMemeJour: 0 };
  const dansMois = { montant: 0, nombre: 0 };
  liste.forEach((d) => {
    const date = new Date(d.creeLe);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() === annee && date.getMonth() === mois) {
      const jour = parJour[date.getDate() - 1];
      jour.montant += d.total;
      jour.nombre += 1;
      dansMois.montant += d.total;
      dansMois.nombre += 1;
    } else if (date.getFullYear() === debutPrecedent.getFullYear() && date.getMonth() === debutPrecedent.getMonth()) {
      precedent.montant += d.total;
      precedent.nombre += 1;
      /* Comparaison juste : le mois dernier jusqu'au même jour (borné à sa longueur). */
      if (date.getDate() <= Math.min(jourCourant, joursPrecedent)) precedent.montantMemeJour += d.total;
    }
  });
  let cumul = 0;
  const cumuls = parJour.map((j) => { cumul += j.montant; return cumul; });
  const acceptes = liste.filter(estAccepte);
  const montant = liste.reduce((s, d) => s + d.total, 0);
  const montantAccepte = acceptes.reduce((s, d) => s + d.total, 0);
  const parClientMap = new Map();
  liste.forEach((d) => {
    const nom = texteBorne(d.client, BORNES.texteMax) || "Sans nom de client";
    const cle = cleTexte(nom);
    if (!parClientMap.has(cle)) parClientMap.set(cle, { nom, montant: 0, nombre: 0, accepte: 0 });
    const c = parClientMap.get(cle);
    c.montant += d.total;
    c.nombre += 1;
    if (estAccepte(d)) c.accepte += d.total;
  });
  const tousClients = [...parClientMap.values()].sort((a, b) => (b.montant - a.montant) || a.nom.localeCompare(b.nom, "fr"));
  const limite = Number.isInteger(nombreClientsMax) && nombreClientsMax > 0 ? nombreClientsMax : tousClients.length;
  const premiers = tousClients.slice(0, limite);
  const reste = tousClients.slice(limite);
  const autres = reste.length ? { nom: reste.length === 1 ? "1 autre client" : reste.length + " autres clients", montant: reste.reduce((s, c) => s + c.montant, 0), nombre: reste.reduce((s, c) => s + c.nombre, 0), autres: true } : null;
  const variation = precedent.montantMemeJour > 0 ? Math.round(((dansMois.montant - precedent.montantMemeJour) / precedent.montantMemeJour) * 100) : null;
  return {
    total: liste.length,
    montant,
    acceptes: acceptes.length,
    montantAccepte,
    taux: liste.length ? Math.round((acceptes.length / liste.length) * 100) : null,
    parStatut: comptesParStatut(liste),
    clients: new Set(liste.map((d) => cleTexte(d.client)).filter(Boolean)).size,
    parClient: autres ? [...premiers, autres] : premiers,
    mois: { annee, mois, jourCourant, jours: parJour, cumuls, montant: dansMois.montant, nombre: dansMois.nombre },
    moisPrecedent: precedent,
    variation
  };
}
/* ==== FIN DES LISTES ==== */

/* ---------- Assistant Nouveau chantier (5 étapes, brouillon automatique) ---------- */

const assistant = { chantier: null, minuterie: 0, toast: 0, habituels: null };

function identifiantCourt() {
  return "p" + [...crypto.getRandomValues(new Uint8Array(5))].map((o) => o.toString(16).padStart(2, "0")).join("");
}

function quantiteFacultative(valeur, max) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const nombre = lireNombre(valeur);
  return Number.isFinite(nombre) ? Math.round(Math.min(max, Math.max(0, nombre))) : null;
}

/* Prix saisi : vide = prix par défaut ; sinon borné, 2 décimales au plus (le moteur arrondit à la devise). */
function montantFacultatif(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  const nombre = lireNombre(valeur);
  return Number.isFinite(nombre) ? arrondi(Math.min(BORNES_CHANTIER.prixMax, Math.max(0, nombre)), 2) : null;
}

function montantSaisi(valeur) {
  const montant = montantFacultatif(valeur);
  return montant === null ? 0 : montant;
}

/* Réglages de l'écran Résultat : quantités et prix modifiés par ligne de matériel, remise, TVA, acompte. */
function reglagesMaterielValides(source) {
  const brut = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const resultat = {};
  Object.keys(brut).slice(0, 80).forEach((ref) => {
    if (!/^[a-z0-9.-]{1,40}$/.test(ref) || !brut[ref] || typeof brut[ref] !== "object") return;
    const quantite = quantiteFacultative(brut[ref].quantite, BORNES_CHANTIER.quantiteMax);
    const prix = montantFacultatif(brut[ref].prix);
    if (quantite !== null || prix !== null) resultat[ref] = { quantite, prix };
  });
  return resultat;
}

function reglagesTotauxValides(source) {
  const r = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const typeRemise = r.remiseType === "montant" ? "montant" : "pourcent";
  return {
    remiseType: typeRemise,
    remise: typeRemise === "pourcent" ? arrondi(borner(r.remise, 0, 100, 0), 2) : montantSaisi(r.remise),
    tva: r.tva === true,
    tauxTva: arrondi(borner(r.tauxTva, 0, TVA_MAX, TVA_DEFAUT), 2),
    acompte: arrondi(borner(r.acompte, 0, 100, ACOMPTE_DEFAUT), 2)
  };
}


/* Écrit un texte dont les mots composés (« Chauffe-eau », « Va-et-vient ») ne sont jamais
   coupés au trait d'union : chacun est placé dans un span insécable. */

function ecrireInsecable(element, texte) {
  element.replaceChildren(...lierUnites(texte).split(/(\s+)/).filter(Boolean).map((morceau) => {
    if (!morceau.includes("-") || /\s/.test(morceau)) return document.createTextNode(morceau);
    const span = document.createElement("span");
    span.className = "insecable";
    span.textContent = morceau;
    return span;
  }));
  return element;
}

function nouveauChantier() {
  const maintenant = new Date().toISOString();
  return {
    id: identifiantAleatoire(), compteId: etat.compte.id, creeLe: maintenant, modifieLe: maintenant,
    statut: "brouillon", etape: 1, etapeMax: 1,
    client: { nom: "", telephone: "" }, nom: "", lieu: "", type: "villa", alimentation: "mono",
    pieces: [], appareils: {},
    options: { distance: 0, hauteur: BORNES_CHANTIER.hauteurDefaut, parafoudre: false, terreNeuve: false, tableauARemplacer: false },
    mainOeuvre: { points: {}, forfait: 0, journees: { ouvriers: 0, jours: 0, tarif: null }, libres: [] }
  };
}

/* Relit un chantier venu du stockage, champ par champ. Tout champ inconnu est ignoré,
   toute valeur hors bornes est ramenée dans les bornes ; une pièce de surface invalide est écartée.
   Retourne null si l'objet n'appartient pas au compte. */
function chantierValide(objet, compteId) {
  if (!objet || typeof objet !== "object" || Array.isArray(objet)) return null;
  if (typeof objet.id !== "string" || !/^[a-z0-9-]{8,64}$/i.test(objet.id)) return null;
  if (typeof compteId !== "string" || objet.compteId !== compteId) return null;
  const date = (valeur) => (typeof valeur === "string" && valeur.length <= 40 && !Number.isNaN(Date.parse(valeur)) ? valeur : new Date().toISOString());
  const client = objet.client && typeof objet.client === "object" ? objet.client : {};
  const telephone = texteBorne(client.telephone, 22);
  const pieces = (Array.isArray(objet.pieces) ? objet.pieces : [])
    .filter((p) => p && typeof p === "object" && Object.prototype.hasOwnProperty.call(TYPES_PIECES, p.type) && surfaceValide(p.surface))
    .slice(0, BORNES_CHANTIER.piecesMax)
    .map((p) => ({
      id: typeof p.id === "string" && /^[a-z0-9-]{1,40}$/i.test(p.id) ? p.id : identifiantCourt(),
      type: p.type,
      surface: arrondi(lireNombre(p.surface), 2),
      prises: quantiteFacultative(p.prises, BORNES_CHANTIER.prisesMax),
      points: quantiteFacultative(p.points, BORNES_CHANTIER.pointsMax)
    }));
  const vus = new Set();
  pieces.forEach((p) => { if (vus.has(p.id)) p.id = identifiantCourt(); vus.add(p.id); });
  const mo = objet.mainOeuvre && typeof objet.mainOeuvre === "object" ? objet.mainOeuvre : {};
  const moPoints = mo.points && typeof mo.points === "object" ? mo.points : {};
  const points = {};
  Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => {
    const reglage = moPoints[id] && typeof moPoints[id] === "object" ? moPoints[id] : {};
    const quantite = quantiteFacultative(reglage.quantite, BORNES_CHANTIER.quantiteMax);
    const prix = montantFacultatif(reglage.prix);
    if (quantite !== null || prix !== null) points[id] = { quantite, prix };
  });
  const journees = mo.journees && typeof mo.journees === "object" ? mo.journees : {};
  const options = normaliserOptions(objet.options);
  const etapeMax = entierBorne(objet.etapeMax, 1, ETAPES_CHANTIER.length, 1);
  return {
    id: objet.id, compteId, creeLe: date(objet.creeLe), modifieLe: date(objet.modifieLe),
    statut: objet.statut === "etudie" ? "etudie" : "brouillon",
    etape: Math.min(entierBorne(objet.etape, 1, ETAPES_CHANTIER.length, 1), etapeMax),
    etapeMax,
    client: { nom: texteBorne(client.nom, BORNES.texteMax), telephone: /^\+\d{6,15}$/.test(telephone) ? telephone : "" },
    nom: texteBorne(objet.nom, BORNES.texteMax),
    lieu: texteBorne(objet.lieu, BORNES.texteMax),
    type: Object.prototype.hasOwnProperty.call(TYPES_CHANTIER, objet.type) ? objet.type : "villa",
    alimentation: objet.alimentation === "tri" ? "tri" : "mono",
    pieces,
    appareils: normaliserAppareils(objet.appareils),
    options,
    mainOeuvre: {
      points,
      forfait: montantSaisi(mo.forfait),
      journees: {
        ouvriers: entierBorne(journees.ouvriers, 0, BORNES_CHANTIER.ouvriersMax, 0),
        jours: arrondi(borner(journees.jours, 0, BORNES_CHANTIER.joursMax, 0), 1),
        tarif: montantFacultatif(journees.tarif)
      },
      libres: (Array.isArray(mo.libres) ? mo.libres : []).slice(0, BORNES_CHANTIER.lignesLibresMax)
        .filter((l) => l && typeof l === "object")
        .map((l) => ({ libelle: texteBorne(l.libelle, 120), montant: montantSaisi(l.montant) }))
    },
    materiel: reglagesMaterielValides(objet.materiel),
    totaux: reglagesTotauxValides(objet.totaux)
  };
}

/* ----- Stockage : chantiers enregistrés et brouillon (un par compte) ----- */

async function lireChantiersBruts() {
  const liste = await lireJson(CLES_STOCKAGE.chantiers);
  return Array.isArray(liste) ? liste.filter((c) => c && typeof c === "object" && !Array.isArray(c)) : [];
}

async function lireChantiers(compteId) {
  return (await lireChantiersBruts()).map((c) => chantierValide(c, compteId)).filter(Boolean);
}

async function lireBrouillons() {
  const brut = await lireJson(CLES_STOCKAGE.brouillonChantier);
  const brouillons = {};
  if (brut && typeof brut === "object" && !Array.isArray(brut)) {
    Object.keys(brut).forEach((compteId) => {
      const chantier = chantierValide(brut[compteId], compteId);
      if (chantier) brouillons[compteId] = chantier;
    });
  }
  return brouillons;
}

async function lireBrouillon(compteId) {
  const brouillons = await lireBrouillons();
  return Object.prototype.hasOwnProperty.call(brouillons, compteId) ? brouillons[compteId] : null;
}

async function ecrireBrouillon(chantier) {
  const brouillons = await lireBrouillons();
  if (chantier) brouillons[chantier.compteId] = chantier;
  else if (etat.compte) delete brouillons[etat.compte.id];
  if (!Object.keys(brouillons).length) {
    await supprimerValeur(CLES_STOCKAGE.brouillonChantier);
    return true;
  }
  return ecrireValeur(CLES_STOCKAGE.brouillonChantier, JSON.stringify(brouillons));
}

function heureCourte(date) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

async function enregistrerBrouillon() {
  clearTimeout(assistant.minuterie);
  assistant.minuterie = 0;
  const chantier = assistant.chantier;
  if (!chantier || !etat.compte || chantier.compteId !== etat.compte.id) return;
  lireEtape(chantier.etape, false);
  chantier.modifieLe = new Date().toISOString();
  const reussi = await ecrireBrouillon(chantier);
  $("etat-brouillon").textContent = reussi
    ? "Brouillon enregistré à " + heureCourte(new Date())
    : "Brouillon non enregistré : mémoire de l'appareil indisponible.";
}

function planifierBrouillon() {
  if (!assistant.chantier) return;
  clearTimeout(assistant.minuterie);
  assistant.minuterie = setTimeout(enregistrerBrouillon, DELAI_BROUILLON);
}

/* L'application passe en arrière-plan : le brouillon en attente est écrit tout de suite. */
function surVisibilite() {
  if (document.visibilityState === "hidden" && assistant.minuterie) enregistrerBrouillon();
  if (document.visibilityState === "hidden" && resultat.minuterie) enregistrerResultat();
  if (document.visibilityState === "hidden" && fiche.minuterie) enregistrerDevis();
  if (document.visibilityState === "hidden" && mesPrix.minuterie) enregistrerMesPrix();
}

/* ----- Construction des éléments fixes (une fois au démarrage) ----- */

function creerPuce(nom, valeur, libelle) {
  const label = document.createElement("label");
  label.className = "puce";
  const entree = document.createElement("input");
  entree.type = "radio";
  entree.name = nom;
  entree.value = valeur;
  const texte = document.createElement("span");
  texte.textContent = libelle;
  label.append(entree, texte);
  return label;
}

function creerCompteurSaisie(id, libelle, max, donnees) {
  const bloc = document.createElement("div");
  bloc.className = "compteur-saisie";
  const moins = document.createElement("button");
  moins.type = "button";
  moins.className = "bouton-pas";
  moins.dataset.pas = "-1";
  moins.dataset.cible = id;
  moins.setAttribute("aria-label", "Diminuer : " + libelle);
  moins.appendChild(creerIcone("i-moins"));
  const entree = document.createElement("input");
  entree.type = "text";
  entree.id = id;
  entree.inputMode = "numeric";
  entree.autocomplete = "off";
  entree.maxLength = String(max).length;
  entree.dataset.max = String(max);
  Object.entries(donnees || {}).forEach(([cle, valeur]) => { entree.dataset[cle] = valeur; });
  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "bouton-pas";
  plus.dataset.pas = "1";
  plus.dataset.cible = id;
  plus.setAttribute("aria-label", "Augmenter : " + libelle);
  plus.appendChild(creerIcone("i-plus"));
  bloc.append(moins, entree, plus);
  return bloc;
}

function creerChamp(idEntree, libelle, enfant) {
  const champ = document.createElement("div");
  champ.className = "champ";
  const label = document.createElement("label");
  label.htmlFor = idEntree;
  label.textContent = libelle;
  champ.append(label, enfant);
  return champ;
}

function creerEntreeTexte(id, mode, longueur, donnees) {
  const entree = document.createElement("input");
  entree.type = "text";
  entree.id = id;
  entree.inputMode = mode;
  entree.autocomplete = "off";
  entree.maxLength = longueur;
  Object.entries(donnees || {}).forEach(([cle, valeur]) => { entree.dataset[cle] = valeur; });
  return entree;
}

function construireAssistant() {
  $("progression-chantier").replaceChildren(...ETAPES_CHANTIER.map((libelle, index) => {
    const li = document.createElement("li");
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "progression-pas";
    bouton.dataset.etapeCible = String(index + 1);
    const numero = document.createElement("span");
    numero.className = "progression-numero";
    numero.textContent = String(index + 1);
    const texte = document.createElement("span");
    texte.className = "progression-libelle";
    texte.textContent = libelle;
    bouton.append(numero, texte);
    li.appendChild(bouton);
    return li;
  }));
  $("choix-type-chantier").replaceChildren(...Object.entries(TYPES_CHANTIER).map(([v, l]) => creerPuce("chantier-type", v, l)));
  $("choix-alimentation").replaceChildren(...Object.entries(ALIMENTATIONS).map(([v, l]) => creerPuce("chantier-alimentation", v, l)));
  $("piece-type").replaceChildren(...Object.entries(TYPES_PIECES).map(([valeur, regle]) => {
    const option = document.createElement("option");
    option.value = valeur;
    option.textContent = regle.libelle;
    return option;
  }));
  $("liste-appareils").replaceChildren(...Object.entries(APPAREILS).map(([id, appareil]) => {
    const li = document.createElement("li");
    li.className = "appareil";
    const label = document.createElement("label");
    label.className = "case";
    const coche = document.createElement("input");
    coche.type = "checkbox";
    coche.id = "appareil-coche-" + id;
    coche.dataset.appareil = id;
    const texte = document.createElement("span");
    texte.appendChild(ecrireInsecable(document.createElement("strong"), appareil.libelle));
    const detail = document.createElement("small");
    detail.textContent = formaterSection(appareil.section) + " mm² · " + appareil.calibre + " A";
    texte.appendChild(detail);
    label.append(coche, texte);
    li.append(label, creerCompteurSaisie("appareil-nombre-" + id, appareil.libelle, BORNES_CHANTIER.appareilsMax, { appareilNombre: id, regle: "appareils" }));
    return li;
  }));
  $("liste-mo-points").replaceChildren(...Object.entries(MAIN_OEUVRE_POINTS).map(([id, ligne]) => {
    const li = document.createElement("li");
    li.className = "ligne-mo";
    const titre = document.createElement("div");
    titre.className = "ligne-mo-titre";
    const libelle = ecrireInsecable(document.createElement("strong"), ligne.libelle);
    const auto = document.createElement("span");
    auto.className = "aide";
    auto.id = "mo-auto-" + id;
    titre.append(libelle, auto);
    const montant = document.createElement("div");
    montant.className = "ligne-mo-montant";
    const etiquette = document.createElement("span");
    etiquette.className = "etiquette-champ";
    etiquette.textContent = "Montant";
    const valeur = document.createElement("strong");
    valeur.className = "montant";
    valeur.id = "mo-montant-" + id;
    montant.append(etiquette, valeur);
    li.append(
      titre,
      creerChamp("mo-qte-" + id, "Quantité", creerEntreeTexte("mo-qte-" + id, "numeric", 6, { moQuantite: id, regle: "quantite" })),
      creerChamp("mo-prix-" + id, "Prix unitaire", creerEntreeTexte("mo-prix-" + id, "numeric", 12, { moPrix: id, regle: "prix" })),
      montant
    );
    return li;
  }));
}

/* ----- Remplissage depuis le chantier en cours ----- */

function cocherPuce(nom, valeur) {
  document.querySelectorAll("input[name=\"" + nom + "\"]").forEach((entree) => { entree.checked = entree.value === valeur; });
}

function valeurPuce(nom) {
  const cochee = document.querySelector("input[name=\"" + nom + "\"]:checked");
  return cochee ? cochee.value : "";
}

async function remplirClientsConnus() {
  const noms = new Map();
  const chantiers = await lireChantiers(etat.compte.id);
  const devis = await lireDevis(etat.compte.id);
  [...chantiers.map((c) => c.client.nom), ...devis.map((d) => d.client)].forEach((nom) => {
    const cle = normaliser(nom);
    if (cle && !noms.has(cle)) noms.set(cle, nom);
  });
  $("liste-clients-chantier").replaceChildren(...[...noms.values()].sort((a, b) => a.localeCompare(b, "fr")).slice(0, 200).map((nom) => {
    const option = document.createElement("option");
    option.value = nom;
    return option;
  }));
}

function remplirAssistant() {
  const c = assistant.chantier;
  $("titre-nouveau-chantier").textContent = c.statut === "etudie" ? "Modifier le chantier" : "Nouveau chantier";
  $("chantier-client").value = c.client.nom;
  $("chantier-telephone").value = c.client.telephone ? formaterTelephone(c.client.telephone, etat.compte.pays) : "";
  $("chantier-nom").value = c.nom;
  $("chantier-lieu").value = c.lieu;
  cocherPuce("chantier-type", c.type);
  cocherPuce("chantier-alimentation", c.alimentation);
  $("piece-surface").value = "";
  afficherPieces();
  Object.keys(APPAREILS).forEach((id) => {
    const nombre = c.appareils[id] || 0;
    $("appareil-coche-" + id).checked = nombre > 0;
    $("appareil-nombre-" + id).value = String(nombre);
  });
  $("option-distance").value = formaterDecimal(c.options.distance);
  $("option-hauteur").value = formaterDecimal(c.options.hauteur);
  $("option-parafoudre").checked = c.options.parafoudre;
  $("option-terre").checked = c.options.terreNeuve;
  $("option-remplacement").checked = c.options.tableauARemplacer;
  $("mo-forfait").value = c.mainOeuvre.forfait ? String(c.mainOeuvre.forfait) : "";
  $("mo-ouvriers").value = c.mainOeuvre.journees.ouvriers ? String(c.mainOeuvre.journees.ouvriers) : "";
  $("mo-jours").value = c.mainOeuvre.journees.jours ? formaterDecimal(c.mainOeuvre.journees.jours) : "";
  afficherLignesLibres();
  document.querySelectorAll("#ecran-nouveau-chantier .champ.invalide").forEach((bloc) => bloc.classList.remove("invalide"));
  document.querySelectorAll("#ecran-nouveau-chantier .champ-erreur, #msg-etape-2").forEach((p) => { p.textContent = ""; });
}

async function ouvrirAssistant() {
  if (!etat.compte) return;
  if (!assistant.chantier || assistant.chantier.compteId !== etat.compte.id) {
    const brouillon = await lireBrouillon(etat.compte.id);
    assistant.chantier = brouillon || nouveauChantier();
    /* Le brouillon relu a été nettoyé champ par champ : c'est cette version propre qui est réécrite. */
    if (brouillon) await ecrireBrouillon(brouillon);
    $("etat-brouillon").textContent = brouillon
      ? "Brouillon repris (enregistré le " + new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(brouillon.modifieLe)) + ")"
      : "";
  }
  $("devise-forfait").textContent = "(" + (DEVISES[etat.compte.devise] || DEVISES.XOF).libelle + ")";
  assistant.habituels = (await lireCatalogue()).mainOeuvre;
  $("mo-enregistrer-habituels").checked = false;
  remplirAssistant();
  afficherEtape(assistant.chantier.etape, false);
  remplirClientsConnus();
}

/* ----- Étapes ----- */

function afficherEtape(numero, avecFocus) {
  const c = assistant.chantier;
  c.etape = numero;
  c.etapeMax = Math.max(c.etapeMax, numero);
  document.querySelectorAll(".etape-chantier").forEach((form) => { form.hidden = Number(form.dataset.etape) !== numero; });
  document.querySelectorAll(".progression-pas").forEach((bouton) => {
    const cible = Number(bouton.dataset.etapeCible);
    const li = bouton.parentElement;
    li.classList.toggle("faite", cible < numero);
    li.classList.toggle("courante", cible === numero);
    bouton.disabled = cible > c.etapeMax;
    if (cible === numero) bouton.setAttribute("aria-current", "step");
    else bouton.removeAttribute("aria-current");
    bouton.setAttribute("aria-label", "Étape " + cible + " sur " + ETAPES_CHANTIER.length + " : " + ETAPES_CHANTIER[cible - 1]);
  });
  $("bouton-etape-precedente").hidden = numero === 1;
  $("bouton-etape-suivante").querySelector(".bouton-libelle").textContent = numero === ETAPES_CHANTIER.length ? "Enregistrer le chantier" : "Suivant";
  if (numero === ETAPES_CHANTIER.length) afficherEtude();
  if (avecFocus) {
    $("titre-etape-" + numero).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: defilementDoux() });
  }
}

function lireTelephoneClient(strict) {
  const saisie = $("chantier-telephone").value.trim();
  if (!saisie) return "";
  const analyse = analyserTelephone(saisie, etat.compte.pays);
  if (telephoneValide(analyse)) return versE164(analyse);
  if (strict) afficherErreur("chantier-telephone", messageTelephone(analyse));
  return assistant.chantier.client.telephone;
}

/* strict = au passage à l'étape suivante (erreurs affichées) ; sinon lecture silencieuse pour le brouillon. */
function lireEtape(numero, strict) {
  const c = assistant.chantier;
  let premiereErreur = "";
  const exiger = (id, message) => {
    const valeur = nettoyerTexte($(id).value);
    if (!texteValide(valeur, true)) {
      if (strict) afficherErreur(id, message);
      if (!premiereErreur) premiereErreur = id;
    }
    return valeur.slice(0, BORNES.texteMax);
  };
  if (numero === 1) {
    c.client.nom = exiger("chantier-client", "Indiquez le nom du client (2 caractères minimum).");
    const telephone = lireTelephoneClient(strict);
    if (strict && $("chantier-telephone").getAttribute("aria-invalid") === "true" && !premiereErreur) premiereErreur = "chantier-telephone";
    c.client.telephone = telephone;
    c.nom = exiger("chantier-nom", "Donnez un nom au chantier (2 caractères minimum).");
    c.lieu = exiger("chantier-lieu", "Indiquez le lieu du chantier.");
    c.type = valeurPuce("chantier-type") || c.type;
    c.alimentation = valeurPuce("chantier-alimentation") || c.alimentation;
  } else if (numero === 2) {
    const invalide = document.querySelector("#liste-pieces .champ.invalide input");
    if (invalide) premiereErreur = invalide.id;
    else if (!c.pieces.length) {
      premiereErreur = "piece-surface";
      if (strict) message("msg-etape-2", "Ajoutez au moins une pièce pour continuer.");
    }
  } else if (numero === 3) {
    Object.keys(APPAREILS).forEach((id) => {
      const nombre = $("appareil-coche-" + id).checked ? entierBorne(valeurSaisie($("appareil-nombre-" + id)), 1, BORNES_CHANTIER.appareilsMax, 1) : 0;
      if (nombre > 0) c.appareils[id] = nombre;
      else delete c.appareils[id];
    });
  } else if (numero === 4) {
    const distance = lireNombre($("option-distance").value.trim() || "0");
    if (Number.isFinite(distance) && distance >= 0 && distance <= BORNES_CHANTIER.distanceMax) c.options.distance = arrondi(distance, 1);
    else {
      if (strict) afficherErreur("option-distance", "Distance entre 0 et 500 m.");
      premiereErreur = "option-distance";
    }
    const hauteur = lireNombre($("option-hauteur").value.trim() || String(BORNES_CHANTIER.hauteurDefaut));
    if (Number.isFinite(hauteur) && hauteur >= BORNES_CHANTIER.hauteurMin && hauteur <= BORNES_CHANTIER.hauteurMax) c.options.hauteur = arrondi(hauteur, 2);
    else {
      if (strict) afficherErreur("option-hauteur", "Hauteur entre 2 et 6 m.");
      if (!premiereErreur) premiereErreur = "option-hauteur";
    }
    c.options.parafoudre = $("option-parafoudre").checked;
    c.options.terreNeuve = $("option-terre").checked;
    c.options.tableauARemplacer = $("option-remplacement").checked;
  } else if (numero === 5) {
    lireMainOeuvre();
  }
  return premiereErreur;
}

async function surEtapeSuivante(evenement) {
  if (evenement) evenement.preventDefault();
  const c = assistant.chantier;
  if (!c) return;
  const erreur = lireEtape(c.etape, true);
  if (erreur) {
    if ($(erreur).closest(".champ")) allerAuChamp(erreur);
    else $(erreur).focus();
    trembler($("bouton-etape-suivante"));
    return;
  }
  vibrer();
  if (c.etape === ETAPES_CHANTIER.length) {
    await enregistrerChantier();
    return;
  }
  afficherEtape(c.etape + 1, true);
  await enregistrerBrouillon();
}

async function surEtapePrecedente() {
  const c = assistant.chantier;
  if (!c || c.etape === 1) return;
  lireEtape(c.etape, false);
  afficherEtape(c.etape - 1, true);
  await enregistrerBrouillon();
}

async function surClicProgression(evenement) {
  const bouton = evenement.target.closest(".progression-pas");
  const c = assistant.chantier;
  if (!bouton || bouton.disabled || !c) return;
  const cible = Number(bouton.dataset.etapeCible);
  if (cible === c.etape) return;
  if (cible > c.etape && lireEtape(c.etape, true)) return;
  lireEtape(c.etape, false);
  afficherEtape(cible, true);
  await enregistrerBrouillon();
}

async function surRecommencerChantier() {
  const ok = await demanderConfirmation("Recommencer ?", "Le brouillon en cours sera effacé. Les chantiers déjà enregistrés ne sont pas touchés.", "Effacer le brouillon", "Garder");
  if (!ok) return;
  clearTimeout(assistant.minuterie);
  assistant.minuterie = 0;
  await ecrireBrouillon(null);
  assistant.chantier = nouveauChantier();
  $("etat-brouillon").textContent = "";
  remplirAssistant();
  afficherEtape(1, true);
}

/* ----- Étape 2 : pièces ----- */

function creerCartePiece(piece, nom, proposition) {
  const li = document.createElement("li");
  li.className = "piece";
  li.dataset.id = piece.id;
  const tete = document.createElement("div");
  tete.className = "piece-tete";
  const titre = document.createElement("strong");
  titre.className = "piece-nom";
  titre.textContent = nom;
  const propose = document.createElement("span");
  propose.className = "aide piece-propose";
  tete.append(titre, propose);
  const champs = document.createElement("div");
  champs.className = "piece-champs";
  const surface = creerEntreeTexte("surface-" + piece.id, "decimal", 8, { champPiece: "surface", regle: "surface" });
  surface.value = formaterDecimal(piece.surface);
  surface.setAttribute("aria-describedby", "err-surface-" + piece.id);
  const champSurface = creerChamp(surface.id, "Surface (m²)", surface);
  const erreur = document.createElement("p");
  erreur.className = "champ-erreur";
  erreur.id = "err-surface-" + piece.id;
  champSurface.appendChild(erreur);
  const prises = creerCompteurSaisie("prises-" + piece.id, "prises de " + nom, BORNES_CHANTIER.prisesMax, { champPiece: "prises", regle: "prises" });
  const points = creerCompteurSaisie("points-" + piece.id, "points lumineux de " + nom, BORNES_CHANTIER.pointsMax, { champPiece: "points", regle: "points" });
  champs.append(champSurface, creerChamp("prises-" + piece.id, "Prises", prises), creerChamp("points-" + piece.id, "Points lumineux", points));
  const actions = document.createElement("div");
  actions.className = "piece-actions";
  const proposer = document.createElement("button");
  proposer.type = "button";
  proposer.className = "lien-texte";
  proposer.dataset.actionPiece = "proposer";
  proposer.textContent = "Reprendre la proposition";
  const outils = document.createElement("div");
  outils.className = "piece-outils";
  [["monter", "i-haut", "Monter"], ["descendre", "i-bas", "Descendre"], ["dupliquer", "i-copier", "Dupliquer"], ["supprimer", "i-poubelle", "Supprimer"]]
    .forEach(([action, icone, libelle]) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "bouton-icone bouton-outil" + (action === "supprimer" ? " outil-danger" : "");
      bouton.dataset.actionPiece = action;
      bouton.setAttribute("aria-label", libelle + " : " + nom);
      bouton.appendChild(creerIcone(icone));
      outils.appendChild(bouton);
    });
  actions.append(proposer, outils);
  li.append(tete, champs, actions);
  majCartePiece(li, piece, proposition);
  return li;
}

function majCartePiece(li, piece, proposition) {
  const prises = piece.prises === null ? proposition.prises : piece.prises;
  const points = piece.points === null ? proposition.points : piece.points;
  li.querySelector(".piece-propose").textContent = "Proposé : " + proposition.prises + (proposition.prises > 1 ? " prises" : " prise")
    + " · " + proposition.points + (proposition.points > 1 ? " points" : " point");
  const entreePrises = li.querySelector("[data-champ-piece=\"prises\"]");
  const entreePoints = li.querySelector("[data-champ-piece=\"points\"]");
  if (document.activeElement !== entreePrises) entreePrises.value = String(prises);
  if (document.activeElement !== entreePoints) entreePoints.value = String(points);
  li.querySelector("[data-action-piece=\"proposer\"]").hidden = prises === proposition.prises && points === proposition.points;
}

function afficherPieces() {
  const c = assistant.chantier;
  const etudiees = normaliserPieces(c.pieces);
  $("liste-pieces").replaceChildren(...c.pieces.map((piece, index) => creerCartePiece(piece, etudiees[index].nom, etudiees[index].proposition)));
  const premier = $("liste-pieces").firstElementChild;
  const dernier = $("liste-pieces").lastElementChild;
  if (premier) premier.querySelector("[data-action-piece=\"monter\"]").disabled = true;
  if (dernier) dernier.querySelector("[data-action-piece=\"descendre\"]").disabled = true;
  majResumePieces();
}

function majResumePieces() {
  const c = assistant.chantier;
  const surface = c.pieces.reduce((s, p) => s + p.surface, 0);
  $("resume-pieces").textContent = c.pieces.length
    ? c.pieces.length + (c.pieces.length > 1 ? " pièces · " : " pièce · ") + formaterDecimal(arrondi(surface, 2)) + " m²"
    : "Aucune pièce pour l'instant.";
  $("bouton-ajouter-piece").disabled = c.pieces.length >= BORNES_CHANTIER.piecesMax;
}

function surAjouterPiece() {
  const c = assistant.chantier;
  const entree = $("piece-surface");
  const surface = lireNombre(entree.value.trim());
  const bloc = entree.closest(".champ");
  if (!surfaceValide(surface)) {
    $("err-piece-surface").textContent = "Surface entre 0,5 et 2 000 m².";
    bloc.classList.add("invalide");
    entree.setAttribute("aria-invalid", "true");
    trembler(bloc);
    entree.focus();
    return;
  }
  if (c.pieces.length >= BORNES_CHANTIER.piecesMax) return;
  c.pieces.push({ id: identifiantCourt(), type: $("piece-type").value, surface: arrondi(surface, 2), prises: null, points: null });
  entree.value = "";
  message("msg-etape-2", "");
  afficherPieces();
  vibrer();
  entree.focus();
  planifierBrouillon();
}

function surSaisieSurfaceAjout(evenement) {
  $("err-piece-surface").textContent = "";
  evenement.currentTarget.closest(".champ").classList.remove("invalide");
  evenement.currentTarget.removeAttribute("aria-invalid");
}

function surToucheSurfaceAjout(evenement) {
  if (evenement.key !== "Enter") return;
  evenement.preventDefault();
  surAjouterPiece();
}

function pieceDepuis(element) {
  const li = element.closest(".piece");
  if (!li) return null;
  const index = assistant.chantier.pieces.findIndex((p) => p.id === li.dataset.id);
  return index < 0 ? null : { li, index, piece: assistant.chantier.pieces[index] };
}

function majPiece(cible) {
  const etudiees = normaliserPieces(assistant.chantier.pieces);
  majCartePiece(cible.li, cible.piece, etudiees[cible.index].proposition);
  majResumePieces();
}

function surSaisiePiece(evenement) {
  const entree = evenement.target;
  const champ = entree.dataset.champPiece;
  const cible = champ ? pieceDepuis(entree) : null;
  if (!cible) return;
  const bloc = entree.closest(".champ");
  if (champ === "surface") {
    const surface = lireNombre(entree.value.trim());
    const valide = surfaceValide(surface);
    bloc.classList.toggle("invalide", !valide);
    $("err-surface-" + cible.piece.id).textContent = valide ? "" : "Surface entre 0,5 et 2 000 m².";
    if (valide) {
      entree.removeAttribute("aria-invalid");
      cible.piece.surface = arrondi(surface, 2);
    } else {
      entree.setAttribute("aria-invalid", "true");
    }
  } else {
    const max = Number(entree.dataset.max);
    const nombre = lireNombre(entree.value.trim());
    const valide = Number.isInteger(nombre) && nombre >= 0 && nombre <= max;
    bloc.classList.toggle("invalide", !valide);
    if (valide) cible.piece[champ] = nombre;
  }
  majPiece(cible);
}

function surActionPiece(evenement) {
  const bouton = evenement.target.closest("[data-action-piece]");
  const cible = bouton ? pieceDepuis(bouton) : null;
  if (!cible || bouton.disabled) return;
  const pieces = assistant.chantier.pieces;
  const action = bouton.dataset.actionPiece;
  let focus = "";
  if (action === "proposer") {
    cible.piece.prises = null;
    cible.piece.points = null;
    majPiece(cible);
    planifierBrouillon();
    return;
  }
  if (action === "monter" && cible.index > 0) {
    pieces.splice(cible.index - 1, 0, pieces.splice(cible.index, 1)[0]);
    focus = cible.piece.id + "|monter";
  } else if (action === "descendre" && cible.index < pieces.length - 1) {
    pieces.splice(cible.index + 1, 0, pieces.splice(cible.index, 1)[0]);
    focus = cible.piece.id + "|descendre";
  } else if (action === "dupliquer" && pieces.length < BORNES_CHANTIER.piecesMax) {
    const copie = { ...cible.piece, id: identifiantCourt() };
    pieces.splice(cible.index + 1, 0, copie);
    focus = copie.id + "|dupliquer";
  } else if (action === "supprimer") {
    pieces.splice(cible.index, 1);
    const voisine = pieces[Math.min(cible.index, pieces.length - 1)];
    focus = voisine ? voisine.id + "|supprimer" : "";
  }
  afficherPieces();
  vibrer();
  if (focus) {
    const [id, nomAction] = focus.split("|");
    const li = [...$("liste-pieces").children].find((e) => e.dataset.id === id);
    const prochain = li && li.querySelector("[data-action-piece=\"" + nomAction + "\"]");
    if (prochain && !prochain.disabled) prochain.focus();
    else if (li) li.querySelector("input").focus();
  } else {
    $("piece-surface").focus();
  }
  planifierBrouillon();
}

/* Boutons − et + : bornés, puis l'évènement « input » prend le relais. */
function surBoutonPas(evenement) {
  const bouton = evenement.target.closest(".bouton-pas");
  if (!bouton) return;
  const entree = $(bouton.dataset.cible);
  const max = Number(entree.dataset.max);
  const actuelle = lireNombre(entree.value.trim());
  const depart = Number.isFinite(actuelle) ? Math.round(actuelle) : 0;
  entree.value = String(Math.min(max, Math.max(0, depart + Number(bouton.dataset.pas))));
  entree.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ----- Étape 3 : appareils ----- */

function surSaisieAppareil(evenement) {
  const entree = evenement.target;
  if (entree.dataset.appareil) {
    const nombre = $("appareil-nombre-" + entree.dataset.appareil);
    if (entree.checked && (lireNombre(nombre.value) || 0) < 1) nombre.value = "1";
    if (!entree.checked) nombre.value = "0";
  } else if (entree.dataset.appareilNombre) {
    const nombre = lireNombre(entree.value.trim());
    if (Number.isInteger(nombre)) $("appareil-coche-" + entree.dataset.appareilNombre).checked = nombre > 0;
  }
  lireEtape(3, false);
}

/* ----- Étape 5 : main-d'œuvre et synthèse ----- */

function lireMainOeuvre() {
  const mo = assistant.chantier.mainOeuvre;
  const etude = etudierChantier(assistant.chantier, etat.compte.devise, assistant.habituels);
  Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => {
    const ligne = etude.mainOeuvre.lignes.find((l) => l.id === id);
    const quantite = quantiteFacultative(valeurSaisie($("mo-qte-" + id)), BORNES_CHANTIER.quantiteMax);
    const prix = montantFacultatif(valeurSaisie($("mo-prix-" + id)));
    const reglage = {
      quantite: quantite === null || quantite === ligne.auto ? null : quantite,
      prix: prix === null || prix === prixMainOeuvreHabituel(id, etat.compte.devise, assistant.habituels) ? null : prix
    };
    if (reglage.quantite === null && reglage.prix === null) delete mo.points[id];
    else mo.points[id] = reglage;
  });
  mo.forfait = montantSaisi(valeurSaisie($("mo-forfait")));
  mo.journees.ouvriers = entierBorne(valeurSaisie($("mo-ouvriers")), 0, BORNES_CHANTIER.ouvriersMax, 0);
  mo.journees.jours = arrondi(borner(valeurSaisie($("mo-jours")), 0, BORNES_CHANTIER.joursMax, 0), 1);
  const tarif = montantFacultatif(valeurSaisie($("mo-tarif")));
  mo.journees.tarif = tarif === null || tarif === tarifJourneeHabituel(etat.compte.devise, assistant.habituels) ? null : tarif;
  mo.libres = [...$("liste-lignes-libres").children].map((li) => ({
    libelle: texteBorne(li.querySelector("[data-libre=\"libelle\"]").value, 120),
    montant: montantSaisi(valeurSaisie(li.querySelector("[data-libre=\"montant\"]")))
  }));
}

function creerLigneLibre(ligne, index) {
  const li = document.createElement("li");
  li.className = "ligne-libre";
  const libelle = creerEntreeTexte("libre-libelle-" + index, "text", 120, { libre: "libelle" });
  libelle.value = ligne.libelle;
  libelle.placeholder = "Ex. : Saignées dans le béton";
  const montant = creerEntreeTexte("libre-montant-" + index, "numeric", 12, { libre: "montant", regle: "prix" });
  montant.value = ligne.montant ? String(ligne.montant) : "";
  montant.placeholder = "0";
  const supprimer = document.createElement("button");
  supprimer.type = "button";
  supprimer.className = "bouton-icone bouton-outil outil-danger";
  supprimer.dataset.supprimerLibre = String(index);
  supprimer.setAttribute("aria-label", "Supprimer la ligne " + (index + 1));
  supprimer.appendChild(creerIcone("i-poubelle"));
  li.append(creerChamp(libelle.id, "Libellé", libelle), creerChamp(montant.id, "Montant", montant), supprimer);
  return li;
}

function afficherLignesLibres() {
  const libres = assistant.chantier.mainOeuvre.libres;
  $("liste-lignes-libres").replaceChildren(...libres.map(creerLigneLibre));
  $("bouton-ajouter-ligne").hidden = libres.length >= BORNES_CHANTIER.lignesLibresMax;
}

function surAjouterLigneLibre() {
  lireMainOeuvre();
  const libres = assistant.chantier.mainOeuvre.libres;
  if (libres.length >= BORNES_CHANTIER.lignesLibresMax) return;
  libres.push({ libelle: "", montant: 0 });
  afficherLignesLibres();
  $("libre-libelle-" + (libres.length - 1)).focus();
  planifierBrouillon();
}

function surSupprimerLigneLibre(evenement) {
  const bouton = evenement.target.closest("[data-supprimer-libre]");
  if (!bouton) return;
  lireMainOeuvre();
  assistant.chantier.mainOeuvre.libres.splice(Number(bouton.dataset.supprimerLibre), 1);
  afficherLignesLibres();
  $("bouton-ajouter-ligne").focus();
  afficherEtude();
  planifierBrouillon();
}

function ajouterChiffre(liste, terme, valeur, large) {
  const bloc = document.createElement("div");
  if (large) bloc.className = "chiffre-large";
  const dt = document.createElement("dt");
  dt.textContent = terme;
  const dd = document.createElement("dd");
  dd.textContent = valeur;
  bloc.append(dt, dd);
  liste.appendChild(bloc);
}

function pluriel(nombre, singulier, plurielTexte) {
  return formaterEntier(nombre) + "\u00A0" + (nombre > 1 ? plurielTexte : singulier);
}

/* Recalcule l'étude et met à jour la main-d'œuvre et la synthèse (étape 5). */
function afficherEtude() {
  const c = assistant.chantier;
  const devise = etat.compte.devise;
  const etude = etudierChantier(c, devise, assistant.habituels);
  const mo = etude.mainOeuvre;
  mo.lignes.forEach((ligne) => {
    const qte = $("mo-qte-" + ligne.id);
    const prix = $("mo-prix-" + ligne.id);
    if (document.activeElement !== qte) qte.value = String(ligne.quantite);
    if (document.activeElement !== prix) prix.value = String(ligne.prix);
    $("mo-auto-" + ligne.id).textContent = ligne.quantite === ligne.auto ? "Calculé : " + ligne.auto : "Calculé : " + ligne.auto + " · modifié";
    $("mo-montant-" + ligne.id).textContent = formaterMontant(ligne.montant, devise);
  });
  /* Chaque champ non actif affiche la valeur retenue par le calcul (jamais « -5000 » ni « abc »). */
  const montrerValeur = (entree, texte) => { if (document.activeElement !== entree) entree.value = texte; };
  montrerValeur($("mo-tarif"), String(mo.journees.tarif));
  montrerValeur($("mo-forfait"), mo.forfait ? String(mo.forfait) : "");
  montrerValeur($("mo-ouvriers"), mo.journees.ouvriers ? String(mo.journees.ouvriers) : "");
  montrerValeur($("mo-jours"), mo.journees.jours ? formaterDecimal(mo.journees.jours) : "");
  mo.libres.forEach((ligne, index) => {
    const entree = $("libre-montant-" + index);
    if (entree) montrerValeur(entree, ligne.montant ? String(ligne.montant) : "");
  });
  $("total-mo-points").textContent = formaterMontant(mo.totalPoints, devise);
  $("total-mo").textContent = formaterMontant(mo.total, devise);

  const chiffres = $("synthese-chiffres");
  chiffres.replaceChildren();
  ajouterChiffre(chiffres, "Surface totale", formaterDecimal(etude.surfaceTotale) + "\u00A0m² · " + pluriel(etude.pieces.length, "pièce", "pièces"));
  ajouterChiffre(chiffres, "Prises", formaterEntier(etude.totaux.prises) + (etude.totaux.prisesEtanches ? " dont " + etude.totaux.prisesEtanches + " étanches" : ""));
  ajouterChiffre(chiffres, "Points lumineux", formaterEntier(etude.totaux.points));
  ajouterChiffre(chiffres, "Circuits", pluriel(etude.circuits.length, "circuit", "circuits") + " (" + etude.comptes.eclairage + " éclairage, "
    + (etude.comptes.prises + etude.comptes.cuisine) + " prises, " + etude.comptes.dedies + " dédiés)", true);
  ajouterChiffre(chiffres, "Différentiels 30 mA", formaterEntier(etude.differentiels.length));
  ajouterChiffre(chiffres, "Coffret", etude.coffret.rangees
    ? pluriel(etude.coffret.rangees, "rangée", "rangées") + " · " + etude.coffret.modules + " modules utilisés sur " + etude.coffret.capacite
    : "—", true);
  ajouterChiffre(chiffres, "Câble", Object.keys(etude.cables).map(Number).sort((a, b) => a - b)
    .map((s) => "3G" + formaterSection(s) + "\u00A0: " + formaterEntier(etude.cables[s]) + "\u00A0m").join(" · ") || "—", true);
  if (etude.cableAlimentation) ajouterChiffre(chiffres, "Alimentation", (etude.alimentation === "tri" ? "5G10" : "3G10") + "\u00A0: " + etude.cableAlimentation + "\u00A0m");

  $("corps-circuits").replaceChildren(...etude.circuits.map((circuit) => {
    const tr = document.createElement("tr");
    const nom = document.createElement("th");
    nom.scope = "row";
    nom.appendChild(ecrireInsecable(document.createElement("span"), circuit.nom));
    if (circuit.pieces.length) {
      const detail = document.createElement("small");
      detail.textContent = circuit.pieces.map((n) => n.replace(/ /g, "\u00A0")).join(", ");
      nom.appendChild(detail);
    }
    const section = document.createElement("td");
    section.textContent = formaterSection(circuit.section) + "\u00A0mm²";
    const protection = document.createElement("td");
    protection.textContent = circuit.calibre + "\u00A0A";
    const longueur = document.createElement("td");
    longueur.textContent = circuit.longueur + "\u00A0m";
    tr.append(nom, section, protection, longueur);
    return tr;
  }));
  $("synthese-differentiels").replaceChildren(...etude.differentiels.map((d) => {
    const li = document.createElement("li");
    const titre = document.createElement("strong");
    titre.textContent = d.nom + " · " + d.calibre + "\u00A0A type\u00A0" + d.type;
    const detail = ecrireInsecable(document.createElement("span"), d.circuits.join(", "));
    li.append(titre, detail);
    return li;
  }), ...(c.options.parafoudre ? [(() => {
    const li = document.createElement("li");
    const titre = document.createElement("strong");
    titre.textContent = "Parafoudre";
    const detail = document.createElement("span");
    detail.textContent = "En tête de tableau, avec sa protection intégrée.";
    li.append(titre, detail);
    return li;
  })()] : []));
  return etude;
}

function surSaisieMainOeuvre() {
  lireMainOeuvre();
  afficherEtude();
}

/* Boutons rapides de l'étape 5 : « − 10 % », « Prix habituels », « + 10 % ». */
function surAjusterAssistant(evenement) {
  const bouton = evenement.target.closest("[data-ajuster-assistant]");
  const c = assistant.chantier;
  if (!bouton || !c || !etat.compte) return;
  lireMainOeuvre();
  const mo = c.mainOeuvre;
  const devise = etat.compte.devise;
  if (bouton.dataset.ajusterAssistant === "habituels") {
    Object.keys(mo.points).forEach((id) => {
      mo.points[id].prix = null;
      if (mo.points[id].quantite === null) delete mo.points[id];
    });
    mo.journees.tarif = null;
  } else {
    const facteur = bouton.dataset.ajusterAssistant === "plus" ? 1 + AJUSTEMENT_MAIN_OEUVRE : 1 - AJUSTEMENT_MAIN_OEUVRE;
    const ajuste = ajusterMainOeuvre(mo, etudierChantier(c, devise, assistant.habituels).mainOeuvre, facteur, devise);
    mo.points = ajuste.points;
    mo.forfait = ajuste.forfait;
    mo.journees.tarif = ajuste.journees.tarif;
    mo.libres = ajuste.libres;
  }
  afficherLignesLibres();
  afficherEtude();
  planifierBrouillon();
}

/* Toute saisie dans l'assistant programme l'enregistrement du brouillon (600 ms). */
function surSaisieAssistant(evenement) {
  const cible = evenement.target;
  if (evenement.type === "input" && cible.matches("input, select, textarea") && cible.closest(".champ") && !cible.closest("#liste-pieces")) {
    effacerErreur(cible);
  }
  planifierBrouillon();
}

function afficherToast(texte) {
  const toast = $("toast");
  ecrireInsecable(toast, texte);
  toast.hidden = false;
  clearTimeout(assistant.toast);
  assistant.toast = setTimeout(() => { toast.hidden = true; }, DUREE_TOAST);
}

async function enregistrerChantier() {
  const c = assistant.chantier;
  clearTimeout(assistant.minuterie);
  assistant.minuterie = 0;
  const maintenant = new Date().toISOString();
  const propre = chantierValide({ ...c, statut: "etudie", modifieLe: maintenant }, etat.compte.id);
  if (!propre || !propre.pieces.length) {
    afficherEtape(2, true);
    return;
  }
  const bruts = await lireChantiersBruts();
  const autres = bruts.filter((x) => x.id !== propre.id);
  const reussi = await ecrireValeur(CLES_STOCKAGE.chantiers, JSON.stringify([...autres, propre]));
  if (!reussi) {
    $("etat-brouillon").textContent = "Enregistrement impossible : mémoire de l'appareil indisponible. Le brouillon est conservé.";
    await enregistrerBrouillon();
    return;
  }
  if ($("mo-enregistrer-habituels").checked) {
    await enregistrerHabituels(etudierChantier(propre, etat.compte.devise, assistant.habituels).mainOeuvre);
    $("mo-enregistrer-habituels").checked = false;
  }
  await ecrireBrouillon(null);
  assistant.chantier = null;
  $("etat-brouillon").textContent = "";
  /* L'étude s'ouvre ; le bouton retour ne ramène pas dans l'assistant vide. */
  ouvrirEtude(propre.id);
  etat.historique = etat.historique.filter((ecran) => ecran !== "nouveau-chantier");
  afficherToast("Chantier « " + propre.nom + " » enregistré. Voici l'étude.");
}

/* ==========================================================================
   Résultat de l'étude (étape 6) : 6 onglets, schéma du tableau en SVG,
   matériel et main-d'œuvre modifiables, total recalculé à chaque saisie.
   ========================================================================== */

const resultat = { id: null, chantier: null, chiffrage: null, catalogue: { articles: {}, liste: [], mainOeuvre: null }, onglet: "circuits", minuterie: 0, lignes: new Map() };

const ICONES_ONGLETS = Object.freeze({
  circuits: "i-eclair", tableau: "i-plan", materiel: "i-chantier", "main-oeuvre": "i-profil", conformite: "i-norme", total: "i-prix"
});
const LIBELLES_GENRES = Object.freeze({
  differentiel: "Différentiel 30 mA", parafoudre: "Parafoudre", eclairage: "Éclairage", prises: "Prises",
  cuisine: "Prises cuisine", dedie: "Gros appareil", libre: "Emplacement libre (réserve)"
});
const SCHEMA = Object.freeze({ module: 40, marge: 10, titre: 30, hauteur: 112, accolade: 18, ecart: 12 });

/* Le SEUL accès aux prix du matériel : catalogue de départ (FCFA uniquement), puis
   les prix enregistrés par l'électricien pour son compte, validés un par un. */
function deviseCompte() {
  return etat.compte ? etat.compte.devise : "XOF";
}

function montantTexte(valeur) {
  return formaterMontant(valeur, deviseCompte());
}

function svgElement(nom, attributs) {
  const element = document.createElementNS(SVG_NS, nom);
  Object.entries(attributs || {}).forEach(([cle, valeur]) => element.setAttribute(cle, String(valeur)));
  return element;
}

/* ----- Construction (une fois au démarrage) ----- */

function construireResultat() {
  $("resultat-onglets").replaceChildren(...ONGLETS_RESULTAT.map((onglet) => {
    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "onglet-resultat";
    bouton.id = "onglet-" + onglet.id;
    bouton.dataset.onglet = onglet.id;
    bouton.setAttribute("role", "tab");
    bouton.setAttribute("aria-controls", "panneau-" + onglet.id);
    const libelle = document.createElement("span");
    libelle.textContent = onglet.libelle;
    bouton.append(creerIcone(ICONES_ONGLETS[onglet.id]), libelle);
    return bouton;
  }));
  $("legende-tableau").replaceChildren(...Object.entries(LIBELLES_GENRES).map(([genre, libelle]) => {
    const li = document.createElement("li");
    const pastille = document.createElement("span");
    pastille.className = "legende-pastille";
    pastille.dataset.genre = genre;
    const texte = document.createElement("span");
    texte.textContent = libelle;
    li.append(pastille, texte);
    return li;
  }));
}

function choisirOngletResultat(id, avecFocus) {
  if (!ONGLETS_RESULTAT.some((o) => o.id === id)) return;
  resultat.onglet = id;
  ONGLETS_RESULTAT.forEach((onglet) => {
    const bouton = $("onglet-" + onglet.id);
    const actif = onglet.id === id;
    bouton.setAttribute("aria-selected", actif ? "true" : "false");
    bouton.tabIndex = actif ? 0 : -1;
    $("panneau-" + onglet.id).hidden = !actif;
  });
  if (avecFocus) $("onglet-" + id).focus();
}

function surClicOngletResultat(evenement) {
  const bouton = evenement.target.closest("[data-onglet]");
  if (bouton) choisirOngletResultat(bouton.dataset.onglet, false);
}

/* Clavier : flèches, Début et Fin déplacent l'onglet actif (motif ARIA « tablist »). */
function surClavierOngletsResultat(evenement) {
  const index = ONGLETS_RESULTAT.findIndex((o) => o.id === resultat.onglet);
  const dernier = ONGLETS_RESULTAT.length - 1;
  const cibles = { ArrowRight: index === dernier ? 0 : index + 1, ArrowLeft: index === 0 ? dernier : index - 1, Home: 0, End: dernier };
  if (!Object.prototype.hasOwnProperty.call(cibles, evenement.key)) return;
  evenement.preventDefault();
  choisirOngletResultat(ONGLETS_RESULTAT[cibles[evenement.key]].id, true);
}

/* ----- Ouverture ----- */

async function ouvrirResultat() {
  if (!etat.compte) return;
  if (resultat.minuterie) await enregistrerResultat();
  const chantiers = (await lireChantiers(etat.compte.id)).filter((c) => c.statut === "etudie");
  const chantier = chantiers.find((c) => c.id === resultat.id)
    || [...chantiers].sort((a, b) => Date.parse(b.modifieLe) - Date.parse(a.modifieLe))[0];
  if (!chantier) {
    montrer("nouveau-chantier", { retour: true });
    return;
  }
  resultat.id = chantier.id;
  resultat.chantier = chantier;
  resultat.catalogue = await lireCatalogue();
  $("etat-resultat").textContent = "";
  remplirResultat();
  choisirOngletResultat(resultat.onglet, false);
}

function ouvrirEtude(id) {
  resultat.id = id;
  resultat.onglet = "circuits";
  montrer("resultat");
}

function remplirResultat() {
  const c = resultat.chantier;
  resultat.chiffrage = chiffrerChantier(c, resultat.catalogue.articles, deviseCompte(), resultat.catalogue.mainOeuvre);
  const { etude } = resultat.chiffrage;
  ecrireInsecable($("titre-resultat"), c.nom || "Chantier sans nom");
  $("resultat-infos").replaceChildren(...[
    c.client.nom, c.lieu, formaterDecimal(etude.surfaceTotale) + "\u00A0m²", ALIMENTATIONS[c.alimentation]
  ].filter(Boolean).map((texte) => ecrireInsecable(document.createElement("span"), texte)));
  $("res-devise-forfait").textContent = "(" + (DEVISES[deviseCompte()] || DEVISES.XOF).libelle + ")";
  afficherCircuitsResultat(etude);
  afficherTableauResultat(etude);
  afficherMaterielResultat();
  afficherMainOeuvreResultat();
  afficherConformite(resultat.chiffrage.conformite);
  remplirReglagesTotaux();
  actualiserResultat();
  majBoutonsDevisResultat();
}

/* ----- 1. Circuits ----- */

function libellePoints(circuit) {
  if (circuit.genre === "eclairage") return pluriel(circuit.points, "point lumineux", "points lumineux");
  if (circuit.genre === "dedie") return "1\u00A0appareil";
  return pluriel(circuit.points, "prise", "prises");
}

function differentielDuCircuit(etude, circuit) {
  const index = etude.differentiels.findIndex((d) => d.circuits.includes(circuit.nom));
  if (index < 0) return "Aucun";
  const d = etude.differentiels[index];
  return "ID\u00A0" + (index + 1) + " · " + d.calibre + "\u00A0A " + d.type;
}

function afficherCircuitsResultat(etude) {
  const chiffres = $("circuits-chiffres");
  chiffres.replaceChildren();
  ajouterChiffre(chiffres, "Circuits", formaterEntier(etude.circuits.length));
  ajouterChiffre(chiffres, "Différentiels 30 mA", formaterEntier(etude.differentiels.length));
  ajouterChiffre(chiffres, "Prises", formaterEntier(etude.totaux.prises) + (etude.totaux.prisesEtanches ? " dont " + formaterEntier(etude.totaux.prisesEtanches) + " étanches" : ""));
  ajouterChiffre(chiffres, "Points lumineux", formaterEntier(etude.totaux.points));
  ajouterChiffre(chiffres, "Surface totale", formaterDecimal(etude.surfaceTotale) + "\u00A0m²");
  ajouterChiffre(chiffres, "Câble des circuits", formaterEntier(etude.cableTotal) + "\u00A0m");
  $("liste-circuits").replaceChildren(...etude.circuits.map((circuit) => {
    const li = document.createElement("li");
    li.className = "circuit";
    li.dataset.genre = circuit.genre;
    const tete = document.createElement("div");
    tete.className = "circuit-tete";
    const numero = document.createElement("span");
    numero.className = "circuit-numero";
    numero.textContent = String(circuit.numero);
    const textes = document.createElement("div");
    const nom = ecrireInsecable(document.createElement("strong"), circuit.nom);
    const pieces = document.createElement("span");
    pieces.className = "aide";
    ecrireInsecable(pieces, circuit.pieces.length ? circuit.pieces.map((p) => p.replace(/ /g, "\u00A0")).join(", ") : "Ligne directe depuis le tableau");
    textes.append(nom, pieces);
    tete.append(numero, textes);
    const details = document.createElement("dl");
    details.className = "circuit-details";
    [["Section", formaterSection(circuit.section) + "\u00A0mm²"], ["Calibre", circuit.calibre + "\u00A0A"],
      ["Points", libellePoints(circuit)], ["Différentiel", differentielDuCircuit(etude, circuit)], ["Longueur", formaterEntier(circuit.longueur) + "\u00A0m"]
    ].forEach(([terme, valeur]) => {
      const bloc = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = terme;
      const dd = document.createElement("dd");
      ecrireInsecable(dd, valeur);
      bloc.append(dt, dd);
      details.appendChild(bloc);
    });
    li.append(tete, details);
    return li;
  }));
  $("liste-differentiels").replaceChildren(...etude.differentiels.map((d, index) => {
    const li = document.createElement("li");
    const titre = document.createElement("strong");
    titre.textContent = "ID\u00A0" + (index + 1) + " · " + d.calibre + "\u00A0A 30\u00A0mA type\u00A0" + d.type + " · " + (etude.alimentation === "tri" ? "4P" : "2P");
    const detail = document.createElement("span");
    const numeros = d.circuits.map((nom) => {
      const circuit = etude.circuits.find((ci) => ci.nom === nom);
      return circuit ? circuit.numero : "";
    });
    ecrireInsecable(detail, (numeros.length > 1 ? "Circuits " : "Circuit ") + numeros.join(", ") + " : " + d.circuits.map((n) => n.replace(/ /g, "\u00A0")).join(", "));
    li.append(titre, detail);
    return li;
  }));
}

/* ----- 2. Tableau : schéma SVG construit élément par élément (jamais de balisage en texte) ----- */

function texteSchema(groupe, x, y, texte, classe) {
  const element = svgElement("text", { x, y, class: classe, "text-anchor": "middle" });
  element.textContent = texte;
  groupe.appendChild(element);
}

function lignesModule(module) {
  if (module.type === "differentiel") return [["ID " + module.numero, "t-fort", 44], [module.calibre + " A", "t-moyen", 67], ["30 mA", "t-petit", 86], ["type " + module.typeDifferentiel, "t-petit", 104]];
  if (module.type === "parafoudre") return [["PF", "t-fort", 52], [module.largeur > 2 ? "4P" : "2P", "t-moyen", 78]];
  if (module.type === "disjoncteur") return [[String(module.numero), "t-fort", 50], [module.calibre + "A", "t-calibre", 76]];
  return [];
}

function dessinerTableau(etude) {
  const S = SCHEMA;
  const N = REGLES_CIRCUITS.modulesParRangee;
  const pas = S.titre + S.hauteur + S.accolade + S.ecart;
  const largeur = N * S.module + 2 * S.marge;
  const hauteur = etude.tableau.length * pas - S.ecart + 2 * S.marge;
  const svg = svgElement("svg", {
    viewBox: "0 0 " + largeur + " " + hauteur, class: "schema", role: "img",
    "aria-labelledby": "schema-titre", preserveAspectRatio: "xMidYMin meet"
  });
  const titre = svgElement("title", { id: "schema-titre" });
  titre.textContent = "Schéma du tableau : " + pluriel(etude.coffret.rangees, "rangée", "rangées") + " de " + N + " modules";
  svg.appendChild(titre);
  svg.appendChild(svgElement("rect", { x: 1, y: 1, width: largeur - 2, height: hauteur - 2, rx: 14, class: "schema-coffret" }));
  etude.tableau.forEach((rangee, index) => {
    const y0 = S.marge + index * pas;
    const groupeRangee = svgElement("g", { class: "schema-rangee", "data-rangee": rangee.numero });
    const libelle = svgElement("text", { x: S.marge + 4, y: y0 + 21, class: "t-rangee" });
    libelle.textContent = "Rangée " + rangee.numero;
    groupeRangee.appendChild(libelle);
    const yModule = y0 + S.titre;
    groupeRangee.appendChild(svgElement("rect", { x: S.marge, y: yModule + S.hauteur / 2 - 5, width: N * S.module, height: 10, rx: 3, class: "schema-rail" }));
    rangee.modules.forEach((module) => {
      const x = S.marge + module.position * S.module + 2;
      const l = module.largeur * S.module - 4;
      const groupe = svgElement("g", { class: "module", "data-type": module.type, "data-genre": module.genre || module.type });
      groupe.appendChild(svgElement("rect", { x, y: yModule, width: l, height: S.hauteur, rx: 6, class: "module-corps" }));
      if (module.type !== "libre") groupe.appendChild(svgElement("rect", { x: x + 4, y: yModule + 4, width: l - 8, height: 12, rx: 3, class: "module-bande" }));
      lignesModule(module).forEach(([texte, classe, dy]) => texteSchema(groupe, x + l / 2, yModule + dy, texte, classe));
      groupeRangee.appendChild(groupe);
    });
    /* Accolade sous chaque différentiel et les disjoncteurs qu'il protège. */
    rangee.modules.filter((m) => m.type === "differentiel").forEach((d) => {
      const membres = rangee.modules.filter((m) => m.type === "disjoncteur" && m.differentiel === d.numero);
      const fin = membres.length ? membres[membres.length - 1] : d;
      const x1 = S.marge + d.position * S.module + 6;
      const x2 = S.marge + (fin.position + fin.largeur) * S.module - 6;
      const y = yModule + S.hauteur + 4;
      groupeRangee.appendChild(svgElement("path", { d: "M" + x1 + " " + y + "v8H" + x2 + "v-8", class: "schema-accolade" }));
    });
    svg.appendChild(groupeRangee);
  });
  return svg;
}

function afficherTableauResultat(etude) {
  const coffret = etude.coffret;
  const libres = coffret.capacite - coffret.modules;
  $("tableau-resume").textContent = "Coffret " + pluriel(coffret.rangees, "rangée", "rangées") + " de " + REGLES_CIRCUITS.modulesParRangee
    + " modules : " + formaterEntier(coffret.modules) + " modules occupés sur " + formaterEntier(coffret.capacite)
    + ", " + pluriel(libres, "emplacement libre", "emplacements libres") + " pour ajouter des circuits plus tard.";
  $("schema-tableau").replaceChildren(dessinerTableau(etude));
  $("detail-rangees").replaceChildren(...etude.tableau.map((rangee) => {
    const li = document.createElement("li");
    const titre = document.createElement("strong");
    titre.textContent = "Rangée " + rangee.numero;
    const detail = document.createElement("span");
    const morceaux = [];
    rangee.modules.forEach((m) => {
      if (m.type === "parafoudre") morceaux.push("parafoudre");
      if (m.type === "differentiel") {
        const numeros = rangee.modules.filter((x) => x.type === "disjoncteur" && x.differentiel === m.numero).map((x) => x.numero);
        morceaux.push("ID\u00A0" + m.numero + " (" + m.calibre + "\u00A0A " + m.typeDifferentiel + ") → " + (numeros.length > 1 ? "circuits " : "circuit ") + numeros.join(", "));
      }
    });
    const vides = REGLES_CIRCUITS.modulesParRangee - rangee.occupe;
    morceaux.push(pluriel(vides, "emplacement libre", "emplacements libres"));
    ecrireInsecable(detail, morceaux.join(" · "));
    li.append(titre, detail);
    return li;
  }));
}

/* ----- Lignes modifiables (matériel et main-d'œuvre) ----- */

function creerLigneModifiable(options) {
  const li = document.createElement("li");
  li.className = "ligne-mo ligne-modifiable";
  const titre = document.createElement("div");
  titre.className = "ligne-mo-titre";
  const libelle = ecrireInsecable(document.createElement("strong"), options.libelle);
  const aide = document.createElement("span");
  aide.className = "aide";
  ecrireInsecable(aide, options.aide);
  titre.append(libelle, aide);
  const quantite = creerEntreeTexte(options.id + "-qte", "numeric", 6, { ...options.donneesQuantite, regle: "quantite" });
  quantite.value = String(options.quantite);
  const prix = creerEntreeTexte(options.id + "-prix", "decimal", 12, { ...options.donneesPrix, regle: "prix" });
  prix.value = formaterDecimal(options.prix);
  const montant = document.createElement("div");
  montant.className = "ligne-mo-montant";
  const etiquette = document.createElement("span");
  etiquette.className = "etiquette-champ";
  etiquette.textContent = "Montant";
  const valeur = document.createElement("strong");
  valeur.className = "montant";
  const alerte = document.createElement("span");
  alerte.className = "prix-a-completer";
  alerte.textContent = "Prix à compléter";
  alerte.hidden = true;
  montant.append(etiquette, valeur, alerte);
  li.append(titre, creerChamp(quantite.id, options.libelleQuantite, quantite), creerChamp(prix.id, "Prix unitaire", prix), montant);
  return { li, valeur, alerte };
}

function afficherMaterielResultat() {
  const lignes = resultat.chiffrage.materiel;
  resultat.lignes = new Map();
  $("liste-materiel").replaceChildren(...Object.entries(CATEGORIES_MATERIEL).map(([categorie, titre]) => {
    const membres = lignes.filter((l) => l.categorie === categorie);
    if (!membres.length) return null;
    const bloc = document.createElement("section");
    bloc.className = "groupe-materiel";
    const h3 = document.createElement("h3");
    h3.className = "sous-titre";
    h3.textContent = titre;
    const ul = document.createElement("ul");
    ul.className = "lignes-mo";
    membres.forEach((ligne) => {
      const unite = ligne.unite === "m" ? "\u00A0m" : "";
      const element = creerLigneModifiable({
        id: "mat-" + ligne.ref.replace(/\./g, "_"),
        libelle: ligne.designation,
        aide: "Calcul : " + formaterEntier(ligne.auto) + unite + " · catalogue : " + (ligne.prixCatalogue ? montantTexte(ligne.prixCatalogue) + (ligne.unite === "m" ? " le mètre" : " l'unité") : "pas de prix"),
        libelleQuantite: ligne.unite === "m" ? "Quantité (m)" : "Quantité",
        quantite: ligne.quantite,
        prix: ligne.prix,
        donneesQuantite: { matQuantite: ligne.ref },
        donneesPrix: { matPrix: ligne.ref }
      });
      resultat.lignes.set("mat:" + ligne.ref, element);
      ul.appendChild(element.li);
    });
    bloc.append(h3, ul);
    return bloc;
  }).filter(Boolean));
}

function afficherMainOeuvreResultat() {
  const mo = resultat.chiffrage.etude.mainOeuvre;
  $("res-mo-points").replaceChildren(...mo.lignes.map((ligne) => {
    const element = creerLigneModifiable({
      id: "res-mo-" + ligne.id,
      libelle: ligne.libelle,
      aide: "Calcul : " + formaterEntier(ligne.auto),
      libelleQuantite: "Quantité",
      quantite: ligne.quantite,
      prix: ligne.prix,
      donneesQuantite: { resMoQuantite: ligne.id },
      donneesPrix: { resMoPrix: ligne.id }
    });
    resultat.lignes.set("mo:" + ligne.id, element);
    return element.li;
  }));
  const saisie = resultat.chantier.mainOeuvre;
  $("res-mo-forfait").value = saisie.forfait ? formaterDecimal(saisie.forfait) : "";
  $("res-mo-ouvriers").value = saisie.journees.ouvriers ? String(saisie.journees.ouvriers) : "";
  $("res-mo-jours").value = saisie.journees.jours ? formaterDecimal(saisie.journees.jours) : "";
  $("res-mo-tarif").value = formaterDecimal(mo.journees.tarif);
  afficherLibresResultat();
}

function afficherLibresResultat() {
  const libres = resultat.chantier.mainOeuvre.libres;
  $("res-mo-libres").replaceChildren(...libres.map((ligne, index) => {
    const li = document.createElement("li");
    li.className = "ligne-libre";
    const libelle = creerEntreeTexte("res-libre-libelle-" + index, "text", 120, { resLibre: "libelle", index: String(index) });
    libelle.value = ligne.libelle;
    const montant = creerEntreeTexte("res-libre-montant-" + index, "decimal", 12, { resLibre: "montant", index: String(index), regle: "prix" });
    montant.value = ligne.montant ? formaterDecimal(ligne.montant) : "";
    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.className = "bouton-icone bouton-outil outil-danger";
    supprimer.dataset.supprimerLibre = String(index);
    supprimer.setAttribute("aria-label", "Supprimer la ligne " + (index + 1));
    supprimer.appendChild(creerIcone("i-poubelle"));
    li.append(creerChamp(libelle.id, "Désignation", libelle), creerChamp(montant.id, "Montant", montant), supprimer);
    return li;
  }));
  $("res-ajouter-libre").hidden = libres.length >= BORNES_CHANTIER.lignesLibresMax;
}

/* ----- 5. Conformité ----- */

function afficherConformite(liste) {
  const aVerifier = liste.filter((p) => p.etat !== "conforme").length;
  $("conformite-resume").textContent = pluriel(liste.length - aVerifier, "point conforme", "points conformes")
    + (aVerifier ? ", " + formaterEntier(aVerifier) + " à vérifier sur place." : ".");
  $("liste-conformite").replaceChildren(...liste.map((point) => {
    const li = document.createElement("li");
    li.className = "point-conformite";
    li.dataset.etat = point.etat;
    const conforme = point.etat === "conforme";
    const icone = creerIcone(conforme ? "i-coche" : "i-alerte");
    const textes = document.createElement("div");
    const tete = document.createElement("div");
    tete.className = "point-tete";
    const titre = ecrireInsecable(document.createElement("strong"), point.titre);
    const badge = document.createElement("span");
    badge.className = "statut";
    badge.dataset.ton = conforme ? "ok" : "verifier";
    badge.textContent = conforme ? "Conforme" : "À vérifier";
    tete.append(titre, badge);
    const explication = ecrireInsecable(document.createElement("p"), point.explication);
    textes.append(tete, explication);
    li.append(icone, textes);
    return li;
  }));
}

/* ----- 6. Total ----- */

function remplirReglagesTotaux() {
  const t = resultat.chantier.totaux;
  cocherPuce("res-remise-type", t.remiseType);
  $("res-remise").value = t.remise ? formaterDecimal(t.remise) : "";
  $("res-tva").checked = t.tva;
  $("res-taux-tva").value = formaterDecimal(t.tauxTva);
  $("res-acompte").value = formaterDecimal(t.acompte);
}

/* Gros montant : jamais coupé ; plus il est long, plus la police est petite (3 paliers). */
function ecrireMontantFort(id, valeur) {
  const element = $(id);
  const texte = montantTexte(valeur);
  element.textContent = texte;
  element.dataset.longueur = texte.length > 18 ? "tres-long" : (texte.length > 13 ? "long" : "court");
}

/* Recalcule tout et réécrit uniquement les valeurs calculées : les champs en cours de saisie ne bougent pas. */
function actualiserResultat() {
  const c = resultat.chantier;
  resultat.chiffrage = chiffrerChantier(c, resultat.catalogue.articles, deviseCompte(), resultat.catalogue.mainOeuvre);
  const { materiel, totalMateriel, total, etude } = resultat.chiffrage;
  materiel.forEach((ligne) => {
    const element = resultat.lignes.get("mat:" + ligne.ref);
    if (!element) return;
    element.valeur.textContent = montantTexte(ligne.montant);
    element.alerte.hidden = !ligne.aCompleter;
  });
  $("total-materiel").textContent = montantTexte(totalMateriel);
  const mo = etude.mainOeuvre;
  mo.lignes.forEach((ligne) => {
    const element = resultat.lignes.get("mo:" + ligne.id);
    if (element) element.valeur.textContent = montantTexte(ligne.montant);
  });
  $("res-mo-journees").textContent = montantTexte(mo.journees.total);
  ecrireMontantFort("res-total-mo", mo.total);
  $("tot-materiel").textContent = montantTexte(total.materiel);
  $("tot-mo").textContent = montantTexte(total.mainOeuvre);
  $("tot-sous-total").textContent = montantTexte(total.sousTotal);
  $("res-remise").dataset.regle = total.typeRemise === "pourcent" ? "pourcentage" : "prix";
  $("res-remise-libelle").textContent = total.typeRemise === "pourcent" ? "Remise (%)" : "Remise (" + (DEVISES[deviseCompte()] || DEVISES.XOF).libelle + ")";
  $("tot-remise").textContent = (total.remise ? "−\u00A0" : "") + montantTexte(total.remise);
  $("bloc-taux-tva").hidden = !total.tvaActive;
  $("tot-tva").textContent = total.tvaActive ? montantTexte(total.tva) : "Non appliquée";
  ecrireMontantFort("tot-general", total.totalGeneral);
  $("tot-acompte").textContent = montantTexte(total.acompte);
  $("tot-reste").textContent = montantTexte(total.reste);
  ecrireMontantFort("resume-total", total.totalGeneral);
}

/* ----- Saisie : chaque frappe met à jour le chantier, le total et planifie l'enregistrement ----- */

function lireSaisieResultat(cible) {
  const c = resultat.chantier;
  const valeur = cible.type === "checkbox" ? cible.checked : cible.value.trim();
  const d = cible.dataset;
  const reglerLigne = (table, cle, champ, lu) => {
    const ligne = Object.prototype.hasOwnProperty.call(table, cle) ? table[cle] : { quantite: null, prix: null };
    ligne[champ] = lu;
    if (ligne.quantite === null && ligne.prix === null) delete table[cle];
    else table[cle] = ligne;
  };
  if (d.matQuantite) reglerLigne(c.materiel, d.matQuantite, "quantite", quantiteFacultative(valeur, BORNES_CHANTIER.quantiteMax));
  else if (d.matPrix) reglerLigne(c.materiel, d.matPrix, "prix", montantFacultatif(valeur));
  else if (d.resMoQuantite) reglerLigne(c.mainOeuvre.points, d.resMoQuantite, "quantite", quantiteFacultative(valeur, BORNES_CHANTIER.quantiteMax));
  else if (d.resMoPrix) reglerLigne(c.mainOeuvre.points, d.resMoPrix, "prix", montantFacultatif(valeur));
  else if (d.resLibre) {
    const ligne = c.mainOeuvre.libres[Number(d.index)];
    if (!ligne) return false;
    if (d.resLibre === "libelle") ligne.libelle = texteBorne(valeur, 120);
    else ligne.montant = montantSaisi(valeur);
  } else if (d.res === "forfait") c.mainOeuvre.forfait = montantSaisi(valeur);
  else if (d.res === "ouvriers") c.mainOeuvre.journees.ouvriers = entierBorne(valeur, 0, BORNES_CHANTIER.ouvriersMax, 0);
  else if (d.res === "jours") c.mainOeuvre.journees.jours = arrondi(borner(valeur, 0, BORNES_CHANTIER.joursMax, 0), 1);
  else if (d.res === "tarif") c.mainOeuvre.journees.tarif = montantFacultatif(valeur);
  else if (d.res === "remiseType") {
    if (!cible.checked) return false;
    c.totaux.remiseType = cible.value === "montant" ? "montant" : "pourcent";
    c.totaux.remise = 0;
    $("res-remise").value = "";
  } else if (d.res === "remise") c.totaux.remise = c.totaux.remiseType === "pourcent" ? arrondi(borner(valeur, 0, 100, 0), 2) : montantSaisi(valeur);
  else if (d.res === "tva") c.totaux.tva = valeur === true;
  else if (d.res === "tauxTva") c.totaux.tauxTva = arrondi(borner(valeur, 0, TVA_MAX, TVA_DEFAUT), 2);
  else if (d.res === "acompte") c.totaux.acompte = arrondi(borner(valeur, 0, 100, ACOMPTE_DEFAUT), 2);
  else return false;
  return true;
}

function surSaisieResultat(evenement) {
  if (!resultat.chantier || !lireSaisieResultat(evenement.target)) return;
  actualiserResultat();
  planifierResultat();
}

/* En quittant un champ, il affiche la valeur réellement retenue (bornée, arrondie, ou le calcul s'il est vide). */
function surChangementResultat(evenement) {
  const cible = evenement.target;
  const d = cible.dataset;
  if (!resultat.chantier || cible.type === "checkbox" || cible.type === "radio") return;
  const { materiel, etude } = resultat.chiffrage;
  const c = resultat.chantier;
  if (d.matQuantite || d.matPrix) {
    const ligne = materiel.find((l) => l.ref === (d.matQuantite || d.matPrix));
    if (ligne) cible.value = d.matQuantite ? String(ligne.quantite) : formaterDecimal(ligne.prix);
  } else if (d.resMoQuantite || d.resMoPrix) {
    const ligne = etude.mainOeuvre.lignes.find((l) => l.id === (d.resMoQuantite || d.resMoPrix));
    if (ligne) cible.value = d.resMoQuantite ? String(ligne.quantite) : formaterDecimal(ligne.prix);
  } else if (d.resLibre === "montant") {
    const ligne = c.mainOeuvre.libres[Number(d.index)];
    if (ligne) cible.value = ligne.montant ? formaterDecimal(ligne.montant) : "";
  } else if (d.res === "forfait") cible.value = c.mainOeuvre.forfait ? formaterDecimal(c.mainOeuvre.forfait) : "";
  else if (d.res === "ouvriers") cible.value = c.mainOeuvre.journees.ouvriers ? String(c.mainOeuvre.journees.ouvriers) : "";
  else if (d.res === "jours") cible.value = c.mainOeuvre.journees.jours ? formaterDecimal(c.mainOeuvre.journees.jours) : "";
  else if (d.res === "tarif") cible.value = formaterDecimal(etude.mainOeuvre.journees.tarif);
  else if (d.res === "remise") cible.value = c.totaux.remise ? formaterDecimal(c.totaux.remise) : "";
  else if (d.res === "tauxTva") cible.value = formaterDecimal(c.totaux.tauxTva);
  else if (d.res === "acompte") cible.value = formaterDecimal(c.totaux.acompte);
}

function surClicResultat(evenement) {
  const supprimer = evenement.target.closest("[data-supprimer-libre]");
  if (supprimer && resultat.chantier) {
    resultat.chantier.mainOeuvre.libres.splice(Number(supprimer.dataset.supprimerLibre), 1);
    afficherLibresResultat();
    actualiserResultat();
    planifierResultat();
    $("res-ajouter-libre").focus({ preventScroll: true });
  }
}

function ajouterLibreResultat() {
  const libres = resultat.chantier && resultat.chantier.mainOeuvre.libres;
  if (!libres || libres.length >= BORNES_CHANTIER.lignesLibresMax) return;
  libres.push({ libelle: "", montant: 0 });
  afficherLibresResultat();
  $("res-libre-libelle-" + (libres.length - 1)).focus();
  planifierResultat();
}

/* ----- Enregistrement automatique (600 ms après la dernière saisie, et en quittant) ----- */

function planifierResultat() {
  clearTimeout(resultat.minuterie);
  resultat.minuterie = setTimeout(enregistrerResultat, DELAI_BROUILLON);
}

async function enregistrerResultat() {
  clearTimeout(resultat.minuterie);
  resultat.minuterie = 0;
  const c = resultat.chantier;
  if (!c || !etat.compte || c.compteId !== etat.compte.id) return;
  const propre = chantierValide({ ...c, modifieLe: new Date().toISOString() }, etat.compte.id);
  if (!propre) return;
  const bruts = await lireChantiersBruts();
  const index = bruts.findIndex((x) => x.id === propre.id);
  if (index >= 0) bruts[index] = propre;
  else bruts.push(propre);
  const reussi = await ecrireValeur(CLES_STOCKAGE.chantiers, JSON.stringify(bruts));
  c.modifieLe = propre.modifieLe;
  $("etat-resultat").textContent = reussi
    ? "Modifications enregistrées à " + heureCourte(new Date())
    : "Modifications non enregistrées : mémoire de l'appareil indisponible.";
}

/* « Modifier le chantier » : l'étude repart dans l'assistant, qui la réenregistre à la fin. */
async function surModifierChantier() {
  const c = resultat.chantier;
  if (!c || !etat.compte) return;
  await enregistrerResultat();
  if (assistant.minuterie) await enregistrerBrouillon();
  const brouillon = await lireBrouillon(etat.compte.id);
  if (brouillon && brouillon.id !== c.id) {
    const ok = await demanderConfirmation("Remplacer le brouillon ?", "Un autre chantier est en cours de saisie. Son brouillon sera effacé. Les chantiers déjà enregistrés ne sont pas touchés.", "Remplacer", "Annuler");
    if (!ok) return;
  }
  clearTimeout(assistant.minuterie);
  assistant.minuterie = 0;
  const copie = chantierValide(JSON.parse(JSON.stringify(c)), etat.compte.id);
  copie.etape = 1;
  copie.etapeMax = ETAPES_CHANTIER.length;
  assistant.chantier = copie;
  await ecrireBrouillon(copie);
  montrer("nouveau-chantier");
  $("etat-brouillon").textContent = "Modification en cours : enregistrez à la dernière étape pour mettre l'étude à jour.";
}

/* ----- Accueil : accès direct aux trois dernières études ----- */

function creerLigneEtude(chantier, catalogue, codeDevise) {
  const chiffrage = chiffrerChantier(chantier, catalogue.articles, codeDevise, catalogue.mainOeuvre);
  const li = document.createElement("li");
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "ligne-etude";
  bouton.dataset.chantier = chantier.id;
  const texte = document.createElement("div");
  texte.className = "devis-texte";
  const titre = ecrireInsecable(document.createElement("strong"), chantier.nom || "Chantier sans nom");
  const detail = document.createElement("span");
  ecrireInsecable(detail, [chantier.client.nom, formaterDecimal(chiffrage.etude.surfaceTotale) + "\u00A0m²", pluriel(chiffrage.etude.circuits.length, "circuit", "circuits")].filter(Boolean).join(" · "));
  texte.append(titre, detail);
  const droite = document.createElement("div");
  droite.className = "devis-droite";
  const montant = document.createElement("span");
  montant.className = "devis-montant";
  montant.textContent = formaterMontant(chiffrage.total.totalGeneral, codeDevise);
  const voir = document.createElement("span");
  voir.className = "lien-voir";
  voir.textContent = "Voir l'étude";
  droite.append(montant, voir);
  bouton.append(texte, droite);
  li.appendChild(bouton);
  return li;
}

async function afficherEtudesAccueil(compte) {
  const etudes = (await lireChantiers(compte.id)).filter((c) => c.statut === "etudie")
    .sort((a, b) => Date.parse(b.modifieLe) - Date.parse(a.modifieLe)).slice(0, 3);
  const catalogue = etudes.length ? await lireCatalogue() : null;
  $("accueil-etudes").replaceChildren(...etudes.map((c) => creerLigneEtude(c, catalogue, compte.devise)));
  $("bloc-etudes").hidden = etudes.length === 0;
}

function surClicEtude(evenement) {
  const bouton = evenement.target.closest("[data-chantier]");
  if (bouton) ouvrirEtude(bouton.dataset.chantier);
}

/* ==========================================================================
   Mes prix (étape 7) : le catalogue de l'électricien, SEULE source des prix.
   Stockage : bp_v1_catalogue = { [compteId]: { articles: [...], mainOeuvre: { points, journee } } }.
   Aucun catalogue enregistré pour le compte = catalogue de départ ; « Réinitialiser » y revient.
   ========================================================================== */

function catalogueDepart(codeDevise) {
  const fcfa = DEVISES_PRIX_DEFAUT.includes(codeDevise);
  return {
    articles: Object.entries(CATALOGUE_DEFAUT).map(([ref, a]) => ({
      ref, designation: a.designation, unite: a.unite, categorie: a.categorie, fournisseurs: [{ nom: "", prix: fcfa ? a.prix : 0 }], choisi: null
    })),
    mainOeuvre: { points: {}, journee: null }
  };
}

function articleValide(source, decimales) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const ref = typeof source.ref === "string" && (Object.prototype.hasOwnProperty.call(CATALOGUE_DEFAUT, source.ref) || /^perso-[a-f0-9]{8}$/.test(source.ref)) ? source.ref : null;
  if (!ref) return null;
  const defaut = Object.prototype.hasOwnProperty.call(CATALOGUE_DEFAUT, ref) ? CATALOGUE_DEFAUT[ref] : null;
  const designation = texteBorne(source.designation, BORNES_CATALOGUE.designationMax) || (defaut ? defaut.designation : "");
  if (!designation) return null;
  const fournisseurs = (Array.isArray(source.fournisseurs) ? source.fournisseurs : []).slice(0, 50)
    .filter((f) => f && typeof f === "object" && !Array.isArray(f)).slice(0, BORNES_CATALOGUE.fournisseursMax)
    .map((f) => ({ nom: texteBorne(f.nom, BORNES_CATALOGUE.fournisseurMax), prix: montantBorne(f.prix, decimales, 0) }));
  if (!fournisseurs.length) fournisseurs.push({ nom: "", prix: 0 });
  return {
    ref,
    designation,
    unite: typeof source.unite === "string" && Object.prototype.hasOwnProperty.call(UNITES, source.unite) ? source.unite : (defaut ? defaut.unite : "u"),
    categorie: typeof source.categorie === "string" && Object.prototype.hasOwnProperty.call(CATEGORIES_MATERIEL, source.categorie) ? source.categorie : (defaut ? defaut.categorie : "autres"),
    fournisseurs,
    choisi: Number.isInteger(source.choisi) && source.choisi >= 0 && source.choisi < fournisseurs.length ? source.choisi : null
  };
}

/* Validation champ par champ ; un ancien format (sans liste d'articles) est ignoré. */
function catalogueValide(source, codeDevise) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray(source.articles)) return null;
  const dec = decimalesDevise(codeDevise);
  const vus = new Set();
  const articles = [];
  source.articles.slice(0, BORNES_CATALOGUE.articlesMax).forEach((brut) => {
    const article = articleValide(brut, dec);
    if (article && !vus.has(article.ref)) {
      vus.add(article.ref);
      articles.push(article);
    }
  });
  const mo = source.mainOeuvre && typeof source.mainOeuvre === "object" && !Array.isArray(source.mainOeuvre) ? source.mainOeuvre : {};
  const pointsSource = mo.points && typeof mo.points === "object" && !Array.isArray(mo.points) ? mo.points : {};
  const points = {};
  /* Prix habituel : un nombre positif ou nul, sinon ignoré (le prix de départ s'applique). */
  const prixHabituel = (valeur) => (typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0 ? montantBorne(valeur, dec, 0) : null);
  Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => {
    if (!Object.prototype.hasOwnProperty.call(pointsSource, id)) return;
    const prix = prixHabituel(pointsSource[id]);
    if (prix !== null) points[id] = prix;
  });
  return { articles, mainOeuvre: { points, journee: prixHabituel(mo.journee) } };
}

/* Le moins cher des fournisseurs qui ont un prix (−1 si aucun prix). */
function indexMoinsCher(article) {
  let meilleur = -1;
  article.fournisseurs.forEach((f, index) => {
    if (f.prix > 0 && (meilleur < 0 || f.prix < article.fournisseurs[meilleur].prix)) meilleur = index;
  });
  return meilleur;
}

/* Fournisseur retenu : celui choisi par l'électricien, sinon le moins cher automatiquement. */
function indexRetenu(article) {
  if (article.choisi !== null && article.choisi < article.fournisseurs.length) return article.choisi;
  return Math.max(0, indexMoinsCher(article));
}

async function lireCatalogueCompte() {
  const compte = etat.compte;
  const devise = deviseCompte();
  const brut = await lireJson(CLES_STOCKAGE.catalogue);
  const propre = compte && brut && typeof brut === "object" && !Array.isArray(brut) && Object.prototype.hasOwnProperty.call(brut, compte.id)
    ? catalogueValide(brut[compte.id], devise) : null;
  return { catalogue: propre || catalogueDepart(devise), personnalise: Boolean(propre) };
}

/* Catalogue prêt à l'emploi : { articles: { ref: { …, prix, fournisseur } }, liste, mainOeuvre }. */
function resoudreCatalogue(catalogue) {
  const articles = {};
  catalogue.articles.forEach((article) => {
    const retenu = article.fournisseurs[indexRetenu(article)];
    articles[article.ref] = { ...article, prix: retenu.prix, fournisseur: retenu.nom };
  });
  return { articles, liste: catalogue.articles, mainOeuvre: catalogue.mainOeuvre };
}

async function lireCatalogue() {
  return resoudreCatalogue((await lireCatalogueCompte()).catalogue);
}

/* null = revenir au catalogue de départ (« Réinitialiser »). */
async function ecrireCatalogue(catalogue) {
  if (!etat.compte) return false;
  const brut = await lireJson(CLES_STOCKAGE.catalogue);
  const tous = brut && typeof brut === "object" && !Array.isArray(brut) ? brut : {};
  if (catalogue === null) {
    delete tous[etat.compte.id];
  } else {
    const propre = catalogueValide(catalogue, deviseCompte());
    if (!propre) return false;
    tous[etat.compte.id] = propre;
  }
  return ecrireValeur(CLES_STOCKAGE.catalogue, JSON.stringify(tous));
}

function referencePerso() {
  return "perso-" + [...crypto.getRandomValues(new Uint8Array(4))].map((o) => o.toString(16).padStart(2, "0")).join("");
}

function libelleUnite(unite) {
  return unite === "m" ? " le mètre" : (unite === "lot" ? " le lot" : (unite === "forfait" ? " le forfait" : " l'unité"));
}

/* Enregistre le prix d'une ligne de devis dans Mes prix (jamais sans l'accord de l'électricien).
   Article connu : le prix du fournisseur retenu change. Ligne libre : un nouvel article est créé. */
async function enregistrerPrixCatalogue(ligne) {
  const { catalogue } = await lireCatalogueCompte();
  let article = ligne.ref ? catalogue.articles.find((a) => a.ref === ligne.ref) : null;
  if (!article && ligne.ref && Object.prototype.hasOwnProperty.call(CATALOGUE_DEFAUT, ligne.ref)) {
    const d = CATALOGUE_DEFAUT[ligne.ref];
    article = { ref: ligne.ref, designation: d.designation, unite: d.unite, categorie: d.categorie, fournisseurs: [{ nom: ligne.fournisseur, prix: 0 }], choisi: null };
    catalogue.articles.push(article);
  }
  if (!article) {
    if (catalogue.articles.length >= BORNES_CATALOGUE.articlesMax) return null;
    article = { ref: referencePerso(), designation: ligne.designation, unite: ligne.unite, categorie: ligne.categorie, fournisseurs: [{ nom: ligne.fournisseur, prix: 0 }], choisi: null };
    catalogue.articles.push(article);
  }
  const index = indexRetenu(article);
  article.fournisseurs[index].prix = ligne.prix;
  /* Le fournisseur mis à jour reste celui du devis, même s'il n'est plus le moins cher. */
  if (indexMoinsCher(article) !== index) article.choisi = index;
  const ok = await ecrireCatalogue(catalogue);
  return ok ? { ref: article.ref, fournisseur: article.fournisseurs[index].nom } : null;
}

/* ----- Écran « Mes prix » ----- */

const mesPrix = { catalogue: null, minuterie: 0 };

function cleArticle(ref) {
  return ref.replace(/\./g, "_");
}

function construireMesPrix() {
  $("article-categorie").replaceChildren(...Object.entries(CATEGORIES_MATERIEL).map(([id, libelle]) => new Option(libelle, id)));
  $("article-categorie").value = "autres";
  $("article-unite").replaceChildren(...Object.entries(UNITES).map(([id, libelle]) => new Option(libelle, id)));
  $("prix-mo-liste").replaceChildren(...Object.entries(MAIN_OEUVRE_POINTS).map(([id, p]) => [id, p.libelle])
    .map(([id, libelle]) => {
      const li = document.createElement("li");
      li.className = "ligne-prix-mo";
      const entree = creerEntreeTexte("prix-mo-" + id, "decimal", 12, { prixMo: id, regle: "prix" });
      li.appendChild(creerChamp(entree.id, libelle, entree));
      return li;
    }));
}

async function ouvrirMesPrix() {
  if (!etat.compte) return;
  if (mesPrix.minuterie) await enregistrerMesPrix();
  mesPrix.catalogue = (await lireCatalogueCompte()).catalogue;
  $("article-devise").textContent = "(" + (DEVISES[deviseCompte()] || DEVISES.XOF).libelle + ")";
  $("etat-prix").textContent = "";
  afficherArticles();
  remplirMainOeuvreHabituelle();
}

function texteResumeArticle(article) {
  const retenu = article.fournisseurs[indexRetenu(article)];
  return { prix: retenu.prix, fournisseur: retenu.nom };
}

function majResumeArticle(details, article) {
  const { prix, fournisseur } = texteResumeArticle(article);
  const resume = details.querySelector(".article-resume-prix");
  const alerte = details.querySelector(".prix-a-completer");
  const source = details.querySelector(".article-fournisseur");
  resume.textContent = prix ? montantTexte(prix) + libelleUnite(article.unite) : "";
  resume.hidden = !prix;
  alerte.hidden = Boolean(prix);
  ecrireInsecable(source, fournisseur ? "Fournisseur : " + fournisseur : (article.fournisseurs.length > 1 ? "Fournisseur sans nom" : ""));
  ecrireInsecable(details.querySelector(".article-nom"), article.designation);
  const moinsCher = indexMoinsCher(article);
  details.querySelectorAll("[data-badge-fournisseur]").forEach((badge) => {
    badge.hidden = article.fournisseurs.length < 2 || Number(badge.dataset.badgeFournisseur) !== moinsCher;
  });
}

function creerLigneFournisseur(article, fournisseur, index) {
  const cle = cleArticle(article.ref);
  const li = document.createElement("li");
  li.className = "ligne-fournisseur";
  const nom = creerEntreeTexte("art-" + cle + "-f" + index + "-nom", "text", BORNES_CATALOGUE.fournisseurMax, { article: article.ref, fournisseurChamp: "nom", index: String(index) });
  nom.value = fournisseur.nom;
  nom.placeholder = "Ex. : Quincaillerie du marché";
  const prix = creerEntreeTexte("art-" + cle + "-f" + index + "-prix", "decimal", 12, { article: article.ref, fournisseurChamp: "prix", index: String(index), regle: "prix" });
  prix.value = fournisseur.prix ? formaterDecimal(fournisseur.prix) : "";
  prix.placeholder = "0";
  const choix = document.createElement("label");
  choix.className = "case case-fournisseur";
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "choisi-" + cle;
  radio.value = String(index);
  radio.dataset.article = article.ref;
  radio.dataset.choisirFournisseur = String(index);
  radio.checked = article.choisi === index;
  const texteChoix = document.createElement("span");
  texteChoix.textContent = "Toujours celui-ci";
  choix.append(radio, texteChoix);
  const badge = document.createElement("span");
  badge.className = "badge-moins-cher";
  badge.dataset.badgeFournisseur = String(index);
  badge.textContent = "Le moins cher";
  const supprimer = document.createElement("button");
  supprimer.type = "button";
  supprimer.className = "bouton-icone bouton-outil outil-danger";
  supprimer.dataset.article = article.ref;
  supprimer.dataset.supprimerFournisseur = String(index);
  supprimer.setAttribute("aria-label", "Supprimer le fournisseur " + (index + 1));
  supprimer.appendChild(creerIcone("i-poubelle"));
  supprimer.hidden = article.fournisseurs.length < 2;
  const pied = document.createElement("div");
  pied.className = "fournisseur-pied";
  pied.append(choix, badge);
  li.append(creerChamp(nom.id, "Fournisseur " + (index + 1), nom), creerChamp(prix.id, "Prix" + libelleUnite(article.unite).replace(" l'", " par ").replace(" le ", " par "), prix), supprimer, pied);
  return li;
}

function remplirArticle(details, article) {
  const cle = cleArticle(article.ref);
  const corps = details.querySelector(".article-corps");
  const designation = creerEntreeTexte("art-" + cle + "-designation", "text", BORNES_CATALOGUE.designationMax, { article: article.ref, articleChamp: "designation" });
  designation.value = article.designation;
  const unite = document.createElement("select");
  unite.id = "art-" + cle + "-unite";
  unite.dataset.article = article.ref;
  unite.dataset.articleChamp = "unite";
  unite.replaceChildren(...Object.entries(UNITES).map(([id, libelle]) => new Option(libelle, id)));
  unite.value = article.unite;
  const duo = document.createElement("div");
  duo.className = "duo";
  duo.append(creerChamp(designation.id, "Désignation", designation), creerChamp(unite.id, "Unité", unite));
  const liste = document.createElement("ul");
  liste.className = "liste-fournisseurs";
  liste.setAttribute("aria-label", "Fournisseurs");
  liste.replaceChildren(...article.fournisseurs.map((f, index) => creerLigneFournisseur(article, f, index)));
  const auto = document.createElement("label");
  auto.className = "case";
  const radioAuto = document.createElement("input");
  radioAuto.type = "radio";
  radioAuto.name = "choisi-" + cle;
  radioAuto.value = "auto";
  radioAuto.dataset.article = article.ref;
  radioAuto.dataset.choisirFournisseur = "auto";
  radioAuto.checked = article.choisi === null;
  const texteAuto = document.createElement("span");
  texteAuto.textContent = "Prendre automatiquement le moins cher";
  auto.append(radioAuto, texteAuto);
  auto.hidden = article.fournisseurs.length < 2;
  const actions = document.createElement("div");
  actions.className = "article-actions";
  const ajouter = document.createElement("button");
  ajouter.type = "button";
  ajouter.className = "lien-texte";
  ajouter.dataset.article = article.ref;
  ajouter.dataset.ajouterFournisseur = "1";
  ajouter.append(creerIcone("i-plus"), document.createTextNode("Ajouter un fournisseur"));
  ajouter.hidden = article.fournisseurs.length >= BORNES_CATALOGUE.fournisseursMax;
  const supprimer = document.createElement("button");
  supprimer.type = "button";
  supprimer.className = "lien-texte lien-danger";
  supprimer.dataset.article = article.ref;
  supprimer.dataset.supprimerArticle = "1";
  supprimer.append(creerIcone("i-poubelle"), document.createTextNode("Supprimer l'article"));
  actions.append(ajouter, supprimer);
  corps.replaceChildren(duo, liste, auto, actions);
  majResumeArticle(details, article);
}

function creerArticle(article) {
  const li = document.createElement("li");
  li.dataset.ref = article.ref;
  const details = document.createElement("details");
  details.className = "article-prix";
  details.id = "article-" + cleArticle(article.ref);
  const resume = document.createElement("summary");
  const nom = document.createElement("strong");
  nom.className = "article-nom";
  const droite = document.createElement("span");
  droite.className = "article-droite";
  const prix = document.createElement("span");
  prix.className = "article-resume-prix montant";
  const alerte = document.createElement("span");
  alerte.className = "prix-a-completer";
  alerte.textContent = "Prix à compléter";
  droite.append(prix, alerte);
  const source = document.createElement("span");
  source.className = "article-fournisseur";
  resume.append(nom, droite, source);
  const corps = document.createElement("div");
  corps.className = "article-corps";
  details.append(resume, corps);
  li.appendChild(details);
  remplirArticle(details, article);
  return li;
}

function afficherArticles() {
  const articles = mesPrix.catalogue.articles;
  $("prix-groupes").replaceChildren(...Object.entries(CATEGORIES_MATERIEL).map(([categorie, titre]) => {
    const membres = articles.filter((a) => a.categorie === categorie);
    if (!membres.length) return null;
    const bloc = document.createElement("section");
    bloc.className = "carte groupe-prix";
    bloc.dataset.categorie = categorie;
    const h2 = document.createElement("h2");
    h2.className = "bloc-titre";
    h2.textContent = titre;
    const ul = document.createElement("ul");
    ul.className = "liste-articles";
    ul.replaceChildren(...membres.map(creerArticle));
    bloc.append(h2, ul);
    return bloc;
  }).filter(Boolean));
  filtrerArticles();
}

function filtrerArticles() {
  const recherche = normaliser($("prix-recherche").value);
  let visibles = 0;
  document.querySelectorAll("#prix-groupes .groupe-prix").forEach((bloc) => {
    let dansBloc = 0;
    bloc.querySelectorAll(".liste-articles > li").forEach((li) => {
      const article = mesPrix.catalogue.articles.find((a) => a.ref === li.dataset.ref);
      const texte = article ? normaliser([article.designation, CATEGORIES_MATERIEL[article.categorie], ...article.fournisseurs.map((f) => f.nom)].join(" ")) : "";
      li.hidden = Boolean(recherche) && !texte.includes(recherche);
      if (!li.hidden) dansBloc += 1;
    });
    bloc.hidden = dansBloc === 0;
    visibles += dansBloc;
  });
  const total = mesPrix.catalogue.articles.length;
  const aCompleter = mesPrix.catalogue.articles.filter((a) => !texteResumeArticle(a).prix).length;
  $("prix-compte").textContent = (recherche ? visibles + " sur " : "") + pluriel(total, "article", "articles")
    + (aCompleter ? " · " + aCompleter + " à compléter" : "");
  $("prix-vide").hidden = visibles > 0 || total === 0;
}

function remplirMainOeuvreHabituelle() {
  const devise = deviseCompte();
  const mo = mesPrix.catalogue.mainOeuvre;
  Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => {
    const entree = $("prix-mo-" + id);
    if (document.activeElement !== entree) entree.value = formaterDecimal(prixMainOeuvreHabituel(id, devise, mo));
  });
  const journee = $("prix-mo-journee");
  if (document.activeElement !== journee) journee.value = formaterDecimal(tarifJourneeHabituel(devise, mo));
}

function articleDe(element) {
  const ref = element.dataset.article;
  return ref && mesPrix.catalogue ? mesPrix.catalogue.articles.find((a) => a.ref === ref) || null : null;
}

function surSaisieMesPrix(evenement) {
  const cible = evenement.target;
  if (!mesPrix.catalogue) return;
  if (cible.id === "prix-recherche") {
    filtrerArticles();
    return;
  }
  const d = cible.dataset;
  if (d.prixMo) {
    const prix = montantFacultatif(cible.value.trim());
    const mo = mesPrix.catalogue.mainOeuvre;
    if (d.prixMo === "journee") mo.journee = prix;
    else if (prix === null) delete mo.points[d.prixMo];
    else mo.points[d.prixMo] = prix;
    planifierMesPrix();
    return;
  }
  const article = articleDe(cible);
  if (!article) return;
  const details = cible.closest("details");
  if (d.articleChamp === "designation") {
    const texte = texteBorne(cible.value, BORNES_CATALOGUE.designationMax);
    if (texte) article.designation = texte;
  } else if (d.articleChamp === "unite") {
    if (Object.prototype.hasOwnProperty.call(UNITES, cible.value)) article.unite = cible.value;
  } else if (d.fournisseurChamp) {
    const fournisseur = article.fournisseurs[Number(d.index)];
    if (!fournisseur) return;
    if (d.fournisseurChamp === "nom") fournisseur.nom = texteBorne(cible.value, BORNES_CATALOGUE.fournisseurMax);
    else fournisseur.prix = montantSaisi(cible.value.trim());
  } else if (d.choisirFournisseur) {
    if (!cible.checked) return;
    article.choisi = d.choisirFournisseur === "auto" ? null : Number(d.choisirFournisseur);
  } else return;
  majResumeArticle(details, article);
  filtrerArticles();
  planifierMesPrix();
}

/* En quittant un champ, il affiche la valeur réellement retenue. */
function surChangementMesPrix(evenement) {
  const cible = evenement.target;
  const d = cible.dataset;
  if (!mesPrix.catalogue || cible.type === "radio") return;
  if (d.prixMo) {
    remplirMainOeuvreHabituelle();
    return;
  }
  const article = articleDe(cible);
  if (!article) return;
  if (d.articleChamp === "designation") cible.value = article.designation;
  else if (d.fournisseurChamp === "prix") {
    const fournisseur = article.fournisseurs[Number(d.index)];
    if (fournisseur) cible.value = fournisseur.prix ? formaterDecimal(fournisseur.prix) : "";
  } else if (d.articleChamp === "unite") {
    remplirArticle(cible.closest("details"), article);
    $("art-" + cleArticle(article.ref) + "-unite").focus();
  }
}

async function surClicMesPrix(evenement) {
  const bouton = evenement.target.closest("button[data-article]");
  if (!bouton || !mesPrix.catalogue) return;
  const article = articleDe(bouton);
  if (!article) return;
  const details = bouton.closest("details");
  if (bouton.dataset.ajouterFournisseur) {
    if (article.fournisseurs.length >= BORNES_CATALOGUE.fournisseursMax) return;
    article.fournisseurs.push({ nom: "", prix: 0 });
    remplirArticle(details, article);
    $("art-" + cleArticle(article.ref) + "-f" + (article.fournisseurs.length - 1) + "-nom").focus();
  } else if (bouton.dataset.supprimerFournisseur) {
    const index = Number(bouton.dataset.supprimerFournisseur);
    if (article.fournisseurs.length < 2 || !article.fournisseurs[index]) return;
    article.fournisseurs.splice(index, 1);
    if (article.choisi === index) article.choisi = null;
    else if (article.choisi !== null && article.choisi > index) article.choisi -= 1;
    remplirArticle(details, article);
    details.querySelector("[data-ajouter-fournisseur]").focus({ preventScroll: true });
  } else if (bouton.dataset.supprimerArticle) {
    const ok = await demanderConfirmation("Supprimer l'article ?", "« " + article.designation + " » sera retiré de Mes prix. Les devis déjà faits ne changent pas ; dans un nouveau chantier, la ligne sera signalée « Prix à compléter ».", "Supprimer", "Annuler");
    if (!ok) return;
    mesPrix.catalogue.articles = mesPrix.catalogue.articles.filter((a) => a !== article);
    afficherArticles();
    await enregistrerMesPrix();
    afficherToast("Article supprimé de Mes prix.");
    return;
  } else return;
  filtrerArticles();
  planifierMesPrix();
}

async function surAjouterArticle(evenement) {
  evenement.preventDefault();
  if (!mesPrix.catalogue) return;
  const champ = $("article-designation");
  effacerErreur(champ);
  effacerErreur($("article-prix"));
  message("msg-nouvel-article", "");
  const designation = texteBorne(champ.value, BORNES_CATALOGUE.designationMax);
  if (!designation) {
    afficherErreur("article-designation", "Indiquez la désignation de l'article.");
    champ.focus();
    return;
  }
  const prixSaisi = $("article-prix").value.trim();
  const prix = montantFacultatif(prixSaisi);
  if (prixSaisi && prix === null) {
    afficherErreur("article-prix", "Prix invalide : un nombre positif, par exemple 2500.");
    $("article-prix").focus();
    return;
  }
  if (mesPrix.catalogue.articles.length >= BORNES_CATALOGUE.articlesMax) {
    message("msg-nouvel-article", BORNES_CATALOGUE.articlesMax + " articles au maximum.", false);
    return;
  }
  const article = {
    ref: referencePerso(),
    designation,
    unite: Object.prototype.hasOwnProperty.call(UNITES, $("article-unite").value) ? $("article-unite").value : "u",
    categorie: Object.prototype.hasOwnProperty.call(CATEGORIES_MATERIEL, $("article-categorie").value) ? $("article-categorie").value : "autres",
    fournisseurs: [{ nom: texteBorne($("article-fournisseur").value, BORNES_CATALOGUE.fournisseurMax), prix: prix === null ? 0 : arrondi(prix, decimalesDevise(deviseCompte())) }],
    choisi: null
  };
  mesPrix.catalogue.articles.push(article);
  $("prix-recherche").value = "";
  afficherArticles();
  const ok = await enregistrerMesPrix();
  if (!ok) return;
  ["article-designation", "article-fournisseur", "article-prix"].forEach((id) => { $(id).value = ""; });
  message("msg-nouvel-article", "« " + designation + " » ajouté dans « " + CATEGORIES_MATERIEL[article.categorie] + " ».", true);
}

async function surReinitialiserPrix() {
  if (!etat.compte) return;
  const ok = await demanderConfirmation("Revenir aux prix de départ ?", "Tous vos articles, fournisseurs et prix de main-d'œuvre seront remplacés par les prix de départ. Les devis déjà faits ne changent pas.", "Réinitialiser", "Annuler");
  if (!ok) return;
  /* Double confirmation : l'action ne peut pas être annulée. */
  const nombre = mesPrix.catalogue ? mesPrix.catalogue.articles.length : 0;
  const sur = await demanderConfirmation("Vraiment tout réinitialiser ?",
    "Dernière vérification : " + accorderNombre(nombre, "article", "articles") + ", leurs fournisseurs et vos prix de main-d'œuvre seront remplacés. Cette action ne peut pas être annulée.",
    "Oui, tout réinitialiser", "Non, garder mes prix");
  if (!sur) return;
  clearTimeout(mesPrix.minuterie);
  mesPrix.minuterie = 0;
  const reussi = await ecrireCatalogue(null);
  await ouvrirMesPrix();
  $("etat-prix").textContent = reussi ? "Prix de départ rétablis." : "Réinitialisation impossible : mémoire de l'appareil indisponible.";
}

function planifierMesPrix() {
  clearTimeout(mesPrix.minuterie);
  mesPrix.minuterie = setTimeout(enregistrerMesPrix, DELAI_BROUILLON);
}

async function enregistrerMesPrix() {
  clearTimeout(mesPrix.minuterie);
  mesPrix.minuterie = 0;
  if (!mesPrix.catalogue || !etat.compte) return false;
  const reussi = await ecrireCatalogue(mesPrix.catalogue);
  $("etat-prix").textContent = reussi
    ? "Prix enregistrés à " + heureCourte(new Date())
    : "Prix non enregistrés : mémoire de l'appareil indisponible.";
  return reussi;
}

/* ==========================================================================
   Fiche devis (étape 7) : matériel modifiable (lignes supprimées puis restaurées,
   lignes libres), main-d'œuvre 4 modes, remise, TVA, acompte, conditions et note.
   Tout est recalculé à chaque frappe ; enregistrement 600 ms après la dernière saisie.
   ========================================================================== */

const fiche = { id: null, devis: null, calcul: null, catalogue: null, minuterie: 0, lignes: new Map(), lignesMo: new Map() };

function construireFicheDevis() {
  $("devis-statut").replaceChildren(...Object.entries(STATUTS_DEVIS).map(([id, statut]) => new Option(statut.libelle, id)));
}

function ouvrirDevis(id) {
  fiche.id = id;
  montrer("fiche-devis");
}

async function ouvrirFicheDevis() {
  if (!etat.compte) return;
  if (fiche.minuterie) await enregistrerDevis();
  const devis = (await lireDevis(etat.compte.id)).find((d) => d.complet && d.id === fiche.id);
  if (!devis) {
    montrer("accueil", { retour: true });
    return;
  }
  fiche.devis = devis;
  fiche.catalogue = await lireCatalogue();
  $("etat-devis").textContent = "";
  $("devis-mo-habituels").checked = false;
  remplirFicheDevis();
}

function dateCourte(iso) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
}

function remplirFicheDevis() {
  const d = fiche.devis;
  $("devis-numero").textContent = "Devis " + d.numero;
  $("devis-titre").value = d.titre;
  $("devis-client").value = d.client;
  $("devis-client-telephone").value = telephoneAffiche(d.clientTelephone);
  effacerErreur($("devis-client-telephone"));
  $("devis-lieu").value = d.lieu;
  $("devis-statut").value = d.statut;
  $("devis-devise-forfait").textContent = "(" + (DEVISES[deviseCompte()] || DEVISES.XOF).libelle + ")";
  $("devis-conditions").value = d.conditions;
  $("devis-note").value = d.note;
  majEnteteDevis();
  remplirAjoutArticle();
  afficherLignesDevis();
  afficherMainOeuvreDevis();
  remplirTotauxDevis();
  actualiserDevis();
  chargerPhotoTableau(d);
}

function majEnteteDevis() {
  const d = fiche.devis;
  ecrireInsecable($("titre-fiche-devis"), d.titre || "Devis");
  $("devis-infos").replaceChildren(...[d.client, d.lieu, "Créé le " + dateCourte(d.creeLe)].filter(Boolean)
    .map((texte) => ecrireInsecable(document.createElement("span"), texte)));
  const statut = STATUTS_DEVIS[d.statut];
  $("devis-badge").textContent = statut.libelle;
  $("devis-badge").dataset.ton = statut.ton;
}

/* ----- Matériel ----- */

function remplirAjoutArticle() {
  const liste = fiche.catalogue.liste;
  const choix = $("devis-ajout-article");
  const groupes = Object.entries(CATEGORIES_MATERIEL).map(([categorie, titre]) => {
    const membres = liste.filter((a) => a.categorie === categorie);
    if (!membres.length) return null;
    const groupe = document.createElement("optgroup");
    groupe.label = titre;
    groupe.append(...membres.map((a) => {
      const prix = fiche.catalogue.articles[a.ref].prix;
      return new Option(a.designation + " — " + (prix ? montantTexte(prix) : "prix à compléter"), a.ref);
    }));
    return groupe;
  }).filter(Boolean);
  choix.replaceChildren(new Option("Choisir un article de Mes prix…", ""), new Option("Ligne libre (désignation et prix à saisir)", "libre"), ...groupes);
  choix.value = "";
}

function texteInfosLigne(ligne) {
  return [ligne.ref ? null : "Ligne libre", UNITES[ligne.unite] ? "Unité : " + UNITES[ligne.unite] : null, ligne.fournisseur ? "Fournisseur : " + ligne.fournisseur : null]
    .filter(Boolean).join(" · ");
}

function creerLigneMaterielDevis(ligne) {
  const li = document.createElement("li");
  li.className = "ligne-devis";
  li.dataset.ligne = ligne.id;
  const tete = document.createElement("div");
  tete.className = "ligne-devis-tete";
  const designation = creerEntreeTexte("devis-" + ligne.id + "-designation", "text", BORNES_CATALOGUE.designationMax, { ligne: ligne.id, ligneChamp: "designation" });
  designation.value = ligne.designation;
  designation.placeholder = "Ex. : Projecteur LED 50 W";
  const supprimer = document.createElement("button");
  supprimer.type = "button";
  supprimer.className = "bouton-icone bouton-outil outil-danger";
  supprimer.dataset.supprimerLigne = ligne.id;
  supprimer.setAttribute("aria-label", "Supprimer la ligne « " + (ligne.designation || "ligne libre") + " »");
  supprimer.appendChild(creerIcone("i-poubelle"));
  tete.append(creerChamp(designation.id, "Désignation", designation), supprimer);
  const infos = document.createElement("p");
  infos.className = "aide ligne-devis-infos";
  ecrireInsecable(infos, texteInfosLigne(ligne));
  infos.hidden = !infos.textContent;
  const quantite = creerEntreeTexte("devis-" + ligne.id + "-qte", "numeric", 6, { ligne: ligne.id, ligneChamp: "quantite", regle: "quantite" });
  quantite.value = String(ligne.quantite);
  const prix = creerEntreeTexte("devis-" + ligne.id + "-prix", "decimal", 12, { ligne: ligne.id, ligneChamp: "prix", regle: "prix" });
  prix.value = ligne.prix ? formaterDecimal(ligne.prix) : "";
  prix.placeholder = "0";
  const montant = document.createElement("div");
  montant.className = "ligne-mo-montant";
  const etiquette = document.createElement("span");
  etiquette.className = "etiquette-champ";
  etiquette.textContent = "Montant";
  const droite = document.createElement("span");
  droite.className = "montant-et-action";
  const maj = document.createElement("button");
  maj.type = "button";
  maj.className = "bouton-maj-prix";
  maj.dataset.majPrix = ligne.id;
  maj.title = "Mettre à jour dans Mes prix ?";
  maj.setAttribute("aria-label", "Mettre à jour dans Mes prix ?");
  maj.appendChild(creerIcone("i-actualiser"));
  maj.hidden = true;
  const valeur = document.createElement("strong");
  valeur.className = "montant";
  droite.append(maj, valeur);
  montant.append(etiquette, droite);
  const encadre = document.createElement("div");
  encadre.className = "encadre-prix";
  encadre.hidden = true;
  const titreEncadre = document.createElement("strong");
  const texteEncadre = document.createElement("p");
  const enregistrer = document.createElement("button");
  enregistrer.type = "button";
  enregistrer.className = "bouton bouton-compact bouton-jaune";
  enregistrer.dataset.enregistrerPrix = ligne.id;
  enregistrer.append(creerIcone("i-prix"), document.createTextNode("Enregistrer dans Mes prix"));
  encadre.append(titreEncadre, texteEncadre, enregistrer);
  li.append(tete, infos, creerChamp(quantite.id, ligne.unite === "m" ? "Quantité (m)" : "Quantité", quantite), creerChamp(prix.id, "Prix unitaire", prix), montant, encadre);
  return { li, valeur, maj, encadre, titreEncadre, texteEncadre, enregistrer, infos };
}

function afficherLignesDevis() {
  const d = fiche.devis;
  fiche.lignes = new Map();
  const actives = d.lignes.filter((l) => !l.supprimee);
  const supprimees = d.lignes.filter((l) => l.supprimee);
  $("devis-lignes").replaceChildren(...actives.map((ligne) => {
    const element = creerLigneMaterielDevis(ligne);
    fiche.lignes.set(ligne.id, element);
    return element.li;
  }));
  $("devis-lignes-vide").hidden = actives.length > 0;
  const dec = decimalesDevise(deviseCompte());
  $("devis-supprimees").replaceChildren(...supprimees.map((ligne) => {
    const li = document.createElement("li");
    const texte = document.createElement("div");
    texte.className = "devis-texte";
    const nom = ecrireInsecable(document.createElement("strong"), ligne.designation || "Ligne libre");
    const detail = document.createElement("span");
    detail.className = "montant";
    detail.textContent = formaterEntier(ligne.quantite) + " × " + montantTexte(ligne.prix) + " = " + montantTexte(arrondi(ligne.quantite * ligne.prix, dec));
    texte.append(nom, detail);
    const restaurer = document.createElement("button");
    restaurer.type = "button";
    restaurer.className = "bouton bouton-discret bouton-compact";
    restaurer.dataset.restaurerLigne = ligne.id;
    restaurer.setAttribute("aria-label", "Restaurer la ligne « " + (ligne.designation || "ligne libre") + " »");
    restaurer.append(creerIcone("i-actualiser"), document.createTextNode("Restaurer"));
    li.append(texte, restaurer);
    return li;
  }));
  $("devis-bloc-supprimees").hidden = supprimees.length === 0;
  $("devis-titre-supprimees").textContent = "Lignes supprimées (" + supprimees.length + ")";
  $("devis-bouton-ajouter").disabled = d.lignes.length >= BORNES_DEVIS.lignesMax;
}

/* État d'une ligne par rapport à Mes prix : encadré jaune si le prix manque, ↻ si le prix a changé. */
function majEtatPrixLigne(ligne, element) {
  const article = ligne.ref && Object.prototype.hasOwnProperty.call(fiche.catalogue.articles, ligne.ref) ? fiche.catalogue.articles[ligne.ref] : null;
  const prixCatalogue = article ? article.prix : 0;
  const absent = prixCatalogue === 0;
  const aZero = ligne.prix === 0;
  element.encadre.hidden = !(aZero || absent);
  element.titreEncadre.textContent = aZero ? "Prix à compléter" : "Prix absent de Mes prix";
  element.texteEncadre.textContent = aZero
    ? "Saisissez le prix de cette ligne, puis enregistrez-le dans Mes prix : il remplira automatiquement vos prochains devis."
    : "Enregistrez ce prix dans Mes prix pour ne plus avoir à le saisir.";
  element.enregistrer.disabled = aZero;
  element.maj.hidden = aZero || absent || ligne.prix === prixCatalogue;
}

/* ----- Main-d'œuvre ----- */

function afficherMainOeuvreDevis() {
  const mo = fiche.devis.mainOeuvre;
  const calcul = calculerDevis(fiche.devis, deviseCompte()).mainOeuvre;
  fiche.lignesMo = new Map();
  $("devis-mo-points").replaceChildren(...calcul.lignes.map((ligne) => {
    const element = creerLigneModifiable({
      id: "devis-mo-" + ligne.id,
      libelle: ligne.libelle,
      aide: "Calcul de l'étude : " + formaterEntier(ligne.auto),
      libelleQuantite: "Quantité",
      quantite: ligne.quantite,
      prix: ligne.prix,
      donneesQuantite: { devisMoQuantite: ligne.id },
      donneesPrix: { devisMoPrix: ligne.id }
    });
    fiche.lignesMo.set(ligne.id, element);
    return element.li;
  }));
  $("devis-mo-forfait").value = mo.forfait ? formaterDecimal(mo.forfait) : "";
  $("devis-mo-ouvriers").value = mo.journees.ouvriers ? String(mo.journees.ouvriers) : "";
  $("devis-mo-jours").value = mo.journees.jours ? formaterDecimal(mo.journees.jours) : "";
  $("devis-mo-tarif").value = formaterDecimal(mo.journees.tarif);
  afficherLibresDevis();
}

function afficherLibresDevis() {
  const libres = fiche.devis.mainOeuvre.libres;
  $("devis-mo-libres").replaceChildren(...libres.map((ligne, index) => {
    const li = document.createElement("li");
    li.className = "ligne-libre";
    const libelle = creerEntreeTexte("devis-libre-libelle-" + index, "text", 120, { devisLibre: "libelle", index: String(index) });
    libelle.value = ligne.libelle;
    libelle.placeholder = "Ex. : Saignées dans le béton";
    const montant = creerEntreeTexte("devis-libre-montant-" + index, "decimal", 12, { devisLibre: "montant", index: String(index), regle: "prix" });
    montant.value = ligne.montant ? formaterDecimal(ligne.montant) : "";
    montant.placeholder = "0";
    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.className = "bouton-icone bouton-outil outil-danger";
    supprimer.dataset.supprimerLibreDevis = String(index);
    supprimer.setAttribute("aria-label", "Supprimer la ligne libre " + (index + 1));
    supprimer.appendChild(creerIcone("i-poubelle"));
    li.append(creerChamp(libelle.id, "Désignation", libelle), creerChamp(montant.id, "Montant", montant), supprimer);
    return li;
  }));
  $("devis-ajouter-libre").hidden = libres.length >= BORNES_CHANTIER.lignesLibresMax;
}

function remplirTotauxDevis() {
  const t = fiche.devis.totaux;
  cocherPuce("devis-remise-type", t.remiseType);
  $("devis-remise").value = t.remise ? formaterDecimal(t.remise) : "";
  $("devis-tva").checked = t.tva;
  $("devis-taux-tva").value = formaterDecimal(t.tauxTva);
  $("devis-acompte").value = formaterDecimal(t.acompte);
}

/* Recalcul instantané : seules les valeurs calculées sont réécrites, jamais le champ en cours de saisie. */
function actualiserDevis() {
  fiche.calcul = calculerDevis(fiche.devis, deviseCompte());
  const { lignes, totalMateriel, mainOeuvre, total } = fiche.calcul;
  lignes.forEach((ligne) => {
    const element = fiche.lignes.get(ligne.id);
    if (!element) return;
    element.valeur.textContent = montantTexte(ligne.montant);
    majEtatPrixLigne(ligne, element);
  });
  $("devis-total-materiel").textContent = montantTexte(totalMateriel);
  mainOeuvre.lignes.forEach((ligne) => {
    const element = fiche.lignesMo.get(ligne.id);
    if (element) element.valeur.textContent = montantTexte(ligne.montant);
  });
  $("devis-mo-journees").textContent = montantTexte(mainOeuvre.journees.total);
  ecrireMontantFort("devis-total-mo", mainOeuvre.total);
  $("devis-tot-materiel").textContent = montantTexte(total.materiel);
  $("devis-tot-mo").textContent = montantTexte(total.mainOeuvre);
  $("devis-tot-sous-total").textContent = montantTexte(total.sousTotal);
  $("devis-remise").dataset.regle = total.typeRemise === "pourcent" ? "pourcentage" : "prix";
  $("devis-remise-libelle").textContent = total.typeRemise === "pourcent" ? "Remise (%)" : "Remise (" + (DEVISES[deviseCompte()] || DEVISES.XOF).libelle + ")";
  $("devis-tot-remise").textContent = (total.remise ? "−\u00A0" : "") + montantTexte(total.remise);
  $("devis-bloc-taux-tva").hidden = !total.tvaActive;
  $("devis-tot-tva").textContent = total.tvaActive ? montantTexte(total.tva) : "Non appliquée";
  ecrireMontantFort("devis-tot-general", total.totalGeneral);
  $("devis-tot-acompte").textContent = montantTexte(total.acompte);
  $("devis-tot-reste").textContent = montantTexte(total.reste);
  ecrireMontantFort("devis-resume-total", total.totalGeneral);
  majLienWhatsApp($("devis-lien-whatsapp"), $("devis-aide-whatsapp"), fiche.devis, modeleDuDevis(fiche.devis));
}

/* ----- Saisie ----- */

function lireSaisieDevis(cible) {
  const d = fiche.devis;
  const valeur = cible.type === "checkbox" ? cible.checked : String(cible.value);
  const ds = cible.dataset;
  if (ds.ligneChamp) {
    const ligne = d.lignes.find((l) => l.id === ds.ligne);
    if (!ligne) return false;
    if (ds.ligneChamp === "designation") ligne.designation = texteBorne(valeur, BORNES_CATALOGUE.designationMax);
    else if (ds.ligneChamp === "quantite") ligne.quantite = entierBorne(valeur.trim(), 0, BORNES_DEVIS.quantiteMax, 0);
    else ligne.prix = montantSaisi(valeur.trim());
  } else if (ds.devisMoQuantite || ds.devisMoPrix) {
    const point = d.mainOeuvre.points[ds.devisMoQuantite || ds.devisMoPrix];
    if (!point) return false;
    if (ds.devisMoQuantite) point.quantite = entierBorne(valeur.trim(), 0, BORNES_CHANTIER.quantiteMax, 0);
    else point.prix = montantSaisi(valeur.trim());
  } else if (ds.devisLibre) {
    const ligne = d.mainOeuvre.libres[Number(ds.index)];
    if (!ligne) return false;
    if (ds.devisLibre === "libelle") ligne.libelle = texteBorne(valeur, 120);
    else ligne.montant = montantSaisi(valeur.trim());
  } else if (ds.devisMo === "forfait") d.mainOeuvre.forfait = montantSaisi(valeur.trim());
  else if (ds.devisMo === "ouvriers") d.mainOeuvre.journees.ouvriers = entierBorne(valeur.trim(), 0, BORNES_CHANTIER.ouvriersMax, 0);
  else if (ds.devisMo === "jours") d.mainOeuvre.journees.jours = arrondi(borner(valeur.trim(), 0, BORNES_CHANTIER.joursMax, 0), 1);
  else if (ds.devisMo === "tarif") d.mainOeuvre.journees.tarif = montantSaisi(valeur.trim());
  else if (ds.devisTotal === "remiseType") {
    if (!cible.checked) return false;
    d.totaux.remiseType = cible.value === "montant" ? "montant" : "pourcent";
    d.totaux.remise = 0;
    $("devis-remise").value = "";
  } else if (ds.devisTotal === "remise") d.totaux.remise = d.totaux.remiseType === "pourcent" ? arrondi(borner(valeur.trim(), 0, 100, 0), 2) : montantSaisi(valeur.trim());
  else if (ds.devisTotal === "tva") d.totaux.tva = valeur === true;
  else if (ds.devisTotal === "tauxTva") d.totaux.tauxTva = arrondi(borner(valeur.trim(), 0, TVA_MAX, TVA_DEFAUT), 2);
  else if (ds.devisTotal === "acompte") d.totaux.acompte = arrondi(borner(valeur.trim(), 0, 100, ACOMPTE_DEFAUT), 2);
  else if (ds.devisChamp === "statut") {
    if (!Object.prototype.hasOwnProperty.call(STATUTS_DEVIS, valeur)) return false;
    d.statut = valeur;
    majEnteteDevis();
  } else if (ds.devisChamp === "titre" || ds.devisChamp === "client" || ds.devisChamp === "lieu") {
    d[ds.devisChamp] = texteBorne(valeur, ds.devisChamp === "titre" ? BORNES_DEVIS.titreMax : BORNES.texteMax);
    majEnteteDevis();
  } else if (ds.devisChamp === "clientTelephone") {
    /* Numéro retenu seulement s'il est complet (format international) ; sinon aucun numéro. */
    const saisie = valeur.trim();
    const analyse = analyserTelephone(saisie, etat.compte.pays);
    d.clientTelephone = saisie && telephoneValide(analyse) ? versE164(analyse) : "";
    if (!saisie || d.clientTelephone) effacerErreur(cible);
  } else if (ds.devisChamp === "conditions") d.conditions = valeur.slice(0, BORNES.conditionsMax);
  else if (ds.devisChamp === "note") d.note = valeur.slice(0, BORNES_DEVIS.noteMax);
  else return false;
  return true;
}

function surSaisieDevis(evenement) {
  if (!fiche.devis || !lireSaisieDevis(evenement.target)) return;
  actualiserDevis();
  planifierDevis();
}

/* En quittant un champ chiffré, il affiche la valeur réellement retenue (bornée, arrondie). */
function surChangementDevis(evenement) {
  const cible = evenement.target;
  const ds = cible.dataset;
  const d = fiche.devis;
  if (!d || cible.type === "checkbox" || cible.type === "radio") return;
  if (ds.ligneChamp === "quantite" || ds.ligneChamp === "prix") {
    const ligne = d.lignes.find((l) => l.id === ds.ligne);
    if (ligne) cible.value = ds.ligneChamp === "quantite" ? String(ligne.quantite) : (ligne.prix ? formaterDecimal(ligne.prix) : "");
  } else if (ds.devisMoQuantite || ds.devisMoPrix) {
    const point = d.mainOeuvre.points[ds.devisMoQuantite || ds.devisMoPrix];
    if (point) cible.value = ds.devisMoQuantite ? String(point.quantite) : formaterDecimal(point.prix);
  } else if (ds.devisLibre === "montant") {
    const ligne = d.mainOeuvre.libres[Number(ds.index)];
    if (ligne) cible.value = ligne.montant ? formaterDecimal(ligne.montant) : "";
  } else if (ds.devisMo === "forfait") cible.value = d.mainOeuvre.forfait ? formaterDecimal(d.mainOeuvre.forfait) : "";
  else if (ds.devisMo === "ouvriers") cible.value = d.mainOeuvre.journees.ouvriers ? String(d.mainOeuvre.journees.ouvriers) : "";
  else if (ds.devisMo === "jours") cible.value = d.mainOeuvre.journees.jours ? formaterDecimal(d.mainOeuvre.journees.jours) : "";
  else if (ds.devisMo === "tarif") cible.value = formaterDecimal(d.mainOeuvre.journees.tarif);
  else if (ds.devisTotal === "remise") cible.value = d.totaux.remise ? formaterDecimal(d.totaux.remise) : "";
  else if (ds.devisTotal === "tauxTva") cible.value = formaterDecimal(d.totaux.tauxTva);
  else if (ds.devisTotal === "acompte") cible.value = formaterDecimal(d.totaux.acompte);
  else if (ds.devisChamp === "clientTelephone") {
    if (d.clientTelephone) cible.value = telephoneAffiche(d.clientTelephone);
    else if (cible.value.trim()) afficherErreur(cible.id, messageTelephone(analyserTelephone(cible.value.trim(), etat.compte.pays)));
  } else if (ds.ligneChamp === "designation") {
    const element = fiche.lignes.get(ds.ligne);
    const ligne = d.lignes.find((l) => l.id === ds.ligne);
    if (element && ligne) element.li.querySelector("[data-supprimer-ligne]").setAttribute("aria-label", "Supprimer la ligne « " + (ligne.designation || "ligne libre") + " »");
  }
}

function ajouterLigneDevis() {
  const d = fiche.devis;
  const choix = $("devis-ajout-article");
  if (!d) return;
  if (!choix.value) {
    choix.focus();
    return;
  }
  if (d.lignes.length >= BORNES_DEVIS.lignesMax) {
    afficherToast(BORNES_DEVIS.lignesMax + " lignes au maximum par devis.");
    return;
  }
  const article = choix.value === "libre" ? null : (Object.prototype.hasOwnProperty.call(fiche.catalogue.articles, choix.value) ? fiche.catalogue.articles[choix.value] : undefined);
  if (article === undefined) return;
  const id = "l" + (d.lignes.reduce((max, l) => Math.max(max, Number(l.id.slice(1)) || 0), 0) + 1);
  d.lignes.push(article
    ? { id, ref: article.ref, designation: article.designation, unite: article.unite, categorie: article.categorie, quantite: 1, prix: article.prix, fournisseur: article.fournisseur, supprimee: false }
    : { id, ref: null, designation: "", unite: "u", categorie: "autres", quantite: 1, prix: 0, fournisseur: "", supprimee: false });
  choix.value = "";
  afficherLignesDevis();
  actualiserDevis();
  planifierDevis();
  $(article ? "devis-" + id + "-qte" : "devis-" + id + "-designation").focus();
}

/* « Enregistrer dans Mes prix » (prix absent) ou ↻ (prix différent, avec confirmation) :
   le catalogue ne change jamais sans la décision de l'électricien. */
async function envoyerPrixVersCatalogue(ligne) {
  if (!ligne || ligne.prix <= 0) return;
  const article = ligne.ref && Object.prototype.hasOwnProperty.call(fiche.catalogue.articles, ligne.ref) ? fiche.catalogue.articles[ligne.ref] : null;
  if (article && article.prix > 0) {
    const ok = await demanderConfirmation("Mettre à jour dans Mes prix ?",
      "« " + article.designation + " » : " + montantTexte(article.prix) + " → " + montantTexte(ligne.prix) + libelleUnite(article.unite)
      + (article.fournisseur ? " chez " + article.fournisseur : "") + ". Les devis déjà faits ne changent pas.", "Mettre à jour", "Annuler");
    if (!ok) return;
  }
  const enregistre = await enregistrerPrixCatalogue({ ...ligne, designation: ligne.designation || "Article" });
  if (!enregistre) {
    afficherToast("Enregistrement impossible : Mes prix est plein ou la mémoire est indisponible.");
    return;
  }
  ligne.ref = enregistre.ref;
  if (enregistre.fournisseur) ligne.fournisseur = enregistre.fournisseur;
  fiche.catalogue = await lireCatalogue();
  remplirAjoutArticle();
  afficherLignesDevis();
  actualiserDevis();
  planifierDevis();
  afficherToast("Prix enregistré dans Mes prix : il remplira vos prochains devis.");
}

/* « − 10 % » / « + 10 % » sur toute la main-d'œuvre ; « Prix habituels » remet les prix au point
   et le tarif journée de Mes prix (forfait et lignes libres ne changent pas). */
function ajusterMainOeuvreDevis(mode) {
  const d = fiche.devis;
  const devise = deviseCompte();
  if (mode === "habituels") {
    Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => { d.mainOeuvre.points[id].prix = prixMainOeuvreHabituel(id, devise, fiche.catalogue.mainOeuvre); });
    d.mainOeuvre.journees.tarif = tarifJourneeHabituel(devise, fiche.catalogue.mainOeuvre);
  } else {
    const facteur = mode === "plus" ? 1 + AJUSTEMENT_MAIN_OEUVRE : 1 - AJUSTEMENT_MAIN_OEUVRE;
    d.mainOeuvre = mainOeuvreDevisValide(ajusterMainOeuvre(d.mainOeuvre, calculerDevis(d, devise).mainOeuvre, facteur, devise), decimalesDevise(devise));
  }
  afficherMainOeuvreDevis();
  actualiserDevis();
  planifierDevis();
  afficherToast((mode === "habituels" ? "Prix habituels appliqués" : (mode === "plus" ? "Main-d'œuvre + 10 %" : "Main-d'œuvre − 10 %"))
    + " : " + montantTexte(fiche.calcul.mainOeuvre.total));
}

async function surClicDevis(evenement) {
  const bouton = evenement.target.closest("button");
  const d = fiche.devis;
  if (!bouton || !d || bouton.disabled) return;
  const ds = bouton.dataset;
  const ligneDe = (id) => d.lignes.find((l) => l.id === id) || null;
  if (ds.supprimerLigne || ds.restaurerLigne) {
    const ligne = ligneDe(ds.supprimerLigne || ds.restaurerLigne);
    if (!ligne) return;
    ligne.supprimee = Boolean(ds.supprimerLigne);
    afficherLignesDevis();
    actualiserDevis();
    planifierDevis();
    if (ligne.supprimee) {
      $("devis-ajout-article").focus({ preventScroll: true });
      afficherToast("Ligne supprimée. Vous pouvez la restaurer dans « Lignes supprimées ».");
    } else {
      $("devis-" + ligne.id + "-qte").focus();
    }
  } else if (ds.enregistrerPrix || ds.majPrix) {
    await envoyerPrixVersCatalogue(ligneDe(ds.enregistrerPrix || ds.majPrix));
  } else if (ds.supprimerLibreDevis) {
    d.mainOeuvre.libres.splice(Number(ds.supprimerLibreDevis), 1);
    afficherLibresDevis();
    actualiserDevis();
    planifierDevis();
    $("devis-ajouter-libre").focus({ preventScroll: true });
  } else if (ds.ajusterDevis) {
    ajusterMainOeuvreDevis(ds.ajusterDevis);
  }
}

function ajouterLibreDevis() {
  const libres = fiche.devis && fiche.devis.mainOeuvre.libres;
  if (!libres || libres.length >= BORNES_CHANTIER.lignesLibresMax) return;
  libres.push({ libelle: "", montant: 0 });
  afficherLibresDevis();
  $("devis-libre-libelle-" + (libres.length - 1)).focus();
  planifierDevis();
}

/* ----- Enregistrement ----- */

function planifierDevis() {
  clearTimeout(fiche.minuterie);
  fiche.minuterie = setTimeout(enregistrerDevis, DELAI_BROUILLON);
}

async function enregistrerDevis() {
  clearTimeout(fiche.minuterie);
  fiche.minuterie = 0;
  const d = fiche.devis;
  if (!d || !etat.compte || d.compteId !== etat.compte.id) return false;
  const propre = devisValide({ ...d, modifieLe: new Date().toISOString() }, deviseCompte());
  if (!propre) return false;
  const { complet, ...stocke } = propre;
  const bruts = await lireDevisBruts();
  const index = bruts.findIndex((x) => x && typeof x === "object" && x.id === stocke.id && x.compteId === stocke.compteId);
  if (index >= 0) bruts[index] = stocke;
  else bruts.push(stocke);
  const reussi = complet && await ecrireValeur(CLES_STOCKAGE.devis, JSON.stringify(bruts));
  d.modifieLe = propre.modifieLe;
  $("etat-devis").textContent = reussi
    ? "Devis enregistré à " + heureCourte(new Date())
    : "Devis non enregistré : mémoire de l'appareil indisponible.";
  return reussi;
}

/* Les prix de main-d'œuvre affichés deviennent les prix habituels (case cochée, au clic sur Enregistrer). */
async function enregistrerHabituels(calculMainOeuvre) {
  const { catalogue } = await lireCatalogueCompte();
  calculMainOeuvre.lignes.forEach((ligne) => { catalogue.mainOeuvre.points[ligne.id] = ligne.prix; });
  catalogue.mainOeuvre.journee = calculMainOeuvre.journees.tarif;
  return ecrireCatalogue(catalogue);
}

async function surEnregistrerDevis() {
  if (!fiche.devis) return;
  const ok = await enregistrerDevis();
  if (!ok) return;
  let texte = "Devis " + fiche.devis.numero + " enregistré.";
  if ($("devis-mo-habituels").checked) {
    if (await enregistrerHabituels(fiche.calcul.mainOeuvre)) {
      $("devis-mo-habituels").checked = false;
      fiche.catalogue = await lireCatalogue();
      texte += " Ces prix de main-d'œuvre sont désormais vos prix habituels.";
    }
  }
  afficherToast(texte);
}

/* ----- Création depuis le résultat de l'étude ----- */

async function majBoutonsDevisResultat() {
  const c = resultat.chantier;
  if (!c || !etat.compte) return;
  const lies = (await lireDevis(etat.compte.id)).filter((d) => d.complet && d.chantierId === c.id)
    .sort((a, b) => Date.parse(b.creeLe) - Date.parse(a.creeLe));
  const bouton = $("bouton-ouvrir-devis");
  bouton.hidden = lies.length === 0;
  if (lies.length) {
    bouton.dataset.devis = lies[0].id;
    $("libelle-ouvrir-devis").textContent = "Ouvrir le devis " + lies[0].numero;
  }
  $("libelle-creer-devis").textContent = lies.length ? "Créer un autre devis" : "Créer le devis";
}

/* Le devis reprend exactement le chiffrage affiché (prix de Mes prix et corrections du chantier),
   puis vit sa vie : ses prix sont figés. */
async function surCreerDevis() {
  const c = resultat.chantier;
  const compte = etat.compte;
  if (!c || !compte) return;
  await enregistrerResultat();
  actualiserResultat();
  if (!await autoriserNouveauDevis(c.nom || "Installation électrique")) return;
  const existants = await lireDevis(compte.id);
  const numero = await prochainNumeroDevis(compte.id, existants);
  const maintenant = new Date().toISOString();
  const devis = devisValide({
    id: "d" + identifiantCourt().slice(1), compteId: compte.id, numero, statut: "brouillon", creeLe: maintenant, modifieLe: maintenant,
    chantierId: c.id, titre: c.nom || "Installation électrique", client: c.client.nom, clientTelephone: c.client.telephone, lieu: c.lieu,
    ...devisDepuisChiffrage(resultat.chiffrage),
    conditions: typeof compte.conditions === "string" ? compte.conditions : CONDITIONS_DEFAUT,
    note: ""
  }, deviseCompte());
  if (!devis) return;
  const { complet, ...stocke } = devis;
  const reussi = complet && await ecrireValeur(CLES_STOCKAGE.devis, JSON.stringify([...(await lireDevisBruts()), stocke]));
  if (!reussi) {
    $("etat-resultat").textContent = "Devis non créé : mémoire de l'appareil indisponible.";
    return;
  }
  ouvrirDevis(devis.id);
  afficherToast("Devis " + numero + " créé à partir de l'étude.");
  await apresDevisCree();
}

function surOuvrirDevisResultat() {
  const id = $("bouton-ouvrir-devis").dataset.devis;
  if (id) ouvrirDevis(id);
}

/* ==========================================================================
   Feuille A4, PDF et WhatsApp (étape 8). L'impression ne quitte jamais
   l'application : elle remplit la feuille A4 de l'écran « feuille ». Le PDF est
   construit sur l'appareil (creerPdfDevis) puis enregistré dans Documents/BatiPlus
   (Android) ou téléchargé (navigateur) ; repli sur l'impression en cas d'échec.
   ========================================================================== */

const feuille = { id: null, devis: null, modele: null, pdf: null, uri: "", photo: "" };

function telephoneAffiche(e164) {
  if (!e164) return "";
  const analyse = analyserTelephone(e164, etat.compte.pays);
  return analyse.pays ? formaterTelephone(e164, analyse.pays.iso) : e164;
}

function modeleDuDevis(devis) {
  const compte = etat.compte;
  const pays = PAYS_PAR_ISO.get(compte.pays);
  return modeleFeuille(devis, deviseCompte(), etat.abonnement ? etat.abonnement.formule : FORMULE_DEFAUT, {
    nom: compte.nom, entreprise: compte.entreprise || "", telephone: formaterTelephone(compte.telephone, compte.pays),
    ville: compte.ville || "", pays: pays ? pays.nom : ""
  }, telephoneAffiche(devis.clientTelephone));
}

/* Le lien ne peut être que https://wa.me/… (numéro en chiffres, texte encodé). */
function majLienWhatsApp(lien, aide, devis, modele) {
  const url = lienWhatsApp(devis.clientTelephone, messageWhatsApp(modele));
  lien.href = /^https:\/\/wa\.me\/\d*\?text=[A-Za-z0-9%._~!*'()-]*$/.test(url) ? url : "https://wa.me/";
  aide.textContent = devis.clientTelephone ? "" : "Sans numéro du client, WhatsApp vous laissera choisir le contact.";
}

async function surImprimerDevis() {
  if (!fiche.devis) return;
  await enregistrerDevis();
  feuille.id = fiche.devis.id;
  montrer("feuille");
}

async function ouvrirFeuille() {
  if (!etat.compte) return;
  await actualiserAbonnement();
  const devis = (await lireDevis(etat.compte.id)).find((d) => d.complet && d.id === feuille.id);
  if (!devis) {
    montrer("accueil", { retour: true });
    return;
  }
  feuille.devis = devis;
  feuille.pdf = null;
  feuille.uri = "";
  feuille.photo = await lirePhotoTableau(devis.id);
  feuille.modele = modeleDuDevis(devis);
  ecrireInsecable($("titre-feuille"), "Devis " + devis.numero);
  $("etat-feuille").textContent = "";
  const manquants = feuille.modele.aCompleter;
  $("feuille-a-completer").hidden = manquants === 0;
  $("feuille-a-completer").textContent = manquants === 0 ? ""
    : (manquants > 1 ? manquants + " lignes de matériel ont" : "1 ligne de matériel a") + " un prix à 0 : complétez-les dans le devis avant de l'envoyer.";
  /* La vue web d'Android n'imprime pas : le PDF (puis l'impression depuis le PDF) la remplace. */
  $("feuille-bouton-imprimer").hidden = estNatif();
  $("libelle-feuille-pdf").textContent = estNatif() ? "Enregistrer le PDF" : "Télécharger le PDF";
  const logo = feuille.modele.emetteur.logo && etat.compte.logo ? etat.compte.logo : "";
  construireFeuille(feuille.modele, logo, feuille.photo);
  majLienWhatsApp($("feuille-lien-whatsapp"), $("feuille-aide-whatsapp"), devis, feuille.modele);
  ajusterApercuFeuille();
}

function elementFeuille(balise, classe, texte) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

/* Montant d'une cellule : jamais coupé ; les très longs montants passent en plus petit. */
function celluleMontant(texte, fort) {
  const td = elementFeuille("td", "f-nombre" + (fort ? " f-fort" : ""), texte);
  if (texte.length > 20) td.dataset.longueur = "xl";
  else if (texte.length > 15) td.dataset.longueur = "l";
  return td;
}

function tableauFeuille(titre, lignes, libelleSousTotal, sousTotal) {
  const section = elementFeuille("section", "f-section");
  section.appendChild(elementFeuille("h2", "f-titre", titre));
  const table = elementFeuille("table", "f-table");
  const colonnes = elementFeuille("colgroup");
  ["f-c-designation", "f-c-unite", "f-c-qte", "f-c-prix", "f-c-montant"].forEach((classe) => colonnes.appendChild(elementFeuille("col", classe)));
  const entete = elementFeuille("thead");
  const rangee = elementFeuille("tr");
  ["Désignation", "Unité", "Qté", "Prix unitaire", "Montant"].forEach((texte, index) => {
    const th = elementFeuille("th", index > 1 ? "f-nombre" : "", texte);
    th.scope = "col";
    rangee.appendChild(th);
  });
  entete.appendChild(rangee);
  const corps = elementFeuille("tbody");
  if (!lignes.length) {
    const vide = elementFeuille("tr");
    const td = elementFeuille("td", "f-vide", "Aucune ligne");
    td.colSpan = 5;
    vide.appendChild(td);
    corps.appendChild(vide);
  }
  lignes.forEach((ligne) => {
    const tr = elementFeuille("tr", ligne.aCompleter ? "f-a-completer" : "");
    tr.append(ecrireInsecable(elementFeuille("td", "f-designation"), ligne.designation), elementFeuille("td", "", ligne.unite),
      elementFeuille("td", "f-nombre", ligne.quantite), celluleMontant(ligne.prix, false), celluleMontant(ligne.montant, true));
    corps.appendChild(tr);
  });
  const total = elementFeuille("tr", "f-sous-total");
  const libelle = elementFeuille("td", "", libelleSousTotal);
  libelle.colSpan = 4;
  total.append(libelle, celluleMontant(sousTotal, true));
  corps.appendChild(total);
  table.append(colonnes, entete, corps);
  section.appendChild(table);
  return section;
}

function ligneTotalFeuille(libelle, valeur, classe) {
  const tr = elementFeuille("tr", classe || "");
  const th = elementFeuille("th", "", libelle);
  th.scope = "row";
  tr.append(th, celluleMontant(valeur, Boolean(classe)));
  return tr;
}

function construireFeuille(m, logo, photo) {
  const insecable = (texte) => String(texte).replace(/ /g, "\u00A0");
  const tete = elementFeuille("header", "f-tete");
  const emetteur = elementFeuille("div", "f-emetteur");
  if (logo) {
    const image = elementFeuille("img", "f-logo");
    image.alt = "Logo de " + m.emetteur.titre;
    image.src = logo;
    emetteur.appendChild(image);
  } else {
    emetteur.appendChild(elementFeuille("span", "f-initiales", m.emetteur.initiales));
  }
  const infos = elementFeuille("div", "f-infos");
  infos.appendChild(ecrireInsecable(elementFeuille("p", "f-entreprise"), m.emetteur.titre));
  m.emetteur.lignes.forEach((ligne) => infos.appendChild(ecrireInsecable(elementFeuille("p", "f-ligne"), ligne.startsWith("Tél. : ") ? "Tél. : " + insecable(ligne.slice(7)) : ligne)));
  emetteur.appendChild(infos);
  const reference = elementFeuille("div", "f-ref");
  reference.append(elementFeuille("p", "f-type", "DEVIS"), elementFeuille("p", "f-numero", m.numero), elementFeuille("p", "f-date", "Date : " + insecable(m.date)));
  tete.append(emetteur, reference);

  const objet = elementFeuille("p", "f-objet");
  objet.append(elementFeuille("strong", "", "Objet : "), ecrireInsecable(elementFeuille("span"), m.objet));

  const parties = elementFeuille("div", "f-parties");
  const client = elementFeuille("section", "f-bloc");
  client.append(elementFeuille("h2", "f-etiquette", "Client"), ecrireInsecable(elementFeuille("p", "f-nom"), m.client.nom || "—"));
  if (m.client.telephone) client.appendChild(elementFeuille("p", "f-ligne", "Tél. : " + insecable(m.client.telephone)));
  const chantier = elementFeuille("section", "f-bloc");
  chantier.append(elementFeuille("h2", "f-etiquette", "Chantier"), ecrireInsecable(elementFeuille("p", "f-nom"), m.client.lieu || "—"));
  parties.append(client, chantier);

  const bas = elementFeuille("div", "f-bas");
  const gauche = elementFeuille("div", "f-gauche");
  gauche.append(elementFeuille("h2", "f-etiquette", "Montant en lettres"), ecrireInsecable(elementFeuille("p", "f-lettres"), m.lettres));
  if (m.note) gauche.append(elementFeuille("h2", "f-etiquette", "Note"), ecrireInsecable(elementFeuille("p", "f-texte"), m.note));
  if (m.conditions) gauche.append(elementFeuille("h2", "f-etiquette", "Conditions"), ecrireInsecable(elementFeuille("p", "f-texte"), m.conditions));
  const totaux = elementFeuille("table", "f-totaux");
  const corpsTotaux = elementFeuille("tbody");
  m.totaux.forEach((t) => corpsTotaux.appendChild(ligneTotalFeuille(t.libelle, t.valeur)));
  corpsTotaux.append(ligneTotalFeuille("TOTAL GÉNÉRAL", m.totalGeneral, "f-total-general"),
    ligneTotalFeuille(m.acompte.libelle, m.acompte.valeur), ligneTotalFeuille(m.reste.libelle, m.reste.valeur, "f-reste"));
  totaux.appendChild(corpsTotaux);
  bas.append(gauche, totaux);

  const signatures = elementFeuille("div", "f-signatures");
  m.signatures.forEach((s) => {
    const bloc = elementFeuille("div", "f-signature");
    bloc.append(elementFeuille("p", "f-sig-titre", s.titre), elementFeuille("p", "f-sig-aide", s.aide));
    signatures.appendChild(bloc);
  });
  const fin = elementFeuille("div", "f-fin");
  fin.append(signatures, elementFeuille("p", "f-mention", m.mention));

  const morceaux = [tete, objet, parties,
    tableauFeuille("Matériel", m.materiel, "Sous-total matériel", m.sousTotalMateriel),
    tableauFeuille("Main-d'œuvre", m.mainOeuvre, "Sous-total main-d'œuvre", m.sousTotalMainOeuvre),
    bas, fin];
  if (m.pied) morceaux.push(elementFeuille("footer", "f-pied f-filigrane", m.pied));
  /* Annexe : photo du tableau électrique, sur une page à part à l'impression. */
  if (photoTableauValide(photo)) {
    const annexe = elementFeuille("section", "f-annexe");
    const image = elementFeuille("img", "f-photo-tableau");
    image.alt = "Photo du tableau électrique du chantier";
    image.src = photo;
    annexe.append(elementFeuille("h2", "f-annexe-titre", "Annexe — Photo du tableau électrique"), elementFeuille("p", "f-ligne", "Devis " + m.numero), image);
    morceaux.push(annexe);
  }
  $("feuille-a4").replaceChildren(...morceaux);
}

/* Aperçu : la feuille garde sa vraie largeur (210 mm) et est réduite pour tenir dans l'écran. */
function ajusterApercuFeuille() {
  if (montrer.ecranCourant !== "feuille") return;
  const cadre = $("feuille-cadre");
  const largeur = cadre.clientWidth;
  if (!largeur) return;
  cadre.style.setProperty("--echelle", Math.min(1, largeur / LARGEUR_A4_PX).toFixed(4));
}

function imprimerFeuille() {
  delete document.body.dataset.impression;
  vibrer();
  window.print();
}

/* Logo (WebP ou PNG en data:) redessiné en JPEG sur fond blanc pour le PDF. */
function logoEnJpeg(source) {
  return new Promise((resoudre) => {
    const image = new Image();
    const delai = setTimeout(() => resoudre(null), 5000);
    image.onload = () => {
      clearTimeout(delai);
      try {
        const echelle = Math.min(1, 400 / Math.max(image.naturalWidth, image.naturalHeight));
        const toile = document.createElement("canvas");
        toile.width = Math.max(1, Math.round(image.naturalWidth * echelle));
        toile.height = Math.max(1, Math.round(image.naturalHeight * echelle));
        const contexte = toile.getContext("2d");
        contexte.fillStyle = "#FFFFFF";
        contexte.fillRect(0, 0, toile.width, toile.height);
        contexte.drawImage(image, 0, 0, toile.width, toile.height);
        const donnees = toile.toDataURL("image/jpeg", 0.9);
        resoudre(donnees.startsWith("data:image/jpeg;base64,")
          ? { octets: depuisBase64(donnees.slice(23)), largeur: toile.width, hauteur: toile.height } : null);
      } catch (erreur) {
        resoudre(null);
      }
    };
    image.onerror = () => {
      clearTimeout(delai);
      resoudre(null);
    };
    image.src = source;
  });
}

async function pdfDuDevis() {
  if (feuille.pdf) return feuille.pdf;
  const logo = feuille.modele.emetteur.logo && etat.compte.logo ? await logoEnJpeg(etat.compte.logo) : null;
  feuille.pdf = creerPdfDevis(feuille.modele, logo, feuille.photo ? photoTableauPdf(feuille.photo) : null);
  return feuille.pdf;
}

function nomPdfFeuille() {
  return nomFichierDevis(feuille.devis.numero, feuille.devis.client);
}

/* Android : Documents/BatiPlus ; si le dossier est refusé (anciens Android), cache de l'application. */
async function enregistrerPdfNatif(octets, nom) {
  const fichiers = plugin("Filesystem");
  if (!fichiers) throw new Error("Filesystem indisponible");
  const data = versBase64(octets);
  const chemin = DOSSIER_PDF + "/" + nom;
  try {
    const resultat = await fichiers.writeFile({ path: chemin, data, directory: "DOCUMENTS", recursive: true });
    return { uri: resultat.uri, documents: true };
  } catch (erreur) {
    const resultat = await fichiers.writeFile({ path: chemin, data, directory: "CACHE", recursive: true });
    return { uri: resultat.uri, documents: false };
  }
}

function telechargerPdf(octets, nom) {
  const url = URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  lien.rel = "noopener";
  lien.hidden = true;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function echecPdf(erreur) {
  journal("PDF impossible", erreur && erreur.message);
  $("etat-feuille").textContent = "Le PDF n'a pas pu être créé. L'impression s'ouvre à la place : choisissez « Enregistrer au format PDF ».";
  try {
    window.print();
  } catch (e) {
    journal("impression impossible");
  }
}

async function avecBouton(id, action) {
  const bouton = $(id);
  if (bouton.disabled) return;
  bouton.disabled = true;
  try {
    await action();
  } finally {
    bouton.disabled = false;
  }
}

function surEnregistrerPdf() {
  return avecBouton("feuille-bouton-pdf", async () => {
    if (!feuille.devis) return;
    try {
      const octets = await pdfDuDevis();
      const nom = nomPdfFeuille();
      if (estNatif()) {
        const resultat = await enregistrerPdfNatif(octets, nom);
        feuille.uri = resultat.uri;
        $("etat-feuille").textContent = resultat.documents
          ? "PDF enregistré dans Documents/" + DOSSIER_PDF + " : " + nom
          : "PDF prêt (le dossier Documents est fermé sur ce téléphone) : touchez « Partager » pour l'envoyer.";
      } else {
        telechargerPdf(octets, nom);
        $("etat-feuille").textContent = "PDF téléchargé : " + nom;
      }
      vibrer();
      programmerInvitationEnvoi();
    } catch (erreur) {
      echecPdf(erreur);
    }
  });
}

function annulationPartage(erreur) {
  return Boolean(erreur) && (erreur.name === "AbortError" || /cancel|annul/i.test(String(erreur.message || "")));
}

function surPartagerPdf() {
  return avecBouton("feuille-bouton-partager", async () => {
    if (!feuille.devis) return;
    const titre = "Devis " + feuille.devis.numero;
    const texte = (titre + " — " + feuille.modele.totalGeneral).replace(/[\u00A0\u202F]/g, " ");
    try {
      const octets = await pdfDuDevis();
      const nom = nomPdfFeuille();
      if (estNatif()) {
        const partage = plugin("Share");
        if (!partage) throw new Error("Share indisponible");
        if (!feuille.uri) feuille.uri = (await enregistrerPdfNatif(octets, nom)).uri;
        await partage.share({ title: titre, text: texte, files: [feuille.uri], dialogTitle: "Partager le devis" });
        programmerInvitationEnvoi();
        return;
      }
      const fichier = new File([octets], nom, { type: "application/pdf" });
      if (navigator.canShare && navigator.share && navigator.canShare({ files: [fichier] })) {
        await navigator.share({ files: [fichier], title: titre, text: texte });
        programmerInvitationEnvoi();
        return;
      }
      telechargerPdf(octets, nom);
      $("etat-feuille").textContent = "Partage direct indisponible dans ce navigateur : le PDF a été téléchargé (" + nom + "), envoyez-le depuis vos fichiers.";
    } catch (erreur) {
      if (!annulationPartage(erreur)) echecPdf(erreur);
    }
  });
}

/* ==========================================================================
   Mes devis, Mes chantiers, Mes clients, Statistiques (étape 9).
   Toutes les listes sont construites avec createElement/textContent. Une suppression
   demande toujours confirmation, puis peut être annulée pendant 5 secondes.
   ========================================================================== */

const listes = {
  compteId: null,
  devis: { requete: "", statut: "tous", tri: "recents" },
  chantiersRequete: "",
  clientsRequete: "",
  clientEdite: null,
  cacheDevis: [],
  cacheChantiers: [],
  cacheClients: []
};
const annulation = { minuterie: 0, restaurer: null, compteId: null };

/* Filtres remis à zéro quand le compte change (un autre électricien sur le même téléphone). */
function preparerListes() {
  if (listes.compteId === etat.compte.id) return;
  listes.compteId = etat.compte.id;
  listes.devis = { requete: "", statut: "tous", tri: "recents" };
  listes.chantiersRequete = "";
  listes.clientsRequete = "";
  listes.clientEdite = null;
  terminerAnnulation();
}

function construireListes() {
  $("devis-tri").replaceChildren(...Object.entries(TRIS_DEVIS).map(([valeur, libelle]) => {
    const option = document.createElement("option");
    option.value = valeur;
    option.textContent = libelle;
    return option;
  }));
}

function dateListe(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/* Bouton d'action d'une ligne : icône + libellé visible ; aria-label précise l'élément visé. */
function boutonListe(icone, libelle, etiquette, donnees, classe) {
  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "action-liste" + (classe ? " " + classe : "");
  Object.entries(donnees).forEach(([cle, valeur]) => { bouton.dataset[cle] = valeur; });
  bouton.setAttribute("aria-label", etiquette);
  const texte = document.createElement("span");
  texte.textContent = libelle;
  bouton.append(creerIcone(icone), texte);
  return bouton;
}

/* Lien d'action (tel:, wa.me) : l'adresse est vérifiée avant d'être posée. */
function lienListe(icone, libelle, etiquette, adresse, classe) {
  const valide = /^tel:\+\d{6,15}$/.test(adresse) || /^https:\/\/wa\.me\/\d*\?text=[A-Za-z0-9%._~!*'()-]*$/.test(adresse);
  if (!valide) {
    const inactif = boutonListe(icone, libelle, etiquette + " (aucun numéro)", {}, classe);
    inactif.disabled = true;
    return inactif;
  }
  const lien = document.createElement("a");
  lien.className = "action-liste" + (classe ? " " + classe : "");
  lien.href = adresse;
  if (adresse.startsWith("https:")) {
    lien.target = "_blank";
    lien.rel = "noopener noreferrer";
  }
  lien.setAttribute("aria-label", etiquette);
  const texte = document.createElement("span");
  texte.textContent = libelle;
  lien.append(creerIcone(icone), texte);
  return lien;
}

/* Corps d'une ligne : titre, deux lignes de détails, montant et pastille à droite. */
function corpsElement(ouvrir, titre, details, montant, statut) {
  const corps = document.createElement(ouvrir ? "button" : "div");
  corps.className = "element-corps";
  if (ouvrir) {
    corps.type = "button";
    Object.entries(ouvrir.donnees).forEach(([cle, valeur]) => { corps.dataset[cle] = valeur; });
    corps.setAttribute("aria-label", ouvrir.etiquette);
  }
  const texte = document.createElement("span");
  texte.className = "element-texte";
  texte.appendChild(ecrireInsecable(document.createElement("strong"), titre));
  details.filter(Boolean).forEach((ligne) => texte.appendChild(ecrireInsecable(document.createElement("span"), ligne)));
  const droite = document.createElement("span");
  droite.className = "element-droite";
  if (montant) {
    const valeur = document.createElement("span");
    valeur.className = "element-montant";
    valeur.textContent = montant;
    if (montant.length > 18) valeur.dataset.longueur = "long";
    droite.appendChild(valeur);
  }
  if (statut) {
    const pastille = document.createElement("span");
    pastille.className = "statut";
    pastille.dataset.ton = statut.ton;
    pastille.textContent = statut.libelle;
    droite.appendChild(pastille);
  }
  corps.append(texte, droite);
  return corps;
}

function reperElement(liste, cle) {
  const element = [...$(liste).querySelectorAll("[data-element]")].find((li) => li.dataset.element === cle);
  if (element) reperer(element);
}

/* ---------- Annulation d'une suppression (5 s) ---------- */

function proposerAnnulation(texte, restaurer) {
  terminerAnnulation();
  $("toast").hidden = true;
  annulation.restaurer = restaurer;
  annulation.compteId = etat.compte ? etat.compte.id : null;
  ecrireInsecable($("annulation-texte"), texte);
  const barre = $("annulation-barre");
  barre.classList.remove("decompte");
  void barre.offsetWidth;
  barre.classList.add("decompte");
  $("annulation").hidden = false;
  annulation.minuterie = setTimeout(terminerAnnulation, DUREE_ANNULATION);
}

function terminerAnnulation() {
  clearTimeout(annulation.minuterie);
  annulation.minuterie = 0;
  annulation.restaurer = null;
  $("annulation").hidden = true;
}

async function surAnnulerSuppression() {
  const restaurer = annulation.restaurer;
  const memeCompte = Boolean(etat.compte) && etat.compte.id === annulation.compteId;
  terminerAnnulation();
  if (!restaurer || !memeCompte) return;
  const reussi = await restaurer();
  await rafraichirEcranListe();
  afficherToast(reussi ? "Suppression annulée : l'élément est revenu." : "Restauration impossible : mémoire de l'appareil indisponible.");
}

async function rafraichirEcranListe() {
  const ecran = montrer.ecranCourant;
  if (ecran === "devis") await afficherMesDevis();
  else if (ecran === "chantiers") await afficherMesChantiers();
  else if (ecran === "clients") await afficherMesClients();
  else if (ecran === "accueil") await afficherAccueil();
}

/* Retire un objet d'une liste stockée et rend la fonction qui le remet à sa place. */
async function retirerDuStockage(cle, test) {
  const brut = await lireJson(cle);
  const liste = Array.isArray(brut) ? brut : [];
  const index = liste.findIndex((x) => x && typeof x === "object" && test(x));
  if (index < 0) return null;
  const [retire] = liste.splice(index, 1);
  if (!await ecrireValeur(cle, JSON.stringify(liste))) return null;
  return async () => {
    const actuel = await lireJson(cle);
    const nouvelle = Array.isArray(actuel) ? actuel : [];
    if (nouvelle.some((x) => x && typeof x === "object" && x.id === retire.id && x.compteId === retire.compteId)) return true;
    nouvelle.splice(Math.min(index, nouvelle.length), 0, retire);
    return ecrireValeur(cle, JSON.stringify(nouvelle));
  };
}

/* ---------- Mes devis ---------- */

async function ouvrirMesDevis() {
  if (!etat.compte) return;
  preparerListes();
  $("devis-recherche").value = listes.devis.requete;
  $("devis-tri").value = listes.devis.tri;
  await afficherMesDevis();
}

async function afficherMesDevis() {
  if (!etat.compte) return;
  listes.cacheDevis = await lireDevis(etat.compte.id);
  remplirFiltreStatuts();
  rafraichirListeDevis();
}

function remplirFiltreStatuts() {
  const comptes = comptesParStatut(listes.cacheDevis);
  const choix = [["tous", "Tous"], ...Object.entries(STATUTS_DEVIS).map(([cle, s]) => [cle, s.libelle])];
  $("devis-filtre-statut").replaceChildren(...choix.map(([valeur, libelle]) => {
    const label = document.createElement("label");
    label.className = "puce";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "filtre-statut";
    radio.value = valeur;
    radio.dataset.filtreStatut = valeur;
    radio.checked = listes.devis.statut === valeur;
    const texte = document.createElement("span");
    texte.textContent = libelle + "\u00A0(" + comptes[valeur] + ")";
    label.append(radio, texte);
    return label;
  }));
}

function rafraichirListeDevis() {
  const tous = listes.cacheDevis;
  const affiches = filtrerDevis(tous, listes.devis);
  $("liste-devis").replaceChildren(...affiches.map(creerElementDevis));
  $("devis-compte").textContent = affiches.length === tous.length
    ? accorderNombre(tous.length, "devis", "devis")
    : formaterEntier(affiches.length) + " sur " + accorderNombre(tous.length, "devis", "devis");
  const vide = $("devis-vide");
  vide.hidden = affiches.length > 0;
  vide.textContent = tous.length ? "Aucun devis ne correspond à la recherche ou au filtre." : "Aucun devis pour l'instant. Créez un chantier, puis « Créer le devis » depuis le résultat de l'étude.";
}

function creerElementDevis(d) {
  const li = document.createElement("li");
  li.className = "element carte";
  li.dataset.element = d.id;
  const nom = d.numero ? "le devis " + d.numero : "le devis « " + (d.titre || "Devis") + " »";
  const details = [[d.numero, d.client].filter(Boolean).join(" · "), [dateListe(d.creeLe), d.lieu].filter(Boolean).join(" · ")];
  const ouvrir = d.complet ? { donnees: { ouvrirDevis: d.id }, etiquette: "Ouvrir " + nom + " : " + (d.titre || "Devis") + (d.client ? ", " + d.client : "") } : null;
  li.appendChild(corpsElement(ouvrir, d.titre || "Devis", details, formaterMontant(d.total, deviseCompte()), STATUTS_DEVIS[d.statut]));
  const actions = document.createElement("div");
  actions.className = "element-actions";
  if (d.complet) {
    const envoyer = lienListe("i-whatsapp", "Envoyer", "Envoyer " + nom + " par WhatsApp", "https://wa.me/?text=", "action-whatsapp");
    envoyer.dataset.envoyerDevis = d.id;
    actions.append(
      boutonListe("i-copier", "Dupliquer", "Dupliquer " + nom, { dupliquerDevis: d.id }),
      boutonListe("i-imprimer", "Imprimer", "Imprimer " + nom + " ou en faire un PDF", { imprimerDevis: d.id }),
      envoyer,
      boutonListe("i-poubelle", "Supprimer", "Supprimer " + nom, { supprimerDevis: d.id }, "action-danger")
    );
  } else {
    const note = document.createElement("p");
    note.className = "element-note";
    note.textContent = "Ancien devis : gardé pour l'historique et les statistiques.";
    actions.append(note, boutonListe("i-poubelle", "Supprimer", "Supprimer " + nom, { supprimerDevis: d.id }, "action-danger"));
  }
  li.appendChild(actions);
  return li;
}

async function surClicListeDevis(evenement) {
  const cible = evenement.target.closest("[data-ouvrir-devis], [data-dupliquer-devis], [data-imprimer-devis], [data-envoyer-devis], [data-supprimer-devis]");
  if (!cible || !etat.compte) return;
  const ds = cible.dataset;
  if (ds.envoyerDevis) {
    preparerEnvoiDevis(cible, ds.envoyerDevis);
    return;
  }
  vibrer();
  if (ds.ouvrirDevis) ouvrirDevis(ds.ouvrirDevis);
  else if (ds.dupliquerDevis) await dupliquerDevis(ds.dupliquerDevis);
  else if (ds.imprimerDevis) {
    feuille.id = ds.imprimerDevis;
    montrer("feuille");
  } else if (ds.supprimerDevis) await supprimerDevisListe(ds.supprimerDevis);
}

/* Le lien WhatsApp est calculé au moment du toucher (message à jour, aucun calcul inutile). */
function preparerEnvoiDevis(lien, id) {
  const devis = listes.cacheDevis.find((d) => d.complet && d.id === id);
  if (!devis) return;
  majLienWhatsApp(lien, document.createElement("span"), devis, modeleDuDevis(devis));
}

async function dupliquerDevis(id) {
  const compte = etat.compte;
  const tous = await lireDevis(compte.id);
  const source = tous.find((d) => d.complet && d.id === id);
  if (!source) return;
  if (!await autoriserNouveauDevis("")) return;
  const numero = await prochainNumeroDevis(compte.id, tous);
  const maintenant = new Date().toISOString();
  const { complet, total, ...contenu } = JSON.parse(JSON.stringify(source));
  const copie = devisValide({ ...contenu, id: "d" + identifiantCourt().slice(1), numero, statut: "brouillon", creeLe: maintenant, modifieLe: maintenant }, deviseCompte());
  if (!copie) return;
  const { complet: completCopie, ...stocke } = copie;
  const reussi = completCopie && await ecrireValeur(CLES_STOCKAGE.devis, JSON.stringify([...(await lireDevisBruts()), stocke]));
  if (!reussi) {
    afficherToast("Copie impossible : mémoire de l'appareil indisponible.");
    return;
  }
  if (listes.devis.statut !== "tous" && listes.devis.statut !== "brouillon") listes.devis.statut = "tous";
  await afficherMesDevis();
  reperElement("liste-devis", copie.id);
  afficherToast("Copie créée : devis " + numero + " (brouillon), copie de " + source.numero + ".");
  await apresDevisCree();
}

async function supprimerDevisListe(id) {
  const compte = etat.compte;
  const devis = (await lireDevis(compte.id)).find((d) => d.id === id);
  if (!devis) return;
  const nom = devis.numero ? "Le devis " + devis.numero : "Le devis « " + (devis.titre || "Devis") + " »";
  const ok = await demanderConfirmation("Supprimer ce devis ?",
    nom + (devis.client ? " de " + devis.client : "") + " sera supprimé de cet appareil. Vous pourrez annuler pendant 5 secondes. Son numéro ne sera jamais réutilisé.",
    "Supprimer", "Garder le devis");
  if (!ok) return;
  const restaurer = await retirerDuStockage(CLES_STOCKAGE.devis, (x) => x.id === id && x.compteId === compte.id);
  if (!restaurer) {
    afficherToast("Suppression impossible : mémoire de l'appareil indisponible.");
    return;
  }
  await rafraichirEcranListe();
  proposerAnnulation(nom + " a été supprimé.", restaurer);
}

/* ---------- Mes chantiers ---------- */

async function ouvrirMesChantiers() {
  if (!etat.compte) return;
  preparerListes();
  $("chantiers-recherche").value = listes.chantiersRequete;
  await afficherMesChantiers();
}

async function afficherMesChantiers() {
  const compte = etat.compte;
  if (!compte) return;
  const chantiers = (await lireChantiers(compte.id)).filter((c) => c.statut === "etudie")
    .sort((a, b) => Date.parse(b.modifieLe) - Date.parse(a.modifieLe));
  const brouillon = await lireBrouillon(compte.id);
  const devis = await lireDevis(compte.id);
  const catalogue = chantiers.length ? await lireCatalogue() : null;
  const elements = chantiers.map((c) => {
    const chiffrage = chiffrerChantier(c, catalogue.articles, deviseCompte(), catalogue.mainOeuvre);
    return { chantier: c, brouillon: false, surface: chiffrage.etude.surfaceTotale, circuits: chiffrage.etude.circuits.length,
      total: chiffrage.total.totalGeneral, devis: devis.filter((d) => d.chantierId === c.id).length };
  });
  if (brouillon) {
    const surface = brouillon.pieces.reduce((s, p) => s + p.surface, 0);
    elements.unshift({ chantier: brouillon, brouillon: true, surface, circuits: 0, total: null, devis: 0 });
  }
  listes.cacheChantiers = elements;
  rafraichirListeChantiers();
}

function rafraichirListeChantiers() {
  const tous = listes.cacheChantiers;
  const affiches = tous.filter((e) => correspondRecherche([e.chantier.nom, e.chantier.client.nom, e.chantier.lieu, TYPES_CHANTIER[e.chantier.type]], listes.chantiersRequete));
  $("liste-chantiers").replaceChildren(...affiches.map(creerElementChantier));
  $("chantiers-compte").textContent = affiches.length === tous.length
    ? accorderNombre(tous.length, "chantier", "chantiers")
    : formaterEntier(affiches.length) + " sur " + accorderNombre(tous.length, "chantier", "chantiers");
  $("chantiers-vide").hidden = affiches.length > 0;
  $("chantiers-vide-texte").textContent = tous.length ? "Aucun chantier ne correspond à la recherche." : "Aucun chantier pour l'instant. Lancez votre première étude NF C 15-100.";
}

function creerElementChantier(e) {
  const c = e.chantier;
  const li = document.createElement("li");
  li.className = "element carte" + (e.brouillon ? " element-brouillon" : "");
  li.dataset.element = (e.brouillon ? "brouillon-" : "") + c.id;
  const nom = c.nom || "Chantier sans nom";
  const mesures = [c.client.nom, e.surface ? formaterDecimal(e.surface) + "\u00A0m²" : "", e.brouillon ? "" : accorderNombre(e.circuits, "circuit", "circuits")];
  const dates = [(e.brouillon ? "Étape " + c.etape + " sur " + ETAPES_CHANTIER.length : "Modifié le " + dateListe(c.modifieLe)), c.lieu,
    e.devis ? accorderNombre(e.devis, "devis", "devis") : ""];
  const ouvrir = { donnees: e.brouillon ? { reprendreChantier: c.id } : { ouvrirChantier: c.id },
    etiquette: (e.brouillon ? "Reprendre le brouillon « " : "Ouvrir l'étude « ") + nom + " »" };
  li.appendChild(corpsElement(ouvrir, nom, [mesures.filter(Boolean).join(" · "), dates.filter(Boolean).join(" · ")],
    e.total === null ? "" : formaterMontant(e.total, deviseCompte()), STATUTS_CHANTIER[e.brouillon ? "brouillon" : "etudie"]));
  const actions = document.createElement("div");
  actions.className = "element-actions";
  if (!e.brouillon) actions.appendChild(boutonListe("i-copier", "Dupliquer", "Dupliquer le chantier « " + nom + " »", { dupliquerChantier: c.id }));
  actions.appendChild(boutonListe("i-poubelle", e.brouillon ? "Effacer" : "Supprimer", (e.brouillon ? "Effacer le brouillon « " : "Supprimer le chantier « ") + nom + " »",
    e.brouillon ? { effacerBrouillonChantier: c.id } : { supprimerChantier: c.id }, "action-danger"));
  li.appendChild(actions);
  return li;
}

async function surClicListeChantiers(evenement) {
  const cible = evenement.target.closest("[data-ouvrir-chantier], [data-reprendre-chantier], [data-dupliquer-chantier], [data-supprimer-chantier], [data-effacer-brouillon-chantier]");
  if (!cible || !etat.compte) return;
  const ds = cible.dataset;
  vibrer();
  if (ds.ouvrirChantier) ouvrirEtude(ds.ouvrirChantier);
  else if (ds.reprendreChantier) montrer("nouveau-chantier");
  else if (ds.dupliquerChantier) await dupliquerChantier(ds.dupliquerChantier);
  else if (ds.supprimerChantier) await supprimerChantierListe(ds.supprimerChantier);
  else if (ds.effacerBrouillonChantier) await effacerBrouillonListe();
}

async function dupliquerChantier(id) {
  const compte = etat.compte;
  const source = (await lireChantiers(compte.id)).find((c) => c.id === id);
  if (!source) return;
  const maintenant = new Date().toISOString();
  const copie = chantierValide({ ...JSON.parse(JSON.stringify(source)), id: identifiantAleatoire(),
    nom: texteBorne((source.nom || "Chantier") + " (copie)", BORNES.texteMax), creeLe: maintenant, modifieLe: maintenant }, compte.id);
  if (!copie) return;
  const reussi = await ecrireValeur(CLES_STOCKAGE.chantiers, JSON.stringify([...(await lireChantiersBruts()), copie]));
  if (!reussi) {
    afficherToast("Copie impossible : mémoire de l'appareil indisponible.");
    return;
  }
  await afficherMesChantiers();
  reperElement("liste-chantiers", copie.id);
  afficherToast("Chantier dupliqué : « " + copie.nom + " ».");
}

async function supprimerChantierListe(id) {
  const compte = etat.compte;
  const chantier = (await lireChantiers(compte.id)).find((c) => c.id === id);
  if (!chantier) return;
  const nom = chantier.nom || "Chantier sans nom";
  const ok = await demanderConfirmation("Supprimer ce chantier ?",
    "« " + nom + " » sera supprimé de cet appareil. Les devis déjà faits à partir de cette étude sont conservés. Vous pourrez annuler pendant 5 secondes.",
    "Supprimer", "Garder le chantier");
  if (!ok) return;
  const restaurer = await retirerDuStockage(CLES_STOCKAGE.chantiers, (x) => x.id === id && x.compteId === compte.id);
  if (!restaurer) {
    afficherToast("Suppression impossible : mémoire de l'appareil indisponible.");
    return;
  }
  if (resultat.id === id) resultat.id = null;
  await rafraichirEcranListe();
  proposerAnnulation("Chantier « " + nom + " » supprimé.", restaurer);
}

async function effacerBrouillonListe() {
  const compte = etat.compte;
  const brouillon = await lireBrouillon(compte.id);
  if (!brouillon) return;
  const nom = brouillon.nom || "Chantier sans nom";
  const ok = await demanderConfirmation("Effacer ce brouillon ?",
    "La saisie en cours de « " + nom + " » sera effacée. Les chantiers déjà enregistrés ne sont pas touchés. Vous pourrez annuler pendant 5 secondes.",
    "Effacer", "Garder le brouillon");
  if (!ok) return;
  clearTimeout(assistant.minuterie);
  assistant.minuterie = 0;
  if (!await ecrireBrouillon(null)) {
    afficherToast("Suppression impossible : mémoire de l'appareil indisponible.");
    return;
  }
  if (assistant.chantier && assistant.chantier.compteId === compte.id) assistant.chantier = null;
  await rafraichirEcranListe();
  proposerAnnulation("Brouillon « " + nom + " » effacé.", async () => {
    if (await lireBrouillon(compte.id)) return true;
    assistant.chantier = null;
    return ecrireBrouillon(brouillon);
  });
}

/* ---------- Mes clients ---------- */

function clientManuelValide(source, compteId) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (typeof source.id !== "string" || !MOTIF_ID.test(source.id) || source.compteId !== compteId) return null;
  const nom = texteBorne(source.nom, BORNES.texteMax);
  if (!nom) return null;
  return {
    id: source.id, compteId, nom,
    telephone: typeof source.telephone === "string" && /^\+\d{6,15}$/.test(source.telephone) ? source.telephone : "",
    creeLe: dateIsoValide(source.creeLe) ? source.creeLe : new Date().toISOString(),
    modifieLe: dateIsoValide(source.modifieLe) ? source.modifieLe : new Date().toISOString()
  };
}

async function lireClientsBruts() {
  const liste = await lireJson(CLES_STOCKAGE.clients);
  return Array.isArray(liste) ? liste.filter((c) => c && typeof c === "object" && !Array.isArray(c)) : [];
}

async function lireClientsManuels(compteId) {
  return (await lireClientsBruts()).map((c) => clientManuelValide(c, compteId)).filter(Boolean).slice(0, BORNES_LISTES.clientsMax);
}

async function ouvrirMesClients() {
  if (!etat.compte) return;
  preparerListes();
  $("clients-recherche").value = listes.clientsRequete;
  quitterModificationClient();
  await afficherMesClients();
}

async function afficherMesClients() {
  const compte = etat.compte;
  if (!compte) return;
  listes.cacheClients = carnetClients(await lireClientsManuels(compte.id), await lireDevis(compte.id), await lireChantiers(compte.id));
  rafraichirListeClients();
}

function rafraichirListeClients() {
  const tous = listes.cacheClients;
  const affiches = filtrerClients(tous, listes.clientsRequete);
  $("liste-clients").replaceChildren(...affiches.map(creerElementClient));
  $("clients-compte").textContent = affiches.length === tous.length
    ? accorderNombre(tous.length, "client", "clients")
    : formaterEntier(affiches.length) + " sur " + accorderNombre(tous.length, "client", "clients");
  const vide = $("clients-vide");
  vide.hidden = affiches.length > 0;
  vide.textContent = tous.length ? "Aucun client ne correspond à la recherche." : "Aucun client pour l'instant. Ils apparaissent ici dès votre premier devis, ou ajoutez-les ci-dessous.";
}

function creerElementClient(c) {
  const li = document.createElement("li");
  li.className = "element carte element-client";
  li.dataset.element = c.cle;
  const tete = document.createElement("div");
  tete.className = "element-corps";
  const pastille = document.createElement("span");
  pastille.className = "avatar avatar-client";
  pastille.setAttribute("aria-hidden", "true");
  pastille.textContent = initialesDe(c.nom);
  const texte = document.createElement("span");
  texte.className = "element-texte";
  texte.appendChild(ecrireInsecable(document.createElement("strong"), c.nom));
  const telephone = document.createElement("span");
  telephone.className = c.telephone ? "insecable" : "";
  telephone.textContent = c.telephone ? telephoneAffiche(c.telephone) : "Pas de numéro";
  const resume = [c.nombreDevis ? accorderNombre(c.nombreDevis, "devis", "devis") : "Aucun devis",
    c.nombreDevis ? formaterMontant(c.total, deviseCompte()) : "", c.manuelId && !c.nombreDevis ? "ajouté à la main" : ""].filter(Boolean).join(" · ");
  texte.append(telephone, ecrireInsecable(document.createElement("span"), resume));
  tete.append(pastille, texte);
  const actions = document.createElement("div");
  actions.className = "element-actions";
  const chiffres = c.telephone.replace(/\D/g, "");
  actions.append(
    lienListe("i-telephone", "Appeler", "Appeler " + c.nom, c.telephone ? "tel:+" + chiffres : ""),
    lienListe("i-whatsapp", "WhatsApp", "Écrire à " + c.nom + " sur WhatsApp", c.telephone ? lienWhatsApp(c.telephone, "Bonjour " + c.nom + ",") : "", "action-whatsapp")
  );
  const sesDevis = boutonListe("i-devis", "Ses devis", "Voir les devis de " + c.nom, { devisClient: c.cle });
  sesDevis.disabled = c.nombreDevis === 0;
  actions.append(sesDevis, boutonListe("i-crayon", "Modifier", "Modifier le téléphone de " + c.nom, { modifierClient: c.cle }));
  /* Seul un client ajouté à la main, sans devis ni chantier, peut être supprimé : les autres
     viennent de vos documents et réapparaîtraient aussitôt. */
  if (c.manuelId && !c.nombreDevis && !c.nombreChantiers) {
    actions.appendChild(boutonListe("i-poubelle", "Supprimer", "Supprimer " + c.nom + " du carnet", { supprimerClient: c.manuelId }, "action-danger"));
  }
  li.append(tete, actions);
  return li;
}

async function surClicListeClients(evenement) {
  const cible = evenement.target.closest("[data-devis-client], [data-modifier-client], [data-supprimer-client]");
  if (!cible || cible.disabled || !etat.compte) return;
  const ds = cible.dataset;
  const client = listes.cacheClients.find((c) => c.cle === (ds.devisClient || ds.modifierClient));
  if (ds.devisClient && client) {
    listes.devis = { requete: client.nom, statut: "tous", tri: "recents" };
    montrer("devis");
  } else if (ds.modifierClient && client) {
    commencerModificationClient(client);
  } else if (ds.supprimerClient) {
    await supprimerClientListe(ds.supprimerClient);
  }
}

function commencerModificationClient(client) {
  listes.clientEdite = client.cle;
  ["client-nom", "client-telephone"].forEach((id) => effacerErreur($(id)));
  message("msg-client", "");
  $("client-nom").value = client.nom;
  $("client-nom").readOnly = true;
  $("client-telephone").value = client.telephone ? telephoneAffiche(client.telephone) : "";
  $("titre-form-client").textContent = "Modifier le téléphone de " + client.nom;
  $("aide-form-client").textContent = "Le nom vient de vos devis et ne change pas ici. Le numéro saisi sera proposé pour appeler et pour WhatsApp.";
  $("libelle-client-enregistrer").textContent = "Enregistrer le numéro";
  $("bouton-client-annuler").hidden = false;
  $("form-client").scrollIntoView({ block: "center", behavior: defilementDoux() });
  $("client-telephone").focus({ preventScroll: true });
}

function quitterModificationClient() {
  listes.clientEdite = null;
  ["client-nom", "client-telephone"].forEach((id) => effacerErreur($(id)));
  $("client-nom").value = "";
  $("client-nom").readOnly = false;
  $("client-telephone").value = "";
  $("titre-form-client").textContent = "Ajouter un client";
  $("aide-form-client").textContent = "Un client qui porte déjà ce nom est mis à jour, jamais dupliqué.";
  $("libelle-client-enregistrer").textContent = "Ajouter le client";
  $("bouton-client-annuler").hidden = true;
}

function surAnnulerModificationClient() {
  quitterModificationClient();
  message("msg-client", "");
}

/* Lecture stricte du téléphone (vide accepté). Rend undefined si invalide (erreur affichée). */
function lireTelephoneFormulaireClient() {
  const saisie = $("client-telephone").value.trim();
  if (!saisie) return "";
  const analyse = analyserTelephone(saisie, etat.compte.pays);
  if (telephoneValide(analyse)) return versE164(analyse);
  afficherErreur("client-telephone", messageTelephone(analyse));
  return undefined;
}

function surChangementTelephoneClient(evenement) {
  const entree = evenement.currentTarget;
  if (!entree.value.trim()) {
    effacerErreur(entree);
    return;
  }
  const analyse = analyserTelephone(entree.value, etat.compte.pays);
  if (telephoneValide(analyse)) {
    entree.value = telephoneAffiche(versE164(analyse));
    effacerErreur(entree);
  } else {
    afficherErreur("client-telephone", messageTelephone(analyse));
  }
}

async function surEnregistrerClient(evenement) {
  evenement.preventDefault();
  const compte = etat.compte;
  if (!compte) return;
  ["client-nom", "client-telephone"].forEach((id) => effacerErreur($(id)));
  message("msg-client", "");
  const nom = nettoyerTexte($("client-nom").value);
  if (!texteValide(nom, true)) {
    afficherErreur("client-nom", "Indiquez le nom du client (" + BORNES.texteMin + " à " + BORNES.texteMax + " caractères).");
    $("client-nom").focus();
    return;
  }
  const telephone = lireTelephoneFormulaireClient();
  if (telephone === undefined) {
    $("client-telephone").focus();
    return;
  }
  const cle = cleTexte(nom);
  const bruts = await lireClientsBruts();
  const index = bruts.findIndex((x) => clientManuelValide(x, compte.id) && cleTexte(x.nom) === cle);
  const existe = index >= 0 || listes.cacheClients.some((c) => c.cle === cle);
  const maintenant = new Date().toISOString();
  if (index >= 0) {
    bruts[index] = { ...clientManuelValide(bruts[index], compte.id), telephone, modifieLe: maintenant };
  } else {
    if ((await lireClientsManuels(compte.id)).length >= BORNES_LISTES.clientsMax) {
      message("msg-client", "Carnet plein : " + formaterEntier(BORNES_LISTES.clientsMax) + " clients au maximum sur cet appareil.");
      return;
    }
    bruts.push({ id: "c" + identifiantCourt().slice(1), compteId: compte.id, nom, telephone, creeLe: maintenant, modifieLe: maintenant });
  }
  if (!await ecrireValeur(CLES_STOCKAGE.clients, JSON.stringify(bruts))) {
    message("msg-client", "Enregistrement impossible : mémoire de l'appareil indisponible.");
    return;
  }
  const modification = Boolean(listes.clientEdite);
  quitterModificationClient();
  await afficherMesClients();
  message("msg-client", modification || existe ? "Client « " + nom + " » mis à jour." : "Client « " + nom + " » ajouté.", true);
  reperElement("liste-clients", cle);
}

async function supprimerClientListe(id) {
  const compte = etat.compte;
  const client = (await lireClientsManuels(compte.id)).find((c) => c.id === id);
  if (!client) return;
  const ok = await demanderConfirmation("Supprimer ce client ?",
    client.nom + " sera retiré de votre carnet. Vous pourrez annuler pendant 5 secondes.", "Supprimer", "Garder le client");
  if (!ok) return;
  const restaurer = await retirerDuStockage(CLES_STOCKAGE.clients, (x) => x.id === id && x.compteId === compte.id);
  if (!restaurer) {
    afficherToast("Suppression impossible : mémoire de l'appareil indisponible.");
    return;
  }
  await rafraichirEcranListe();
  proposerAnnulation(client.nom + " a été retiré du carnet.", restaurer);
}

/* ---------- Statistiques ---------- */

async function ouvrirStats() {
  const compte = etat.compte;
  if (!compte) return;
  await actualiserAbonnement();
  const pro = formulePayante(etat.abonnement.formule);
  $("stats-verrou-pro").hidden = pro;
  $("stats-details").hidden = !pro;
  const s = statistiquesDetaillees(await lireDevis(compte.id), new Date(), BORNES_LISTES.clientsGraphique);
  const devise = deviseCompte();
  ecrireMontantFort("stats-montant", s.montant);
  $("stats-montant-detail").textContent = s.total ? accorderNombre(s.total, "devis", "devis") + " au total" : "Aucun devis pour l'instant";
  $("stats-taux").textContent = s.taux === null ? "—" : s.taux + "\u00A0%";
  $("stats-taux-detail").textContent = s.total ? accorderNombre(s.acceptes, "devis accepté ou payé", "devis acceptés ou payés") + " sur " + formaterEntier(s.total) : "";
  ecrireMontantFort("stats-accepte", s.montantAccepte);
  $("stats-accepte-detail").textContent = "Devis acceptés et payés";

  const nomMois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(s.mois.annee, s.mois.mois, 1));
  ecrireInsecable($("stats-mois-texte"), nomMois.charAt(0).toLocaleUpperCase("fr-FR") + nomMois.slice(1) + " : "
    + (s.mois.nombre ? accorderNombre(s.mois.nombre, "devis", "devis") + " pour " + formaterMontant(s.mois.montant, devise) + "." : "aucun devis pour l'instant."));
  const p = s.moisPrecedent;
  let comparaison = "Aucun devis le mois dernier : pas de comparaison possible.";
  if (s.variation !== null) {
    comparaison = "Le mois dernier à la même date : " + formaterMontant(p.montantMemeJour, devise) + " ("
      + (s.variation > 0 ? "+\u00A0" : s.variation < 0 ? "−\u00A0" : "") + Math.abs(s.variation) + "\u00A0% ce mois-ci).";
  } else if (p.nombre) {
    comparaison = "Le mois dernier : " + accorderNombre(p.nombre, "devis", "devis") + " pour " + formaterMontant(p.montant, devise) + ", tous après le " + formaterEntier(s.mois.jourCourant) + ".";
  }
  ecrireInsecable($("stats-mois-comparaison"), comparaison);
  dessinerEvolution(s.mois, devise, $("stats-mois-texte").textContent);

  const max = s.parClient.reduce((m, c) => Math.max(m, c.montant), 0);
  $("stats-clients").replaceChildren(...s.parClient.map((c) => {
    const li = document.createElement("li");
    li.className = "stats-barre" + (c.autres ? " stats-autres" : "");
    const tete = document.createElement("div");
    tete.className = "stats-barre-tete";
    const nom = ecrireInsecable(document.createElement("span"), c.nom + " · " + accorderNombre(c.nombre, "devis", "devis"));
    nom.className = "stats-barre-nom";
    const montant = document.createElement("strong");
    montant.className = "stats-barre-montant";
    montant.textContent = formaterMontant(c.montant, devise);
    tete.append(nom, montant);
    const piste = document.createElement("div");
    piste.className = "stats-piste";
    piste.setAttribute("aria-hidden", "true");
    const remplissage = document.createElement("span");
    remplissage.style.width = (max > 0 ? Math.max(2, Math.round((c.montant / max) * 100)) : 0) + "%";
    piste.appendChild(remplissage);
    li.append(tete, piste);
    return li;
  }));
  $("stats-clients-vide").hidden = s.parClient.length > 0;

  $("stats-statuts").replaceChildren(...Object.entries(STATUTS_DEVIS).map(([cle, statut]) => {
    const li = document.createElement("li");
    const pastille = document.createElement("span");
    pastille.className = "statut";
    pastille.dataset.ton = statut.ton;
    pastille.textContent = statut.libelle;
    const nombre = document.createElement("strong");
    nombre.textContent = formaterEntier(s.parStatut[cle]);
    li.append(pastille, nombre);
    return li;
  }));
}

/* Histogramme du mois en SVG : un bâton par jour (montant devisé ce jour-là), aujourd'hui en
   jaune cerclé de violet, jours à venir en simple trait. Le résumé texte est lu par les lecteurs d'écran. */
function dessinerEvolution(mois, devise, resume) {
  const L = 360;
  const H = 168;
  const gauche = 8;
  const droite = 8;
  const haut = 26;
  const bas = 22;
  const largeurUtile = L - gauche - droite;
  const pas = largeurUtile / mois.jours.length;
  const max = mois.jours.reduce((m, j) => Math.max(m, j.montant), 0);
  const svg = svgElement("svg", { viewBox: "0 0 " + L + " " + H, role: "img", class: "graphique-mois", "aria-label": resume });
  const titre = svgElement("title", {});
  titre.textContent = resume;
  svg.appendChild(titre);
  svg.appendChild(svgElement("line", { x1: gauche, y1: H - bas, x2: L - droite, y2: H - bas, class: "graphique-axe" }));
  const legende = svgElement("text", { x: gauche, y: 14, class: "graphique-texte" });
  legende.textContent = max > 0 ? "Plus forte journée : " + formaterMontant(max, devise) : "Aucun montant ce mois-ci";
  svg.appendChild(legende);
  mois.jours.forEach((jour, index) => {
    const x = gauche + index * pas + pas * 0.18;
    const largeur = Math.max(1.5, pas * 0.64);
    const numero = index + 1;
    const hauteurBaton = max > 0 && jour.montant > 0 ? Math.max(3, ((H - haut - bas) * jour.montant) / max) : 0;
    if (numero > mois.jourCourant) {
      svg.appendChild(svgElement("rect", { x, y: H - bas - 3, width: largeur, height: 3, rx: 1, class: "graphique-futur" }));
    } else if (hauteurBaton > 0) {
      svg.appendChild(svgElement("rect", { x, y: H - bas - hauteurBaton, width: largeur, height: hauteurBaton, rx: Math.min(3, largeur / 2),
        class: numero === mois.jourCourant ? "graphique-baton graphique-aujourdhui" : "graphique-baton" }));
    }
    /* 1, 5, 10… et le dernier jour ; un multiple de 5 trop proche du dernier est omis (30/31). */
    if (numero === 1 || numero === mois.jours.length || (numero % 5 === 0 && mois.jours.length - numero >= 3)) {
      const etiquette = svgElement("text", { x: gauche + index * pas + pas / 2, y: H - 6, class: "graphique-texte graphique-jour" });
      etiquette.textContent = String(numero);
      svg.appendChild(etiquette);
    }
  });
  $("stats-graphique").replaceChildren(svg);
}

function surClicDevisAccueil(evenement) {
  const bouton = evenement.target.closest("[data-devis]");
  if (bouton) ouvrirDevis(bouton.dataset.devis);
}

/* ---------- Écran de démarrage natif ---------- */

function masquerSplashNatif() {
  const splash = plugin("SplashScreen");
  if (splash) splash.hide({ fadeOutDuration: 150 }).catch(() => {});
}

/* ==========================================================================
   Initialisation
   ========================================================================== */

function brancherEvenements() {
  document.addEventListener("click", surClicNavigation);
  document.addEventListener("click", surClicInvitation);
  document.addEventListener("click", surClicEnvoiWhatsApp);
  window.addEventListener("afterprint", surApresImpression);
  $("liste-formules").addEventListener("click", surClicFormules);
  $("liste-paiements").addEventListener("click", surClicPaiements);
  $("bouton-reessayer-paiement").addEventListener("click", () => {
    if (abonnementEtat.formuleChoisie) lancerPaiement(abonnementEtat.formuleChoisie);
  });
  $("bouton-passer-pro").addEventListener("click", surClicPasserPro);
  $("bouton-renouveler").addEventListener("click", renouvelerFormule);
  $("bouton-suivi-recu").addEventListener("click", () => imprimerRecu(suiviPaiement.reference));
  $("bouton-suivi-reessayer").addEventListener("click", surReessayerSuivi);
  $("bouton-suivi-verifier").addEventListener("click", surVerifierSuivi);
  $("bouton-suivi-accueil").addEventListener("click", () => {
    vibrer();
    montrer(ECRAN_DEPART);
  });
  $("renouvellement-auto").addEventListener("change", surChangementRenouvellement);
  /* Capture : la règle de saisie passe AVANT les écouteurs des écrans. */
  document.addEventListener("focusin", surFocusNumerique, true);
  document.addEventListener("input", surSaisieNumerique, true);
  document.addEventListener("change", surSaisieNumerique, true);
  $("form-verrou").addEventListener("submit", surDeverrouillage);
  $("bouton-verrou-changer-compte").addEventListener("click", surChangerCompte);
  $("bouton-menu").addEventListener("click", ouvrirTiroir);
  $("bouton-fermer-tiroir").addEventListener("click", fermerTiroir);
  $("voile").addEventListener("click", fermerTiroir);
  $("bouton-theme").addEventListener("click", basculerTheme);
  $("bouton-deconnexion").addEventListener("click", surDeconnexion);

  $("bouton-recherche").addEventListener("click", ouvrirRecherche);
  $("bouton-fermer-recherche").addEventListener("click", fermerRecherche);
  $("recherche").addEventListener("click", surClicFondRecherche);
  $("recherche-saisie").addEventListener("input", surSaisieRecherche);
  $("recherche-saisie").addEventListener("keydown", surToucheRecherche);
  $("recherche-resultats").addEventListener("click", surChoixResultat);

  $("bouton-passer").addEventListener("click", terminerPresentation);
  $("bouton-diapo-suivante").addEventListener("click", surDiapoSuivante);
  const fenetre = $("presentation-fenetre");
  fenetre.addEventListener("pointerdown", surDebutGlisse);
  fenetre.addEventListener("pointermove", surGlisse);
  fenetre.addEventListener("pointerup", surFinGlisse);
  fenetre.addEventListener("pointercancel", surFinGlisse);
  fenetre.addEventListener("dragstart", (e) => e.preventDefault());

  $("onglet-inscription").addEventListener("click", surClicOnglet);
  $("onglet-connexion").addEventListener("click", surClicOnglet);
  $("onglet-inscription").addEventListener("keydown", surToucheOnglets);
  $("onglet-connexion").addEventListener("keydown", surToucheOnglets);
  $("panneau-inscription").addEventListener("submit", surInscription);
  $("panneau-connexion").addEventListener("submit", surConnexion);
  $("ins-telephone").addEventListener("input", surSaisieTelephoneInscription);
  $("ins-pays").addEventListener("change", surChangementPaysInscription);
  $("cnx-telephone").addEventListener("input", surSaisieTelephoneConnexion);
  $("comptes-liste").addEventListener("click", surChoixCompte);
  ["ins-nom", "ins-entreprise", "ins-ville", "ins-conditions", "pro-nom", "pro-entreprise", "pro-ville", "pro-conditions"]
    .forEach((id) => $(id).addEventListener("input", surSaisieChamp));
  document.querySelectorAll(".code-cases").forEach((champ) => {
    champ.addEventListener("focus", surActivationCode);
    champ.addEventListener("click", surActivationCode);
    champ.addEventListener("keydown", surToucheCode);
  });
  document.querySelectorAll(".code-oeil").forEach((bouton) => bouton.addEventListener("click", surOeil));
  $("bouton-conditions").addEventListener("click", ouvrirConditions);
  $("bouton-conditions-apropos").addEventListener("click", ouvrirConditions);
  $("contenu").addEventListener("focusin", surFocusChamp);

  $("carte-infos").addEventListener("submit", surEnregistrerProfil);
  $("pro-telephone").addEventListener("input", surSaisieTelephoneProfil);
  $("pro-pays").addEventListener("change", surChangementPaysProfil);
  $("carte-conditions").addEventListener("submit", surEnregistrerConditions);
  $("pro-conditions").addEventListener("input", majCompteurConditions);
  $("carte-code").addEventListener("submit", surChangerCode);
  $("bouton-photo").addEventListener("click", surChoisirPhoto);
  $("bouton-retirer-photo").addEventListener("click", surRetirerPhoto);
  $("fichier-photo").addEventListener("change", surFichierPhoto);
  $("bouton-photo-tableau").addEventListener("click", surPrendrePhotoTableau);
  $("bouton-retirer-photo-tableau").addEventListener("click", surRetirerPhotoTableau);
  $("fichier-photo-tableau").addEventListener("change", surFichierPhotoTableau);
  $("bouton-logo").addEventListener("click", surChoisirLogo);
  $("bouton-retirer-logo").addEventListener("click", surRetirerLogo);
  $("fichier-logo").addEventListener("change", surFichierLogo);
  $("bouton-exporter").addEventListener("click", surExporter);
  $("bouton-importer").addEventListener("click", surChoisirSauvegarde);
  $("fichier-sauvegarde").addEventListener("change", surFichierSauvegarde);
  $("bouton-deconnexion-profil").addEventListener("click", surDeconnexion);
  $("bouton-changer-compte").addEventListener("click", surChangerCompte);

  const logo = $("logo-apropos");
  logo.addEventListener("pointerdown", surDebutAppuiAdmin);
  logo.addEventListener("pointerup", surFinAppuiAdmin);
  logo.addEventListener("pointerleave", surFinAppuiAdmin);
  logo.addEventListener("pointercancel", surFinAppuiAdmin);
  logo.addEventListener("contextmenu", surMenuContextuelLogo);
  $("form-admin").addEventListener("submit", surAdmin);

  const ecranChantier = $("ecran-nouveau-chantier");
  ecranChantier.addEventListener("input", surSaisieAssistant);
  ecranChantier.addEventListener("change", surSaisieAssistant);
  ecranChantier.addEventListener("click", surBoutonPas);
  document.querySelectorAll(".etape-chantier").forEach((form) => form.addEventListener("submit", surEtapeSuivante));
  $("bouton-etape-suivante").addEventListener("click", surEtapeSuivante);
  $("bouton-etape-precedente").addEventListener("click", surEtapePrecedente);
  $("progression-chantier").addEventListener("click", surClicProgression);
  $("bouton-recommencer-chantier").addEventListener("click", surRecommencerChantier);
  $("resultat-onglets").addEventListener("click", surClicOngletResultat);
  $("resultat-onglets").addEventListener("keydown", surClavierOngletsResultat);
  $("ecran-resultat").addEventListener("input", (evenement) => {
    if (evenement.target.type !== "radio" && evenement.target.type !== "checkbox") surSaisieResultat(evenement);
  });
  $("ecran-resultat").addEventListener("change", (evenement) => {
    if (evenement.target.type === "radio" || evenement.target.type === "checkbox") surSaisieResultat(evenement);
    else surChangementResultat(evenement);
  });
  $("ecran-resultat").addEventListener("click", surClicResultat);
  $("res-ajouter-libre").addEventListener("click", ajouterLibreResultat);
  $("bouton-modifier-chantier").addEventListener("click", surModifierChantier);
  $("accueil-etudes").addEventListener("click", surClicEtude);
  $("accueil-devis").addEventListener("click", surClicDevisAccueil);
  $("bouton-creer-devis").addEventListener("click", surCreerDevis);
  $("bouton-ouvrir-devis").addEventListener("click", surOuvrirDevisResultat);
  const ecranDevis = $("ecran-fiche-devis");
  ecranDevis.addEventListener("input", (evenement) => {
    if (evenement.target.type !== "radio" && evenement.target.type !== "checkbox" && evenement.target.tagName !== "SELECT") surSaisieDevis(evenement);
  });
  ecranDevis.addEventListener("change", (evenement) => {
    if (evenement.target.id === "devis-ajout-article" || evenement.target.id === "devis-mo-habituels") return;
    if (evenement.target.type === "radio" || evenement.target.type === "checkbox" || evenement.target.tagName === "SELECT") surSaisieDevis(evenement);
    else surChangementDevis(evenement);
  });
  ecranDevis.addEventListener("click", surClicDevis);
  $("devis-bouton-ajouter").addEventListener("click", ajouterLigneDevis);
  $("devis-ajouter-libre").addEventListener("click", ajouterLibreDevis);
  $("devis-bouton-enregistrer").addEventListener("click", surEnregistrerDevis);
  $("devis-bouton-imprimer").addEventListener("click", surImprimerDevis);
  $("feuille-bouton-imprimer").addEventListener("click", imprimerFeuille);
  $("feuille-bouton-pdf").addEventListener("click", surEnregistrerPdf);
  $("feuille-bouton-partager").addEventListener("click", surPartagerPdf);
  window.addEventListener("resize", ajusterApercuFeuille);
  $("devis-recherche").addEventListener("input", (e) => { listes.devis.requete = e.currentTarget.value; rafraichirListeDevis(); });
  $("devis-filtre-statut").addEventListener("change", (e) => {
    if (!e.target.dataset.filtreStatut) return;
    listes.devis.statut = e.target.value;
    rafraichirListeDevis();
  });
  $("devis-tri").addEventListener("change", (e) => { listes.devis.tri = e.currentTarget.value; rafraichirListeDevis(); });
  $("liste-devis").addEventListener("click", surClicListeDevis);
  $("chantiers-recherche").addEventListener("input", (e) => { listes.chantiersRequete = e.currentTarget.value; rafraichirListeChantiers(); });
  $("liste-chantiers").addEventListener("click", surClicListeChantiers);
  $("clients-recherche").addEventListener("input", (e) => { listes.clientsRequete = e.currentTarget.value; rafraichirListeClients(); });
  $("liste-clients").addEventListener("click", surClicListeClients);
  $("form-client").addEventListener("submit", surEnregistrerClient);
  $("bouton-client-annuler").addEventListener("click", surAnnulerModificationClient);
  $("client-telephone").addEventListener("change", surChangementTelephoneClient);
  $("bouton-annuler-suppression").addEventListener("click", surAnnulerSuppression);
  const ecranPrix = $("ecran-prix");
  ecranPrix.addEventListener("input", (evenement) => {
    if (evenement.target.type !== "radio" && evenement.target.tagName !== "SELECT") surSaisieMesPrix(evenement);
  });
  ecranPrix.addEventListener("change", (evenement) => {
    if (evenement.target.type === "radio" || (evenement.target.tagName === "SELECT" && evenement.target.dataset.article)) surSaisieMesPrix(evenement);
    surChangementMesPrix(evenement);
  });
  $("prix-groupes").addEventListener("click", surClicMesPrix);
  $("form-nouvel-article").addEventListener("submit", surAjouterArticle);
  $("bouton-reinitialiser-prix").addEventListener("click", surReinitialiserPrix);
  $("bouton-ajouter-piece").addEventListener("click", surAjouterPiece);
  $("piece-surface").addEventListener("input", surSaisieSurfaceAjout);
  $("piece-surface").addEventListener("keydown", surToucheSurfaceAjout);
  $("liste-pieces").addEventListener("input", surSaisiePiece);
  $("liste-pieces").addEventListener("click", surActionPiece);
  $("liste-appareils").addEventListener("input", surSaisieAppareil);
  $("liste-appareils").addEventListener("change", surSaisieAppareil);
  $("etape-chantier-5").addEventListener("input", surSaisieMainOeuvre);
  $("etape-chantier-5").addEventListener("change", surSaisieMainOeuvre);
  $("etape-chantier-5").addEventListener("click", surAjusterAssistant);
  $("liste-lignes-libres").addEventListener("click", surSupprimerLigneLibre);
  $("bouton-ajouter-ligne").addEventListener("click", surAjouterLigneLibre);
  document.addEventListener("visibilitychange", surVisibilite);

  $("modale").addEventListener("click", surClicFondModale);
  $("bouton-fermer-modale").addEventListener("click", surAnnulerModale);
  $("bouton-modale-annuler").addEventListener("click", surAnnulerModale);
  $("bouton-modale-ok").addEventListener("click", surOkModale);

  document.addEventListener("keydown", surToucheClavier);
  document.addEventListener("pointerdown", surAppuiOnde);
  tiroirMobileQuery.addEventListener("change", () => { fermerTiroir(); majAccessibiliteTiroir(); });
  activerGlissementTiroir();
  brancherBoutonRetour();
}

function preparerInterface() {
  $("etat-version").textContent = APP.version;
  $("etat-plateforme").textContent = nomPlateforme();
  surveillerLogos();
  surveillerPhotos();
  construireAssistant();
  construireResultat();
  construireFicheDevis();
  construireMesPrix();
  construireListes();
  construireNavigation();
  masquerLiensAbsents();
  remplirListes("ins", PAYS_DEFAUT, PAYS_PAR_ISO.get(PAYS_DEFAUT).devise);
  creerClavier("clavier-inscription");
  creerClavier("clavier-connexion");
  creerClavier("clavier-verrou");
  creerClavier("clavier-profil");
  Object.keys(codes).forEach(afficherCode);
  activerCode("ins-code");
  activerCode("cnx-code");
  activerCode("ver-code");
  activerCode("pro-ancien");
  construirePoints();
  allerDiapo(0);
  majLienCodeOublie(null);
  brancherEvenements();
  majAccessibiliteTiroir();
}

/* Pendant l'écran de démarrage : thème, compte et choix du premier écran. */
async function choisirPremierEcran() {
  await migrerStockage();
  await purgerPhotosOrphelines();
  await initialiserTheme();
  const presentationVue = await lireValeur(CLES_STOCKAGE.presentationVue) === "1";
  const comptes = await lireComptes();
  choisirOnglet(comptes.length ? "connexion" : "inscription");
  await afficherComptesAppareil();
  const verrou = await lireVerrou();
  if (verrou.jusqua > Date.now()) afficherBlocage(verrou.jusqua);
  const session = await lireSession();
  const compte = session ? comptes.find((c) => c.id === session.compteId) : null;
  if (compte) {
    etat.compte = compte;
    etat.abonnement = await abonnementCourant();
    afficherCompte(compte);
    planifierRappels();
    reprendreActivite(session);
  }
  if (!presentationVue) return "presentation";
  return compte ? ECRAN_DEPART : "connexion";
}

/* Anti-encadrement. La directive CSP frame-ancestors est ignorée dans une balise meta :
   elle sera envoyée en en-tête HTTP avec l'API et le site (étape 14, partie 3). D'ici là,
   une page chargée dans le cadre d'un autre site n'affiche jamais l'application
   (aucun clic piégé possible) mais propose de l'ouvrir dans sa propre fenêtre. */
function pageEncadree() {
  try {
    return window.top !== window.self;
  } catch (erreur) {
    return true;
  }
}

function afficherHorsCadre() {
  const bloc = document.createElement("main");
  bloc.className = "hors-cadre";
  const titre = document.createElement("h1");
  titre.textContent = "BâtiPlus s'ouvre dans sa propre fenêtre";
  const texte = document.createElement("p");
  texte.textContent = "Pour votre sécurité, l'application ne s'affiche pas à l'intérieur d'une autre page.";
  const lien = document.createElement("a");
  lien.className = "bouton bouton-principal";
  lien.href = location.origin + location.pathname;
  lien.target = "_blank";
  lien.rel = "noopener noreferrer";
  lien.textContent = "Ouvrir BâtiPlus";
  bloc.append(titre, texte, lien);
  document.body.replaceChildren(bloc);
}

async function demarrer() {
  if (pageEncadree()) {
    afficherHorsCadre();
    return;
  }
  masquerSplashNatif();
  preparerInterface();
  montrer("demarrage");
  initialiserToile();
  const [, premierEcran] = await Promise.all([attendre(DUREE_DEMARRAGE), choisirPremierEcran()]);
  montrer(premierEcran);
  surveillerInactivite();
  ecouterRetourPaiement();
  if (location.hash.startsWith("#paiement-retour")) await surRetourPaiement();
  else verifierPaiementEnAttente();
  await surveillerReseau();
  journal("démarrage terminé");
}

demarrer();
