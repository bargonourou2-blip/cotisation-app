/* ==========================================================================
   BâtiPlus — paiements : le cœur (indépendant de l'agrégateur)
   Règles :
   - le montant vient de formules.js, jamais du client ;
   - une notification n'est qu'un signal : signature vérifiée (temps constant), puis le statut
     est RE-CONSULTÉ chez l'agrégateur par un appel sortant avant toute activation ;
   - montant ET devise doivent égaler le prix de la formule, sinon « anomalie » sans activation ;
   - l'activation se fait dans UNE transaction SQL : paiement → payé, abonnement prolongé, journal ;
     « UPDATE … WHERE statut = 'en_attente' » + paiement_id UNIQUE = 10 notifications, 1 activation ;
   - tâche planifiée intégrée (toutes les 5 min) : re-consulte les paiements en attente depuis
     plus de 3 min, passe en « expiré » après 24 h sans réponse, lance les renouvellements par carte.
   ========================================================================== */
import { createHmac, randomBytes } from "node:crypto";
import { STATUTS, enTransaction, journaliser } from "../base.js";
import { DEVISE, FORMULES, JOUR_MS, PLACES_VIE, formulePayante, prixParJour } from "../formules.js";
import { signerJetonAbonnement } from "../jetons.js";
import { MOYENS } from "./interface.js";

export const DELAIS = Object.freeze({
  planificateurMs: 5 * 60000,
  attenteAvantRattrapageMs: 3 * 60000,
  expirationMs: 24 * 3600000,
  consultationMinMs: 15000,
  initiationsParFenetre: 5,
  fenetreInitiationMs: 10 * 60000,
  renouvellementAvantFinMs: 24 * 3600000
});

/* Codes de statut renvoyés à l'application (sans accent, stables). */
export const CODES_API = Object.freeze({
  [STATUTS.attente]: "en_attente", [STATUTS.paye]: "paye", [STATUTS.echoue]: "echoue", [STATUTS.annule]: "annule",
  [STATUTS.expire]: "expire", [STATUTS.anomalie]: "anomalie", [STATUTS.rembourse]: "rembourse"
});

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class ErreurPaiement extends Error {
  constructor(statutHttp, code) {
    super(code);
    this.statutHttp = statutHttp;
    this.code = code;
  }
}

export function nouvelleReference() {
  const octets = randomBytes(12);
  let texte = "BP-";
  for (const octet of octets) texte += ALPHABET[octet % ALPHABET.length];
  return texte;
}

/* Secret propre à un agrégateur dans l'URL de notification : connaître l'URL de l'un ne donne pas celle des autres. */
export function secretUrlNotification(webhookSecret, fournisseur) {
  return createHmac("sha256", webhookSecret).update("notification:" + fournisseur).digest("hex").slice(0, 32);
}

export function creerServicePaiements({ base, config, adaptateurs, horloge = () => Date.now(), alerter = () => {} }) {
  const iso = (instant) => new Date(instant).toISOString();
  const enCours = new Map();
  let minuterie = null;

  const req = {
    electricien: base.prepare("SELECT * FROM electriciens WHERE id = ?"),
    paiement: base.prepare("SELECT * FROM paiements WHERE reference = ?"),
    paiementDe: base.prepare("SELECT * FROM paiements WHERE reference = ? AND electricien_id = ?"),
    parFournisseur: base.prepare("SELECT * FROM paiements WHERE fournisseur = ? AND id_fournisseur = ?"),
    inserer: base.prepare(`INSERT INTO paiements (reference, electricien_id, formule, montant, devise, fournisseur, statut, cle_idempotence, cree_le, maj_le)
      VALUES (?, ?, ?, ?, ?, ?, 'en_attente', ?, ?, ?)`),
    lier: base.prepare("UPDATE paiements SET fournisseur = ?, id_fournisseur = ?, secret_notification = ?, maj_le = ? WHERE id = ? AND statut = 'en_attente'"),
    changerFournisseur: base.prepare("UPDATE paiements SET fournisseur = ?, maj_le = ? WHERE id = ? AND statut = 'en_attente'"),
    finaliser: base.prepare(`UPDATE paiements SET statut = ?, moyen = ?, paye_le = ?, donnees_brutes = ?, maj_le = ?, verifie_le = ?
      WHERE reference = ? AND statut = 'en_attente'`),
    verifie: base.prepare("UPDATE paiements SET verifie_le = ? WHERE reference = ? AND statut = 'en_attente'"),
    recents: base.prepare("SELECT COUNT(*) AS n FROM paiements WHERE electricien_id = ? AND cree_le > ?"),
    placesVie: base.prepare("SELECT COUNT(DISTINCT electricien_id) AS n FROM abonnements WHERE formule = 'vie'"),
    enAttente: base.prepare("SELECT reference, cree_le FROM paiements WHERE statut = 'en_attente' AND cree_le < ? ORDER BY cree_le LIMIT 200"),
    abonner: base.prepare("INSERT INTO abonnements (electricien_id, formule, debut, fin, source, paiement_id, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    majElectricien: base.prepare("UPDATE electriciens SET formule = ?, abonne_depuis = ?, abonne_jusqu = ? WHERE id = ?"),
    garderCarte: base.prepare("UPDATE electriciens SET carte_client = ?, carte_moyen = ? WHERE id = ? AND renouvellement_auto = 1"),
    renouvellement: base.prepare("UPDATE electriciens SET renouvellement_auto = ?, carte_client = CASE WHEN ? = 1 THEN carte_client END, carte_moyen = CASE WHEN ? = 1 THEN carte_moyen END WHERE id = ?"),
    aRenouveler: base.prepare(`SELECT * FROM electriciens WHERE renouvellement_auto = 1 AND suspendu = 0 AND carte_client IS NOT NULL AND carte_moyen IS NOT NULL
      AND formule IN ('mensuel', 'annuel') AND abonne_jusqu IS NOT NULL AND abonne_jusqu > ? AND abonne_jusqu <= ?`),
    rembourserPaiement: base.prepare("UPDATE paiements SET statut = 'remboursé', maj_le = ? WHERE reference = ? AND statut = 'payé'"),
    anomalies: base.prepare("SELECT reference, formule, montant, devise, fournisseur, cree_le, maj_le FROM paiements WHERE statut = 'anomalie' AND maj_le > ? ORDER BY maj_le DESC LIMIT 50")
  };

  function adaptateur(nom) {
    return Object.prototype.hasOwnProperty.call(adaptateurs, nom) ? adaptateurs[nom] : null;
  }

  function abonnementActif(electricien, maintenant) {
    if (electricien.formule === "vie") return true;
    return Boolean(formulePayante(electricien.formule) && electricien.abonne_jusqu && Date.parse(electricien.abonne_jusqu) > maintenant);
  }

  /* Nouvelle période après un paiement confirmé :
     - pas d'abonnement actif → commence maintenant ;
     - même formule (renouvellement anticipé) → les jours s'ajoutent à la fin actuelle ;
     - formule supérieure → immédiate ; les jours restants sont convertis au prorata du prix ;
     - formule inférieure pendant un Pro plus long → jours ajoutés, la formule supérieure est gardée. */
  function nouvellePeriode(electricien, idFormule, maintenant) {
    const nouvelle = FORMULES[idFormule];
    if (idFormule === "vie") return { formule: "vie", debut: iso(maintenant), fin: null };
    const duree = nouvelle.jours * JOUR_MS;
    if (!abonnementActif(electricien, maintenant)) return { formule: idFormule, debut: iso(maintenant), fin: iso(maintenant + duree) };
    if (electricien.formule === "vie") return { formule: "vie", debut: electricien.abonne_depuis || iso(maintenant), fin: null };
    const actuelle = FORMULES[electricien.formule];
    const fin = Date.parse(electricien.abonne_jusqu);
    const debut = electricien.abonne_depuis || iso(maintenant);
    if (nouvelle.rang > actuelle.rang) {
      const bonus = Math.floor((fin - maintenant) * prixParJour(electricien.formule) / prixParJour(idFormule));
      return { formule: idFormule, debut: iso(maintenant), fin: iso(maintenant + duree + Math.max(0, bonus)) };
    }
    return { formule: electricien.formule, debut, fin: iso(fin + duree) };
  }

  function jetonPour(electricien, maintenant) {
    if (!abonnementActif(electricien, maintenant)) return null;
    return signerJetonAbonnement(config.clePrivee, {
      compteId: electricien.compte_id, telephone: electricien.telephone, formule: electricien.formule,
      debut: electricien.abonne_depuis || iso(maintenant), fin: electricien.formule === "vie" ? null : electricien.abonne_jusqu, emisLe: iso(maintenant)
    });
  }

  function urlSure(texte) {
    if (texte === null) return null;
    try {
      const url = new URL(texte);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      return url.protocol === "https:" || (!config.production && local && url.protocol === "http:") ? url.href : "";
    } catch (erreur) {
      return "";
    }
  }

  async function initier(electricien, idFormule, { ip = null, carte = null } = {}) {
    const formule = formulePayante(idFormule);
    if (!formule) throw new ErreurPaiement(400, "formule_inconnue");
    const maintenant = horloge();
    if (electricien.suspendu) throw new ErreurPaiement(403, "compte_suspendu");
    if (electricien.formule === "vie") throw new ErreurPaiement(409, "deja_a_vie");
    if (idFormule === "vie" && req.placesVie.get().n >= PLACES_VIE) throw new ErreurPaiement(409, "places_vie_epuisees");
    if (!carte && req.recents.get(electricien.id, iso(maintenant - DELAIS.fenetreInitiationMs)).n >= DELAIS.initiationsParFenetre) throw new ErreurPaiement(429, "trop_de_tentatives");
    const reference = nouvelleReference();
    const resultat = req.inserer.run(reference, electricien.id, idFormule, formule.prix, DEVISE, config.paiement.fournisseur, reference, iso(maintenant), iso(maintenant));
    const id = Number(resultat.lastInsertRowid);
    const fournisseurs = carte ? ["stripe"] : [config.paiement.fournisseur, config.paiement.secours].filter(Boolean);
    for (const nom of fournisseurs) {
      const agregateur = adaptateur(nom);
      if (!agregateur) continue;
      try {
        req.changerFournisseur.run(nom, iso(horloge()), id);
        const cree = await agregateur.creerPaiement({
          reference, montant: formule.prix, devise: DEVISE, formule, telephone: electricien.telephone, nom: electricien.nom,
          email: electricien.email || "", renouvellementAuto: electricien.renouvellement_auto === 1, carte
        });
        const adresse = urlSure(cree.urlPaiement);
        if (adresse === "" || (adresse === null && !carte) || typeof cree.idFournisseur !== "string" || !cree.idFournisseur) throw new Error("réponse d'initiation incomplète");
        req.lier.run(nom, cree.idFournisseur.slice(0, 512), typeof cree.secretNotification === "string" ? cree.secretNotification.slice(0, 512) : null, iso(horloge()), id);
        journaliser(base, "paiement_initie", { electricienId: electricien.id, ip, details: { reference, formule: idFormule, montant: formule.prix, fournisseur: nom, renouvellement: Boolean(carte) } });
        return { reference, urlPaiement: adresse };
      } catch (erreur) {
        journaliser(base, "agregateur_indisponible", { electricienId: electricien.id, ip, details: { reference, fournisseur: nom, erreur: String(erreur && erreur.message).slice(0, 120) } });
      }
    }
    req.finaliser.run(STATUTS.echoue, null, null, JSON.stringify({ motif: "initiation impossible" }), iso(horloge()), iso(horloge()), reference);
    throw new ErreurPaiement(503, "paiement_indisponible");
  }

  /* LA fonction qui décide : re-consultation chez l'agrégateur puis transaction unique. */
  async function confirmer(reference) {
    if (enCours.has(reference)) return enCours.get(reference);
    const travail = (async () => {
      const paiement = req.paiement.get(reference);
      if (!paiement || paiement.statut !== STATUTS.attente || !paiement.id_fournisseur) return paiement ? paiement.statut : null;
      const agregateur = adaptateur(paiement.fournisseur);
      if (!agregateur) return paiement.statut;
      let etat;
      try {
        etat = await agregateur.consulterStatut(paiement.id_fournisseur);
      } catch (erreur) {
        req.verifie.run(iso(horloge()), reference);
        return STATUTS.attente;
      }
      const maintenant = horloge();
      if (!etat || etat.statut === STATUTS.attente || !Object.values(STATUTS).includes(etat.statut)) {
        req.verifie.run(iso(maintenant), reference);
        return STATUTS.attente;
      }
      let statut = etat.statut;
      const formule = FORMULES[paiement.formule];
      const ecarts = [];
      if (statut === STATUTS.paye) {
        if (etat.montant !== paiement.montant || etat.montant !== formule.prix) ecarts.push("montant");
        if (etat.devise !== paiement.devise || etat.devise !== DEVISE) ecarts.push("devise");
        if (etat.reference && etat.reference !== reference) ecarts.push("reference");
        if (ecarts.length) statut = STATUTS.anomalie;
      }
      if (statut === STATUTS.rembourse) statut = STATUTS.anomalie;
      const moyen = MOYENS.includes(etat.moyen) ? etat.moyen : "autre";
      const brut = JSON.stringify({ statut: etat.statut, montant: etat.montant, devise: etat.devise, moyen, ecarts });
      const applique = enTransaction(base, () => {
        const changement = req.finaliser.run(statut, moyen, statut === STATUTS.paye ? iso(maintenant) : null, brut, iso(maintenant), iso(maintenant), reference);
        if (changement.changes === 0) return false;
        if (statut === STATUTS.paye) {
          const electricien = req.electricien.get(paiement.electricien_id);
          const periode = nouvellePeriode(electricien, paiement.formule, maintenant);
          req.abonner.run(electricien.id, periode.formule, periode.debut, periode.fin, "paiement", paiement.id, iso(maintenant));
          req.majElectricien.run(periode.formule, periode.debut, periode.fin, electricien.id);
          if (etat.carte && etat.carte.client && etat.carte.moyen) req.garderCarte.run(String(etat.carte.client).slice(0, 255), String(etat.carte.moyen).slice(0, 255), electricien.id);
          journaliser(base, "activation_abonnement", { electricienId: electricien.id, details: { reference, formule: periode.formule, fin: periode.fin, moyen } });
        } else if (statut === STATUTS.anomalie) {
          journaliser(base, "paiement_anomalie", { electricienId: paiement.electricien_id, details: { reference, ecarts, montantRecu: etat.montant, deviseRecue: etat.devise } });
        } else {
          journaliser(base, "paiement_" + CODES_API[statut], { electricienId: paiement.electricien_id, details: { reference } });
        }
        return true;
      });
      if (applique && statut === STATUTS.anomalie) alerter({ type: "anomalie", reference, ecarts });
      return applique ? statut : req.paiement.get(reference).statut;
    })();
    enCours.set(reference, travail);
    try {
      return await travail;
    } finally {
      enCours.delete(reference);
    }
  }

  /* Webhook : réponse rapide ; le traitement (re-consultation) suit sans bloquer la réponse. */
  function recevoirNotification(fournisseur, requete, ip) {
    const agregateur = adaptateur(fournisseur);
    if (!agregateur) return { statutHttp: 404, traitement: Promise.resolve(null) };
    let lu = null;
    try {
      lu = agregateur.lireNotification(requete);
    } catch (erreur) {
      lu = null;
    }
    const paiement = lu && lu.reference ? req.paiement.get(lu.reference) : lu && lu.idFournisseur ? req.parFournisseur.get(fournisseur, lu.idFournisseur) : null;
    const lie = paiement && paiement.fournisseur === fournisseur && (!lu.idFournisseur || !paiement.id_fournisseur || lu.idFournisseur === paiement.id_fournisseur) ? paiement : null;
    let valide = false;
    try {
      valide = agregateur.verifierNotification(requete, { secretNotification: lie ? lie.secret_notification : null }) === true;
    } catch (erreur) {
      valide = false;
    }
    if (valide && !lie) {
      /* Signée mais sans paiement BâtiPlus correspondant (autre type d'évènement) : accusée, ignorée. */
      journaliser(base, "notification_ignoree", { ip, details: { fournisseur } });
      return { statutHttp: 200, traitement: Promise.resolve(null) };
    }
    if (!valide) {
      journaliser(base, "notification_invalide", { ip, details: { fournisseur, reference: lu && typeof lu.reference === "string" ? lu.reference.slice(0, 40) : null } });
      return { statutHttp: 401, traitement: Promise.resolve(null) };
    }
    journaliser(base, "notification_recue", { electricienId: lie.electricien_id, ip, details: { fournisseur, reference: lie.reference } });
    const traitement = new Promise((resoudre) => setImmediate(resoudre)).then(() => confirmer(lie.reference)).catch(() => null);
    return { statutHttp: 200, traitement };
  }

  /* GET /api/paiements/:reference — seulement le propriétaire (sinon 404). Un paiement encore en
     attente déclenche au plus une re-consultation toutes les 15 s (l'application interroge toutes les 3 s). */
  async function statutPourCompte(electricien, reference) {
    let paiement = req.paiementDe.get(reference, electricien.id);
    if (!paiement) return null;
    const maintenant = horloge();
    if (paiement.statut === STATUTS.attente && maintenant - Date.parse(paiement.verifie_le || paiement.cree_le) >= DELAIS.consultationMinMs) {
      req.verifie.run(iso(maintenant), reference);
      confirmer(reference).catch(() => null);
    }
    paiement = req.paiementDe.get(reference, electricien.id);
    const compte = req.electricien.get(electricien.id);
    const paye = paiement.statut === STATUTS.paye;
    return {
      reference: paiement.reference, statut: CODES_API[paiement.statut], formule: paiement.formule, montant: paiement.montant, devise: paiement.devise,
      moyen: paiement.moyen || null, payeLe: paiement.paye_le || null,
      abonnement: paye ? { formule: compte.formule, debut: compte.abonne_depuis, fin: compte.formule === "vie" ? null : compte.abonne_jusqu } : null,
      jeton: paye ? jetonPour(compte, maintenant) : null
    };
  }

  function reglerRenouvellementAuto(electricien, actif, ip) {
    const valeur = actif ? 1 : 0;
    req.renouvellement.run(valeur, valeur, valeur, electricien.id);
    journaliser(base, "renouvellement_auto", { electricienId: electricien.id, ip, details: { actif: Boolean(actif) } });
    return { actif: Boolean(actif) };
  }

  /* Renouvellement par carte, seulement après accord explicite (interrupteur du profil), à J-1. */
  async function renouvellementsAuto() {
    if (!adaptateur("stripe")) return 0;
    const maintenant = horloge();
    let lances = 0;
    for (const electricien of req.aRenouveler.all(iso(maintenant), iso(maintenant + DELAIS.renouvellementAvantFinMs))) {
      if (req.recents.get(electricien.id, iso(maintenant - DELAIS.renouvellementAvantFinMs)).n > 0) continue;
      try {
        await initier(electricien, electricien.formule, { carte: { client: electricien.carte_client, moyen: electricien.carte_moyen } });
        lances += 1;
      } catch (erreur) {
        journaliser(base, "renouvellement_auto_echec", { electricienId: electricien.id, details: { code: erreur && erreur.code } });
      }
    }
    return lances;
  }

  /* Rattrapage : un webhook perdu la nuit n'empêche jamais un abonnement de s'activer. */
  async function rattraper() {
    const maintenant = horloge();
    const bilan = { consultes: 0, payes: 0, expires: 0 };
    for (const { reference, cree_le: creeLe } of req.enAttente.all(iso(maintenant - DELAIS.attenteAvantRattrapageMs))) {
      bilan.consultes += 1;
      const statut = await confirmer(reference);
      if (statut === STATUTS.paye) bilan.payes += 1;
      if (statut === STATUTS.attente && maintenant - Date.parse(creeLe) > DELAIS.expirationMs) {
        const changement = req.finaliser.run(STATUTS.expire, null, null, JSON.stringify({ motif: "sans réponse après 24 h" }), iso(maintenant), iso(maintenant), reference);
        if (changement.changes) {
          bilan.expires += 1;
          journaliser(base, "paiement_expire", { details: { reference } });
        }
      }
    }
    bilan.renouvellements = await renouvellementsAuto();
    return bilan;
  }

  /* Remboursement (administrateur, étape 14 pour la route) : confirmation + motif écrits,
     journal complet, désactivation de l'abonnement dans la même transaction. */
  async function rembourser(reference, { adminId, motif, confirmation, ip = null }) {
    const paiement = req.paiement.get(reference);
    if (!paiement || paiement.statut !== STATUTS.paye) throw new ErreurPaiement(404, "paiement_introuvable");
    if (confirmation !== reference || typeof motif !== "string" || motif.trim().length < 5) throw new ErreurPaiement(400, "confirmation_requise");
    const agregateur = adaptateur(paiement.fournisseur);
    if (!agregateur) throw new ErreurPaiement(503, "paiement_indisponible");
    await agregateur.rembourser(paiement.id_fournisseur);
    const maintenant = horloge();
    enTransaction(base, () => {
      if (req.rembourserPaiement.run(iso(maintenant), reference).changes === 0) throw new ErreurPaiement(409, "deja_traite");
      req.majElectricien.run("gratuit", null, null, paiement.electricien_id);
      req.abonner.run(paiement.electricien_id, "gratuit", iso(maintenant), iso(maintenant), "remboursement", null, iso(maintenant));
      journaliser(base, "remboursement", { electricienId: paiement.electricien_id, ip, details: { reference, adminId, motif: motif.trim().slice(0, 300) } });
    });
    return { rembourse: true };
  }

  /* Alertes en tête du tableau d'administration (route admin : étape 14). */
  function alertes() {
    return req.anomalies.all(iso(horloge() - 30 * JOUR_MS));
  }

  function demarrerPlanificateur() {
    if (minuterie) return;
    minuterie = setInterval(() => { rattraper().catch(() => null); }, DELAIS.planificateurMs);
    minuterie.unref();
  }

  function arreterPlanificateur() {
    if (minuterie) clearInterval(minuterie);
    minuterie = null;
  }

  return Object.freeze({
    initier, confirmer, recevoirNotification, statutPourCompte, reglerRenouvellementAuto, renouvellementsAuto,
    rattraper, rembourser, alertes, demarrerPlanificateur, arreterPlanificateur, nouvellePeriode
  });
}
