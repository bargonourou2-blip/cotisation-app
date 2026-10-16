/* ==========================================================================
   BâtiPlus — paiements : CinetPay (API REST v1, celle du SDK officiel cinetpay-php-sdk 2.x)
   Sandbox : https://api.cinetpay.net · Production : https://api.cinetpay.co
   1. POST /v1/oauth/login { api_key, api_password } → access_token (Bearer, renouvelé avant expiration).
   2. POST /v1/payment → { payment_url, transaction_id, notify_token }.
   3. Notification : { notify_token, merchant_transaction_id, transaction_id } — le notify_token
      gardé à l'initiation est comparé en temps constant ; le statut reçu est IGNORÉ.
   4. GET /v1/payment/{merchant_transaction_id} → status SUCCESS | PENDING | FAILED | …
   Un compte = un pays (Burkina Faso : XOF, +226). Remboursement : pas d'API → espace marchand.
   ========================================================================== */
import {
  ErreurFournisseur, STATUTS, appelJson, decouperNom, deviseNormalisee, egalTempsConstant,
  montantEntier, normaliserMoyen, texteCourt, verifierAdaptateur
} from "./interface.js";

export default function fabriquer(options) {
  const base = options.baseUrl || (options.mode === "production" ? "https://api.cinetpay.co" : "https://api.cinetpay.net");
  let jeton = null;

  async function autorisation(forcer) {
    if (!forcer && jeton && jeton.expire > Date.now()) return jeton.valeur;
    const { statut, donnees } = await appelJson(base + "/v1/oauth/login", {
      methode: "POST", corps: { api_key: options.cles.CINETPAY_API_KEY, api_password: options.cles.CINETPAY_API_PASSWORD }
    });
    const imbrique = donnees && donnees.data && typeof donnees.data === "object" ? donnees.data : {};
    const valeur = (donnees && donnees.access_token) || imbrique.token;
    if (statut >= 400 || typeof valeur !== "string" || !valeur) throw new ErreurFournisseur("authentification CinetPay refusée", { statut });
    const duree = Number((donnees && donnees.expires_in) || imbrique.expires_in || 300);
    jeton = { valeur, expire: Date.now() + Math.max(0, duree - 30) * 1000 };
    return valeur;
  }

  async function appel(chemin, methode, corps) {
    for (const forcer of [false, true]) {
      const reponse = await appelJson(base + chemin, { methode, corps, entetes: { Authorization: "Bearer " + await autorisation(forcer) } });
      const code = reponse.donnees && reponse.donnees.status;
      if (reponse.statut !== 401 && code !== "EXPIRED_TOKEN" && code !== "INVALID_TOKEN") return reponse;
    }
    throw new ErreurFournisseur("jeton CinetPay refusé");
  }

  function statutDe(texte) {
    const s = String(texte || "").toUpperCase();
    if (s === "SUCCESS") return STATUTS.paye;
    if (["FAILED", "INSUFFICIENT_BALANCE", "USER_IS_BLOCKED", "NOT_ALLOWED", "OTP_ERROR"].includes(s)) return STATUTS.echoue;
    if (s === "EXPIRED" || s === "OTP_EXPIRED") return STATUTS.expire;
    if (s === "CANCELED" || s === "CANCELLED") return STATUTS.annule;
    return STATUTS.attente;
  }

  return verifierAdaptateur({
    async creerPaiement({ reference, montant, devise, formule, telephone, nom, email }) {
      const { prenom, famille } = decouperNom(nom);
      const domaine = new URL(options.urlPublique).hostname;
      const { statut, donnees } = await appel("/v1/payment", "POST", {
        currency: devise, merchant_transaction_id: reference, amount: montant,
        success_url: options.urlRetour(reference), failed_url: options.urlAnnulation(reference), notify_url: options.urlNotification,
        lang: "fr", designation: "Abonnement BâtiPlus " + formule.nom,
        client_first_name: prenom.padEnd(2, "."), client_last_name: famille.padEnd(2, "."),
        client_email: email || "paiements@" + domaine,
        ...(typeof telephone === "string" && /^\+\d{8,15}$/.test(telephone) ? { client_phone_number: telephone } : {})
      });
      if (statut >= 400 || !donnees || typeof donnees.payment_url !== "string" || typeof donnees.notify_token !== "string") {
        throw new ErreurFournisseur("création refusée par CinetPay", { statut, code: donnees && donnees.status });
      }
      return { urlPaiement: donnees.payment_url, idFournisseur: reference, secretNotification: donnees.notify_token };
    },

    verifierNotification(requete, contexte) {
      const recu = requete.corps && requete.corps.notify_token;
      const attendu = contexte && contexte.secretNotification;
      return typeof recu === "string" && typeof attendu === "string" && recu.length > 0 && attendu.length > 0 && egalTempsConstant(attendu, recu);
    },

    lireNotification(requete) {
      const c = requete.corps || {};
      return {
        reference: texteCourt(c.merchant_transaction_id, 40), statut: STATUTS.attente, montant: null, devise: null,
        moyen: "autre", idFournisseur: texteCourt(c.merchant_transaction_id, 40)
      };
    },

    async consulterStatut(idFournisseur) {
      const { statut, donnees } = await appel("/v1/payment/" + encodeURIComponent(idFournisseur), "GET", null);
      if (statut >= 400 || !donnees || typeof donnees.status !== "string") throw new ErreurFournisseur("statut CinetPay illisible", { statut });
      const detail = donnees.data && typeof donnees.data === "object" ? donnees.data : donnees;
      return {
        statut: statutDe(donnees.status), montant: montantEntier(detail.amount), devise: deviseNormalisee(detail.currency),
        moyen: normaliserMoyen(detail.payment_method), reference: typeof donnees.merchant_transaction_id === "string" ? donnees.merchant_transaction_id : null
      };
    },

    async rembourser() {
      throw new ErreurFournisseur("CinetPay : remboursement à effectuer depuis l'espace marchand");
    }
  }, "cinetpay");
}
