#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — clés des jetons d'abonnement (étape 11)
   Le front ne croit qu'un jeton SIGNÉ : « charge.signature » en base64url, signature
   ECDSA P-256 / SHA-256 (64 octets) de ABONNEMENT_JETON.prefixe + charge.
     node src/scripts/cles-abonnement.mjs generer
       → crée .cles/abonnement-privee.pem (JAMAIS versionnée, jamais dans www/)
         et affiche la ligne ABONNEMENT_CLE_PUBLIQUE=… à copier dans .env
     node src/scripts/cles-abonnement.mjs signer <compteId> <telephone> <formule> [jours]
       → jeton de test signé avec la clé privée (le backend de l'étape 14 fera de même)
   ========================================================================== */
import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chargerMoteur } from "./chantiers-types.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOSSIER = join(RACINE, ".cles");
const PRIVEE = join(DOSSIER, "abonnement-privee.pem");

function arreter(message) {
  console.error("✘ " + message);
  process.exit(1);
}

function generer() {
  if (existsSync(PRIVEE)) arreter(".cles/abonnement-privee.pem existe déjà : supprimez-la d'abord si vous voulez vraiment changer de clé (tous les jetons émis deviendront invalides).");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  mkdirSync(DOSSIER, { recursive: true, mode: 0o700 });
  writeFileSync(PRIVEE, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  console.log("✔ Clé privée écrite dans .cles/abonnement-privee.pem (à garder secrète, hors du dépôt).");
  console.log("Ajoutez cette ligne à .env puis relancez « npm run assembler » :");
  console.log("ABONNEMENT_CLE_PUBLIQUE=" + publicKey.export({ type: "spki", format: "der" }).toString("base64"));
}

function signer(compteId, telephone, formule, joursTexte) {
  if (!existsSync(PRIVEE)) arreter("aucune clé privée : lancez d'abord « node src/scripts/cles-abonnement.mjs generer ».");
  const { FORMULES, ABONNEMENT_JETON } = chargerMoteur();
  if (!compteId || !/^\+\d{8,15}$/.test(telephone || "")) arreter("usage : signer <compteId> <telephone +226…> <formule> [jours]");
  if (!Object.prototype.hasOwnProperty.call(FORMULES, formule) || formule === "gratuit") arreter("formule inconnue : " + Object.keys(FORMULES).filter((f) => f !== "gratuit").join(", "));
  const debut = new Date();
  const jours = joursTexte ? Number(joursTexte) : FORMULES[formule].dureeJours;
  if (jours !== null && (!Number.isInteger(jours) || jours < 1 || jours > 3660)) arreter("nombre de jours invalide");
  const charge = {
    v: ABONNEMENT_JETON.version, compteId, telephone, formule,
    debut: debut.toISOString(),
    fin: jours === null ? null : new Date(debut.getTime() + jours * 86400000).toISOString(),
    emisLe: debut.toISOString()
  };
  const corps = Buffer.from(JSON.stringify(charge), "utf8").toString("base64url");
  const signature = sign("sha256", Buffer.from(ABONNEMENT_JETON.prefixe + corps, "utf8"), { key: createPrivateKey(readFileSync(PRIVEE)), dsaEncoding: "ieee-p1363" });
  console.log(corps + "." + signature.toString("base64url"));
}

const [commande, ...arguments_] = process.argv.slice(2);
if (commande === "generer") generer();
else if (commande === "signer") signer(...arguments_);
else arreter("commande attendue : generer | signer");
