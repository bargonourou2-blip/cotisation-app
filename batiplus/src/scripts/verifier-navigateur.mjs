#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur dans un vrai navigateur (Chromium)
   Contrôles qui demandent un moteur de rendu, donc impossibles dans jsdom :
     ⑬ aucun débordement ni texte coupé (360×640 → 1440×900, chaque diapositive,
        inscription et connexion, thèmes clair et sombre)
     ⑭ écran de démarrage réel (logo chargé, calque éclair) + animations coupées
        si l'appareil demande moins de mouvement
     ⑯ champs ≥ 16 px (pas de zoom au toucher) et touches du clavier ≥ 48 px
     N  aucune erreur console, aucune violation CSP, aucune requête en échec
   Outils de vérification uniquement, jamais embarqués :
     npm i --no-save puppeteer-core
     CHROME_PATH=/chemin/vers/chrome node src/scripts/verifier-navigateur.mjs
   Variables : CHROME_PATH, OUTILS (dossier où puppeteer-core est installé),
   CAPTURES (dossier des captures d'écran, hors dépôt), PORT (défaut 8091).
   ========================================================================== */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
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

  async function nouvellePage(largeur, hauteur, sombre, reduit) {
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
    await page.evaluate(() => window.localStorage.clear());
    await page.goto(ADRESSE, { waitUntil: "load" });
    return { page, contexte, nom };
  }

  async function capturer(page, nom) {
    if (CAPTURES) await page.screenshot({ path: join(CAPTURES, nom + ".png") });
  }

  /* ⑭ démarrage réel */
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
    controle("⑭", "démarrage (navigateur réel) et mouvement réduit respecté", ok,
      ok ? "logo chargé, éclair animé, sans en-tête ; présentation après 1,5 s ; 0 animation si mouvement réduit"
        : JSON.stringify({ ...splash, apres, animations }));
  }

  /* ⑬ débordements et ⑯ saisie, à chaque taille */
  const fautes = [];
  let mesures = 0;
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
        mesures++;
        if (m.deborde.length || m.coupes.length || m.defileX) fautes.push(nom + " " + onglet + " " + JSON.stringify(m));
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
        if (modale.defileX) fautes.push("modale déborde");
        saisie = await page.evaluate(mesurerSaisie);
      }
      await contexte.close();
    }
  }
  controle("⑬", "aucun débordement ni texte coupé, du 360×640 au 1440×900", fautes.length === 0,
    fautes.length ? fautes.slice(0, 3).join(" | ") : mesures + " vues mesurées (4 diapositives tenant dans l'écran + inscription + connexion ; 5 tailles ; clair et sombre)");
  const okSaisie = saisie && saisie.petits.length === 0 && saisie.petitesTouches === 0 && saisie.boutons.length === 0;
  controle("⑯", "champs ≥ 16 px (pas de zoom), touches ≥ 48 px, boutons ≥ 44 px", okSaisie,
    okSaisie ? saisie.champs + " champs ≥ 16 px, " + saisie.touches + " touches ≥ 48 px" : JSON.stringify(saisie));

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
  console.error("✘ vérification navigateur impossible : " + e.message);
  process.exit(1);
});
