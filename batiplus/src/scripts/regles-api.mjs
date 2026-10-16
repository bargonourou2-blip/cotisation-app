#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — règles partagées entre l'application et l'API (étape 14)
   Une SEULE source : src/donnees.js et src/regles-saisie.json. Ce script en extrait ce dont
   le serveur a besoin pour valider les données synchronisées (bornes, listes autorisées) et
   l'écrit dans backend/regles-donnees.json, livré avec le backend (le serveur ne lit jamais
   les sources de l'application). « node src/scripts/regles-api.mjs --verifier » échoue si le
   fichier n'est plus à jour (contrôle lancé par npm run construire).
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import { injecterRegles } from "./regles.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FICHIER_REGLES_API = join(RACINE, "backend", "regles-donnees.json");

export function reglesApi() {
  const donnees = injecterRegles(readFileSync(join(RACINE, "src", "donnees.js"), "utf8"));
  const contexte = vm.createContext({});
  vm.runInContext(donnees + `
globalThis.__regles = {
  format: "batiplus-regles-api",
  version: 1,
  saisie: REGLES_SAISIE,
  code: { longueurMin: CODE.longueurMin, longueurMax: CODE.longueurMax },
  blocage: { essaisLibres: BLOCAGE.essaisLibres, durees: BLOCAGE.durees },
  bornes: BORNES,
  chantier: BORNES_CHANTIER,
  catalogue: BORNES_CATALOGUE,
  devis: BORNES_DEVIS,
  clientsMax: BORNES_LISTES.clientsMax,
  limiteGratuite: LIMITE_GRATUITE,
  tvaMax: TVA_MAX,
  imageDonneesMax: IMAGES.donneesMax,
  statutsDevis: Object.keys(STATUTS_DEVIS),
  unites: Object.keys(UNITES),
  categories: Object.keys(CATEGORIES_MATERIEL),
  typesPieces: Object.keys(TYPES_PIECES),
  typesChantier: Object.keys(TYPES_CHANTIER),
  alimentations: Object.keys(ALIMENTATIONS),
  appareils: Object.keys(APPAREILS),
  pointsMainOeuvre: Object.keys(MAIN_OEUVRE_POINTS),
  articlesDefaut: Object.keys(CATALOGUE_DEFAUT),
  devises: Object.fromEntries(Object.entries(DEVISES).map(([code, d]) => [code, d.decimales])),
  pays: Object.fromEntries(PAYS.map((p) => [p.iso, p.devise])),
  etapesChantier: ETAPES_CHANTIER.length
};`, contexte, { filename: "donnees.js" });
  return JSON.parse(JSON.stringify(contexte.__regles));
}

export function texteReglesApi() {
  return JSON.stringify(reglesApi(), null, 2) + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const attendu = texteReglesApi();
  if (process.argv.includes("--verifier")) {
    let actuel = "";
    try {
      actuel = readFileSync(FICHIER_REGLES_API, "utf8");
    } catch {
      actuel = "";
    }
    if (actuel !== attendu) {
      console.error("✘ backend/regles-donnees.json n'est plus à jour : node src/scripts/regles-api.mjs");
      process.exit(1);
    }
    console.log("✔ backend/regles-donnees.json à jour (mêmes règles que l'application)");
  } else {
    writeFileSync(FICHIER_REGLES_API, attendu);
    console.log("✔ backend/regles-donnees.json écrit depuis src/donnees.js et src/regles-saisie.json");
  }
}
