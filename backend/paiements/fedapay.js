/* ==========================================================================
   BâtiPlus — paiements : FedaPay (Bénin, Côte d'Ivoire, Togo, Sénégal… — Mobile Money et cartes)
   Sandbox : https://sandbox-api.fedapay.com/v1 · Production : https://api.fedapay.com/v1
   Authorization: Bearer <clé secrète>.
   1. POST /transactions → { "v1/transaction": { id, … } } ; 2. POST /transactions/{id}/token → { token, url }.
   Notification signée : en-tête X-FEDAPAY-SIGNATURE « t=…,s=… », HMAC-SHA256 hexadécimal de « t.corps »
   avec le secret du webhook, tolérance 5 minutes (comme le SDK officiel fedapay-node).
   Statut : GET /transactions/{id} → approved | transferred (payé), declined, canceled, pending, refunded…
   Remboursement : pas d'API publique → espace marchand.
   ========================================================================== */
import {
  ErreurFournisseur, STATUTS, appelJson, decouperNom, deviseNormalisee, montantEntier, normaliserMoyen,
  texteCourt, verifierAdaptateur, verifierSignatureHorodatee
} from "./interface.js";

export default function fabriquer(options) {
  const base = options.baseUrl || (options.mode === "production" ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1");
  const entetes = { Authorization: "Bearer " + options.cles.FEDAPAY_SECRET_KEY };

  function transactionDe(donnees) {
    if (!donnees || typeof donnees !== "object") return null;
    return donnees["v1/transaction"] || donnees.transaction || donnees;
  }

  function statutDe(texte) {
    const s = String(texte || "").toLowerCase();
    if (s === "approved" || s === "transferred") return STATUTS.paye;
    if (s.includes("refunded")) return STATUTS.rembourse;
    if (s === "declined") return STATUTS.echoue;
    if (s === "canceled" || s === "cancelled") return STATUTS.annule;
    if (s === "expired") return STATUTS.expire;
    return STATUTS.attente;
  }

  return verifierAdaptateur({
    async creerPaiement({ reference, montant, devise, formule, telephone, nom, email }) {
      const { prenom, famille } = decouperNom(nom);
      const client = { firstname: prenom, lastname: famille };
      if (email) client.email = email;
      if (typeof telephone === "string" && /^\+226\d{8}$/.test(telephone)) client.phone_number = { number: telephone.slice(4), country: "bf" };
      const creation = await appelJson(base + "/transactions", {
        methode: "POST", entetes,
        corps: { description: "Abonnement BâtiPlus " + formule.nom, amount: montant, currency: { iso: devise }, callback_url: options.urlRetour(reference), merchant_reference: reference, customer: client }
      });
      const transaction = transactionDe(creation.donnees);
      if (creation.statut >= 400 || !transaction || transaction.id === undefined) throw new ErreurFournisseur("création refusée par FedaPay", { statut: creation.statut });
      const id = String(transaction.id);
      const jeton = await appelJson(base + "/transactions/" + encodeURIComponent(id) + "/token", { methode: "POST", entetes, corps: {} });
      if (jeton.statut >= 400 || !jeton.donnees || typeof jeton.donnees.url !== "string") throw new ErreurFournisseur("lien FedaPay refusé", { statut: jeton.statut });
      return { urlPaiement: jeton.donnees.url, idFournisseur: id };
    },

    verifierNotification(requete) {
      return verifierSignatureHorodatee(requete.entetes["x-fedapay-signature"], requete.corpsBrut, options.cles.FEDAPAY_WEBHOOK_SECRET, "s");
    },

    lireNotification(requete) {
      const entite = requete.corps && requete.corps.entity && typeof requete.corps.entity === "object" ? requete.corps.entity : {};
      return {
        reference: texteCourt(entite.merchant_reference, 40), statut: statutDe(entite.status), montant: montantEntier(entite.amount),
        devise: null, moyen: normaliserMoyen(entite.mode), idFournisseur: entite.id === undefined ? "" : String(entite.id).slice(0, 40)
      };
    },

    async consulterStatut(idFournisseur) {
      const { statut, donnees } = await appelJson(base + "/transactions/" + encodeURIComponent(idFournisseur) + "?include=currency", { entetes });
      const t = transactionDe(donnees);
      if (statut >= 400 || !t || typeof t.status !== "string") throw new ErreurFournisseur("statut FedaPay illisible", { statut });
      const devise = t.currency && typeof t.currency === "object" ? t.currency.iso : t.currency_iso;
      return {
        statut: statutDe(t.status), montant: montantEntier(t.amount), devise: deviseNormalisee(devise),
        moyen: normaliserMoyen(t.mode), reference: typeof t.merchant_reference === "string" ? t.merchant_reference : null
      };
    },

    async rembourser() {
      throw new ErreurFournisseur("FedaPay : remboursement à effectuer depuis l'espace marchand");
    }
  }, "fedapay");
}
