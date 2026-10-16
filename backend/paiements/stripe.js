/* ==========================================================================
   BâtiPlus — paiements : Stripe (cartes Visa / Mastercard ; seul agrégateur qui permet
   le renouvellement automatique par carte, sur accord explicite dans le profil)
   https://api.stripe.com/v1 — Authorization: Bearer <clé secrète>, corps en formulaire.
   Le XOF est une devise « sans décimale » chez Stripe : unit_amount = montant en FCFA.
   1. POST /checkout/sessions (mode=payment) → { id: cs_…, url }.
      Renouvellement automatique accepté → la carte est gardée CHEZ STRIPE (setup_future_usage) :
      BâtiPlus ne garde que des identifiants opaques (cus_…, pm_…), jamais un numéro de carte.
   2. Renouvellement : POST /payment_intents (off_session, confirm) → { id: pi_… }, sans page.
   3. Notification : en-tête Stripe-Signature « t=…,v1=… », HMAC-SHA256 de « t.corps », tolérance 5 min.
   4. Statut : GET /checkout/sessions/{id} (payment_status=paid) ou GET /payment_intents/{id} (succeeded).
   5. Remboursement : POST /refunds { payment_intent }.
   ========================================================================== */
import {
  ErreurFournisseur, STATUTS, appelJson, deviseNormalisee, montantEntier, normaliserMoyen, texteCourt,
  verifierAdaptateur, verifierSignatureHorodatee
} from "./interface.js";

export default function fabriquer(options) {
  const base = options.baseUrl || "https://api.stripe.com/v1";
  const entetes = { Authorization: "Bearer " + options.cles.STRIPE_SECRET_KEY };

  async function appel(chemin, methode, corps) {
    const reponse = await appelJson(base + chemin, { methode, entetes, corps, formulaire: corps !== null });
    if (reponse.statut >= 400 || !reponse.donnees || typeof reponse.donnees !== "object") {
      throw new ErreurFournisseur("Stripe a refusé la demande", { statut: reponse.statut, code: reponse.donnees && reponse.donnees.error && reponse.donnees.error.code });
    }
    return reponse.donnees;
  }

  function carteDe(intention) {
    const moyen = intention && typeof intention.payment_method === "object" ? intention.payment_method : null;
    const marque = moyen && moyen.card ? moyen.card.brand : "";
    return {
      moyen: normaliserMoyen(marque || "card"),
      carte: intention && typeof intention.customer === "string" && moyen && typeof moyen.id === "string" ? { client: intention.customer, moyen: moyen.id } : null
    };
  }

  function statutIntention(s) {
    if (s === "succeeded") return STATUTS.paye;
    if (s === "canceled") return STATUTS.annule;
    if (s === "requires_payment_method") return STATUTS.echoue;
    return STATUTS.attente;
  }

  return verifierAdaptateur({
    async creerPaiement({ reference, montant, devise, formule, email, renouvellementAuto, carte }) {
      if (carte && carte.client && carte.moyen) {
        const intention = await appel("/payment_intents", "POST", {
          amount: String(montant), currency: devise.toLowerCase(), customer: carte.client, payment_method: carte.moyen,
          off_session: "true", confirm: "true", description: "Renouvellement BâtiPlus " + formule.nom, "metadata[reference]": reference
        });
        if (typeof intention.id !== "string") throw new ErreurFournisseur("renouvellement Stripe refusé");
        return { urlPaiement: null, idFournisseur: intention.id };
      }
      const corps = {
        mode: "payment", locale: "fr", client_reference_id: reference, "metadata[reference]": reference,
        success_url: options.urlRetour(reference), cancel_url: options.urlAnnulation(reference),
        "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": devise.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(montant), "line_items[0][price_data][product_data][name]": "BâtiPlus " + formule.nom,
        "payment_method_types[0]": "card"
      };
      if (email) corps.customer_email = email;
      if (renouvellementAuto && formule.renouvelableParCarte) {
        corps.customer_creation = "always";
        corps["payment_intent_data[setup_future_usage]"] = "off_session";
      }
      const session = await appel("/checkout/sessions", "POST", corps);
      if (typeof session.id !== "string" || typeof session.url !== "string") throw new ErreurFournisseur("session Stripe incomplète");
      return { urlPaiement: session.url, idFournisseur: session.id };
    },

    verifierNotification(requete) {
      return verifierSignatureHorodatee(requete.entetes["stripe-signature"], requete.corpsBrut, options.cles.STRIPE_WEBHOOK_SECRET, "v1");
    },

    lireNotification(requete) {
      const objet = requete.corps && requete.corps.data && requete.corps.data.object && typeof requete.corps.data.object === "object" ? requete.corps.data.object : {};
      const meta = objet.metadata && typeof objet.metadata === "object" ? objet.metadata : {};
      return {
        reference: texteCourt(objet.client_reference_id || meta.reference, 40), statut: STATUTS.attente,
        montant: montantEntier(objet.amount_total ?? objet.amount), devise: deviseNormalisee(objet.currency), moyen: "carte",
        idFournisseur: texteCourt(objet.id, 255)
      };
    },

    async consulterStatut(idFournisseur) {
      if (/^pi_[A-Za-z0-9_]+$/.test(idFournisseur)) {
        const intention = await appel("/payment_intents/" + encodeURIComponent(idFournisseur) + "?expand[]=payment_method", "GET", null);
        const { moyen, carte } = carteDe(intention);
        return {
          statut: statutIntention(intention.status), montant: montantEntier(intention.amount_received || intention.amount),
          devise: deviseNormalisee(intention.currency), moyen, reference: intention.metadata && intention.metadata.reference || null, carte
        };
      }
      if (!/^cs_[A-Za-z0-9_]+$/.test(idFournisseur)) throw new ErreurFournisseur("identifiant Stripe inattendu");
      const session = await appel("/checkout/sessions/" + encodeURIComponent(idFournisseur) + "?expand[]=payment_intent.payment_method", "GET", null);
      const intention = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
      const { moyen, carte } = carteDe(intention ? { ...intention, customer: intention.customer || session.customer } : null);
      let statut = STATUTS.attente;
      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") statut = STATUTS.paye;
      else if (session.status === "expired") statut = STATUTS.expire;
      else if (intention && intention.status === "canceled") statut = STATUTS.annule;
      return {
        statut, montant: montantEntier(session.amount_total), devise: deviseNormalisee(session.currency), moyen,
        reference: session.client_reference_id || null, carte: intention && intention.setup_future_usage === "off_session" ? carte : null
      };
    },

    async rembourser(idFournisseur) {
      let intention = idFournisseur;
      if (/^cs_/.test(idFournisseur)) {
        const session = await appel("/checkout/sessions/" + encodeURIComponent(idFournisseur), "GET", null);
        const lie = session.payment_intent;
        intention = typeof lie === "string" ? lie : lie && typeof lie.id === "string" ? lie.id : "";
      }
      if (!/^pi_[A-Za-z0-9_]+$/.test(intention)) throw new ErreurFournisseur("paiement Stripe introuvable pour le remboursement");
      const remboursement = await appel("/refunds", "POST", { payment_intent: intention });
      if (remboursement.status === "failed" || remboursement.status === "canceled") throw new ErreurFournisseur("remboursement Stripe refusé");
      return { rembourse: true };
    }
  }, "stripe");
}
