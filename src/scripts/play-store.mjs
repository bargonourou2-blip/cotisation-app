#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — images de la fiche Google Play (étape 13)
   Produit, dans un vrai navigateur (Chromium) et avec les polices et logos locaux :
     store/captures/01-…png à 06-…png  captures 1080 × 1920 (écran 360 × 640, densité 3)
     store/banniere-1024x500.png        image de présentation 1024 × 500
     (store/icone-512.png : icône 512 × 512 RGBA, tirée de www/images/logo/icon-512.png)
   Données d'exemple réalistes : compte créé par l'interface, étude d'une villa, devis.
   Outils de vérification uniquement, jamais embarqués :
     npm i --no-save puppeteer-core            (ou OUTILS=dossier contenant puppeteer-core)
     CHROME_PATH=/chemin/vers/chrome npm run play-store
   ========================================================================== */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chargerMoteur } from "./chantiers-types.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STORE = join(RACINE, "store");
const CAPTURES = join(STORE, "captures");
const OUTILS = process.env.OUTILS || RACINE;
const PORT = Number(process.env.PORT) || 8093;
const ADRESSE = "http://127.0.0.1:" + PORT + "/";
const exiger = createRequire(join(OUTILS, "package.json"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function cheminChrome() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] };
  const chromium = exiger("@sparticuz/chromium");
  const module = chromium.default || chromium;
  return { executablePath: await module.executablePath(), args: module.args };
}

const piece = (id, type, surface) => ({ id, type, surface, prises: null, points: null });

async function main() {
  mkdirSync(CAPTURES, { recursive: true });
  for (const f of readdirSync(CAPTURES)) if (f.endsWith(".png")) rmSync(join(CAPTURES, f));

  const serveur = spawn(process.execPath, [join(RACINE, "src", "scripts", "apercu.mjs")], {
    env: { ...process.env, PORT: String(PORT), HOTE: "127.0.0.1" }, stdio: "ignore"
  });
  await pause(600);
  const puppeteer = exiger("puppeteer-core");
  const navigateur = await (puppeteer.default || puppeteer).launch({ ...(await cheminChrome()), headless: true });
  const erreurs = [];

  async function nouvellePage(stockage, largeur, hauteur, densite) {
    const page = await navigateur.newPage();
    page.on("pageerror", (e) => erreurs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }]);
    await page.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: densite, isMobile: true, hasTouch: true });
    await page.goto(ADRESSE + "manifest.webmanifest", { waitUntil: "load" });
    await page.evaluate((valeurs) => {
      window.localStorage.clear();
      for (const [cle, valeur] of Object.entries(valeurs)) {
        let ecrite = valeur;
        if (cle === "bp_v1_session") { const s = JSON.parse(valeur); s.derniereActivite = Date.now(); ecrite = JSON.stringify(s); }
        window.localStorage.setItem(cle, ecrite);
      }
    }, stockage);
    await page.goto(ADRESSE, { waitUntil: "load" });
    await pause(2000);
    return page;
  }

  /* 1. Compte réel, créé par l'interface (empreinte du code calculée par l'application). */
  const inscription = await nouvellePage({ bp_v1_presentation_vue: "1" }, 390, 844, 1);
  await inscription.type("#ins-nom", "Issouf Kaboré");
  await inscription.type("#ins-entreprise", "Kaboré Électricité Services");
  await inscription.type("#ins-telephone", "+226 70 11 22 33");
  await inscription.type("#ins-ville", "Ouagadougou");
  await pause(400);
  await inscription.click("#ins-code");
  await pause(400);
  for (const c of "258071258071") await inscription.click('#clavier-inscription [data-touche="' + c + '"]');
  await inscription.evaluate(() => { document.getElementById("ins-conditions").checked = true; });
  await inscription.click("#bouton-inscription");
  await inscription.waitForFunction(() => document.querySelector(".ecran.actif").id === "ecran-accueil", { timeout: 10000 });
  const base = await inscription.evaluate(() => ({ ...window.localStorage }));
  await inscription.close();
  const compteId = JSON.parse(base.bp_v1_comptes)[0].id;

  /* 2. Données d'exemple : une villa étudiée, quelques devis de différents statuts. */
  const quand = new Date().toISOString();
  const villa = {
    id: "villa-exemple-0001", compteId, creeLe: quand, modifieLe: quand, statut: "etudie", etape: 5, etapeMax: 5,
    client: { nom: "M. et Mme Ouédraogo", telephone: "+22676543210" },
    nom: "Villa F4 Ouaga 2000", lieu: "Ouaga 2000, Ouagadougou", type: "villa", alimentation: "mono",
    pieces: [piece("p1", "sejour", 32), piece("p2", "cuisine", 12), piece("p3", "chambre", 14), piece("p4", "chambre", 12),
      piece("p5", "chambre", 11), piece("p6", "salle-eau", 6), piece("p7", "wc", 2), piece("p8", "couloir", 8), piece("p9", "veranda", 10)],
    appareils: { "chauffe-eau": 1, cuisiniere: 1, "lave-linge": 1, climatiseur: 2 },
    options: { distance: 12, hauteur: 2.8, parafoudre: true, terreNeuve: true, tableauARemplacer: false },
    mainOeuvre: { points: {}, forfait: 0, journees: { ouvriers: 2, jours: 4, tarif: null }, libres: [] },
    totaux: { remiseType: "pourcent", remise: 0, tva: false, tauxTva: 18, acompte: 40 }
  };
  const m = chargerMoteur();
  const catalogue = Object.fromEntries(Object.entries(m.CATALOGUE_DEFAUT).map(([r, a]) => [r, { ...a }]));
  const annee = new Date().getFullYear();
  const jour = 86400000;
  const boutique = { ...villa, id: "boutique-exemple", nom: "Boutique Dapoya", type: "boutique", pieces: [piece("b1", "sejour", 40), piece("b2", "wc", 2)], appareils: { climatiseur: 1 } };
  const devis = [
    ["Rénovation tableau et prises", "Mme Sawadogo Aminata", "paye", 9, boutique, "+22670123456"],
    ["Boutique Dapoya", "Ets Zongo et Fils", "accepte", 4, boutique, "+22678001122"],
    ["Studio Gounghin", "M. Traoré Moussa", "envoye", 2, boutique, ""]
  ].map(([titre, client, statut, age, chantier, telephone], i) => ({
    ...m.devisDepuisChiffrage(m.chiffrerChantier(chantier, catalogue, "XOF", null)),
    id: "ex" + i, compteId, numero: "BP-" + annee + "-000" + (i + 1), statut, titre, client, clientTelephone: telephone, lieu: "Ouagadougou",
    chantierId: null, conditions: "Devis valable 30 jours. Acompte de 40 % à la commande, solde à la fin des travaux.", note: "",
    creeLe: new Date(Date.now() - age * jour).toISOString(), modifieLe: new Date(Date.now() - age * jour).toISOString()
  }));
  const etat = { ...base, bp_v1_chantiers: JSON.stringify([villa]), bp_v1_devis: JSON.stringify(devis), bp_v1_numeros_devis: JSON.stringify({ [compteId + ":" + annee]: 3 }) };

  const fermerModale = async (page) => {
    const ouverte = await page.evaluate(() => {
      const modale = document.getElementById("modale");
      if (!modale || modale.hidden) return false;
      document.getElementById("bouton-fermer-modale").click();
      return true;
    });
    if (ouverte) await pause(500);
  };
  const capturer = async (page, nom) => {
    await fermerModale(page);
    return page.screenshot({ path: join(CAPTURES, nom + ".png") });
  };
  const allerA = (page, selecteur) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 76));
  }, selecteur);

  /* 3. Captures 1080 × 1920. */
  const page = await nouvellePage(etat, 360, 640, 3);
  await capturer(page, "01-accueil");

  await page.evaluate(() => document.querySelector("#accueil-etudes [data-chantier='villa-exemple-0001']").click());
  await pause(700);
  await page.evaluate(() => document.getElementById("onglet-tableau").click());
  await pause(500);
  await allerA(page, "#schema-tableau");
  await pause(300);
  await capturer(page, "03-tableau-electrique");
  await page.evaluate(() => document.getElementById("onglet-circuits").click());
  await pause(500);
  await allerA(page, "#panneau-circuits");
  await pause(300);
  await capturer(page, "04-circuits-nf-c-15-100");

  await page.evaluate(() => document.getElementById("bouton-creer-devis").click());
  await pause(1200);
  await fermerModale(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await pause(5000);
  await capturer(page, "05-devis");
  await page.evaluate(() => document.getElementById("devis-bouton-imprimer").click());
  await pause(1200);
  await allerA(page, "#feuille-a4");
  await pause(300);
  await capturer(page, "06-devis-a4-pdf-whatsapp");
  await page.close();

  /* Assistant : étape « Pièces » d'un nouveau chantier (brouillon en cours). */
  const brouillon = { ...villa, id: "brouillon-exemple", statut: "brouillon", etape: 2, etapeMax: 5 };
  const pageChantier = await nouvellePage({ ...etat, bp_v1_brouillon_chantier: JSON.stringify({ [compteId]: brouillon }) }, 360, 640, 3);
  await pageChantier.evaluate(() => document.getElementById("bouton-nouveau-chantier").click());
  await pause(600);
  await pageChantier.evaluate(() => document.querySelector("[data-etape-cible='2']").click());
  await pause(600);
  await allerA(pageChantier, "#liste-pieces");
  await pause(300);
  await capturer(pageChantier, "02-etude-guidee");
  await pageChantier.close();

  /* 4. Bannière 1024 × 500 : page servie à la même origine (polices et logos locaux). */
  const banniere = await navigateur.newPage();
  await banniere.setViewport({ width: 1024, height: 500, deviceScaleFactor: 1 });
  await banniere.setRequestInterception(true);
  banniere.on("request", (requete) => {
    if (requete.url() === ADRESSE + "__banniere") {
      requete.respond({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE_BANNIERE });
    } else if (requete.url().startsWith(ADRESSE)) {
      requete.continue();
    } else {
      requete.abort();
    }
  });
  await banniere.goto(ADRESSE + "__banniere", { waitUntil: "networkidle0" });
  await banniere.evaluate(() => document.fonts.ready);
  await pause(300);
  await banniere.screenshot({ path: join(STORE, "banniere-1024x500.png") });
  await banniere.close();

  await navigateur.close();
  serveur.kill();
  if (erreurs.length) {
    console.error("✘ erreurs dans la page :\n" + erreurs.join("\n"));
    process.exit(1);
  }
  console.log("✔ store/ : " + readdirSync(CAPTURES).length + " captures 1080 × 1920, bannière 1024 × 500");
}

const PAGE_BANNIERE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Bannière BâtiPlus</title>
<style>
  @font-face { font-family: "Montserrat"; font-weight: 800; src: url("/assets/polices/montserrat-latin-800-normal.woff2") format("woff2"); }
  @font-face { font-family: "Inter"; font-weight: 600; src: url("/assets/polices/inter-latin-600-normal.woff2") format("woff2"); }
  @font-face { font-family: "Inter"; font-weight: 800; src: url("/assets/polices/inter-latin-800-normal.woff2") format("woff2"); }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
  body { position: relative; font-family: "Inter", sans-serif; color: #FFFFFF;
    background: radial-gradient(circle at 82% 30%, rgba(139, 47, 214, 0.9), transparent 55%), linear-gradient(135deg, #4E0A80 0%, #6A0DAD 60%, #8B2FD6 100%); }
  .eclair { position: absolute; right: -40px; top: -60px; width: 520px; height: 620px; opacity: 0.10; }
  .texte { position: absolute; left: 64px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .logo { height: 92px; width: auto; align-self: flex-start; }
  h1 { margin: 0; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 40px; line-height: 1.12; letter-spacing: -0.01em; }
  h1 span { color: #FFD400; }
  p { margin: 0; font-weight: 600; font-size: 22px; line-height: 1.35; color: #F3E9FD; }
  .pastilles { display: flex; gap: 10px; flex-wrap: wrap; }
  .pastilles b { font-weight: 800; font-size: 16px; padding: 8px 14px; border-radius: 999px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.28); }
  .brg { position: absolute; right: 56px; bottom: 34px; display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 600; color: #F3E9FD; }
  .brg img { height: 38px; width: auto; }
  .icone { position: absolute; right: 120px; top: 92px; width: 230px; height: 230px; border-radius: 52px; background: #FFFFFF; padding: 18px;
    box-shadow: 0 24px 60px rgba(23, 19, 31, 0.35); }
  .icone img { width: 100%; height: 100%; }
</style></head>
<body>
  <svg class="eclair" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FFFFFF" d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>
  <div class="texte">
    <img class="logo" src="/images/logo/batiplus-blanc.webp" alt="BâtiPlus">
    <h1>Vous décrivez le chantier,<br><span>le devis est prêt.</span></h1>
    <p>Étude et devis d'électricité selon la NF C 15-100, à vos prix. Même hors connexion.</p>
    <div class="pastilles"><b>Tableau électrique</b><b>Matériel</b><b>PDF et WhatsApp</b></div>
  </div>
  <div class="icone"><img src="/images/logo/icon-512.png" alt=""></div>
  <div class="brg"><span>Conçu par</span><img src="/images/brg/brg-blanc.webp" alt="BRG Électro+"></div>
</body></html>`;

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
