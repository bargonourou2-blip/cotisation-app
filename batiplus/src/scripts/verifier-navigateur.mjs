#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur dans un vrai navigateur (Chromium)
   Contrôles qui demandent un moteur de rendu, donc impossibles dans jsdom :
     D  écran de démarrage réel (logo chargé, calque éclair) + animations coupées
        si l'appareil demande moins de mouvement
     ⑬ la présentation ne déborde à aucune taille (360×640 → 1440×900)
     ⑭ aucun texte tronqué ni coupé sur l'inscription et la connexion
     ⑯ champs ≥ 16 px (pas de zoom au toucher) et touches du clavier ≥ 48 px
     ⑱ aucun texte tronqué ni mot/montant coupé sur les écrans connectés et le
        tiroir (360 et 1440 px, clair et sombre, devis de 125 000 000)
     ⑲ le contenu ne passe jamais sous le menu latéral (1440 et 1025 px)
     I  photo et logo : image réelle redessinée en WebP ≤ 300 Ko, faux PNG,
        SVG et fichier > 5 Mo refusés
     N  aucune erreur console, aucune violation CSP, aucune requête en échec
   Outils de vérification uniquement, jamais embarqués :
     npm i --no-save puppeteer-core
     CHROME_PATH=/chemin/vers/chrome node src/scripts/verifier-navigateur.mjs
   Variables : CHROME_PATH, OUTILS (dossier où puppeteer-core est installé),
   CAPTURES (dossier des captures d'écran, hors dépôt), PORT (défaut 8091).
   ========================================================================== */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTILS = process.env.OUTILS || RACINE;
const CAPTURES = process.env.CAPTURES || "";
const PORT = Number(process.env.PORT) || 8091;
const ADRESSE = "http://127.0.0.1:" + PORT + "/";
const exiger = createRequire(join(OUTILS, "package.json"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const resultats = [];

function controle(numero, libelle, ok, detail) {
  resultats.push({ numero, libelle, ok: Boolean(ok), detail: detail || "" });
}

async function cheminChrome() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] };
  const chromium = exiger("@sparticuz/chromium");
  const module = chromium.default || chromium;
  return { executablePath: await module.executablePath(), args: module.args };
}

/* ---------- Mesures exécutées dans la page ---------- */

function mesurerEcran() {
  const largeur = document.documentElement.clientWidth;
  const ecran = document.querySelector(".ecran.actif");
  const visibles = [...ecran.querySelectorAll("*")].filter((el) => {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return false;
    if (el.closest(".diapo[aria-hidden='true']") || el.closest("[hidden]")) return false;
    if (el.matches(".diapos, .onde, .splash-lueur, .lueur")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const deborde = visibles.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.left < -1 || r.right > largeur + 1;
  }).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className).split(" ")[0]);
  const coupes = [...ecran.querySelectorAll("h1, h2, p, label, button, .bouton span, .diapo-titre, .diapo-phrase, .onglet-auth, .etat-ligne strong, a")]
    .filter((el) => visibles.includes(el) && getComputedStyle(el).overflow !== "visible" && el.scrollWidth > el.clientWidth + 1)
    .map((el) => el.textContent.trim().slice(0, 30));
  /* Le texte d'une liste déroulante est coupé sans que scrollWidth le signale : on le mesure. */
  const regle = document.createElement("canvas").getContext("2d");
  const listes = [...ecran.querySelectorAll("select")].filter((el) => visibles.includes(el)).filter((el) => {
    const style = getComputedStyle(el);
    regle.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    const libre = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - (style.appearance === "none" ? 0 : 20);
    return [...el.options].some((o) => regle.measureText(o.textContent).width > libre + 1);
  }).map((el) => "liste #" + el.id);
  coupes.push(...listes);
  const defileX = document.documentElement.scrollWidth > largeur + 1;
  const hauteurEcran = document.documentElement.scrollHeight;
  return { deborde: deborde.slice(0, 4), coupes: coupes.slice(0, 4), defileX, depasseVertical: hauteurEcran > window.innerHeight + 1 };
}

function mesurerSaisie() {
  const champs = [...document.querySelectorAll("#ecran-connexion input:not([type=checkbox]), #ecran-connexion select")]
    .filter((el) => el.getBoundingClientRect().width > 0);
  const petits = champs.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => el.id);
  const touches = [...document.querySelectorAll("#ecran-connexion .touche:not(.touche-vide)")].filter((el) => el.getBoundingClientRect().width > 0);
  const petitesTouches = touches.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height < 48 || r.width < 48;
  }).length;
  const boutons = [...document.querySelectorAll("#ecran-connexion .bouton, #ecran-connexion .onglet-auth, #ecran-connexion .code-oeil")]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height < 44).map((el) => el.id || el.className);
  return { champs: champs.length, petits, touches: touches.length, petitesTouches, boutons };
}

/* Mots et montants coupés en plein milieu : chaque mot (les montants sont liés par des
   espaces insécables) doit tenir sur une seule ligne ; aucun texte ne doit être rogné. */
function mesurerTextes(selecteurs) {
  const largeur = document.documentElement.clientWidth;
  const racines = selecteurs.map((s) => document.querySelector(s)).filter(Boolean);
  const visible = (el) => {
    /* .visuellement-cache : texte réservé aux lecteurs d'écran, rogné volontairement. */
    if (!el || el.closest("[hidden], template, svg, script, style, select, .visuellement-cache, .diapo[aria-hidden='true']")) return false;
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.opacity !== "0";
  };
  const decrire = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "");
  const motsCoupes = [];
  const rognes = [];
  const deborde = [];
  let mots = 0;
  for (const racine of racines) {
    const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT);
    while (parcours.nextNode()) {
      const noeud = parcours.currentNode;
      if (!noeud.textContent.trim() || !visible(noeud.parentElement)) continue;
      for (const m of noeud.textContent.matchAll(/[^ \t\n\r]+/g)) {
        const plage = document.createRange();
        plage.setStart(noeud, m.index);
        plage.setEnd(noeud, m.index + m[0].length);
        const hauts = [...plage.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top));
        mots++;
        if (new Set(hauts.map((h) => Math.round(h / 3))).size > 1) motsCoupes.push(m[0].slice(0, 30));
      }
    }
    for (const el of racine.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const style = getComputedStyle(el);
      if (el.matches("input, textarea, .onde, .lueur, .bandeau-photos-rangee img")) continue;
      if ((style.overflowX !== "visible" || style.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && el.textContent.trim()) rognes.push(decrire(el) + " « " + el.textContent.trim().slice(0, 25) + " »");
      const r = el.getBoundingClientRect();
      const defilant = el.parentElement && el.parentElement.closest(".bandeau-photos-rangee");
      if (!defilant && racine.id !== "tiroir" && (r.left < -1 || r.right > largeur + 1)) deborde.push(decrire(el));
    }
  }
  return { mots, motsCoupes: motsCoupes.slice(0, 5), rognes: rognes.slice(0, 5), deborde: deborde.slice(0, 5), defileX: document.documentElement.scrollWidth > largeur + 1 };
}

/* Sur ordinateur : aucun élément du contenu ni de l'en-tête ne commence sous le menu fixe. */
function mesurerSousMenu() {
  const tiroir = document.getElementById("tiroir").getBoundingClientRect();
  const sous = [...document.querySelectorAll("#contenu .ecran.actif *, .entete *, .onglets *")].filter((el) => {
    if (el.closest("[hidden], svg")) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && r.left < tiroir.right - 1;
  }).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "@" + Math.round(el.getBoundingClientRect().left));
  const centre = document.elementFromPoint(tiroir.left + tiroir.width / 2, tiroir.top + tiroir.height / 2);
  return { largeurMenu: Math.round(tiroir.right), visible: tiroir.left >= 0 && tiroir.width > 200, dessus: Boolean(centre && centre.closest("#tiroir")), sous: sous.slice(0, 5), total: sous.length };
}

/* ---------- Déroulé ---------- */

const ECRANS = [[360, 640], [390, 844], [412, 915], [768, 1024], [1440, 900]];

async function main() {
  const serveur = spawn(process.execPath, [join(RACINE, "src", "scripts", "apercu.mjs")], {
    env: { ...process.env, PORT: String(PORT), HOTE: "127.0.0.1" }, stdio: "ignore"
  });
  await pause(600);
  const puppeteer = exiger("puppeteer-core");
  const lanceur = puppeteer.default || puppeteer;
  const options = await cheminChrome();
  const navigateur = await lanceur.launch({ ...options, headless: true });
  const erreurs = [];
  if (CAPTURES) mkdirSync(CAPTURES, { recursive: true });

  async function nouvellePage(largeur, hauteur, sombre, reduit, stockage) {
    /* Une page par mesure, stockage vidé avant le vrai chargement (1re ouverture). */
    const page = await navigateur.newPage();
    const contexte = { close: () => page.close() };
    const nom = largeur + "x" + hauteur + (sombre ? "-sombre" : "");
    page.on("console", (m) => { if (["error", "warning"].includes(m.type())) erreurs.push(nom + " " + m.type() + " : " + m.text()); });
    page.on("pageerror", (e) => erreurs.push(nom + " exception : " + e.message));
    page.on("requestfailed", (r) => erreurs.push(nom + " requête en échec : " + r.url()));
    page.on("response", (r) => { if (r.status() >= 400) erreurs.push(nom + " HTTP " + r.status() + " : " + r.url()); });
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: sombre ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: reduit ? "reduce" : "no-preference" }
    ]);
    await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 1, isMobile: largeur < 768, hasTouch: largeur < 1024 });
    await page.goto(ADRESSE + "manifest.webmanifest", { waitUntil: "load" });
    await page.evaluate((valeurs) => {
      window.localStorage.clear();
      for (const [cle, valeur] of Object.entries(valeurs || {})) window.localStorage.setItem(cle, valeur);
    }, stockage || {});
    await page.goto(ADRESSE, { waitUntil: "load" });
    return { page, contexte, nom };
  }

  async function capturer(page, nom, complet) {
    if (CAPTURES) await page.screenshot({ path: join(CAPTURES, nom + ".png"), fullPage: Boolean(complet) });
  }

  /* D démarrage réel */
  {
    const { page, contexte } = await nouvellePage(390, 844, false, false);
    await pause(250);
    const splash = await page.evaluate(() => {
      const img = document.querySelector("#ecran-demarrage [data-logo] img");
      const eclair = document.querySelector("#ecran-demarrage [class*='eclair']");
      return {
        actif: document.querySelector(".ecran.actif").id,
        mode: document.body.dataset.mode,
        logo: Boolean(img && img.complete && img.naturalWidth > 0),
        eclair: Boolean(eclair) && getComputedStyle(eclair).animationName !== "none",
        enTete: getComputedStyle(document.querySelector(".entete") || document.body).display
      };
    });
    await capturer(page, "demarrage-390");
    await pause(1600);
    const apres = await page.evaluate(() => document.querySelector(".ecran.actif").id);
    await contexte.close();
    const reduit = await nouvellePage(390, 844, false, true);
    await pause(250);
    const animations = await reduit.page.evaluate(() => [...document.querySelectorAll("#ecran-demarrage *")]
      .filter((el) => getComputedStyle(el).animationName !== "none" && parseFloat(getComputedStyle(el).animationDuration) > 0.02).length);
    await reduit.contexte.close();
    const ok = splash.actif === "ecran-demarrage" && splash.mode === "entree" && splash.logo && splash.eclair
      && splash.enTete === "none" && apres === "ecran-presentation" && animations === 0;
    controle("D", "démarrage (navigateur réel) et mouvement réduit respecté", ok,
      ok ? "logo chargé, éclair animé, sans en-tête ; présentation après 1,5 s ; 0 animation si mouvement réduit"
        : JSON.stringify({ ...splash, apres, animations }));
  }

  /* ⑬ débordements et ⑯ saisie, à chaque taille */
  const fautes = [];
  const fautesAuth = [];
  let mesures = 0;
  let mesuresAuth = 0;
  let saisie = null;
  for (const [largeur, hauteur] of ECRANS) {
    for (const sombre of [false, true]) {
      if (sombre && largeur !== 360 && largeur !== 1440) continue;
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true);
      await pause(1700);
      for (let i = 0; i < 4; i++) {
        const m = await page.evaluate(mesurerEcran);
        mesures++;
        if (m.deborde.length || m.coupes.length || m.defileX || m.depasseVertical) fautes.push(nom + " diapo " + (i + 1) + " " + JSON.stringify(m));
        await capturer(page, nom + "-diapo" + (i + 1));
        if (i < 3) {
          await page.click("#bouton-diapo-suivante");
          await pause(500);
        }
      }
      await page.click("#bouton-diapo-suivante");
      await pause(300);
      for (const onglet of ["inscription", "connexion"]) {
        await page.click("#onglet-" + onglet);
        await pause(150);
        const m = await page.evaluate(mesurerEcran);
        const t = await page.evaluate(mesurerTextes, ["#ecran-connexion"]);
        mesuresAuth++;
        if (m.deborde.length || m.coupes.length || m.defileX || t.motsCoupes.length || t.rognes.length) fautesAuth.push(nom + " " + onglet + " " + JSON.stringify({ ...m, ...t }));
        await capturer(page, nom + "-" + onglet);
      }
      if (largeur === 360 && !sombre) {
        await page.click("#onglet-inscription");
        await page.click("#ins-telephone");
        await page.type("#ins-telephone", "+225 07 08 09 10 11");
        await page.click("#ins-code");
        for (const c of "2580") await page.click('#clavier-inscription [data-touche="' + c + '"]');
        await capturer(page, nom + "-saisie");
        await page.click("#bouton-inscription");
        await pause(300);
        await capturer(page, nom + "-erreurs");
        await page.click("#bouton-conditions");
        await pause(400);
        const modale = await page.evaluate(mesurerEcran);
        await capturer(page, nom + "-conditions");
        await page.keyboard.press("Escape");
        if (modale.defileX) fautesAuth.push("modale déborde");
        saisie = await page.evaluate(mesurerSaisie);
      }
      await contexte.close();
    }
  }
  controle("⑬", "la présentation ne déborde à aucune taille (360 → 1440)", fautes.length === 0,
    fautes.length ? fautes.slice(0, 3).join(" | ") : mesures + " diapositives mesurées, chacune tient dans l'écran (5 tailles ; clair et sombre)");
  controle("⑭", "aucun texte tronqué ni coupé (inscription, connexion)", fautesAuth.length === 0,
    fautesAuth.length ? fautesAuth.slice(0, 3).join(" | ") : mesuresAuth + " vues, chaque mot mesuré : aucun mot coupé, aucun texte rogné");
  const okSaisie = saisie && saisie.petits.length === 0 && saisie.petitesTouches === 0 && saisie.boutons.length === 0;
  controle("⑯", "champs ≥ 16 px (pas de zoom), touches ≥ 48 px, boutons ≥ 44 px", okSaisie,
    okSaisie ? saisie.champs + " champs ≥ 16 px, " + saisie.touches + " touches ≥ 48 px" : JSON.stringify(saisie));

  /* ---------- Étape 3 : compte réel créé par l'interface, devis volumineux ---------- */
  let base = {};
  {
    const { page, contexte } = await nouvellePage(390, 844, false, true, { bp_v1_presentation_vue: "1" });
    await pause(1700);
    await page.type("#ins-nom", "Marie-Christine Ouédraogo-Kaboré");
    await page.type("#ins-entreprise", "Électricité Générale du Faso SARL");
    await page.type("#ins-telephone", "+226 05 60 86 08");
    await page.type("#ins-ville", "Bobo-Dioulasso");
    await pause(500);
    await page.click("#ins-code");
    await pause(500);
    for (const c of "258071258071") await page.click('#clavier-inscription [data-touche="' + c + '"]');
    await page.evaluate(() => { document.getElementById("ins-conditions").checked = true; });
    await page.click("#bouton-inscription");
    await page.waitForFunction(() => document.querySelector(".ecran.actif").id === "ecran-accueil", { timeout: 8000 });
    base = await page.evaluate(() => ({ ...window.localStorage }));
    await contexte.close();
  }
  const compteId = JSON.parse(base.bp_v1_comptes)[0].id;
  const maintenant = Date.now();
  base.bp_v1_devis = JSON.stringify([
    { id: "d1", compteId, titre: "Installation électrique complète villa R+2 Ouaga 2000", client: "Société Immobilière du Kadiogo", total: 125000000, statut: "accepte", creeLe: new Date(maintenant - 60000).toISOString() },
    { id: "d2", compteId, titre: "Rénovation tableau général et prises", client: "Mme Sawadogo Aminata", total: 48750000, statut: "envoye", creeLe: new Date(maintenant - 120000).toISOString() },
    { id: "d3", compteId, titre: "Éclairage atelier", client: "M. Ilboudo", total: 99999999, statut: "refuse", creeLe: new Date(maintenant - 180000).toISOString() }
  ]);

  const ECRANS_APP = ["accueil", "profil", "a-propos", "admin"];
  async function ouvrirEcran(page, ecran) {
    if (ecran === "admin") {
      await page.evaluate(() => document.querySelector("#tiroir-menu [data-ecran='a-propos']").click());
      await pause(200);
      await page.evaluate(() => document.getElementById("logo-apropos").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })));
      await pause(3200);
    } else {
      await page.evaluate((e) => document.querySelector("#tiroir-menu [data-ecran='" + e + "']").click(), ecran);
      await pause(400);
    }
    return page.evaluate(() => document.querySelector(".ecran.actif").id);
  }

  /* ⑱ aucun texte tronqué ni coupé, 360 et 1440, clair et sombre, avec le tiroir */
  const fautes18 = [];
  let vues18 = 0;
  let mots18 = 0;
  for (const [largeur, hauteur] of [[360, 640], [1440, 900]]) {
    for (const sombre of [false, true]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true, base);
      await pause(1800);
      for (const ecran of ECRANS_APP) {
        const actif = await ouvrirEcran(page, ecran);
        if (actif !== "ecran-" + ecran) { fautes18.push(nom + " " + ecran + " : écran " + actif); continue; }
        const t = await page.evaluate(mesurerTextes, [".ecran.actif", ".entete", largeur > 1024 ? "#tiroir" : ".onglets"]);
        vues18++;
        mots18 += t.mots;
        if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautes18.push(nom + " " + ecran + " " + JSON.stringify(t));
        await capturer(page, nom + "-" + ecran, true);
      }
      if (largeur < 1024) {
        await page.click("#bouton-menu");
        await pause(500);
        const t = await page.evaluate(mesurerTextes, ["#tiroir"]);
        vues18++;
        mots18 += t.mots;
        if (t.motsCoupes.length || t.rognes.length) fautes18.push(nom + " tiroir " + JSON.stringify(t));
        await capturer(page, nom + "-tiroir");
        await page.keyboard.press("Escape");
        await page.evaluate(() => document.getElementById("bouton-recherche").click());
        await page.type("#recherche-saisie", "code");
        await pause(200);
        const r = await page.evaluate(mesurerTextes, ["#recherche"]);
        vues18++;
        if (r.motsCoupes.length || r.rognes.length || r.deborde.length) fautes18.push(nom + " recherche " + JSON.stringify(r));
        await capturer(page, nom + "-recherche");
        await page.keyboard.press("Escape");
      }
      await contexte.close();
    }
  }
  controle("⑱", "aucun texte tronqué ni coupé nulle part (360 et 1440)", fautes18.length === 0,
    fautes18.length ? fautes18.slice(0, 3).join(" | ")
      : vues18 + " vues (accueil, profil, à propos, admin, tiroir, recherche ; clair et sombre), " + mots18.toLocaleString("fr-FR") + " mots mesurés un par un, montant de 125 000 000 FCFA sur une ligne");

  /* ⑲ le contenu ne passe jamais sous le menu latéral */
  const fautes19 = [];
  const largeursMenu = [];
  for (const [largeur, hauteur] of [[1440, 900], [1025, 768]]) {
    const { page, contexte, nom } = await nouvellePage(largeur, hauteur, false, true, base);
    await pause(1800);
    for (const ecran of ECRANS_APP) {
      await ouvrirEcran(page, ecran);
      const m = await page.evaluate(mesurerSousMenu);
      largeursMenu.push(m.largeurMenu);
      if (!m.visible || !m.dessus || m.total) fautes19.push(nom + " " + ecran + " " + JSON.stringify(m));
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await pause(200);
    const bas = await page.evaluate(mesurerSousMenu);
    if (bas.total) fautes19.push(nom + " après défilement " + JSON.stringify(bas));
    await contexte.close();
  }
  controle("⑲", "le contenu ne passe jamais sous le menu latéral", fautes19.length === 0,
    fautes19.length ? fautes19.slice(0, 3).join(" | ")
      : "1440 et 1025 px, 4 écrans + défilement : menu fixe visible (" + Math.max(...largeursMenu) + " px), 0 élément du contenu ou de l'en-tête à sa gauche");

  /* I images réelles : photo et logo redessinés, fichiers piégés refusés */
  {
    const fautesI = [];
    const { page, contexte } = await nouvellePage(390, 844, false, true, base);
    await pause(1800);
    await ouvrirEcran(page, "profil");
    const lire = () => page.evaluate(() => JSON.parse(window.localStorage.getItem("bp_v1_comptes"))[0]);
    const envoyer = async (id, chemin) => {
      const entree = await page.$("#" + id);
      await entree.uploadFile(chemin);
      await pause(1800);
    };
    await envoyer("fichier-photo", join(RACINE, "sources-photos", "equipe-chantier.jpg"));
    const apresPhoto = await lire();
    const photo = apresPhoto.photo || "";
    const dimPhoto = await page.evaluate(() => { const img = document.querySelector("#bouton-avatar [data-photo]"); return img && !img.hidden ? [img.naturalWidth, img.naturalHeight] : null; });
    if (!photo.startsWith("data:image/webp;base64,") || photo.length > 300 * 1024) fautesI.push("photo : " + photo.slice(0, 30) + " (" + photo.length + " car.)");
    if (!dimPhoto || dimPhoto[0] > 320 || dimPhoto[1] > 320) fautesI.push("photo affichée : " + JSON.stringify(dimPhoto));
    await envoyer("fichier-logo", join(RACINE, "sources-photos", "elec-cables.jpg"));
    const logo = (await lire()).logo || "";
    const dimLogo = await page.evaluate((src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok(null); i.src = src; }), logo);
    if (!logo.startsWith("data:image/webp;base64,") || !dimLogo || dimLogo[0] > 600 || dimLogo[1] > 300) fautesI.push("logo : " + JSON.stringify(dimLogo));
    const dossier = tmpdir();
    const fauxPng = join(dossier, "faux-batiplus.png");
    writeFileSync(fauxPng, "<html><script>alert(1)</script></html>");
    const svg = join(dossier, "image-batiplus.svg");
    writeFileSync(svg, "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'><rect width='10' height='10'/></svg>");
    const lourd = join(dossier, "lourd-batiplus.jpg");
    writeFileSync(lourd, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5 * 1024 * 1024 + 100)]));
    const refusI = [];
    for (const [nomFichier, chemin] of [["faux PNG", fauxPng], ["SVG", svg], ["> 5 Mo", lourd]]) {
      await envoyer("fichier-photo", chemin);
      const msg = await page.evaluate(() => document.getElementById("msg-photo").textContent);
      const apres = (await lire()).photo;
      if (apres !== photo || !msg) fautesI.push(nomFichier + " accepté (" + msg + ")");
      else refusI.push(nomFichier + " → « " + msg + " »");
    }
    await capturer(page, "390x844-profil-images", true);
    await contexte.close();
    controle("I", "images : redessinées en WebP compressé, fichiers piégés refusés", fautesI.length === 0,
      fautesI.length ? fautesI.join(" | ")
        : "photo JPEG → WebP " + dimPhoto.join("×") + " (" + Math.round(photo.length / 1024) + " Ko), logo → " + dimLogo.join("×") + " ; " + refusI.join(" ; "));
  }

  controle("N", "aucune erreur console, CSP ou requête en échec (Chromium)", erreurs.length === 0,
    erreurs.length ? erreurs.slice(0, 4).join(" | ") : "0 erreur, 0 violation CSP, 0 requête en échec");

  await navigateur.close();
  serveur.kill();
  for (const r of resultats) console.log((r.ok ? "✔" : "✘") + " " + r.numero.padEnd(3) + " " + r.libelle + (r.detail ? "  — " + r.detail : ""));
  const echecs = resultats.filter((r) => !r.ok).length;
  console.log(echecs === 0 ? "\n✔ " + resultats.length + " contrôles navigateur réussis." : "\n✘ " + echecs + " contrôle(s) navigateur en échec.");
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("✘ vérification navigateur impossible : " + e.message + "\n" + String(e.stack).split("\n").filter((l) => l.includes("verifier-navigateur")).join("\n"));
  process.exit(1);
});
