/* ==========================================================================
   BâtiPlus — paiements : LigdiCash (Burkina Faso — Orange Money, Moov Money, Telecel, cartes)
   API « redirect » : https://app.ligdicash.com/pay/v01/ (test : https://test.ligdicash.com/pay/v01/)
   En-têtes : Apikey + Authorization: Bearer <auth_token>. Réponse { response_code: "00", token, response_text: url }.
   Statut : GET redirect/checkout-invoice/confirm/?invoiceToken=… → status completed | pending | nocompleted.
   Notification (callback_url) : LigdiCash ne SIGNE PAS ses notifications. La protection repose donc sur
   l'URL secrète (vérifiée avant l'adaptateur), sur le jeton de facture présent dans la notification,
   et surtout sur la RE-CONSULTATION systématique du statut chez LigdiCash avant toute activation.
   Devise : XOF uniquement. Remboursement : pas d'API publique → à faire depuis l'espace marchand.
   ========================================================================== */
import {
  ErreurFournisseur, STATUTS, appelJson, decouperNom, montantEntier, normaliserMoyen, texteCourt, verifierAdaptateur
} from "./interface.js";

export default function fabriquer(options) {
  const base = options.baseUrl || (options.mode === "production" ? "https://app.ligdicash.com/pay/v01/" : "https://test.ligdicash.com/pay/v01/");
  const entetes = { Apikey: options.cles.LIGDICASH_API_KEY, Authorization: "Bearer " + options.cles.LIGDICASH_AUTH_TOKEN };

  function statutDe(texte) {
    const s = String(texte || "").toLowerCase();
    if (s === "completed") return STATUTS.paye;
    if (s === "nocompleted" || s === "failed") return STATUTS.echoue;
    if (s === "cancelled" || s === "canceled") return STATUTS.annule;
    return STATUTS.attente;
  }

  return verifierAdaptateur({
    async creerPaiement({ reference, montant, devise, formule, nom, email }) {
      if (devise !== "XOF") throw new ErreurFournisseur("LigdiCash n'accepte que le XOF");
      const { prenom, famille } = decouperNom(nom);
      const { statut, donnees } = await appelJson(base + "redirect/checkout-invoice/create", {
        methode: "POST", entetes,
        corps: {
          commande: {
            invoice: {
              items: [{ name: "BâtiPlus " + formule.nom, description: "Abonnement BâtiPlus " + formule.nom, quantity: 1, unit_price: montant, total_price: montant }],
              total_amount: montant, devise: "XOF", description: "Abonnement BâtiPlus " + formule.nom,
              customer: "", customer_firstname: prenom, customer_lastname: famille, customer_email: email || "",
              external_id: reference, otp: ""
            },
            store: { name: "BâtiPlus", website_url: options.urlPublique },
            actions: { cancel_url: options.urlAnnulation(reference), return_url: options.urlRetour(reference), callback_url: options.urlNotification },
            custom_data: { reference }
          }
        }
      });
      if (statut >= 400 || !donnees || donnees.response_code !== "00" || typeof donnees.token !== "string" || typeof donnees.response_text !== "string") {
        throw new ErreurFournisseur("création refusée par LigdiCash", { statut, code: donnees && donnees.response_code });
      }
      return { urlPaiement: donnees.response_text, idFournisseur: donnees.token };
    },

    /* Pas de signature chez LigdiCash : on exige au moins un jeton de facture plausible ;
       l'activation ne se fera qu'après re-consultation (consulterStatut). */
    verifierNotification(requete) {
      const jeton = requete.corps && requete.corps.token;
      return typeof jeton === "string" && /^[A-Za-z0-9._-]{10,512}$/.test(jeton);
    },

    lireNotification(requete) {
      const c = requete.corps || {};
      const donnees = c.custom_data && typeof c.custom_data === "object" ? c.custom_data : {};
      const liste = Array.isArray(donnees) ? donnees : [];
      const trouve = liste.find((d) => d && (d.keyof_customdata === "reference" || d.key === "reference"));
      const reference = typeof donnees.reference === "string" ? donnees.reference : trouve ? String(trouve.valueof_customdata || trouve.value || "") : "";
      return {
        reference: texteCourt(reference, 40), statut: statutDe(c.status), montant: montantEntier(c.montant ?? c.amount),
        devise: "XOF", moyen: normaliserMoyen(c.operator_name), idFournisseur: texteCourt(c.token, 512)
      };
    },

    async consulterStatut(idFournisseur) {
      const { statut, donnees } = await appelJson(base + "redirect/checkout-invoice/confirm/?invoiceToken=" + encodeURIComponent(idFournisseur), { entetes });
      if (statut >= 400 || !donnees || donnees.response_code !== "00") throw new ErreurFournisseur("statut LigdiCash illisible", { statut });
      return {
        statut: statutDe(donnees.status), montant: montantEntier(donnees.montant ?? donnees.amount), devise: "XOF",
        moyen: normaliserMoyen(donnees.operator_name), reference: typeof donnees.external_id === "string" && donnees.external_id ? donnees.external_id : null
      };
    },

    async rembourser() {
      throw new ErreurFournisseur("LigdiCash : remboursement à effectuer depuis l'espace marchand");
    }
  }, "ligdicash");
}
