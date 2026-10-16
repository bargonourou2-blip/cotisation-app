/* ==========================================================================
   BâtiPlus — backend : LA source de vérité des prix (étape 12)
   Le front envoie seulement le nom de la formule ; le montant facturé est lu ICI.
   Les prix affichés dans l'application (src/donnees.js → FORMULES) sont contrôlés
   à chaque construction : ils doivent être identiques (contrôle P2).
   ========================================================================== */

export const DEVISE = "XOF";
export const JOUR_MS = 86400000;
/* Lifetime : réservé aux 200 premiers abonnés (contrôlé en base au moment de l'initiation). */
export const PLACES_VIE = 200;

/* rang : sert au passage supérieur (semaine < mensuel < annuel < vie).
   renouvelableParCarte : le renouvellement automatique par carte n'existe pas pour le Pass semaine
   (« Aucun renouvellement automatique », promis sur sa carte) ni pour Lifetime (rien à renouveler). */
export const FORMULES = Object.freeze({
  semaine: Object.freeze({ nom: "Pass semaine", prix: 750, jours: 7, rang: 1, renouvelableParCarte: false }),
  mensuel: Object.freeze({ nom: "Pro mensuel", prix: 2500, jours: 30, rang: 2, renouvelableParCarte: true }),
  annuel: Object.freeze({ nom: "Pro annuel", prix: 25000, jours: 365, rang: 3, renouvelableParCarte: true }),
  vie: Object.freeze({ nom: "Lifetime", prix: 60000, jours: null, rang: 4, renouvelableParCarte: false })
});

export function formulePayante(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(FORMULES, id) ? FORMULES[id] : null;
}

/* Prix d'un jour de formule (pour le prorata d'un passage supérieur). */
export function prixParJour(id) {
  const formule = formulePayante(id);
  return formule && formule.jours ? formule.prix / formule.jours : null;
}

/* Liste publique (GET /api/formules) : rien d'autre que ce qui est affiché dans l'application. */
export function formulesPubliques() {
  return Object.entries(FORMULES).map(([id, f]) => ({ id, nom: f.nom, prix: f.prix, devise: DEVISE, jours: f.jours }));
}
