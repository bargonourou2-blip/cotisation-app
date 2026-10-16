#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — restaure une sauvegarde quotidienne chiffrée (AES-256-GCM).
   Usage : node outils/dechiffrer-sauvegarde.mjs sauvegardes/batiplus-AAAAMMJJ-HHMMSS.sqlite.chiffre restauree.sqlite
   La clé est lue dans SAUVEGARDE_CLE (backend/.env ou environnement). Un fichier modifié ou une
   mauvaise clé sont refusés (étiquette GCM). Arrêter l'API (pm2 stop batiplus-api) avant de
   remplacer la base par le fichier restauré.
   ========================================================================== */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lireFichierEnv } from "../config.js";
import { dechiffrer } from "../sauvegarde.js";

const [source, cible] = process.argv.slice(2);
if (!source || !cible) {
  console.error("Usage : node outils/dechiffrer-sauvegarde.mjs <fichier.sqlite.chiffre> <restauree.sqlite>");
  process.exit(1);
}
const env = { ...lireFichierEnv(join(dirname(fileURLToPath(import.meta.url)), "..", ".env")), ...process.env };
if (!/^[a-f0-9]{64}$/i.test(env.SAUVEGARDE_CLE || "")) {
  console.error("SAUVEGARDE_CLE absente ou invalide.");
  process.exit(1);
}
try {
  writeFileSync(cible, dechiffrer(env.SAUVEGARDE_CLE, readFileSync(source)), { mode: 0o600 });
  console.log("✔ Base restaurée dans " + cible);
} catch (erreur) {
  console.error("✘ Restauration refusée : " + erreur.message);
  process.exit(1);
}
