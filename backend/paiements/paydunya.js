/* ==========================================================================
   BâtiPlus — paiements : PayDunya (Sénégal, Côte d'Ivoire, Bénin, Togo, Mali, Burkina Faso)
   Sandbox : https://app.paydunya.com/sandbox-api/v1 · Production : https://app.paydunya.com/api/v1
   En-têtes : PAYDUNYA-MASTER-KEY, PAYDUNYA-PRIVATE-KEY, PAYDUNYA-TOKEN.
   1. POST /checkout-invoice/create → { response_code: "00", response_text: url, token }.
   2. Notification (IPN) : formulaire « data[…] » ; data[hash] = SHA-512 de la MASTER KEY,
      comparé en temps constant.
   3. GET /checkout-invoice/confirm/{token} → status completed | pending | cancelled, invoice.total_amount.
   Remboursement : pas d'API publique → espace marchand.
   ========================================================================== */
import { createHash } from "node:crypto";
import {
  ErreurFournisseur, STATUTS, appelJson, egalTempsConstant, montantEntier, normaliserMoyen, texteCourt, verifierAdaptateur
} from "./interface.js";

export default function fabriquer(options) {
  const base = options.baseUrl || (options.mode === "production" ? "https://app.paydunya.com/api/v1" : "https://app.paydunya.com/sandbox-api/v1");
  const entetes = {
    "PAYDUNYA-MASTER-KEY": options.cles.PAYDUNYA_MASTER_KEY,
    "PAYDUNYA-PRIVATE-KEY": options.cles.PAYDUNYA_PRIVATE_KEY,
    "PAYDUNYA-TOKEN": options.cles.PAYDUNYA_TOKEN
  };
  const empreinte = createHash("sha512").update(options.cles.PAYDUNYA_MASTER_KEY).digest("hex");

  /* L'IPN arrive en formulaire (« data[invoice][token] ») ou en JSON ({ data: { … } }). */
  function champ(corps, ...chemin) {
    if (!corps || typeof corps !== "object") return undefined;
    const plat = "data" + chemin.map((c) => "[" + c + "]").join("");
    if (Object.prototype.hasOwnProperty.call(corps, plat)) return corps[plat];
    let noeud = corps.data;
    for (const c of chemin) noeud = noeud && typeof noeud === "object" ? noeud[c] : undefined;
    return noeud;
  }

  function statutDe(texte) {
    const s = String(texte || "").toLowerCase();
    if (s === "completed") return STATUTS.paye;
    if (s === "cancelled" || s === "canceled") return STATUTS.annule;
    if (s === "failed") return STATUTS.echoue;
    return STATUTS.attente;
  }

  return verifierAdaptateur({
    async creerPaiement({ reference, montant, devise, formule }) {
      if (devise !== "XOF") throw new ErreurFournisseur("PayDunya : devise non prise en charge");
      const { statut, donnees } = await appelJson(base + "/checkout-invoice/create", {
        methode: "POST", entetes,
        corps: {
          invoice: {
            total_amount: montant, description: "Abonnement BâtiPlus " + formule.nom,
            items: { item_0: { name: "BâtiPlus " + formule.nom, quantity: 1, unit_price: montant, total_price: montant } }
          },
          store: { name: "BâtiPlus", website_url: options.urlPublique },
          actions: { cancel_url: options.urlAnnulation(reference), return_url: options.urlRetour(reference), callback_url: options.urlNotification },
          custom_data: { reference }
        }
      });
      if (statut >= 400 || !donnees || donnees.response_code !== "00" || typeof donnees.token !== "string" || typeof donnees.response_text !== "string") {
        throw new ErreurFournisseur("création refusée par PayDunya", { statut, code: donnees && donnees.response_code });
      }
      return { urlPaiement: donnees.response_text, idFournisseur: donnees.token };
    },

    verifierNotification(requete) {
      const hash = champ(requete.corps, "hash");
      return typeof hash === "string" && /^[a-f0-9]{128}$/i.test(hash) && egalTempsConstant(empreinte, hash.toLowerCase());
    },

    lireNotification(requete) {
      return {
        reference: texteCourt(champ(requete.corps, "custom_data", "reference"), 40), statut: statutDe(champ(requete.corps, "status")),
        montant: montantEntier(champ(requete.corps, "invoice", "total_amount")), devise: "XOF", moyen: "autre",
        idFournisseur: texteCourt(champ(requete.corps, "invoice", "token"), 120)
      };
    },

    async consulterStatut(idFournisseur) {
      const { statut, donnees } = await appelJson(base + "/checkout-invoice/confirm/" + encodeURIComponent(idFournisseur), { entetes });
      if (statut >= 400 || !donnees || donnees.response_code !== "00") throw new ErreurFournisseur("statut PayDunya illisible", { statut });
      const facture = donnees.invoice && typeof donnees.invoice === "object" ? donnees.invoice : {};
      const perso = donnees.custom_data && typeof donnees.custom_data === "object" ? donnees.custom_data : {};
      return {
        statut: statutDe(donnees.status), montant: montantEntier(facture.total_amount), devise: "XOF",
        moyen: normaliserMoyen(donnees.customer && donnees.customer.payment_method), reference: typeof perso.reference === "string" ? perso.reference : null
      };
    },

    async rembourser() {
      throw new ErreurFournisseur("PayDunya : remboursement à effectuer depuis l'espace marchand");
    }
  }, "paydunya");
}
