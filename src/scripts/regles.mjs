/* ==========================================================================
   BâtiPlus — règles de saisie partagées (src/regles-saisie.json)
   Un seul fichier de bornes, lu ici par l'assembleur et par les outils de
   vérification, et repris tel quel par l'API à l'étape 14 : les mêmes bornes
   sont contrôlées dans le téléphone et en ligne (contrôle ㊻).
   ========================================================================== */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const FICHIER_REGLES = join(RACINE, "src", "regles-saisie.json");
export const DECLARATION_REGLES = 'const REGLES_SAISIE = "@@REGLES_SAISIE@@";';

function borneValide(regle) {
  return regle && typeof regle === "object"
    && Number.isFinite(regle.min) && Number.isFinite(regle.max) && regle.min >= 0 && regle.max >= regle.min
    && (regle.decimales === undefined || (Number.isInteger(regle.decimales) && regle.decimales >= 0 && regle.decimales <= 2));
}

/* Lit et contrôle le fichier : toute anomalie arrête l'assemblage. */
export function lireRegles() {
  const regles = JSON.parse(readFileSync(FICHIER_REGLES, "utf8"));
  const erreurs = [];
  if (regles.format !== "batiplus-regles-saisie" || regles.version !== 1) erreurs.push("format ou version inattendus");
  if (regles.decimalesMax !== 2) erreurs.push("decimalesMax doit valoir 2");
  for (const [nom, regle] of Object.entries(regles.nombres || {})) {
    if (!borneValide(regle) || typeof regle.libelle !== "string") erreurs.push("nombre « " + nom + " » invalide");
  }
  for (const [nom, regle] of Object.entries(regles.textes || {})) {
    if (!borneValide(regle)) erreurs.push("texte « " + nom + " » invalide");
  }
  for (const nom of ["surface", "quantite", "prix", "pieces"]) if (!regles.nombres || !regles.nombres[nom]) erreurs.push("règle « " + nom + " » absente");
  if (!regles.telephone || !regles.fichiers) erreurs.push("telephone ou fichiers absents");
  if (erreurs.length) throw new Error("src/regles-saisie.json : " + erreurs.join(" ; "));
  return regles;
}

/* Objet → code JavaScript gelé à tous les niveaux : Object.freeze({ … Object.freeze({ … }) }). */
export function codeGele(valeur) {
  if (Array.isArray(valeur)) return "Object.freeze([" + valeur.map(codeGele).join(", ") + "])";
  if (valeur && typeof valeur === "object") {
    return "Object.freeze({ " + Object.entries(valeur).map(([cle, v]) => JSON.stringify(cle) + ": " + codeGele(v)).join(", ") + " })";
  }
  return JSON.stringify(valeur);
}

/* Remplace le marqueur de donnees.js par les règles, gelées en profondeur. */
export function injecterRegles(donnees) {
  if (!donnees.includes(DECLARATION_REGLES)) throw new Error("donnees.js doit déclarer " + DECLARATION_REGLES);
  return donnees.replace('"@@REGLES_SAISIE@@"', () => codeGele(lireRegles()));
}
