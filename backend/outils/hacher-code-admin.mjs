#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — génère la valeur ADMIN_CODE_HASH du .env (scrypt N=16384, r=8, p=1, sel 16 o, clé 64 o).
   Le code administrateur n'est JAMAIS écrit en clair : ni dans le .env, ni dans l'application,
   ni dans les journaux. Usage (saisie masquée, rien dans l'historique du terminal) :
     node outils/hacher-code-admin.mjs
   Puis copier la ligne affichée dans backend/.env. Code : 8 à 64 CHIFFRES (saisi sur clavier numérique, partie E.1) ; 12 chiffres ou plus conseillés.
   ========================================================================== */
import { createInterface } from "node:readline";
import { formaterHachageAdmin, hacherCode } from "../codes.js";

function demander(question) {
  return new Promise((resoudre) => {
    const lecteur = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const ecrire = lecteur._writeToOutput;
    lecteur._writeToOutput = (texte) => { if (texte.includes(question)) ecrire.call(lecteur, texte); };
    lecteur.question(question, (reponse) => {
      lecteur.close();
      process.stdout.write("\n");
      resoudre(reponse);
    });
  });
}

const code = process.env.CODE_ADMIN_SAISI || await demander("Code administrateur (8 à 64 chiffres, 12 conseillés) : ");
if (!/^\d{8,64}$/.test(code) || /^(\d)\1+$/.test(code) || "01234567890123456789".includes(code) || "98765432109876543210".includes(code)) {
  console.error("Code refusé : 8 à 64 chiffres, ni répétés ni suivis.");
  process.exit(1);
}
if (!process.env.CODE_ADMIN_SAISI) {
  const confirmation = await demander("Confirmez le code : ");
  if (confirmation !== code) {
    console.error("Les deux saisies diffèrent.");
    process.exit(1);
  }
}
console.log("ADMIN_CODE_HASH=" + formaterHachageAdmin(await hacherCode(code)));
