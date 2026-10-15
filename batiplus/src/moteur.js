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

/* État de l'application, en mémoire uniquement. */
const etat = {
  compte: null,
  minuterieBlocage: 0,
  elementAvantModale: null
};

/* Codes en cours de saisie : jamais dans le DOM, jamais stockés. */
const codes = { "ins-code": "", "ins-confirmation": "", "cnx-code": "" };
const codesVisibles = new Set();
const cibleClavier = { "clavier-inscription": "ins-code", "clavier-connexion": "cnx-code" };

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
  $("etat-theme").textContent = THEMES[valide].libelle;
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

function montrer(id) {
  /* Les écrans de l'application exigent une session ouverte. */
  const destination = !estEcranEntree(id) && !etat.compte ? "connexion" : id;
  const cible = $("ecran-" + destination);
  if (!cible) {
    journal("écran inexistant :", destination);
    return false;
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
  return true;
}
montrer.ecranCourant = null;

function surClicNavigation(evenement) {
  const lien = evenement.currentTarget;
  vibrer();
  montrer(lien.dataset.ecran);
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
  bouton.addEventListener("click", surClicNavigation);
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
  bouton.addEventListener("click", surClicNavigation);
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
    if (!$("modale").hidden) fermerModale();
    else if (tiroirOuvert()) fermerTiroir();
    return;
  }
  if (montrer.ecranCourant === "presentation") {
    if (evenement.key === "ArrowRight") allerDiapo(presentation.index + 1);
    if (evenement.key === "ArrowLeft") allerDiapo(presentation.index - 1);
  }
}

/* ---------- Modale ---------- */

function ouvrirModale(titre, idModele) {
  $("modale-titre").textContent = titre;
  $("modale-contenu").replaceChildren($(idModele).content.cloneNode(true));
  etat.elementAvantModale = document.activeElement;
  $("modale").hidden = false;
  $("bouton-modale-ok").focus({ preventScroll: true });
}

function fermerModale() {
  $("modale").hidden = true;
  const precedent = etat.elementAvantModale;
  etat.elementAvantModale = null;
  if (precedent && typeof precedent.focus === "function") precedent.focus({ preventScroll: true });
}

function surClicFondModale(evenement) {
  if (evenement.target === evenement.currentTarget) fermerModale();
}

function ouvrirConditions() {
  ouvrirModale("Conditions d'utilisation et confidentialité", "modele-conditions");
}

/* ---------- Bouton retour Android ---------- */

function surBoutonRetour() {
  if (!$("modale").hidden) {
    fermerModale();
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
  if (montrer.ecranCourant && !estEcranEntree(montrer.ecranCourant) && montrer.ecranCourant !== ECRAN_DEPART) {
    montrer(ECRAN_DEPART);
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
  const cible = evenement.target.closest(".bouton, .bouton-icone, .onglet, .tiroir-lien, .touche, .onglet-auth");
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
  mouvementReduitQuery.addEventListener("change", () => { afficherAnimations(); demarrerToile(); });
}

function afficherAnimations() {
  $("etat-animations").textContent = mouvementReduitQuery.matches ? "Réduites (réglage de l'appareil)" : "Actives";
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

function construireListesPays() {
  const options = [...PAYS]
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((p) => new Option(p.nom + " (+" + p.indicatif + ")", p.iso));
  $("ins-pays").replaceChildren(...options);
  $("ins-pays").value = PAYS_DEFAUT;
  const devises = Object.entries(DEVISES).map(([code, d]) => new Option(d.libelle + " — " + d.nom, code));
  $("ins-devise").replaceChildren(...devises);
  $("ins-devise").value = PAYS_PAR_ISO.get(PAYS_DEFAUT).devise;
}

function surSaisieTelephoneInscription() {
  const champ = $("ins-telephone");
  const analyse = analyserTelephone(champ.value, $("ins-pays").value);
  if (analyse.pays && analyse.detecte && analyse.pays.iso !== $("ins-pays").value) {
    $("ins-pays").value = analyse.pays.iso;
    $("ins-devise").value = analyse.pays.devise;
  }
  afficherApercu("apercu-ins-telephone", analyse, champ.value);
  effacerErreur(champ);
}

function surChangementPays() {
  const pays = PAYS_PAR_ISO.get($("ins-pays").value);
  if (pays) $("ins-devise").value = pays.devise;
  surSaisieTelephoneInscription();
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
  if (id === "ins-code" && codes[id].length === CODE.longueurMax) activerCode("ins-confirmation");
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
    && PAYS_PAR_ISO.has(compte.pays) && Object.prototype.hasOwnProperty.call(DEVISES, compte.devise);
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
  afficherCompte(compte);
}

async function fermerSession() {
  await supprimerValeur(CLES_STOCKAGE.session);
  etat.compte = null;
  afficherCompte(null);
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
    construireListesPays();
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

/* ---------- Écran de test : compte connecté ---------- */

function afficherCompte(compte) {
  const pays = compte ? PAYS_PAR_ISO.get(compte.pays) : null;
  const devise = compte ? DEVISES[compte.devise] : null;
  $("compte-nom").textContent = compte ? compte.nom : "";
  $("compte-entreprise").textContent = compte ? compte.entreprise || "—" : "";
  $("compte-telephone").textContent = compte ? formaterTelephone(compte.telephone, compte.pays) : "";
  $("compte-ville").textContent = compte ? compte.ville : "";
  $("compte-pays").textContent = pays ? pays.nom : "";
  $("compte-devise").textContent = devise ? devise.nom + " · " + formaterMontant(25000, compte.devise) : "";
}

/* ---------- Vérification du démarrage (écran de test) ---------- */

async function testerStockage() {
  const cle = "bp.test-demarrage";
  const valeur = String(Date.now());
  const ecrit = await ecrireValeur(cle, valeur);
  const relu = await lireValeur(cle);
  await supprimerValeur(cle);
  return ecrit && relu === valeur;
}

function testerPolices() {
  if (!document.fonts || typeof document.fonts.check !== "function") return true;
  return document.fonts.check('600 16px "Inter"') && document.fonts.check('800 16px "Montserrat"');
}

async function verifierDemarrage() {
  const bouton = $("bouton-verifier");
  bouton.setAttribute("aria-busy", "true");
  $("verif-resultat").hidden = true;
  vibrer();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const controles = [
    { nom: "stockage local", ok: await testerStockage() },
    { nom: "polices embarquées", ok: testerPolices() },
    { nom: "navigation", ok: ecranExiste(ECRAN_DEPART) && montrer.ecranCourant === ECRAN_DEPART },
    { nom: "chiffrement du code", ok: cryptoDisponible() },
    { nom: "logo", ok: document.querySelectorAll("[data-logo].logo-echec").length === 0 }
  ];
  await attendre(650);
  afficherVerification(controles.filter((c) => !c.ok).map((c) => c.nom));
  bouton.removeAttribute("aria-busy");
}

function afficherVerification(echecs) {
  const coche = $("verif-coche");
  const nouvelle = coche.cloneNode(true);
  nouvelle.classList.toggle("echec", echecs.length > 0);
  coche.replaceWith(nouvelle);
  if (echecs.length === 0) {
    $("verif-titre").textContent = "Tout est prêt";
    $("verif-detail").textContent = "Stockage, polices, navigation, chiffrement du code et logo fonctionnent sur cet appareil.";
  } else {
    $("verif-titre").textContent = "À vérifier";
    $("verif-detail").textContent = "Problème détecté : " + echecs.join(", ") + ".";
  }
  $("verif-resultat").hidden = false;
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
  $("bouton-menu").addEventListener("click", ouvrirTiroir);
  $("bouton-fermer-tiroir").addEventListener("click", fermerTiroir);
  $("voile").addEventListener("click", fermerTiroir);
  $("bouton-theme").addEventListener("click", basculerTheme);
  $("bouton-verifier").addEventListener("click", verifierDemarrage);
  $("bouton-deconnexion").addEventListener("click", fermerSession);

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
  $("ins-pays").addEventListener("change", surChangementPays);
  $("cnx-telephone").addEventListener("input", surSaisieTelephoneConnexion);
  ["ins-nom", "ins-entreprise", "ins-ville", "ins-conditions"].forEach((id) => $(id).addEventListener("input", surSaisieChamp));
  document.querySelectorAll(".code-cases").forEach((champ) => {
    champ.addEventListener("focus", surActivationCode);
    champ.addEventListener("click", surActivationCode);
    champ.addEventListener("keydown", surToucheCode);
  });
  document.querySelectorAll(".code-oeil").forEach((bouton) => bouton.addEventListener("click", surOeil));
  $("bouton-conditions").addEventListener("click", ouvrirConditions);
  $("contenu").addEventListener("focusin", surFocusChamp);

  $("modale").addEventListener("click", surClicFondModale);
  $("bouton-fermer-modale").addEventListener("click", fermerModale);
  $("bouton-modale-ok").addEventListener("click", fermerModale);

  document.addEventListener("keydown", surToucheClavier);
  document.addEventListener("pointerdown", surAppuiOnde);
  tiroirMobileQuery.addEventListener("change", () => { fermerTiroir(); majAccessibiliteTiroir(); });
  activerGlissementTiroir();
  brancherBoutonRetour();
}

function preparerInterface() {
  $("etat-version").textContent = APP.version;
  $("etat-plateforme").textContent = nomPlateforme();
  afficherAnimations();
  surveillerLogos();
  construireNavigation();
  construireListesPays();
  creerClavier("clavier-inscription");
  creerClavier("clavier-connexion");
  Object.keys(codes).forEach(afficherCode);
  activerCode("ins-code");
  activerCode("cnx-code");
  construirePoints();
  allerDiapo(0);
  majLienCodeOublie(null);
  brancherEvenements();
  majAccessibiliteTiroir();
}

/* Pendant l'écran de démarrage : thème, compte et choix du premier écran. */
async function choisirPremierEcran() {
  await initialiserTheme();
  const presentationVue = await lireValeur(CLES_STOCKAGE.presentationVue) === "1";
  const comptes = await lireComptes();
  choisirOnglet(comptes.length ? "connexion" : "inscription");
  const verrou = await lireVerrou();
  if (verrou.jusqua > Date.now()) afficherBlocage(verrou.jusqua);
  const session = await lireSession();
  const compte = session ? comptes.find((c) => c.id === session.compteId) : null;
  if (compte) {
    etat.compte = compte;
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
