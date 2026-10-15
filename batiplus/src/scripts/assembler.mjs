#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — assembleur
   Construit www/index.html en UN seul passage à partir des sources :
     src/gabarit.html  (squelette)
     src/charte.css    → l'unique <style> du <head>
     src/corps.html    → le contenu du <body>
     src/donnees.js + src/moteur.js → l'unique <script> en fin de <body>
   Calcule les empreintes SHA-256 du style et du script et les inscrit dans la
   Content-Security-Policy (pas de 'unsafe-inline', pas de 'unsafe-eval').
   Usage : npm run assembler
   ========================================================================== */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(RACINE, "src");
const SORTIE = join(RACINE, "www", "index.html");
const API_PAR_DEFAUT = "https://api.batiplus.bf";

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
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'"
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
  const corps = lire("corps.html");
  const js = '(() => {\n"use strict";\n\n' + lire("donnees.js") + "\n\n" + lire("moteur.js") + "\n})();";
  verifierSources(css, corps, js);

  /* Le contenu exact entre les balises (sauts de ligne compris) est haché. */
  const contenuStyle = "\n" + css + "\n";
  const contenuScript = "\n" + js + "\n";
  const csp = politique(empreinte(contenuStyle), empreinte(contenuScript), adresseApi());

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
