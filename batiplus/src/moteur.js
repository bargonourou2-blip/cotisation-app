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
  resoudreModale: null
};

/* Codes en cours de saisie : jamais dans le DOM, jamais stockés. */
const codes = { "ins-code": "", "ins-confirmation": "", "cnx-code": "", "pro-ancien": "", "pro-nouveau": "", "pro-confirmation": "" };
const codesVisibles = new Set();
const cibleClavier = { "clavier-inscription": "ins-code", "clavier-connexion": "cnx-code", "clavier-profil": "pro-ancien" };
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

function vibrer() {
  const haptics = plugin("Haptics");
  if (haptics) haptics.impact({ style: "LIGHT" }).catch(() => {});
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
  const destination = !estEcranEntree(id) && !etat.compte ? "connexion" : id;
  const cible = $("ecran-" + destination);
  if (!cible) {
    journal("écran inexistant :", destination);
    return false;
  }
  const precedent = montrer.ecranCourant;
  const retour = Boolean(options && options.retour);
  if (precedent === "resultat" && destination !== "resultat" && resultat.minuterie) enregistrerResultat();
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
   Ordre : modale → recherche → tiroir → diapositive précédente → historique
   (confirmation si un travail n'est pas enregistré) → accueil → quitter. */

async function surBoutonRetour() {
  if (!$("modale").hidden) {
    fermerModale(false);
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

function formaterMontant(montant, codeDevise) {
  const devise = DEVISES[codeDevise] || DEVISES.XOF;
  const nombre = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: devise.decimales,
    maximumFractionDigits: devise.decimales
  }).format(montant);
  return nombre + "\u00A0" + devise.libelle;
}

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
function codeTrivial(code) {
  if (/^(\d)\1+$/.test(code)) return true;
  const chiffres = [...code].map(Number);
  const montante = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 1) % 10);
  const descendante = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 9) % 10);
  if (montante || descendante) return true;
  const moitie = code.length / 2;
  return Number.isInteger(moitie) && moitie >= 2 && code.slice(0, moitie) === code.slice(moitie)
    || code.length === 4 && code.slice(0, 2) === code.slice(2);
}

function erreurCodeNeuf(code) {
  if (code.length < CODE.longueurMin || code.length > CODE.longueurMax || !/^\d+$/.test(code)) {
    return "Le code doit comporter de 4 à 6 chiffres.";
  }
  if (codeTrivial(code)) return "Code trop simple (comme 1234 ou 0000). Choisissez-en un moins évident.";
  return "";
}

/* ---------- Cryptographie (WebCrypto) ---------- */

function cryptoDisponible() {
  return Boolean(window.isSecureContext && window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
}

function versBase64(octets) {
  let binaire = "";
  octets.forEach((octet) => { binaire += String.fromCharCode(octet); });
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
  await ecrireValeur(CLES_STOCKAGE.session, JSON.stringify({ compteId: compte.id, ouverte: Date.now() }));
  etat.compte = compte;
  etat.abonnement = abonnementCourant();
  afficherCompte(compte);
}

async function fermerSession() {
  if (assistant.minuterie) await enregistrerBrouillon();
  if (resultat.minuterie) await enregistrerResultat();
  assistant.chantier = null;
  resultat.chantier = null;
  resultat.id = null;
  await supprimerValeur(CLES_STOCKAGE.session);
  etat.compte = null;
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

function afficherBlocage(jusqua) {
  clearInterval(etat.minuterieBlocage);
  const mettreAJour = () => {
    const reste = jusqua - Date.now();
    if (reste <= 0) {
      clearInterval(etat.minuterieBlocage);
      $("msg-blocage").hidden = true;
      $("bouton-connexion").disabled = false;
      return;
    }
    $("msg-blocage").hidden = false;
    $("bouton-connexion").disabled = true;
    $("texte-blocage").textContent = "Trop d'essais. Réessayez dans " + formaterDuree(reste) + ".";
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

/* ---------- Identité affichée partout (en-tête, tiroir, accueil, profil) ---------- */

function prenom(nom) {
  return String(nom || "").split(" ").filter(Boolean)[0] || "";
}

function initiales(nom) {
  const lettres = String(nom || "").split(" ").filter(Boolean)
    .map((mot) => (mot.match(/\p{L}|\p{N}/u) || [""])[0])
    .filter(Boolean);
  return (lettres.slice(0, 2).join("") || "?").toLocaleUpperCase("fr-FR");
}

/* Formule : le front ne lit JAMAIS la formule dans le stockage local (on ne peut
   pas s'attribuer le Pro en modifiant un fichier). Elle viendra du compte vérifié
   en ligne ; d'ici là, tout compte est en formule gratuite. */
function abonnementCourant() {
  return { formule: FORMULE_DEFAUT, fin: null };
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
  return Math.max(0, Math.ceil((fin - Date.now()) / 86400000));
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
  document.querySelectorAll("[data-nom]").forEach((el) => { el.textContent = nom; });
  document.querySelectorAll("[data-initiales]").forEach((el) => { el.textContent = compte ? initiales(nom) : ""; });
  document.querySelectorAll("[data-photo]").forEach((img) => afficherImage(img, compte ? compte.photo : ""));
  document.querySelectorAll("[data-formule]").forEach((el) => { el.textContent = libelleFormule(etat.abonnement); });
  $("bouton-avatar").setAttribute("aria-label", compte ? "Mon profil — " + nom : "Mon profil");
  $("profil-telephone").textContent = compte ? formaterTelephone(compte.telephone, compte.pays) : "";
}

/* ---------- Devis enregistrés (lecture seule à cette étape) ---------- */

function devisValide(devis) {
  return Boolean(devis) && typeof devis.id === "string" && typeof devis.compteId === "string"
    && typeof devis.titre === "string" && typeof devis.client === "string"
    && Number.isFinite(devis.total) && devis.total >= 0 && devis.total <= 1e13
    && Object.prototype.hasOwnProperty.call(STATUTS_DEVIS, devis.statut)
    && typeof devis.creeLe === "string" && !Number.isNaN(Date.parse(devis.creeLe));
}

async function lireDevis(compteId) {
  const liste = await lireJson(CLES_STOCKAGE.devis);
  return Array.isArray(liste) ? liste.filter(devisValide).filter((d) => d.compteId === compteId) : [];
}

function statistiques(devis) {
  const maintenant = new Date();
  const duMois = devis.filter((d) => {
    const date = new Date(d.creeLe);
    return date.getFullYear() === maintenant.getFullYear() && date.getMonth() === maintenant.getMonth();
  });
  const acceptes = devis.filter((d) => d.statut === "accepte").length;
  return {
    total: devis.length,
    mois: duMois.length,
    acceptes,
    montant: devis.reduce((somme, d) => somme + d.total, 0),
    clients: new Set(devis.map((d) => normaliser(d.client)).filter(Boolean)).size,
    taux: devis.length ? Math.round((acceptes / devis.length) * 100) : null
  };
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
  titre.textContent = devis.titre;
  const client = document.createElement("span");
  client.textContent = devis.client;
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
  li.append(texte, droite);
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
  $("accueil-quota").textContent = formule.illimite ? "Devis illimités" : stats.mois + " / " + LIMITE_GRATUITE + " devis ce mois";
  $("bouton-passer-pro").hidden = formule.illimite || !ecranExiste("abonnement");

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
  $("astuce-texte").textContent = astuceDuJour();
  await afficherEtudesAccueil(compte);
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
  if (mode === "photo") {
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
  let qualite = IMAGES.qualite;
  let donnees = exporterImage(toile, mode, qualite);
  while (donnees.length > IMAGES.donneesMax && qualite > 0.4) {
    qualite -= 0.14;
    donnees = toile.toDataURL(mode === "logo" ? "image/webp" : "image/jpeg", qualite);
  }
  if (donnees.length > IMAGES.donneesMax || !DONNEES_IMAGE.test(donnees)) throw new Error("taille");
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

function lireNombre(valeur) {
  if (typeof valeur === "number") return valeur;
  if (typeof valeur !== "string") return NaN;
  const texte = valeur.replace(/[\s\u00A0\u202F]/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(texte) && !/^-?\.\d+$/.test(texte)) return NaN;
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

/* Main-d'œuvre : 4 modes cumulables (au point, forfait, journées, lignes libres). */
function calculerMainOeuvre(saisie, quantitesAuto, codeDevise) {
  const mo = saisie && typeof saisie === "object" ? saisie : {};
  const points = mo.points && typeof mo.points === "object" ? mo.points : {};
  const dec = decimalesDevise(codeDevise);
  const lignes = Object.keys(MAIN_OEUVRE_POINTS).map((id) => {
    const reglage = points[id] && typeof points[id] === "object" ? points[id] : {};
    const auto = quantitesAuto[id] || 0;
    const quantite = saisieManuelle(reglage.quantite) ? entierBorne(reglage.quantite, 0, BORNES_CHANTIER.quantiteMax, auto) : auto;
    const prix = saisieManuelle(reglage.prix) ? montantBorne(reglage.prix, dec, 0) : prixDefautMainOeuvre(id, codeDevise);
    return { id, libelle: MAIN_OEUVRE_POINTS[id].libelle, auto, quantite, prix, montant: arrondi(quantite * prix, dec) };
  });
  const journees = mo.journees && typeof mo.journees === "object" ? mo.journees : {};
  const ouvriers = entierBorne(journees.ouvriers, 0, BORNES_CHANTIER.ouvriersMax, 0);
  const jours = arrondi(borner(journees.jours, 0, BORNES_CHANTIER.joursMax, 0), 1);
  const tarif = saisieManuelle(journees.tarif) ? montantBorne(journees.tarif, dec, 0)
    : (DEVISES_PRIX_DEFAUT.includes(codeDevise) ? TARIF_JOURNEE_DEFAUT : 0);
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

/* Chiffrage complet : étude + prix du catalogue (ou prix modifiés sur la ligne) + totaux. */
function chiffrerChantier(chantier, catalogue, codeDevise) {
  const c = chantier && typeof chantier === "object" ? chantier : {};
  const etude = etudierChantier(c, codeDevise);
  const dec = decimalesDevise(codeDevise);
  const cat = catalogue && typeof catalogue === "object" ? catalogue : {};
  const reglages = c.materiel && typeof c.materiel === "object" ? c.materiel : {};
  const materiel = etude.materiel.map((ligne) => {
    const reglage = Object.prototype.hasOwnProperty.call(reglages, ligne.ref) && reglages[ligne.ref] && typeof reglages[ligne.ref] === "object" ? reglages[ligne.ref] : {};
    const article = Object.prototype.hasOwnProperty.call(cat, ligne.ref) ? cat[ligne.ref] : null;
    const prixCatalogue = article ? montantBorne(article.prix, dec, 0) : 0;
    const quantite = saisieManuelle(reglage.quantite) ? entierBorne(reglage.quantite, 0, BORNES_CHANTIER.quantiteMax, ligne.quantite) : ligne.quantite;
    const prix = saisieManuelle(reglage.prix) ? montantBorne(reglage.prix, dec, prixCatalogue) : prixCatalogue;
    return { ...ligne, auto: ligne.quantite, quantite, prixCatalogue, prix, montant: arrondi(quantite * prix, dec), aCompleter: prix === 0 };
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

/* Étude complète d'un chantier : circuits, protections, coffret, câbles, matériel, main-d'œuvre. */
function etudierChantier(chantier, codeDevise) {
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
    mainOeuvre: calculerMainOeuvre(c.mainOeuvre, quantitesAuto, codeDevise)
  };
}
/* ==== FIN DU MOTEUR ==== */

/* ---------- Assistant Nouveau chantier (5 étapes, brouillon automatique) ---------- */

const assistant = { chantier: null, minuterie: 0, toast: 0 };

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

function formaterDecimal(nombre) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2, useGrouping: false }).format(nombre);
}

/* Écrit un texte dont les mots composés (« Chauffe-eau », « Va-et-vient ») ne sont jamais
   coupés au trait d'union : chacun est placé dans un span insécable. */
/* Un nombre et son unité restent sur la même ligne (10 A, 30 mA, 1,5 mm², 25 m). */
function lierUnites(texte) {
  return String(texte).replace(/(\d) (?=(A|mA|mm²|m|m²|modules)(?![\wÀ-ÿ]))/g, "$1\u00A0");
}

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
    li.append(label, creerCompteurSaisie("appareil-nombre-" + id, appareil.libelle, BORNES_CHANTIER.appareilsMax, { appareilNombre: id }));
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
      creerChamp("mo-qte-" + id, "Quantité", creerEntreeTexte("mo-qte-" + id, "numeric", 4, { moQuantite: id })),
      creerChamp("mo-prix-" + id, "Prix unitaire", creerEntreeTexte("mo-prix-" + id, "numeric", 12, { moPrix: id })),
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
      const nombre = $("appareil-coche-" + id).checked ? entierBorne($("appareil-nombre-" + id).value, 1, BORNES_CHANTIER.appareilsMax, 1) : 0;
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
  const surface = creerEntreeTexte("surface-" + piece.id, "decimal", 8, { champPiece: "surface" });
  surface.value = formaterDecimal(piece.surface);
  surface.setAttribute("aria-describedby", "err-surface-" + piece.id);
  const champSurface = creerChamp(surface.id, "Surface (m²)", surface);
  const erreur = document.createElement("p");
  erreur.className = "champ-erreur";
  erreur.id = "err-surface-" + piece.id;
  champSurface.appendChild(erreur);
  const prises = creerCompteurSaisie("prises-" + piece.id, "prises de " + nom, BORNES_CHANTIER.prisesMax, { champPiece: "prises" });
  const points = creerCompteurSaisie("points-" + piece.id, "points lumineux de " + nom, BORNES_CHANTIER.pointsMax, { champPiece: "points" });
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
  const etude = etudierChantier(assistant.chantier, etat.compte.devise);
  Object.keys(MAIN_OEUVRE_POINTS).forEach((id) => {
    const ligne = etude.mainOeuvre.lignes.find((l) => l.id === id);
    const quantite = quantiteFacultative($("mo-qte-" + id).value.trim(), BORNES_CHANTIER.quantiteMax);
    const prix = montantFacultatif($("mo-prix-" + id).value.trim());
    const reglage = {
      quantite: quantite === null || quantite === ligne.auto ? null : quantite,
      prix: prix === null || prix === prixDefautMainOeuvre(id, etat.compte.devise) ? null : prix
    };
    if (reglage.quantite === null && reglage.prix === null) delete mo.points[id];
    else mo.points[id] = reglage;
  });
  mo.forfait = montantSaisi($("mo-forfait").value.trim());
  mo.journees.ouvriers = entierBorne($("mo-ouvriers").value.trim(), 0, BORNES_CHANTIER.ouvriersMax, 0);
  mo.journees.jours = arrondi(borner($("mo-jours").value.trim(), 0, BORNES_CHANTIER.joursMax, 0), 1);
  const tarif = montantFacultatif($("mo-tarif").value.trim());
  mo.journees.tarif = tarif === null || tarif === (DEVISES_PRIX_DEFAUT.includes(etat.compte.devise) ? TARIF_JOURNEE_DEFAUT : 0) ? null : tarif;
  mo.libres = [...$("liste-lignes-libres").children].map((li) => ({
    libelle: texteBorne(li.querySelector("[data-libre=\"libelle\"]").value, 120),
    montant: montantSaisi(li.querySelector("[data-libre=\"montant\"]").value.trim())
  }));
}

function creerLigneLibre(ligne, index) {
  const li = document.createElement("li");
  li.className = "ligne-libre";
  const libelle = creerEntreeTexte("libre-libelle-" + index, "text", 120, { libre: "libelle" });
  libelle.value = ligne.libelle;
  libelle.placeholder = "Ex. : Saignées dans le béton";
  const montant = creerEntreeTexte("libre-montant-" + index, "numeric", 12, { libre: "montant" });
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
  const etude = etudierChantier(c, devise);
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

const resultat = { id: null, chantier: null, chiffrage: null, catalogue: {}, onglet: "circuits", minuterie: 0, lignes: new Map() };

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
async function lireCatalogue() {
  const compte = etat.compte;
  const devise = compte ? compte.devise : "XOF";
  const decimales = decimalesDevise(devise);
  const catalogue = {};
  if (DEVISES_PRIX_DEFAUT.includes(devise)) {
    Object.entries(CATALOGUE_DEFAUT).forEach(([ref, prix]) => { catalogue[ref] = { prix }; });
  }
  const brut = await lireJson(CLES_STOCKAGE.catalogue);
  const propres = compte && brut && typeof brut === "object" && !Array.isArray(brut)
    && Object.prototype.hasOwnProperty.call(brut, compte.id) && brut[compte.id] && typeof brut[compte.id] === "object"
    ? brut[compte.id] : {};
  Object.keys(propres).slice(0, 500).forEach((ref) => {
    if (!/^[a-z0-9.-]{1,40}$/.test(ref)) return;
    const prix = montantFacultatif(propres[ref]);
    if (prix !== null) catalogue[ref] = { prix: arrondi(prix, decimales) };
  });
  return catalogue;
}

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
  resultat.chiffrage = chiffrerChantier(c, resultat.catalogue, deviseCompte());
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
  const quantite = creerEntreeTexte(options.id + "-qte", "numeric", 4, options.donneesQuantite);
  quantite.value = String(options.quantite);
  const prix = creerEntreeTexte(options.id + "-prix", "decimal", 12, options.donneesPrix);
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
    const montant = creerEntreeTexte("res-libre-montant-" + index, "decimal", 12, { resLibre: "montant", index: String(index) });
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
  resultat.chiffrage = chiffrerChantier(c, resultat.catalogue, deviseCompte());
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
  const chiffrage = chiffrerChantier(chantier, catalogue, codeDevise);
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
  const catalogue = etudes.length ? await lireCatalogue() : {};
  $("accueil-etudes").replaceChildren(...etudes.map((c) => creerLigneEtude(c, catalogue, compte.devise)));
  $("bloc-etudes").hidden = etudes.length === 0;
}

function surClicEtude(evenement) {
  const bouton = evenement.target.closest("[data-chantier]");
  if (bouton) ouvrirEtude(bouton.dataset.chantier);
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
  $("bouton-ajouter-piece").addEventListener("click", surAjouterPiece);
  $("piece-surface").addEventListener("input", surSaisieSurfaceAjout);
  $("piece-surface").addEventListener("keydown", surToucheSurfaceAjout);
  $("liste-pieces").addEventListener("input", surSaisiePiece);
  $("liste-pieces").addEventListener("click", surActionPiece);
  $("liste-appareils").addEventListener("input", surSaisieAppareil);
  $("liste-appareils").addEventListener("change", surSaisieAppareil);
  $("etape-chantier-5").addEventListener("input", surSaisieMainOeuvre);
  $("etape-chantier-5").addEventListener("change", surSaisieMainOeuvre);
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
  construireNavigation();
  masquerLiensAbsents();
  remplirListes("ins", PAYS_DEFAUT, PAYS_PAR_ISO.get(PAYS_DEFAUT).devise);
  creerClavier("clavier-inscription");
  creerClavier("clavier-connexion");
  creerClavier("clavier-profil");
  Object.keys(codes).forEach(afficherCode);
  activerCode("ins-code");
  activerCode("cnx-code");
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
    etat.abonnement = abonnementCourant();
    afficherCompte(compte);
  }
  if (!presentationVue) return "presentation";
  return compte ? ECRAN_DEPART : "connexion";
}

async function demarrer() {
  masquerSplashNatif();
  preparerInterface();
  montrer("demarrage");
  initialiserToile();
  const [, premierEcran] = await Promise.all([attendre(DUREE_DEMARRAGE), choisirPremierEcran()]);
  montrer(premierEcran);
  await surveillerReseau();
  journal("démarrage terminé");
}

demarrer();
