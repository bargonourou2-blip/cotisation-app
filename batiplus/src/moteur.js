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
