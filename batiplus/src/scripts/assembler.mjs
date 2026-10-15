#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — assembleur
   Construit www/index.html en UN seul passage à partir des sources :
     src/gabarit.html  (squelette)
     src/charte.css    → l'unique <style> du <head>
     src/corps.html    → le contenu du <body>
     src/donnees.js + src/moteur.js → l'unique <script> en fin de <body>
     www/icons/*.svg   → le sprite d'icônes (<symbol id="i-nom">) au début du <body>
     www/images/paiement/*.webp → liste des logos de paiement fournis (LOGOS_PAIEMENT_FOURNIS)
   Calcule les empreintes SHA-256 du style et du script et les inscrit dans la
   Content-Security-Policy (pas de 'unsafe-inline', pas de 'unsafe-eval').
   Usage : npm run assembler
   ========================================================================== */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(RACINE, "src");
const SORTIE = join(RACINE, "www", "index.html");
const API_PAR_DEFAUT = "https://api.batiplus.bf";
const ICONES = join(RACINE, "www", "icons");
const PAIEMENT = join(RACINE, "www", "images", "paiement");

/* Une icône = une seule couleur (currentColor), trait de 2 px, formes géométriques seulement. */
const ENTETE_ICONE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" '
  + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const ELEMENTS_ICONE = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);
const ATTRIBUTS_ICONE = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "points"]);

function lire(nom) {
  return readFileSync(join(SRC, nom), "utf8").replace(/\r\n/g, "\n").trimEnd();
}

function arreter(message) {
  console.error("✘ Assemblage refusé : " + message);
  process.exit(1);
}

/* L'adresse publique de l'API est la seule valeur de .env connue du front. */
function adresseApi() {
  const fichier = join(RACINE, ".env");
  let valeur = process.env.API_URL || "";
  if (!valeur && existsSync(fichier)) {
    const ligne = readFileSync(fichier, "utf8").split("\n").find((l) => l.startsWith("API_URL="));
    if (ligne) valeur = ligne.slice("API_URL=".length).trim();
  }
  valeur = valeur || API_PAR_DEFAUT;
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(valeur)) arreter("API_URL doit être une origine https:// sans chemin");
  return valeur;
}

/* Construit le sprite à partir de www/icons/ ; refuse toute icône hors charte ou porteuse de code. */
function construireIcones() {
  if (!existsSync(ICONES)) arreter("dossier www/icons/ absent");
  const fichiers = readdirSync(ICONES).filter((f) => f.endsWith(".svg")).sort();
  if (!fichiers.length) arreter("aucune icône dans www/icons/");
  return fichiers.map((fichier) => {
    const nom = fichier.slice(0, -4);
    if (!/^[a-z0-9-]+$/.test(nom)) arreter("www/icons/" + fichier + " : nom invalide");
    const texte = readFileSync(join(ICONES, fichier), "utf8").trim();
    if (!texte.startsWith(ENTETE_ICONE) || !texte.endsWith("</svg>")) {
      arreter("www/icons/" + fichier + " : en-tête non conforme (une couleur, trait de 2 px, 24×24)");
    }
    const interieur = texte.slice(ENTETE_ICONE.length, -"</svg>".length);
    const reste = interieur.replace(/<([a-z]+)((?:\s+[a-z0-9-]+="[^"<>]*")*)\s*\/>/g, (tout, element, attributs) => {
      if (!ELEMENTS_ICONE.has(element)) arreter("www/icons/" + fichier + " : élément <" + element + "> interdit");
      for (const [, attribut, valeur] of attributs.matchAll(/([a-z0-9-]+)="([^"]*)"/g)) {
        if (!ATTRIBUTS_ICONE.has(attribut)) arreter("www/icons/" + fichier + " : attribut " + attribut + " interdit");
        if (!/^[-0-9.,\sMmLlHhVvCcSsQqTtAaZz]*$/.test(valeur)) arreter("www/icons/" + fichier + " : valeur non géométrique");
      }
      return "";
    });
    if (reste.trim()) arreter("www/icons/" + fichier + " : contenu non autorisé");
    return '  <symbol id="i-' + nom + '" viewBox="0 0 24 24">' + interieur + "</symbol>";
  }).join("\n");
}

/* Logos de paiement réellement fournis (WebP vérifié) ; les autres s'affichent en pastille texte. */
function logosPaiement() {
  if (!existsSync(PAIEMENT)) return [];
  return readdirSync(PAIEMENT).filter((f) => f.endsWith(".webp")).sort().map((fichier) => {
    const octets = readFileSync(join(PAIEMENT, fichier));
    if (!/^[a-z0-9-]+\.webp$/.test(fichier)) arreter("www/images/paiement/" + fichier + " : nom invalide");
    if (octets.toString("latin1", 0, 4) !== "RIFF" || octets.toString("latin1", 8, 12) !== "WEBP") arreter("www/images/paiement/" + fichier + " n'est pas un WebP");
    return fichier.slice(0, -5);
  });
}

function empreinte(texte) {
  return "'sha256-" + createHash("sha256").update(texte, "utf8").digest("base64") + "'";
}

function politique(hashStyle, hashScript, api) {
  return [
    "default-src 'self'",
    "script-src 'self' " + hashScript,
    "style-src 'self' " + hashStyle,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' " + api,
    "media-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join("; ");
}

function verifierSources(css, corps, js) {
  if (/<\/style/i.test(css)) arreter("charte.css contient « </style »");
  if (/<\/?script/i.test(js)) arreter("le JavaScript contient une balise <script>");
  if (js.includes("<!--") || js.includes("-->")) arreter("commentaire HTML dans le JavaScript");
  if (/<style|<script/i.test(corps)) arreter("corps.html contient une balise <style> ou <script>");
  if (/\sstyle\s*=/i.test(corps)) arreter("corps.html contient un attribut style= (interdit par la CSP)");
  if (/\son[a-z]+\s*=/i.test(corps)) arreter("corps.html contient un gestionnaire en attribut (onclick=…)");
}

function assembler() {
  const gabarit = lire("gabarit.html");
  const css = lire("charte.css");
  if (!lire("corps.html").includes("@@ICONES@@")) arreter("corps.html doit contenir le marqueur @@ICONES@@");
  const corps = lire("corps.html").replace("@@ICONES@@", construireIcones);
  const api = adresseApi();
  const donnees = lire("donnees.js");
  if (!donnees.includes('const API_URL = "@@API_URL@@";')) arreter("donnees.js doit déclarer API_URL = \"@@API_URL@@\"");
  if (!donnees.includes('const LOGOS_PAIEMENT_FOURNIS = Object.freeze("@@LOGOS_PAIEMENT@@");')) arreter("donnees.js doit déclarer LOGOS_PAIEMENT_FOURNIS");
  const donneesFinales = donnees
    .replace('"@@API_URL@@"', () => JSON.stringify(api))
    .replace('"@@LOGOS_PAIEMENT@@"', () => JSON.stringify(logosPaiement()));
  const js = '(() => {\n"use strict";\n\n' + donneesFinales + "\n\n" + lire("moteur.js") + "\n})();";
  verifierSources(css, corps, js);

  /* Le contenu exact entre les balises (sauts de ligne compris) est haché. */
  const contenuStyle = "\n" + css + "\n";
  const contenuScript = "\n" + js + "\n";
  const csp = politique(empreinte(contenuStyle), empreinte(contenuScript), api);

  const html = gabarit
    .replace("<style>\n@@CHARTE@@\n</style>", () => "<style>" + contenuStyle + "</style>")
    .replace("<script>\n@@SCRIPT@@\n</script>", () => "<script>" + contenuScript + "</script>")
    .replace("@@CORPS@@", () => corps)
    .replace("@@CSP@@", () => csp);

  if (html.includes("@@")) arreter("un marqueur @@…@@ n'a pas été remplacé");
  writeFileSync(SORTIE, html + "\n", "utf8");
  console.log("✔ www/index.html assemblé (" + (Buffer.byteLength(html) / 1024).toFixed(1) + " Ko)");
}

assembler();
