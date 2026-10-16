/* ==========================================================================
   BâtiPlus — backend : jetons
   1. Jeton de SESSION (API) : HMAC-SHA256 avec JETON_SECRET, porte la version de session
      du compte → invalidable à distance (on incrémente version_session). L'étape 14 les émet
      à la connexion ; l'étape 12 les vérifie sur les routes de paiement.
   2. Jeton d'ABONNEMENT : ECDSA P-256 / SHA-256 (signature IEEE P1363, 64 octets), même format
      que celui vérifié par l'application (ABONNEMENT_JETON dans src/donnees.js) :
      base64url(charge JSON) + "." + base64url(signature de « bp-abonnement-v1. » + charge).
   ========================================================================== */
import { createHmac, sign, timingSafeEqual, createHash } from "node:crypto";

const PREFIXE_SESSION = "bp-session-v1.";
export const PREFIXE_ABONNEMENT = "bp-abonnement-v1.";
export const DUREE_SESSION_MS = 30 * 86400000;

function b64(octets) {
  return Buffer.from(octets).toString("base64url");
}

/* Comparaison en temps constant, même pour des longueurs différentes. */
export function egalTempsConstant(a, b) {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb) && String(a).length === String(b).length;
}

export function creerJetonSession(secret, electricien, maintenant = Date.now(), dureeMs = DUREE_SESSION_MS) {
  const charge = b64(JSON.stringify({ sub: electricien.id, ver: electricien.version_session, exp: maintenant + dureeMs }));
  const mac = createHmac("sha256", Buffer.from(secret, "hex")).update(PREFIXE_SESSION + charge).digest("base64url");
  return "v1." + charge + "." + mac;
}

/* Renvoie { sub, ver } si le jeton est intact et non expiré ; null sinon (la base vérifie ensuite la version). */
export function lireJetonSession(secret, jeton, maintenant = Date.now()) {
  if (typeof jeton !== "string" || jeton.length > 512) return null;
  const parties = jeton.split(".");
  if (parties.length !== 3 || parties[0] !== "v1" || !/^[A-Za-z0-9_-]+$/.test(parties[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parties[2])) return null;
  const attendu = createHmac("sha256", Buffer.from(secret, "hex")).update(PREFIXE_SESSION + parties[1]).digest("base64url");
  if (!egalTempsConstant(attendu, parties[2])) return null;
  let charge;
  try {
    charge = JSON.parse(Buffer.from(parties[1], "base64url").toString("utf8"));
  } catch (erreur) {
    return null;
  }
  if (!charge || !Number.isInteger(charge.sub) || !Number.isInteger(charge.ver) || !Number.isInteger(charge.exp) || charge.exp <= maintenant) return null;
  return { sub: charge.sub, ver: charge.ver };
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
