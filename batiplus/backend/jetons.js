/* ==========================================================================
   BâtiPlus — backend : jetons
   1. Jeton de SESSION (électricien) : HMAC-SHA256 (clé dérivée de JETON_SECRET), contient
      l'identifiant du compte, l'appareil, la date d'émission (iat), la date d'expiration
      (30 jours) et la « version de session » du compte. Changer de code ou « Déconnecter
      tous mes appareils » incrémente la version : tous les anciens jetons tombent aussitôt.
      Renouvellement glissant : un jeton de plus d'un jour est remplacé à la synchronisation
      tant que le compte est actif ; sans activité, il expire au bout de 30 jours.
   2. Jeton d'ADMINISTRATION : séparé (autre clé dérivée, autre préfixe), 2 heures, lié à
      l'empreinte d'un identifiant d'appareil gardé en mémoire par l'écran d'administration.
   3. Jeton d'ABONNEMENT : ECDSA P-256 / SHA-256 (signature IEEE P1363, 64 octets), même format
      que celui vérifié par l'application (ABONNEMENT_JETON dans src/donnees.js) :
      base64url(charge JSON) + "." + base64url(signature de « bp-abonnement-v1. » + charge).
      Vérifié aussi par le serveur à chaque synchronisation (H.4 n°1).
   ========================================================================== */
import { createHash, createHmac, createPublicKey, sign, timingSafeEqual, verify } from "node:crypto";

const PREFIXE_SESSION = "bp-session-v1.";
const PREFIXE_ADMIN = "bp-admin-v1.";
export const PREFIXE_ABONNEMENT = "bp-abonnement-v1.";
export const DUREE_SESSION_MS = 30 * 86400000;
export const RENOUVELLEMENT_APRES_MS = 86400000;
export const DUREE_ADMIN_MS = 2 * 3600000;

function b64(octets) {
  return Buffer.from(octets).toString("base64url");
}

/* Clé propre à chaque usage : connaître un jeton de session n'aide pas à forger un jeton admin. */
function cle(secret, usage) {
  return createHmac("sha256", Buffer.from(secret, "hex")).update("bp-cle." + usage).digest();
}

/* Comparaison en temps constant, même pour des longueurs différentes. */
export function egalTempsConstant(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

export function empreinteAppareil(identifiant) {
  return createHash("sha256").update("bp-appareil-v1." + String(identifiant)).digest("hex");
}

function signer(secret, usage, prefixe, charge) {
  const corps = b64(JSON.stringify(charge));
  return "v1." + corps + "." + createHmac("sha256", cle(secret, usage)).update(prefixe + corps).digest("base64url");
}

function lire(secret, usage, prefixe, jeton, maintenant) {
  if (typeof jeton !== "string" || jeton.length > 600) return null;
  const parties = jeton.split(".");
  if (parties.length !== 3 || parties[0] !== "v1" || !/^[A-Za-z0-9_-]{10,500}$/.test(parties[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parties[2])) return null;
  const attendu = createHmac("sha256", cle(secret, usage)).update(prefixe + parties[1]).digest("base64url");
  if (!egalTempsConstant(attendu, parties[2])) return null;
  let charge;
  try {
    charge = JSON.parse(Buffer.from(parties[1], "base64url").toString("utf8"));
  } catch (erreur) {
    return null;
  }
  if (!charge || typeof charge !== "object" || !Number.isInteger(charge.exp) || !Number.isInteger(charge.iat)) return null;
  if (charge.exp <= maintenant || charge.iat > maintenant + 60000) return null;
  return charge;
}

/* electricien : ligne de la table ; appareilId : ligne de la table appareils. */
export function creerJetonSession(secret, electricien, appareilId, maintenant = Date.now(), dureeMs = DUREE_SESSION_MS) {
  return signer(secret, "session", PREFIXE_SESSION, { sub: electricien.id, app: appareilId, ver: electricien.version_session, iat: maintenant, exp: maintenant + dureeMs });
}

/* → { sub, app, ver, iat } si le jeton est intact et non expiré ; null sinon (la base vérifie ensuite version et appareil). */
export function lireJetonSession(secret, jeton, maintenant = Date.now()) {
  const charge = lire(secret, "session", PREFIXE_SESSION, jeton, maintenant);
  if (!charge || !Number.isInteger(charge.sub) || !Number.isInteger(charge.app) || !Number.isInteger(charge.ver)) return null;
  return { sub: charge.sub, app: charge.app, ver: charge.ver, iat: charge.iat };
}

export function creerJetonAdmin(secret, appareil, maintenant = Date.now()) {
  return signer(secret, "admin", PREFIXE_ADMIN, { adm: 1, app: empreinteAppareil(appareil), iat: maintenant, exp: maintenant + DUREE_ADMIN_MS });
}

/* Jeton admin valide ET présenté avec le même identifiant d'appareil qu'à la connexion. */
export function lireJetonAdmin(secret, jeton, appareil, maintenant = Date.now()) {
  const charge = lire(secret, "admin", PREFIXE_ADMIN, jeton, maintenant);
  if (!charge || charge.adm !== 1 || typeof charge.app !== "string" || typeof appareil !== "string" || !/^[a-f0-9]{32}$/.test(appareil)) return null;
  return egalTempsConstant(charge.app, empreinteAppareil(appareil)) ? charge : null;
}

/* Jeton d'abonnement pour l'application (lié au compte de l'appareil ET au numéro). */
export function signerJetonAbonnement(clePrivee, charge) {
  const corps = b64(JSON.stringify({
    v: 1, compteId: charge.compteId, telephone: charge.telephone, formule: charge.formule,
    debut: charge.debut, fin: charge.fin === null ? null : charge.fin, emisLe: charge.emisLe
  }));
  const signature = sign("sha256", Buffer.from(PREFIXE_ABONNEMENT + corps, "utf8"), { key: clePrivee, dsaEncoding: "ieee-p1363" });
  return corps + "." + b64(signature);
}

/* Vérification côté serveur d'un jeton d'abonnement renvoyé par l'application :
   → la charge si la signature est authentique, null sinon (falsifié, retouché, autre clé). */
export function verifierJetonAbonnement(clePrivee, jeton) {
  if (typeof jeton !== "string" || jeton.length > 2000) return null;
  const parties = jeton.split(".");
  if (parties.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parties[0]) || !/^[A-Za-z0-9_-]+$/.test(parties[1])) return null;
  const signature = Buffer.from(parties[1], "base64url");
  if (signature.length !== 64) return null;
  let ok = false;
  try {
    ok = verify("sha256", Buffer.from(PREFIXE_ABONNEMENT + parties[0], "utf8"), { key: createPublicKey(clePrivee), dsaEncoding: "ieee-p1363" }, signature);
  } catch (erreur) {
    ok = false;
  }
  if (!ok) return null;
  try {
    const charge = JSON.parse(Buffer.from(parties[0], "base64url").toString("utf8"));
    return charge && typeof charge === "object" && !Array.isArray(charge) ? charge : null;
  } catch (erreur) {
    return null;
  }
}
