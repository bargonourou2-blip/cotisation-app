/* ==========================================================================
   BâtiPlus — paiements : agrégateur SIMULÉ (PAIEMENT_MODE=test uniquement)
   Interdit en production (config.js refuse de démarrer). Il reproduit, sans argent réel :
   succès, échec, annulation, notification en double, montant faux, notification perdue
   (rattrapée par la tâche planifiée) et agrégateur en panne.
   Les notifications sont signées comme chez FedaPay : en-tête « t=…,s=… », HMAC-SHA256
   de « t.corps » avec SIMULATION_SECRET.
   ========================================================================== */
import { randomBytes } from "node:crypto";
import {
  ErreurFournisseur, STATUTS, hmacHex, montantEntier, deviseNormalisee, normaliserMoyen,
  texteCourt, verifierAdaptateur, verifierSignatureHorodatee
} from "./interface.js";

export const ISSUES = Object.freeze(["reussi", "echoue", "annule", "doublon", "montant_faux", "webhook_perdu"]);
const ENTETE = "x-simulation-signature";

/* Banc d'essai partagé par le processus : transactions simulées + panne. */
export const banc = {
  transactions: new Map(),
  panne: false,
  regler({ panne }) {
    this.panne = Boolean(panne);
  },
  signer(secret, objet, horodatage = Math.floor(Date.now() / 1000)) {
    const corpsBrut = JSON.stringify(objet);
    return { corpsBrut, entetes: { [ENTETE]: "t=" + horodatage + ",s=" + hmacHex(secret, horodatage + "." + corpsBrut), "content-type": "application/json" } };
  }
};

export default function fabriquer(options) {
  const secret = options.cles.SIMULATION_SECRET;

  async function envoyer(transaction) {
    const { corpsBrut, entetes } = banc.signer(secret, {
      id: transaction.id, reference: transaction.reference, statut: transaction.statut,
      montant: transaction.montantPaye, devise: transaction.devise, moyen: transaction.moyen
    });
    try {
      await fetch(options.urlNotification, { method: "POST", headers: entetes, body: corpsBrut, signal: AbortSignal.timeout(5000) });
    } catch (erreur) {
      /* Notification perdue : la tâche planifiée la rattrapera. */
    }
  }

  /* Appelé par la page de paiement simulée (/simulation/payer/:id) ou par les tests. */
  banc.payer = async function payer(id, issue, moyen = "orange-money") {
    const transaction = banc.transactions.get(id);
    if (!transaction || transaction.statut !== STATUTS.attente || !ISSUES.includes(issue)) return false;
    transaction.moyen = normaliserMoyen(moyen);
    transaction.statut = issue === "echoue" ? STATUTS.echoue : issue === "annule" ? STATUTS.annule : STATUTS.paye;
    transaction.montantPaye = issue === "montant_faux" ? 1 : transaction.montant;
    if (issue === "webhook_perdu") return true;
    await envoyer(transaction);
    if (issue === "doublon") await envoyer(transaction);
    return true;
  };

  return verifierAdaptateur({
    async creerPaiement({ reference, montant, devise }) {
      if (banc.panne) throw new ErreurFournisseur("agrégateur simulé en panne");
      const id = "SIM-" + randomBytes(9).toString("base64url");
      banc.transactions.set(id, { id, reference, montant, montantPaye: montant, devise, statut: STATUTS.attente, moyen: null });
      return { urlPaiement: options.urlPublique + "/simulation/payer/" + id, idFournisseur: id };
    },

    verifierNotification(requete) {
      return verifierSignatureHorodatee(requete.entetes[ENTETE], requete.corpsBrut, secret, "s");
    },

    lireNotification(requete) {
      const c = requete.corps || {};
      return {
        reference: texteCourt(c.reference, 40), statut: texteCourt(c.statut, 20), montant: montantEntier(c.montant),
        devise: deviseNormalisee(c.devise), moyen: normaliserMoyen(c.moyen), idFournisseur: texteCourt(c.id, 80)
      };
    },

    async consulterStatut(idFournisseur) {
      if (banc.panne) throw new ErreurFournisseur("agrégateur simulé en panne");
      const transaction = banc.transactions.get(idFournisseur);
      if (!transaction) throw new ErreurFournisseur("transaction simulée inconnue");
      return {
        statut: transaction.statut, montant: transaction.montantPaye, devise: transaction.devise,
        moyen: transaction.moyen || "autre", reference: transaction.reference
      };
    },

    async rembourser(idFournisseur) {
      const transaction = banc.transactions.get(idFournisseur);
      if (!transaction || transaction.statut !== STATUTS.paye) throw new ErreurFournisseur("remboursement simulé impossible");
      transaction.statut = STATUTS.rembourse;
      return { rembourse: true };
    }
  }, "simulation");
}
