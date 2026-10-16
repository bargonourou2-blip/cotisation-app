/* ==========================================================================
   BâtiPlus — backend : sauvegarde quotidienne CHIFFRÉE de la base
   Copie cohérente (VACUUM INTO, base en service), chiffrée en AES-256-GCM avec SAUVEGARDE_CLE
   (32 octets, .env, différente de JETON_SECRET), écrite en 0600 dans SAUVEGARDE_DOSSIER.
   Format : « BPSAUV1\n » + IV (12 o) + étiquette GCM (16 o) + base chiffrée.
   Les 30 dernières sont gardées. Restauration : node outils/dechiffrer-sauvegarde.mjs.
   ========================================================================== */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { journaliser } from "./base.js";

export const ENTETE_SAUVEGARDE = Buffer.from("BPSAUV1\n", "utf8");
export const SAUVEGARDES_GARDEES = 30;
const INTERVALLE_MS = 24 * 3600000;

export function chiffrer(cleHex, contenu) {
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", Buffer.from(cleHex, "hex"), iv);
  chiffreur.setAAD(ENTETE_SAUVEGARDE);
  const chiffre = Buffer.concat([chiffreur.update(contenu), chiffreur.final()]);
  return Buffer.concat([ENTETE_SAUVEGARDE, iv, chiffreur.getAuthTag(), chiffre]);
}

/* Lève une erreur si le fichier a été modifié ou si la clé est fausse (GCM authentifié). */
export function dechiffrer(cleHex, fichier) {
  if (fichier.length < ENTETE_SAUVEGARDE.length + 28 || !fichier.subarray(0, ENTETE_SAUVEGARDE.length).equals(ENTETE_SAUVEGARDE)) throw new Error("fichier de sauvegarde inconnu");
  const debut = ENTETE_SAUVEGARDE.length;
  const dechiffreur = createDecipheriv("aes-256-gcm", Buffer.from(cleHex, "hex"), fichier.subarray(debut, debut + 12));
  dechiffreur.setAAD(ENTETE_SAUVEGARDE);
  dechiffreur.setAuthTag(fichier.subarray(debut + 12, debut + 28));
  return Buffer.concat([dechiffreur.update(fichier.subarray(debut + 28)), dechiffreur.final()]);
}

export function creerSauvegardes({ base, config, horloge = () => Date.now(), journalConsole = console }) {
  let minuterie = null;
  let amorce = null;
  const dossier = config.sauvegarde.dossier;

  function fichiers() {
    if (!existsSync(dossier)) return [];
    return readdirSync(dossier).filter((f) => /^batiplus-\d{8}-\d{6}\.sqlite\.chiffre$/.test(f)).sort();
  }

  function sauvegarder() {
    mkdirSync(dossier, { recursive: true, mode: 0o700 });
    const horodatage = new Date(horloge()).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const temporaire = join(dossier, ".copie-" + randomBytes(6).toString("hex") + ".sqlite");
    try {
      base.prepare("VACUUM INTO ?").run(temporaire);
      const cible = join(dossier, "batiplus-" + horodatage + ".sqlite.chiffre");
      writeFileSync(cible, chiffrer(config.sauvegarde.cle, readFileSync(temporaire)), { mode: 0o600 });
      chmodSync(cible, 0o600);
      const liste = fichiers();
      for (const ancien of liste.slice(0, Math.max(0, liste.length - SAUVEGARDES_GARDEES))) rmSync(join(dossier, ancien), { force: true });
      journaliser(base, "sauvegarde_quotidienne", { details: { fichier: "batiplus-" + horodatage } });
      return cible;
    } finally {
      rmSync(temporaire, { force: true });
    }
  }

  function derniere() {
    const liste = fichiers();
    return liste.length ? statSync(join(dossier, liste[liste.length - 1])).mtimeMs : 0;
  }

  function demarrer() {
    if (minuterie) return;
    const tenter = () => {
      try {
        if (horloge() - derniere() >= INTERVALLE_MS - 60000) sauvegarder();
      } catch (erreur) {
        journalConsole.error("[sauvegarde] échec :", erreur && erreur.message);
      }
    };
    minuterie = setInterval(tenter, 3600000);
    minuterie.unref();
    amorce = setTimeout(tenter, 5000);
    amorce.unref();
  }

  function arreter() {
    if (minuterie) clearInterval(minuterie);
    if (amorce) clearTimeout(amorce);
    minuterie = null;
    amorce = null;
  }

  return Object.freeze({ sauvegarder, demarrer, arreter, fichiers });
}
