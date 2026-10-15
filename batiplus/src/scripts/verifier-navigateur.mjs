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
     AS assistant Nouveau chantier : 5 étapes, 360 et 1440 px, rien de coupé, Suivant visible
     SV schéma SVG du tableau : textes dans leurs modules, aucun chevauchement, taille lisible
     RE écran Résultat : 6 onglets, 360 et 1440 px, clair et sombre, rien de coupé
     ㊱ fiche devis et Mes prix : 360 et 1440 px, clair et sombre, rien de coupé
     A4 feuille du devis : impression réelle (studio 1 page, villa ≤ 2), seule la feuille sort
     ㉒ tous les logos chargent et sont détourés, aucune image cassée, photo absente
        remplacée par l'illustration de repli
     ㉓ icônes maskable (navigateur et Android) : le pictogramme reste dans la zone sûre
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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chargerMoteur } from "./chantiers-types.mjs";

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

/* Analyse des pixels d'une image : coins transparents, et distance maximale au centre
   des pixels du pictogramme (rapportée au côté). `fondBlanc` : le fond est blanc opaque. */
async function analyserImage(source, fondBlanc) {
  const img = new Image();
  img.src = source;
  try { await img.decode(); } catch { return { charge: false }; }
  const toile = document.createElement("canvas");
  toile.width = img.naturalWidth;
  toile.height = img.naturalHeight;
  const ctx = toile.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const width = toile.width;
  const height = toile.height;
  const { data } = ctx.getImageData(0, 0, width, height);
  const alpha = (x, y) => data[(y * width + x) * 4 + 3];
  const coins = [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)];
  let rayon = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const motif = fondBlanc ? (255 - Math.min(data[i], data[i + 1], data[i + 2]) > 24) : data[i + 3] > 24;
      if (motif) rayon = Math.max(rayon, Math.hypot(x + 0.5 - width / 2, y + 0.5 - height / 2));
    }
  }
  return { charge: true, largeur: width, hauteur: height, coins, rayon: rayon / width };
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

  async function nouvellePage(largeur, hauteur, sombre, reduit, stockage, activiteFigee) {
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
    /* Une session reprise vient d'être utilisée (sinon le verrouillage des 15 min s'appliquerait). */
    await page.evaluate((valeurs, figee) => {
      window.localStorage.clear();
      for (const [cle, valeur] of Object.entries(valeurs || {})) {
        let ecrite = valeur;
        if (cle === "bp_v1_session" && !figee) { const s = JSON.parse(valeur); s.derniereActivite = Date.now(); ecrite = JSON.stringify(s); }
        window.localStorage.setItem(cle, ecrite);
      }
    }, stockage || {}, Boolean(activiteFigee));
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

  /* AS assistant Nouveau chantier : 5 étapes de la villa, 360 et 1440 px, clair et sombre :
     aucun débordement, aucun mot ni montant coupé, Suivant toujours visible, rien sous le menu. */
  const fautesAS = [];
  let vuesAS = 0;
  let motsAS = 0;
  {
    const piece = (id, type, surface) => ({ id, type, surface, prises: null, points: null });
    const villa = {
      id: "villa-essai-0001", compteId, creeLe: new Date().toISOString(), modifieLe: new Date().toISOString(),
      statut: "brouillon", etape: 5, etapeMax: 5,
      client: { nom: "Société Immobilière du Kadiogo", telephone: "+22605608608" },
      nom: "Villa R+1 Ouaga 2000 — famille Compaoré-Ouédraogo", lieu: "Ouaga 2000, Ouagadougou", type: "villa", alimentation: "mono",
      pieces: [piece("p1", "sejour", 36), piece("p2", "cuisine", 12), piece("p3", "chambre", 14), piece("p4", "chambre", 12), piece("p5", "chambre", 12),
        piece("p6", "salle-eau", 6), piece("p7", "salle-eau", 5), piece("p8", "wc", 2), piece("p9", "couloir", 9), piece("p10", "veranda", 12)],
      appareils: { "chauffe-eau": 1, cuisiniere: 1, "lave-linge": 1, climatiseur: 2 },
      options: { distance: 15, hauteur: 2.8, parafoudre: true, terreNeuve: true, tableauARemplacer: true },
      mainOeuvre: { points: {}, forfait: 125000000, journees: { ouvriers: 3, jours: 4.5, tarif: null }, libres: [{ libelle: "Saignées et rebouchage dans le béton banché", montant: 99999999 }] }
    };
    const avecVilla = { ...base, bp_v1_brouillon_chantier: JSON.stringify({ [compteId]: villa }) };
    for (const [largeur, hauteur, sombre] of [[360, 640, false], [360, 640, true], [1440, 900, false], [1440, 900, true]]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true, avecVilla);
      await pause(1800);
      await page.evaluate(() => document.getElementById("bouton-nouveau-chantier").click());
      await pause(400);
      for (let etape = 1; etape <= 5; etape++) {
        await page.evaluate((n) => document.querySelector("[data-etape-cible='" + n + "']").click(), etape);
        await pause(350);
        const visible = await page.evaluate(() => [1, 2, 3, 4, 5].find((n) => !document.getElementById("etape-chantier-" + n).hidden));
        if (visible !== etape) { fautesAS.push(nom + " étape " + etape + " non affichée (" + visible + ")"); continue; }
        const t = await page.evaluate(mesurerTextes, [".ecran.actif", ".entete", largeur > 1024 ? "#tiroir" : ".onglets"]);
        vuesAS++;
        motsAS += t.mots;
        if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautesAS.push(nom + " étape " + etape + " " + JSON.stringify(t));
        const bouton = await page.evaluate(() => {
          const r = document.getElementById("bouton-etape-suivante").getBoundingClientRect();
          const onglets = document.querySelector(".onglets");
          const haut = onglets && getComputedStyle(onglets).display !== "none" ? onglets.getBoundingClientRect().top : window.innerHeight;
          return { haut: Math.round(r.top), bas: Math.round(r.bottom), limite: Math.round(haut) };
        });
        if (bouton.bas > bouton.limite + 1 || bouton.haut < 0) fautesAS.push(nom + " étape " + etape + " Suivant hors de portée " + JSON.stringify(bouton));
        if (largeur > 1024) {
          const m = await page.evaluate(mesurerSousMenu);
          if (m.total) fautesAS.push(nom + " étape " + etape + " sous le menu " + JSON.stringify(m));
        }
        await capturer(page, nom + "-chantier-" + etape, true);
      }
      await contexte.close();
    }
  }
  controle("AS", "assistant chantier : rien ne déborde ni n'est coupé (360 et 1440)", fautesAS.length === 0,
    fautesAS.length ? fautesAS.slice(0, 3).join(" | ")
      : vuesAS + " vues (5 étapes de la villa, clair et sombre), " + motsAS.toLocaleString("fr-FR") + " mots mesurés, montants jusqu'à 125 000 000 FCFA sur une ligne, Suivant toujours au-dessus des onglets, rien sous le menu fixe");

  /* SV schéma du tableau mesuré dans le vrai moteur de rendu ; RE écran Résultat : 6 onglets,
     360 et 1440 px, clair et sombre, rien ne déborde, aucun mot ni montant coupé. */
  let avecEtudes36 = null;
  const fautesSV = [];
  const fautesRE = [];
  let vuesRE = 0;
  let motsRE = 0;
  const mesuresSV = [];
  {
    const piece = (id, type, surface) => ({ id, type, surface, prises: null, points: null });
    const quand = new Date().toISOString();
    const commun = { compteId, creeLe: quand, modifieLe: quand, statut: "etudie", etape: 5, etapeMax: 5 };
    const villa = {
      ...commun, id: "villa-etude-0001",
      client: { nom: "Société Immobilière du Kadiogo", telephone: "+22605608608" },
      nom: "Villa R+1 Ouaga 2000 — famille Compaoré-Ouédraogo", lieu: "Ouaga 2000, Ouagadougou", type: "villa", alimentation: "mono",
      pieces: [piece("p1", "sejour", 36), piece("p2", "cuisine", 12), piece("p3", "chambre", 14), piece("p4", "chambre", 12), piece("p5", "chambre", 12),
        piece("p6", "salle-eau", 6), piece("p7", "salle-eau", 5), piece("p8", "wc", 2), piece("p9", "couloir", 9), piece("p10", "veranda", 12)],
      appareils: { "chauffe-eau": 1, cuisiniere: 1, "lave-linge": 1, climatiseur: 2 },
      options: { distance: 15, hauteur: 2.8, parafoudre: true, terreNeuve: true, tableauARemplacer: true },
      mainOeuvre: { points: {}, forfait: 100000000, journees: { ouvriers: 3, jours: 4.5, tarif: null }, libres: [{ libelle: "Saignées et rebouchage dans le béton banché", montant: 99999999 }] },
      materiel: { "cable-1.5": { quantite: 9999, prix: 99999999 }, prise: { quantite: null, prix: 0 } },
      totaux: { remiseType: "pourcent", remise: 7.5, tva: true, tauxTva: 18, acompte: 40 }
    };
    const grand = {
      ...commun, id: "grand-etude-0002", modifieLe: new Date(Date.now() - 60000).toISOString(),
      client: { nom: "Hôtel Laïco", telephone: "" }, nom: "Hôtel 3 étages", lieu: "Koulouba", type: "bureau", alimentation: "tri",
      pieces: Array.from({ length: 14 }, (_, i) => piece("g" + i, i % 3 === 0 ? "sejour" : i % 3 === 1 ? "chambre" : "salle-eau", i % 3 === 0 ? 60 : 16)),
      appareils: { "chauffe-eau": 4, climatiseur: 6, cuisiniere: 1 },
      options: { distance: 40, hauteur: 3, parafoudre: true, terreNeuve: false, tableauARemplacer: false },
      mainOeuvre: { points: {}, forfait: 0, journees: { ouvriers: 0, jours: 0, tarif: null }, libres: [] }
    };
    const avecEtudes = { ...base, bp_v1_chantiers: JSON.stringify([villa, grand]) };
    avecEtudes36 = avecEtudes;
    const mesurerSchema = () => {
      const svg = document.querySelector("#schema-tableau svg");
      if (!svg) return { absent: true };
      const cadre = svg.getBoundingClientRect();
      const panneau = document.getElementById("panneau-tableau").getBoundingClientRect();
      const echelle = cadre.width / svg.viewBox.baseVal.width;
      const fautes = [];
      let policeMin = 99;
      let policeNumeros = 99;
      const dedans = (b, c, marge) => b.x >= c.x + marge && b.y >= c.y && b.x + b.width <= c.x + c.width - marge && b.y + b.height <= c.y + c.height;
      const coffret = svg.querySelector(".schema-coffret").getBBox();
      for (const rangee of svg.querySelectorAll(".schema-rangee")) {
        const corps = [...rangee.querySelectorAll(".module-corps")].map((r) => r.getBBox());
        corps.forEach((c, i) => {
          if (i && c.x < corps[i - 1].x + corps[i - 1].width) fautes.push("modules superposés rangée " + rangee.dataset.rangee);
          if (!dedans(c, coffret, 0)) fautes.push("module hors du coffret");
        });
        if (corps.length && corps[corps.length - 1].x + corps[corps.length - 1].width > coffret.x + coffret.width) fautes.push("rangée trop longue");
        const titre = rangee.querySelector(".t-rangee").getBBox();
        if (corps.length && titre.y + titre.height > corps[0].y) fautes.push("titre de rangée sur les modules");
        for (const g of rangee.querySelectorAll(".module")) {
          const c = g.querySelector(".module-corps").getBBox();
          const textes = [...g.querySelectorAll("text")].map((t) => ({ t, b: t.getBBox() }));
          textes.forEach(({ t, b }, i) => {
            const taille = parseFloat(getComputedStyle(t).fontSize) * echelle;
            policeMin = Math.min(policeMin, taille);
            if (t.classList.contains("t-fort")) policeNumeros = Math.min(policeNumeros, taille);
            if (!dedans(b, c, 1)) fautes.push("« " + t.textContent + " » déborde de son module");
            if (i && b.y < textes[i - 1].b.y + textes[i - 1].b.height - 0.5) fautes.push("« " + t.textContent + " » chevauche la ligne au-dessus");
          });
        }
      }
      return {
        rangees: svg.querySelectorAll(".schema-rangee").length, modules: svg.querySelectorAll(".module").length,
        largeur: Math.round(cadre.width), depasse: cadre.right > panneau.right + 0.5 || cadre.left < panneau.left - 0.5,
        policeMin: Math.round(policeMin * 10) / 10, policeNumeros: Math.round(policeNumeros * 10) / 10, fautes: [...new Set(fautes)].slice(0, 5)
      };
    };
    for (const [largeur, hauteur, sombre] of [[360, 640, false], [360, 640, true], [1440, 900, false], [1440, 900, true]]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true, avecEtudes);
      await pause(1800);
      for (const etude of [villa, grand]) {
        await page.evaluate((id) => document.querySelector("#accueil-etudes [data-chantier='" + id + "']").click(), etude.id);
        await pause(500);
        const actif = await page.evaluate(() => document.querySelector(".ecran.actif").id);
        if (actif !== "ecran-resultat") { fautesRE.push(nom + " " + etude.id + " : écran " + actif); continue; }
        const onglets = etude === villa ? ["circuits", "tableau", "materiel", "main-oeuvre", "conformite", "total"] : ["tableau"];
        for (const onglet of onglets) {
          await page.evaluate((o) => document.getElementById("onglet-" + o).click(), onglet);
          await pause(250);
          const t = await page.evaluate(mesurerTextes, [".ecran.actif", ".entete", largeur > 1024 ? "#tiroir" : ".onglets"]);
          vuesRE++;
          motsRE += t.mots;
          if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautesRE.push(nom + " " + etude.id + " " + onglet + " " + JSON.stringify(t));
          if (largeur > 1024) {
            const m = await page.evaluate(mesurerSousMenu);
            if (m.total) fautesRE.push(nom + " " + onglet + " sous le menu " + JSON.stringify(m));
          }
          if (onglet === "tableau") {
            const s = await page.evaluate(mesurerSchema);
            mesuresSV.push(s);
            if (s.absent || s.depasse || s.fautes.length || s.policeNumeros < 10 || s.policeMin < 8) fautesSV.push(nom + " " + etude.id + " " + JSON.stringify(s));
          }
          await capturer(page, nom + "-resultat-" + (etude === villa ? "" : "grand-") + onglet, true);
        }
        await page.evaluate(() => document.querySelector("#onglets [data-ecran='accueil'], #tiroir-menu [data-ecran='accueil']").click());
        await pause(400);
      }
      await contexte.close();
    }
  }
  const rangeesSV = [...new Set(mesuresSV.map((m) => m.rangees))].join(" et ");
  controle("SV", "schéma du tableau : textes dans leurs modules, rien ne dépasse", fautesSV.length === 0,
    fautesSV.length ? fautesSV.slice(0, 3).join(" | ")
      : mesuresSV.length + " schémas (" + rangeesSV + " rangées, mono 2P et tri 4P avec parafoudre) : chaque texte dans son module, aucun chevauchement, coffret jamais plus large que la carte, numéros ≥ " + Math.min(...mesuresSV.map((m) => m.policeNumeros)) + " px et textes ≥ " + Math.min(...mesuresSV.map((m) => m.policeMin)) + " px à 360 px");
  controle("RE", "écran Résultat : rien ne déborde ni n'est coupé (360 et 1440)", fautesRE.length === 0,
    fautesRE.length ? fautesRE.slice(0, 3).join(" | ")
      : vuesRE + " vues (6 onglets, clair et sombre), " + motsRE.toLocaleString("fr-FR") + " mots mesurés, montants jusqu'à 13 chiffres (1 091 610 041 974 FCFA) sur une ligne, rien sous le menu fixe");

  /* ㊱ fiche devis et Mes prix : devis réel créé depuis l'étude volumineuse (montants à 13 chiffres),
     ligne supprimée, catalogue à 5 fournisseurs aux noms longs ; 360 et 1440 px, clair et sombre. */
  {
    const fautes36 = [];
    let vues36 = 0;
    let mots36 = 0;
    const fournisseursLongs = [
      { nom: "Quincaillerie Générale du Kadiogo et Frères", prix: 99999999 },
      { nom: "Électro-Distribution Ouaga 2000", prix: 1250 },
      { nom: "Comptoir Burkinabè du Matériel", prix: 1400 },
      { nom: "Société Commerciale de Bobo-Dioulasso", prix: 1325.5 },
      { nom: "Grossiste du Marché Rood-Woko", prix: 0 }
    ];
    const catalogue36 = { [compteId]: {
      articles: [
        { ref: "prise", designation: "Prise de courant 2P+T 16 A à éclips Legrand Niloé", unite: "u", categorie: "appareillage", fournisseurs: fournisseursLongs, choisi: 1 },
        { ref: "cable-1.5", designation: "Câble rigide H07V-U 1,5 mm² (couronne de 100 m)", unite: "m", categorie: "cables", fournisseurs: fournisseursLongs, choisi: null },
        { ref: "perso-0a1b2c3d", designation: "Projecteur LED étanche 150 W détecteur crépusculaire", unite: "u", categorie: "autres", fournisseurs: [{ nom: "Importateur Général Électrique du Sahel", prix: 99999999 }], choisi: null }
      ],
      mainOeuvre: { points: { prise: 99999999, tableau: 25000 }, journee: 99999999 }
    } };
    const etat36 = { ...avecEtudes36, bp_v1_catalogue: JSON.stringify(catalogue36) };
    for (const [largeur, hauteur, sombre] of [[360, 640, false], [360, 640, true], [1440, 900, false], [1440, 900, true]]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true, etat36);
      await pause(1800);
      const mesurer = async (vue) => {
        const t = await page.evaluate(mesurerTextes, [".ecran.actif", ".entete", largeur > 1024 ? "#tiroir" : ".onglets"]);
        vues36++;
        mots36 += t.mots;
        if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautes36.push(nom + " " + vue + " " + JSON.stringify(t));
        if (largeur > 1024) {
          const m = await page.evaluate(mesurerSousMenu);
          if (m.total) fautes36.push(nom + " " + vue + " sous le menu " + JSON.stringify(m));
        }
        await capturer(page, nom + "-" + vue, true);
      };
      await page.evaluate(() => document.querySelector("#accueil-etudes [data-chantier='villa-etude-0001']").click());
      await pause(500);
      await page.evaluate(() => document.getElementById("bouton-creer-devis").click());
      await pause(900);
      const actif = await page.evaluate(() => document.querySelector(".ecran.actif").id);
      if (actif !== "ecran-fiche-devis") { fautes36.push(nom + " création du devis : écran " + actif); await contexte.close(); continue; }
      await page.evaluate(() => document.querySelector("#devis-lignes [data-supprimer-ligne]").click());
      await pause(400);
      await page.evaluate(() => { const b = document.getElementById("devis-bloc-supprimees"); if (b && b.tagName === "DETAILS") b.open = true; });
      await pause(200);
      await mesurer("fiche-devis");
      await page.evaluate(() => document.querySelector("#tiroir-menu [data-ecran='prix']").click());
      await pause(600);
      const actifPrix = await page.evaluate(() => document.querySelector(".ecran.actif").id);
      if (actifPrix !== "ecran-prix") { fautes36.push(nom + " Mes prix : écran " + actifPrix); await contexte.close(); continue; }
      await page.evaluate(() => document.querySelectorAll("#ecran-prix details").forEach((d) => { d.open = true; }));
      await pause(300);
      await mesurer("mes-prix");
      await contexte.close();
    }
    controle("㊱", "fiche devis et Mes prix : rien ne déborde ni n'est coupé (360 et 1440)", fautes36.length === 0,
      fautes36.length ? fautes36.slice(0, 3).join(" | ")
        : vues36 + " vues (fiche devis créée depuis l'étude, ligne supprimée, Mes prix tout déplié, clair et sombre), " + mots36.toLocaleString("fr-FR") + " mots mesurés, montants à 13 chiffres et 5 fournisseurs aux noms longs sur une ligne, rien sous le menu fixe");
  }

  /* LI Mes devis, Mes chantiers, Mes clients, Statistiques : devis aux montants géants et noms longs,
     brouillon, client saisi à la main ; bandeau « Annuler » ; 360 et 1440 px, clair et sombre. */
  {
    const fautesLI = [];
    let vuesLI = 0;
    let motsLI = 0;
    const moteurLI = chargerMoteur();
    const catalogueLI = Object.fromEntries(Object.entries(moteurLI.CATALOGUE_DEFAUT).map(([r, a]) => [r, { ...a }]));
    const chantiersLI = JSON.parse(avecEtudes36.bp_v1_chantiers);
    const annee = new Date().getFullYear();
    const jour = 86400000;
    const devisLI = [
      ["Installation électrique complète villa R+2 Ouaga 2000 — famille Compaoré-Ouédraogo", "Société Immobilière du Kadiogo et Associés", "accepte", 0, chantiersLI[0], "+22605608608"],
      ["Hôtel 3 étages Koulouba", "Hôtel Laïco", "envoye", 1, chantiersLI[1], ""],
      ["Rénovation tableau général et prises", "Mme Sawadogo Aminata", "paye", 3, chantiersLI[1], "+22670123456"],
      ["Éclairage atelier", "M. Ilboudo", "refuse", 35, chantiersLI[0], ""],
      ["Studio Gounghin", "M. Kaboré Issouf", "brouillon", 2, chantiersLI[1], ""]
    ].map(([titre, client, statut, age, chantier, telephone], i) => ({
      ...moteurLI.devisDepuisChiffrage(moteurLI.chiffrerChantier(chantier, catalogueLI, "XOF", null)),
      id: "li" + i, compteId, numero: "BP-" + annee + "-00" + (10 + i), statut, titre, client, clientTelephone: telephone, lieu: "Ouaga 2000, Ouagadougou",
      chantierId: null, conditions: "", note: "", creeLe: new Date(Date.now() - age * jour).toISOString(), modifieLe: new Date(Date.now() - age * jour).toISOString()
    }));
    devisLI.push({ id: "ancien1", compteId, titre: "Ancien devis d'avant la mise à jour", client: "M. Ilboudo", total: 99999999, statut: "accepte", creeLe: new Date(Date.now() - 400 * jour).toISOString() });
    const brouillonLI = { [compteId]: { ...chantiersLI[0], id: "brouillon-li-0001", nom: "Immeuble R+4 avenue Kwame-Nkrumah — saisie en cours", statut: "brouillon", etape: 3, etapeMax: 3 } };
    const clientsLI = [{ id: "cli1", compteId, nom: "Entreprise Générale de Construction du Burkina", telephone: "+22676543210", creeLe: new Date().toISOString(), modifieLe: new Date().toISOString() }];
    const etatLI = { ...avecEtudes36, bp_v1_devis: JSON.stringify(devisLI), bp_v1_brouillon_chantier: JSON.stringify(brouillonLI), bp_v1_clients: JSON.stringify(clientsLI) };
    for (const [largeur, hauteur, sombre] of [[360, 640, false], [360, 640, true], [1440, 900, false], [1440, 900, true]]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true, etatLI);
      await pause(1800);
      const mesurer = async (vue, selecteurs) => {
        const t = await page.evaluate(mesurerTextes, selecteurs || [".ecran.actif", ".entete", largeur > 1024 ? "#tiroir" : ".onglets"]);
        vuesLI++;
        motsLI += t.mots;
        if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautesLI.push(nom + " " + vue + " " + JSON.stringify(t));
        if (largeur > 1024) {
          const m = await page.evaluate(mesurerSousMenu);
          if (m.total) fautesLI.push(nom + " " + vue + " sous le menu " + JSON.stringify(m));
        }
        await capturer(page, nom + "-" + vue, true);
      };
      const aller = async (ecran) => {
        await page.evaluate((e) => (document.querySelector("#tiroir-menu [data-ecran='" + e + "']") || document.querySelector("#carte-stats [data-ecran='" + e + "']")).click(), ecran);
        await pause(600);
        return page.evaluate(() => document.querySelector(".ecran.actif").id);
      };
      for (const ecran of ["devis", "chantiers", "clients", "stats"]) {
        const actif = await aller(ecran);
        if (actif !== "ecran-" + ecran) { fautesLI.push(nom + " " + ecran + " : écran " + actif); continue; }
        await mesurer(ecran);
      }
      /* Bandeau « Annuler » après une suppression confirmée. */
      await aller("devis");
      await page.evaluate(() => document.querySelector("#liste-devis [data-supprimer-devis='li0']").click());
      await pause(300);
      await page.evaluate(() => document.getElementById("bouton-modale-ok").click());
      await pause(600);
      const bandeau = await page.evaluate(() => {
        const b = document.getElementById("annulation");
        const r = b.getBoundingClientRect();
        const onglets = document.querySelector(".onglets");
        const o = onglets && onglets.getClientRects().length ? onglets.getBoundingClientRect() : null;
        return { visible: !b.hidden && r.width > 0, gauche: Math.round(r.left), droite: Math.round(r.right), bas: Math.round(r.bottom), hautOnglets: o ? Math.round(o.top) : null, largeur: window.innerWidth };
      });
      if (!bandeau.visible || bandeau.gauche < 0 || bandeau.droite > bandeau.largeur || (bandeau.hautOnglets !== null && bandeau.bas > bandeau.hautOnglets)) fautesLI.push(nom + " bandeau Annuler " + JSON.stringify(bandeau));
      const t = await page.evaluate(mesurerTextes, ["#annulation"]);
      if (t.motsCoupes.length || t.rognes.length || t.deborde.length) fautesLI.push(nom + " bandeau Annuler " + JSON.stringify(t));
      await capturer(page, nom + "-annulation");
      await contexte.close();
    }
    controle("LI", "Mes devis, chantiers, clients, statistiques : rien ne déborde ni n'est coupé (360 et 1440)", fautesLI.length === 0,
      fautesLI.length ? fautesLI.slice(0, 3).join(" | ")
        : vuesLI + " vues (4 écrans, clair et sombre), " + motsLI.toLocaleString("fr-FR") + " mots mesurés, montants à 13 chiffres et noms longs sur une ligne, boutons d'action sur 360 px, bandeau « Annuler » au-dessus des onglets, rien sous le menu fixe");
  }

  /* A4 feuille du devis dans le vrai moteur d'impression : studio sur 1 page, villa aux montants
     géants sur 2 pages au plus ; à l'impression seule la feuille sort ; aperçu 360/1440 sans coupure. */
  {
    const fautesA4 = [];
    const pagesA4 = {};
    const quand = new Date().toISOString();
    const studio = {
      compteId, creeLe: quand, modifieLe: quand, statut: "etudie", etape: 5, etapeMax: 5, id: "studio-etude-0003",
      client: { nom: "M. Kaboré Issouf", telephone: "+22670123456" }, nom: "Studio 25 m² — séjour, salle d'eau, WC", lieu: "Gounghin, Ouagadougou", type: "appartement", alimentation: "mono",
      pieces: [{ id: "s1", type: "sejour", surface: 18, prises: null, points: null }, { id: "s2", type: "salle-eau", surface: 4, prises: null, points: null }, { id: "s3", type: "wc", surface: 3, prises: null, points: null }],
      appareils: {}, options: { distance: 0, hauteur: 2.8, parafoudre: false, terreNeuve: false, tableauARemplacer: false },
      mainOeuvre: { points: {}, forfait: 0, journees: { ouvriers: 0, jours: 0, tarif: null }, libres: [] }
    };
    const chantiersA4 = JSON.parse(avecEtudes36.bp_v1_chantiers).concat([studio]);
    const etatA4 = { ...avecEtudes36, bp_v1_chantiers: JSON.stringify(chantiersA4) };
    const compter = (pdf) => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
    for (const [largeur, hauteur] of [[360, 640], [1440, 900]]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, false, true, etatA4);
      await pause(1800);
      for (const [cle, id, maximum] of [["studio", "studio-etude-0003", 1], ["villa", "villa-etude-0001", 2]]) {
        await page.evaluate(() => document.querySelector("#tiroir-menu [data-ecran='accueil']").click());
        await pause(400);
        await page.evaluate((i) => document.querySelector("#accueil-etudes [data-chantier='" + i + "']").click(), id);
        await pause(500);
        await page.evaluate(() => (document.getElementById("bouton-ouvrir-devis").hidden ? document.getElementById("bouton-creer-devis") : document.getElementById("bouton-ouvrir-devis")).click());
        await pause(900);
        await page.evaluate(() => document.getElementById("devis-bouton-imprimer").click());
        await pause(700);
        const actif = await page.evaluate(() => document.querySelector(".ecran.actif").id);
        if (actif !== "ecran-feuille") { fautesA4.push(nom + " " + cle + " : écran " + actif); continue; }
        const t = await page.evaluate(mesurerTextes, [".ecran.actif", ".entete"]);
        if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautesA4.push(nom + " " + cle + " aperçu " + JSON.stringify(t));
        await capturer(page, nom + "-feuille-" + cle, true);
        await page.emulateMediaType("print");
        const imprime = await page.evaluate(() => {
          const visible = (s) => [...document.querySelectorAll(s)].some((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
          const feuille = document.getElementById("feuille-a4");
          return {
            autres: [".entete", "#tiroir", ".onglets", ".actions-feuille", "#feuille-a-completer"].filter((s) => visible(s)),
            feuille: visible("#feuille-a4"), zoom: getComputedStyle(feuille).zoom, largeur: Math.round(feuille.getBoundingClientRect().width)
          };
        });
        /* Mots mesurés à l'impression seulement quand la fenêtre est au moins aussi large qu'une
           page A4 : à 360 px, l'émulation « print » met la feuille en page dans la fenêtre, ce
           qu'une vraie impression ne fait jamais (elle utilise la largeur de la page). */
        const t2 = largeur >= 794 ? await page.evaluate(mesurerTextes, ["#feuille-a4"]) : { motsCoupes: [], rognes: [] };
        if (t2.motsCoupes.length || t2.rognes.length) fautesA4.push(nom + " " + cle + " impression " + JSON.stringify(t2));
        if (imprime.autres.length || !imprime.feuille || String(imprime.zoom) !== "1") fautesA4.push(nom + " " + cle + " impression : " + JSON.stringify(imprime));
        if (largeur === 1440) await capturer(page, "impression-" + cle, true);
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        await page.emulateMediaType(null);
        const n = compter(pdf);
        pagesA4[cle] = n;
        if (n < 1 || n > maximum) fautesA4.push(nom + " " + cle + " : " + n + " page(s) A4 imprimée(s), attendu ≤ " + maximum);
      }
      await contexte.close();
    }
    controle("A4", "feuille A4 imprimée : studio sur 1 page, seule la feuille sort", fautesA4.length === 0,
      fautesA4.length ? fautesA4.slice(0, 3).join(" | ")
        : "impression Chromium (@page A4, marges 12 mm) : studio " + pagesA4.studio + " page, villa aux montants géants " + pagesA4.villa + " pages ; en-tête, menu, boutons et alerte masqués, zoom 1 ; aperçu 360 et 1440 px sans mot ni montant coupé");
  }


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

  /* ㉒ logos et images */
  {
    const fautes22 = [];
    const { page, contexte } = await nouvellePage(390, 844, false, true, base);
    await pause(1800);
    const logos = ["images/logo/batiplus-couleur.webp", "images/logo/batiplus-blanc.webp", "images/logo/batiplus-fond-noir.webp", "images/brg/brg-couleur.webp", "images/brg/brg-blanc.webp"];
    for (const logo of logos) {
      const a = await page.evaluate(analyserImage, logo, false);
      if (!a.charge) fautes22.push(logo + " ne charge pas");
      else if (a.coins.some((c) => c !== 0)) fautes22.push(logo + " non détouré (coins " + a.coins.join(",") + ")");
    }
    /* Chaque image référencée par la page se décode. */
    const sources = await page.evaluate(() => [...new Set([...document.querySelectorAll("img[src]")].map((i) => i.getAttribute("src")).filter((s) => s && !s.startsWith("data:")))]);
    for (const src of sources) {
      const a = await page.evaluate(analyserImage, src, false);
      if (!a.charge) fautes22.push(src + " ne se décode pas");
    }
    /* Images visibles réellement chargées (bas d'écran compris), jamais remplacées à tort. */
    let visibles = 0;
    for (const ecran of ["accueil", "a-propos", "profil"]) {
      await ouvrirEcran(page, ecran);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await pause(900);
      const etat = await page.evaluate(() => [...document.querySelectorAll(".ecran.actif img, .entete img")]
        .filter((i) => i.getBoundingClientRect().width > 0 && !i.hidden && getComputedStyle(i).display !== "none")
        .map((i) => ({ src: i.getAttribute("src").slice(0, 40), ok: i.complete && i.naturalWidth > 0, repli: i.dataset.repli === "1" })));
      visibles += etat.length;
      for (const e of etat) if (!e.ok || e.repli) fautes22.push(ecran + " : " + JSON.stringify(e));
    }
    await contexte.close();

    /* Photo absente : l'illustration de repli la remplace (page à part, la requête bloquée est voulue). */
    const essai = await navigateur.newPage();
    await essai.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await essai.goto(ADRESSE + "manifest.webmanifest");
    await essai.evaluate((valeurs) => { localStorage.clear(); for (const [c, v] of Object.entries(valeurs)) localStorage.setItem(c, v); }, base);
    await essai.setRequestInterception(true);
    essai.on("request", (r) => (/equipe-chantier\.webp|elec-cables\.webp/.test(r.url()) ? r.abort() : r.continue()));
    await essai.goto(ADRESSE, { waitUntil: "load" });
    await pause(1800);
    await essai.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await pause(1200);
    const replis = await essai.evaluate(() => [...document.querySelectorAll("#ecran-accueil .photo-cadre img")]
      .map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0 })));
    await capturer(essai, "390x844-photo-repli", true);
    await essai.close();
    const remplacees = replis.filter((r) => r.src.endsWith("electricien-repli.svg") && r.ok).length;
    if (remplacees !== 2 || replis.some((r) => !r.ok)) fautes22.push("repli : " + JSON.stringify(replis));
    controle("㉒", "tous les logos chargent, aucun cadre cassé", fautes22.length === 0,
      fautes22.length ? fautes22.slice(0, 4).join(" | ")
        : "5 logos détourés (coins transparents), " + sources.length + " images référencées décodées, " + visibles + " images visibles chargées ; 2 photos bloquées → illustration d'électricien, jamais de cadre vide");
  }

  /* ㉓ icônes maskable : le pictogramme reste dans la zone sûre */
  {
    const page = await navigateur.newPage();
    await page.goto(ADRESSE, { waitUntil: "load" });
    const enDonnees = (chemin) => "data:image/png;base64," + readFileSync(join(RACINE, chemin)).toString("base64");
    const res = "android/app/src/main/res/";
    /* Navigateur : cercle sûr de 40 % du côté (W3C). Android : l'avant-plan est encadré d'une marge de
       16,7 % ; le cercle sûr de 66 dp sur 72 dp visibles vaut 45,8 % du côté de l'image. */
    const cas = [
      ["www/images/logo/icon-maskable-512.png", true, 0.40],
      [res + "mipmap-xxxhdpi/ic_launcher_foreground.png", false, 0.458],
      [res + "mipmap-mdpi/ic_launcher_foreground.png", false, 0.458]
    ];
    const fautes23 = [];
    const mesures23 = [];
    for (const [chemin, fondBlanc, limite] of cas) {
      const a = await page.evaluate(analyserImage, enDonnees(chemin), fondBlanc);
      if (!a.charge) { fautes23.push(chemin + " illisible"); continue; }
      mesures23.push(chemin.split("/").slice(-2).join("/") + " " + Math.round(a.rayon * 100) + " % ≤ " + Math.round(limite * 1000) / 10 + " %");
      if (a.rayon > limite) fautes23.push(chemin + " : pictogramme à " + (a.rayon * 100).toFixed(1) + " % du centre (limite " + limite * 100 + " %)");
    }
    await page.close();
    controle("㉓", "les icônes maskables ne sont pas rognées", fautes23.length === 0,
      fautes23.length ? fautes23.join(" | ") : "distance maximale du pictogramme au centre : " + mesures23.join(" ; "));
  }

  /* VE écran verrouillé (étape 10) : lisible, clavier utilisable, menu et onglets absents */
  {
    const fautesVE = [];
    const sessionAncienne = { ...base, bp_v1_session: JSON.stringify({ ...JSON.parse(base.bp_v1_session || "{}"), derniereActivite: Date.now() - 20 * 60000 }) };
    for (const [largeur, hauteur, sombre] of [[360, 640, false], [390, 844, true], [1280, 800, false]]) {
      const { page, contexte, nom } = await nouvellePage(largeur, hauteur, sombre, true, sessionAncienne, true);
      await pause(1800);
      const etat = await page.evaluate(() => {
        const vis = (el) => el && !el.closest("[hidden]") && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden";
        const touches = [...document.querySelectorAll("#clavier-verrou .touche:not(.touche-vide)")].map((t) => t.getBoundingClientRect());
        return {
          actif: (document.querySelector(".ecran.actif") || {}).id,
          menu: vis(document.getElementById("tiroir")) || vis(document.querySelector(".onglets")) || vis(document.getElementById("bouton-menu")),
          touches: touches.length, petites: touches.filter((r) => r.width < 44 || r.height < 44).length,
          bouton: vis(document.getElementById("bouton-deverrouiller")), compte: (document.getElementById("verrou-telephone") || {}).textContent
        };
      });
      if (etat.actif !== "ecran-verrou") { fautesVE.push(nom + " : " + etat.actif); await contexte.close(); continue; }
      if (etat.menu) fautesVE.push(nom + " : menu ou onglets visibles sous le verrou");
      if (etat.touches !== 11 || etat.petites) fautesVE.push(nom + " : clavier " + etat.touches + " touches, " + etat.petites + " < 44 px");
      if (!etat.bouton || !etat.compte) fautesVE.push(nom + " : bouton ou compte absent");
      const t = await page.evaluate(mesurerTextes, ["#ecran-verrou"]);
      if (t.motsCoupes.length || t.rognes.length || t.deborde.length || t.defileX) fautesVE.push(nom + " " + JSON.stringify(t));
      await capturer(page, nom + "-verrou");
      for (const c of "999990") await page.click("#clavier-verrou [data-touche='" + c + "']");
      await page.click("#bouton-deverrouiller");
      await pause(1500);
      const message = await page.evaluate(() => document.getElementById("msg-verrou").textContent);
      if (!message.startsWith("Code incorrect")) fautesVE.push(nom + " : mauvais code → « " + message + " »");
      await contexte.close();
    }
    controle("VE", "écran verrouillé : lisible, clavier ≥ 44 px, rien d'autre accessible", fautesVE.length === 0,
      fautesVE.join(" | ") || "360×640, 390×844 sombre, 1280×800 : session de 20 min → verrou, ni menu ni onglets, 11 touches ≥ 44 px, aucun texte coupé, mauvais code signalé");
  }

  /* CA garde anti-encadrement (étape 10) : chargée dans le cadre d'une page tierce, l'application
     ne montre ni écran ni champ, seulement un lien qui l'ouvre dans sa propre fenêtre. */
  {
    const page = await navigateur.newPage();
    await page.setViewport({ width: 900, height: 760 });
    const fautesCA = [];
    page.on("pageerror", (e) => fautesCA.push("erreur : " + e.message));
    await page.setContent("<!doctype html><html><head><title>Page tierce</title></head><body style=\"margin:0\"><iframe src=\"" + ADRESSE + "\" width=\"420\" height=\"720\" style=\"border:0\"></iframe></body></html>");
    await new Promise((r) => setTimeout(r, 2500));
    const cadre = page.frames().find((f) => f.url().startsWith(ADRESSE));
    let etat = null;
    if (!cadre) fautesCA.push("cadre non chargé");
    else {
      etat = await cadre.evaluate(() => {
        const lien = document.querySelector(".hors-cadre a");
        const titre = document.querySelector(".hors-cadre h1");
        const boite = lien ? lien.getBoundingClientRect() : { width: 0, height: 0 };
        return {
          horsCadre: !!document.querySelector(".hors-cadre"),
          ecrans: document.querySelectorAll(".ecran, input, textarea, button, form").length,
          href: lien ? lien.href : "", target: lien ? lien.target : "", rel: lien ? lien.rel : "",
          visible: boite.width > 0 && boite.height >= 44,
          titre: titre ? titre.textContent : "",
          debordement: document.documentElement.scrollWidth > window.innerWidth
        };
      });
      if (!etat.horsCadre) fautesCA.push("l'application s'affiche dans le cadre");
      if (etat.ecrans) fautesCA.push(etat.ecrans + " écrans ou champs présents dans le cadre");
      if (etat.href !== ADRESSE || etat.target !== "_blank" || etat.rel !== "noopener noreferrer") fautesCA.push("lien « Ouvrir BâtiPlus » : " + JSON.stringify(etat));
      if (!etat.visible || etat.debordement) fautesCA.push("lien invisible ou page qui déborde");
      if (CAPTURES) await page.screenshot({ path: join(CAPTURES, "hors-cadre.png") });
    }
    await page.close();
    controle("CA", "dans le cadre d'une autre page, l'application ne s'affiche pas", fautesCA.length === 0,
      fautesCA.join(" | ") || "cadre tiers → « " + etat.titre + " », aucun écran ni champ, lien Ouvrir BâtiPlus (nouvel onglet, noopener noreferrer, cible ≥ 44 px)");
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
