/* ==========================================================================
   BâtiPlus — backend : codes secrets (scrypt) et codes d'activation
   - Code secret d'un électricien et code administrateur : scrypt N=16384, r=8, p=1,
     sel aléatoire de 16 octets UNIQUE par compte (crypto.randomBytes), clé de 64 octets.
     Comparaison avec crypto.timingSafeEqual, jamais === sur un hachage.
   - Même calcul quand le compte n'existe pas : la durée de réponse ne révèle rien.
   - Codes d'activation (offerts par l'administrateur) : 60 bits aléatoires, conservés
     seulement sous forme d'empreinte HMAC (le code en clair n'est montré qu'une fois).
   ========================================================================== */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, octetsSel: 16, octetsCle: 64, maxmem: 64 * 1024 * 1024 });
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MOTIF_CODE_ACTIVATION = /^BP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

function deriver(code, sel) {
  return new Promise((resoudre, rejeter) => {
    scrypt(String(code).normalize("NFC"), sel, SCRYPT.octetsCle, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem }, (erreur, cle) => {
      if (erreur) rejeter(erreur);
      else resoudre(cle);
    });
  });
}

/* → { hash, sel } en base64 (colonnes code_hash et code_sel). */
export async function hacherCode(code) {
  const sel = randomBytes(SCRYPT.octetsSel);
  const cle = await deriver(code, sel);
  return { hash: cle.toString("base64"), sel: sel.toString("base64") };
}

/* Vrai seulement si le code correspond. Sans hachage connu (compte absent), le calcul
   est fait quand même sur un sel aléatoire puis comparé à des zéros : même durée. */
export async function verifierCode(code, hash, sel) {
  let attendu = Buffer.alloc(SCRYPT.octetsCle);
  let selOctets = randomBytes(SCRYPT.octetsSel);
  let connu = false;
  if (typeof hash === "string" && typeof sel === "string") {
    const h = Buffer.from(hash, "base64");
    const s = Buffer.from(sel, "base64");
    if (h.length === SCRYPT.octetsCle && s.length === SCRYPT.octetsSel) {
      attendu = h;
      selOctets = s;
      connu = true;
    }
  }
  const calcule = await deriver(typeof code === "string" ? code : "", selOctets);
  return timingSafeEqual(calcule, attendu) && connu;
}

/* Code administrateur dans le .env : « scrypt$16384$8$1$<sel base64>$<hachage base64> ». */
export function formaterHachageAdmin({ hash, sel }) {
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, sel, hash].join("$");
}

export function lireHachageAdmin(texte) {
  const parties = String(texte || "").split("$");
  if (parties.length !== 6 || parties[0] !== "scrypt" || parties[1] !== String(SCRYPT.N) || parties[2] !== String(SCRYPT.r) || parties[3] !== String(SCRYPT.p)) return null;
  const sel = Buffer.from(parties[4], "base64");
  const hash = Buffer.from(parties[5], "base64");
  if (sel.length !== SCRYPT.octetsSel || hash.length !== SCRYPT.octetsCle) return null;
  return Object.freeze({ sel: parties[4], hash: parties[5] });
}

/* Règle partagée avec l'application (erreurCodeNeuf) : 4 à 6 chiffres, ni répétition
   (0000, 1212, 123123), ni suite (1234, 4321, 7890), ni année (1940-2039 sur 4 chiffres). */
export function codeTrivial(code) {
  if (/^(\d{1,3})\1+$/.test(code)) return true;
  const chiffres = [...code].map(Number);
  const montante = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 1) % 10);
  const descendante = chiffres.every((c, i) => i === 0 || c === (chiffres[i - 1] + 9) % 10);
  if (montante || descendante) return true;
  return code.length === 4 && /^(19[4-9]\d|20[0-3]\d)$/.test(code);
}

export function nouveauCodeActivation() {
  const groupes = [];
  for (let g = 0; g < 3; g += 1) {
    let groupe = "";
    for (const octet of randomBytes(4)) groupe += ALPHABET[octet % ALPHABET.length];
    groupes.push(groupe);
  }
  return "BP-" + groupes.join("-");
}

export function empreinteCodeActivation(secret, code) {
  return createHmac("sha256", Buffer.from(secret, "hex")).update("bp-code-activation-v1." + code).digest("hex");
}
