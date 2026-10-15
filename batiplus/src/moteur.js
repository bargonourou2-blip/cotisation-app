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

function montrer(id) {
  const cible = $("ecran-" + id);
  if (!cible) {
    journal("écran inexistant :", id);
    return false;
  }
  document.querySelectorAll(".ecran.actif").forEach((ecran) => ecran.classList.remove("actif"));
  cible.classList.add("actif");
  document.querySelectorAll("[data-ecran]").forEach((lien) => {
    if (lien.dataset.ecran === id) lien.setAttribute("aria-current", "page");
    else lien.removeAttribute("aria-current");
  });
  fermerTiroir();
  window.scrollTo({ top: 0, behavior: "auto" });
  montrer.ecranCourant = id;
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

function surToucheClavier(evenement) {
  if (evenement.key === "Escape" && tiroirOuvert()) fermerTiroir();
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

/* ---------- Bouton retour Android ---------- */

function surBoutonRetour() {
  if (!$("modale").hidden) {
    $("modale").hidden = true;
    return;
  }
  if (tiroirOuvert()) {
    fermerTiroir();
    return;
  }
  if (montrer.ecranCourant && montrer.ecranCourant !== ECRAN_DEPART) {
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
    if (img.complete && img.naturalWidth === 0 && img.offsetParent !== null) {
      img.closest("[data-logo]").classList.add("logo-echec");
    }
  });
}

/* ---------- Onde au toucher ---------- */

function surAppuiOnde(evenement) {
  const cible = evenement.target.closest(".bouton, .bouton-icone, .onglet, .tiroir-lien");
  if (!cible || mouvementReduitQuery.matches) return;
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
  const etat = $("etat-reseau");
  etat.textContent = enLigne ? "En ligne" : "Hors ligne";
  etat.classList.toggle("ok", enLigne);
  etat.classList.toggle("alerte", !enLigne);
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

/* ---------- Vérification du démarrage (écran de test de l'étape 1) ---------- */

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
  const resultat = $("verif-resultat");
  bouton.setAttribute("aria-busy", "true");
  resultat.hidden = true;
  vibrer();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const controles = [
    { nom: "stockage local", ok: await testerStockage() },
    { nom: "polices embarquées", ok: testerPolices() },
    { nom: "navigation", ok: ecranExiste(ECRAN_DEPART) && montrer.ecranCourant === ECRAN_DEPART },
    { nom: "logo", ok: document.querySelectorAll("[data-logo].logo-echec").length === 0 }
  ];
  await attendre(650);
  const echecs = controles.filter((c) => !c.ok).map((c) => c.nom);
  afficherVerification(echecs);
  bouton.removeAttribute("aria-busy");
}

function afficherVerification(echecs) {
  const coche = $("verif-coche");
  const nouvelle = coche.cloneNode(true);
  nouvelle.classList.toggle("echec", echecs.length > 0);
  coche.replaceWith(nouvelle);
  if (echecs.length === 0) {
    $("verif-titre").textContent = "Tout est prêt";
    $("verif-detail").textContent = "Stockage, polices, navigation et logo fonctionnent sur cet appareil.";
  } else {
    $("verif-titre").textContent = "À vérifier";
    $("verif-detail").textContent = "Problème détecté : " + echecs.join(", ") + ".";
  }
  $("verif-resultat").hidden = false;
}

/* ---------- Écran de démarrage natif ---------- */

function masquerSplashNatif() {
  const splash = plugin("SplashScreen");
  if (splash) splash.hide().catch(() => {});
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
  document.addEventListener("keydown", surToucheClavier);
  document.addEventListener("pointerdown", surAppuiOnde);
  tiroirMobileQuery.addEventListener("change", () => { fermerTiroir(); majAccessibiliteTiroir(); });
  activerGlissementTiroir();
  brancherBoutonRetour();
}

async function demarrer() {
  $("etat-version").textContent = APP.version;
  $("etat-plateforme").textContent = nomPlateforme();
  afficherAnimations();
  surveillerLogos();
  construireNavigation();
  brancherEvenements();
  majAccessibiliteTiroir();
  montrer(ECRAN_DEPART);
  initialiserToile();
  await initialiserTheme();
  await surveillerReseau();
  masquerSplashNatif();
  journal("démarrage terminé");
}

demarrer();
