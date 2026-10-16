/* ==========================================================================
   BâtiPlus — backend : administration (étape 14)
   - Code administrateur vérifié ICI (scrypt, ADMIN_CODE_HASH du .env), jamais dans l'application.
   - 3 échecs depuis une adresse : blocage d'une heure, journalisé. Liste ADMIN_IPS facultative.
   - Jeton d'administration séparé, 2 heures, lié à un identifiant d'appareil (jetons.js).
   - Actions sensibles : confirmation écrite (numéro du compte ou référence) + motif obligatoire,
     journalisées ; toutes réversibles (réactiver, retirer des jours), réversion journalisée.
   - Ce que l'administration ne voit jamais : code_hash, code_sel, jetons, signatures, clés,
     données brutes de paiement, empreintes d'appareil ou de code d'activation (sauvegarde comprise).
   ========================================================================== */
import { createHash } from "node:crypto";
import { STATUTS, enTransaction, journaliser } from "./base.js";
import { empreinteCodeActivation, nouveauCodeActivation, verifierCode } from "./codes.js";
import { ErreurApi } from "./comptes.js";
import { FORMULES, JOUR_MS, PLACES_VIE } from "./formules.js";
import { creerJetonAdmin, lireJetonAdmin } from "./jetons.js";

export const ADMIN = Object.freeze({ echecsMax: 3, blocageMs: 3600000, pageMax: 50, journalMax: 100 });

/* Colonnes exportées par la sauvegarde : LISTE BLANCHE (C.12). Une colonne ajoutée plus tard
   n'apparaît jamais par défaut dans une sauvegarde. */
const EXPORT = Object.freeze({
  electriciens: ["id", "nom", "telephone", "entreprise", "ville", "pays", "devise", "metier", "formule", "abonne_depuis", "abonne_jusqu",
    "renouvellement_auto", "suspendu", "motif_suspension", "cree_le", "derniere_activite", "supprime_le"],
  paiements: ["id", "reference", "electricien_id", "formule", "montant", "devise", "fournisseur", "moyen", "statut", "cree_le", "paye_le", "maj_le"],
  abonnements: ["id", "electricien_id", "formule", "debut", "fin", "source", "paiement_id", "cree_le"],
  devis: ["id", "electricien_id", "uid", "numero", "statut", "client", "total", "donnees", "cree_le", "mois", "modifie_le", "supprime", "hors_ligne"],
  chantiers: ["id", "electricien_id", "uid", "nom", "statut", "donnees", "cree_le", "modifie_le", "supprime"],
  clients: ["id", "electricien_id", "uid", "nom", "telephone", "donnees", "cree_le", "modifie_le", "supprime"],
  catalogue: ["id", "electricien_id", "ref", "rang", "designation", "unite", "categorie", "choisi"],
  fournisseurs: ["id", "article_id", "rang", "nom", "prix"],
  codes_activation: ["id", "formule", "cree_le", "expire_le", "motif", "utilise_par", "utilise_le", "revoque_le"],
  activites: ["id", "date", "electricien_id", "ip", "action", "details"]
});

export function creerServiceAdmin({ base, config, paiements, horloge = () => Date.now() }) {
  const iso = (instant) => new Date(instant).toISOString();
  /* Requêtes de sauvegarde : une requête préparée, LITTÉRALE, par table (aucun nom assemblé). */
  const SAUVEGARDE = Object.freeze({
    electriciens: base.prepare("SELECT id, nom, telephone, entreprise, ville, pays, devise, metier, formule, abonne_depuis, abonne_jusqu, renouvellement_auto, suspendu, motif_suspension, cree_le, derniere_activite, supprime_le FROM electriciens ORDER BY id"),
    paiements: base.prepare("SELECT id, reference, electricien_id, formule, montant, devise, fournisseur, moyen, statut, cree_le, paye_le, maj_le FROM paiements ORDER BY id"),
    abonnements: base.prepare("SELECT id, electricien_id, formule, debut, fin, source, paiement_id, cree_le FROM abonnements ORDER BY id"),
    devis: base.prepare("SELECT id, electricien_id, uid, numero, statut, client, total, donnees, cree_le, mois, modifie_le, supprime, hors_ligne FROM devis ORDER BY id"),
    chantiers: base.prepare("SELECT id, electricien_id, uid, nom, statut, donnees, cree_le, modifie_le, supprime FROM chantiers ORDER BY id"),
    clients: base.prepare("SELECT id, electricien_id, uid, nom, telephone, donnees, cree_le, modifie_le, supprime FROM clients ORDER BY id"),
    catalogue: base.prepare("SELECT id, electricien_id, ref, rang, designation, unite, categorie, choisi FROM catalogue ORDER BY id"),
    fournisseurs: base.prepare("SELECT id, article_id, rang, nom, prix FROM fournisseurs ORDER BY id"),
    codes_activation: base.prepare("SELECT id, formule, cree_le, expire_le, motif, utilise_par, utilise_le, revoque_le FROM codes_activation ORDER BY id"),
    activites: base.prepare("SELECT id, date, electricien_id, ip, action, details FROM activites ORDER BY id")
  });
  const req = {
    electricien: base.prepare("SELECT * FROM electriciens WHERE id = ? AND supprime_le IS NULL"),
    blocage: base.prepare("SELECT echecs, jusqu FROM blocages WHERE cle = ?"),
    ecrireBlocage: base.prepare(`INSERT INTO blocages (cle, echecs, jusqu, maj_le) VALUES (?, ?, ?, ?)
      ON CONFLICT (cle) DO UPDATE SET echecs = excluded.echecs, jusqu = excluded.jusqu, maj_le = excluded.maj_le`),
    effacerBlocage: base.prepare("DELETE FROM blocages WHERE cle = ?"),
    total: base.prepare("SELECT COUNT(*) AS n FROM electriciens WHERE supprime_le IS NULL"),
    actifsDepuis: base.prepare("SELECT COUNT(*) AS n FROM electriciens WHERE supprime_le IS NULL AND derniere_activite > ?"),
    nouveauxDepuis: base.prepare("SELECT COUNT(*) AS n FROM electriciens WHERE supprime_le IS NULL AND cree_le > ?"),
    suspendus: base.prepare("SELECT COUNT(*) AS n FROM electriciens WHERE supprime_le IS NULL AND suspendu = 1"),
    parFormule: base.prepare(`SELECT CASE WHEN formule = 'vie' OR (formule <> 'gratuit' AND abonne_jusqu > ?) THEN formule ELSE 'gratuit' END AS formule, COUNT(*) AS n
      FROM electriciens WHERE supprime_le IS NULL GROUP BY 1`),
    parPays: base.prepare("SELECT pays, COUNT(*) AS n FROM electriciens WHERE supprime_le IS NULL GROUP BY pays ORDER BY n DESC LIMIT 30"),
    revenus: base.prepare("SELECT formule, COUNT(*) AS n, COALESCE(SUM(montant), 0) AS montant FROM paiements WHERE statut = 'payé' AND paye_le >= ? GROUP BY formule"),
    enAttente: base.prepare("SELECT COUNT(*) AS n FROM paiements WHERE statut = 'en_attente'"),
    placesVie: base.prepare("SELECT COUNT(DISTINCT electricien_id) AS n FROM abonnements WHERE formule = 'vie'"),
    devisMois: base.prepare("SELECT COUNT(*) AS n FROM devis WHERE mois = ?"),
    devisHorsLimite: base.prepare("SELECT COUNT(*) AS n FROM devis WHERE mois = ? AND hors_ligne = 1"),
    falsifications: base.prepare("SELECT COUNT(*) AS n FROM activites WHERE action = 'abonnement_falsifie' AND date > ?"),
    liste: base.prepare(`SELECT e.id, e.nom, e.telephone, e.ville, e.pays, e.formule, e.abonne_jusqu, e.suspendu, e.cree_le, e.derniere_activite,
        (SELECT COUNT(*) FROM devis d WHERE d.electricien_id = e.id AND d.mois = ?) AS devis_mois,
        (SELECT COUNT(*) FROM appareils a WHERE a.electricien_id = e.id AND a.revoque_le IS NULL) AS appareils
      FROM electriciens e
      WHERE e.supprime_le IS NULL AND (? = '' OR e.nom LIKE ? ESCAPE '\\' OR e.telephone LIKE ? ESCAPE '\\' OR e.ville LIKE ? ESCAPE '\\')
      ORDER BY e.id DESC LIMIT ? OFFSET ?`),
    journal: base.prepare("SELECT id, date, electricien_id, ip, action, details FROM activites ORDER BY id DESC LIMIT ? OFFSET ?"),
    insererCode: base.prepare("INSERT INTO codes_activation (empreinte, formule, cree_le, expire_le, motif) VALUES (?, ?, ?, ?, ?)"),
    suspendre: base.prepare("UPDATE electriciens SET suspendu = ?, motif_suspension = ?, version_session = version_session + ? WHERE id = ?"),
    majAbonnement: base.prepare("UPDATE electriciens SET formule = ?, abonne_depuis = ?, abonne_jusqu = ? WHERE id = ?"),
    abonner: base.prepare("INSERT INTO abonnements (electricien_id, formule, debut, fin, source, paiement_id, cree_le) VALUES (?, ?, ?, ?, ?, NULL, ?)"),
    paiement: base.prepare("SELECT reference, statut FROM paiements WHERE reference = ?")
  };

  /* ---------- Connexion ---------- */

  function adresseAutorisee(ip) {
    return !config.adminIps.length || config.adminIps.includes(ip);
  }

  function cleBlocage(ip) {
    return "admin:" + createHash("sha256").update(String(ip)).digest("hex");
  }

  async function connexion({ code, appareil }, ip) {
    if (!adresseAutorisee(ip)) {
      journaliser(base, "admin_refuse", { ip, details: { motif: "adresse" } });
      throw new ErreurApi(404, "introuvable");
    }
    const cle = cleBlocage(ip);
    const avant = req.blocage.get(cle) || { echecs: 0, jusqu: 0 };
    if (avant.jusqu > horloge()) throw new ErreurApi(429, "trop_de_tentatives_connexion", { retryAfter: Math.ceil((avant.jusqu - horloge()) / 1000) });
    const ok = await verifierCode(code, config.adminCode.hash, config.adminCode.sel);
    const maintenant = horloge();
    if (!ok) {
      const echecs = avant.echecs + 1;
      const jusqu = echecs >= ADMIN.echecsMax ? maintenant + ADMIN.blocageMs : 0;
      req.ecrireBlocage.run(cle, jusqu ? 0 : echecs, jusqu, iso(maintenant));
      journaliser(base, jusqu ? "admin_bloque" : "admin_echec", { ip, details: { echecs } });
      if (jusqu) throw new ErreurApi(429, "trop_de_tentatives_connexion", { retryAfter: Math.ceil(ADMIN.blocageMs / 1000) });
      throw new ErreurApi(401, "code_incorrect");
    }
    req.effacerBlocage.run(cle);
    journaliser(base, "admin_connexion", { ip });
    return { jeton: creerJetonAdmin(config.jetonSecret, appareil, maintenant), expireDans: 7200 };
  }

  function authentifier(jeton, appareil, ip) {
    if (!adresseAutorisee(ip)) throw new ErreurApi(404, "introuvable");
    if (!lireJetonAdmin(config.jetonSecret, jeton, appareil, horloge())) throw new ErreurApi(401, "non_authentifie");
    return true;
  }

  /* ---------- Tableau de bord ---------- */

  function stats() {
    const maintenant = horloge();
    const mois = iso(maintenant).slice(0, 7);
    const parFormule = Object.fromEntries(["gratuit", ...Object.keys(FORMULES)].map((f) => [f, 0]));
    for (const ligne of req.parFormule.all(iso(maintenant))) parFormule[ligne.formule] = (parFormule[ligne.formule] || 0) + ligne.n;
    const revenus = req.revenus.all(mois + "-01T00:00:00.000Z");
    return {
      anomalies: paiements.alertes(),
      alertes: { paiementsEnAttente: req.enAttente.get().n, falsifications30j: req.falsifications.get(iso(maintenant - 30 * JOUR_MS)).n, devisHorsLimiteMois: req.devisHorsLimite.get(mois).n },
      electriciens: {
        total: req.total.get().n, actifs7j: req.actifsDepuis.get(iso(maintenant - 7 * JOUR_MS)).n,
        nouveaux30j: req.nouveauxDepuis.get(iso(maintenant - 30 * JOUR_MS)).n, suspendus: req.suspendus.get().n
      },
      formules: parFormule,
      pays: req.parPays.all().map((l) => ({ pays: l.pays, n: l.n })),
      revenusMois: { mois, total: revenus.reduce((s, l) => s + l.montant, 0), paiements: revenus.reduce((s, l) => s + l.n, 0), parFormule: Object.fromEntries(revenus.map((l) => [l.formule, l.montant])) },
      devisMois: req.devisMois.get(mois).n,
      placesVie: { prises: req.placesVie.get().n, total: PLACES_VIE }
    };
  }

  function motifRecherche(texte) {
    return "%" + String(texte).replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  }

  function electriciens({ recherche = "", page = 0 }) {
    const mois = iso(horloge()).slice(0, 7);
    const q = String(recherche).slice(0, 60);
    const motif = motifRecherche(q);
    const lignes = req.liste.all(mois, q, motif, motif, motif, ADMIN.pageMax, page * ADMIN.pageMax);
    return {
      electriciens: lignes.map((l) => ({
        id: l.id, nom: l.nom, telephone: l.telephone, ville: l.ville, pays: l.pays, formule: l.formule,
        abonneJusqu: l.formule === "vie" ? null : l.abonne_jusqu, suspendu: Boolean(l.suspendu), creeLe: l.cree_le,
        derniereActivite: l.derniere_activite, devisMois: l.devis_mois, appareils: l.appareils
      })),
      page, parPage: ADMIN.pageMax
    };
  }

  /* Export CSV : une cellule commençant par = + - @ est préfixée d'une apostrophe
     (pas de formule exécutée à l'ouverture dans un tableur). */
  function celluleCsv(valeur) {
    let texte = valeur === null || valeur === undefined ? "" : String(valeur);
    if (/^[=+\-@\t\r]/.test(texte)) texte = "'" + texte;
    return "\"" + texte.replace(/"/g, "\"\"") + "\"";
  }

  function electriciensCsv() {
    const lignes = [];
    for (let page = 0; page < 200; page += 1) {
      const lot = electriciens({ page }).electriciens;
      lignes.push(...lot);
      if (lot.length < ADMIN.pageMax) break;
    }
    const entete = ["id", "nom", "telephone", "ville", "pays", "formule", "abonne_jusqu", "suspendu", "cree_le", "derniere_activite", "devis_mois", "appareils"];
    const corps = lignes.map((l) => [l.id, l.nom, l.telephone, l.ville, l.pays, l.formule, l.abonneJusqu, l.suspendu ? "oui" : "non", l.creeLe, l.derniereActivite, l.devisMois, l.appareils].map(celluleCsv).join(";"));
    return "\uFEFF" + [entete.map(celluleCsv).join(";"), ...corps].join("\r\n") + "\r\n";
  }

  function journal({ page = 0 }) {
    return {
      activites: req.journal.all(ADMIN.journalMax, page * ADMIN.journalMax).map((l) => ({
        id: l.id, date: l.date, electricienId: l.electricien_id, ip: l.ip, action: l.action, details: l.details ? JSON.parse(l.details) : null
      })),
      page
    };
  }

  /* ---------- Actions sensibles ---------- */

  function exigerCompte(id, confirmation) {
    const e = req.electricien.get(id);
    if (!e) throw new ErreurApi(404, "introuvable");
    if (confirmation !== e.telephone) throw new ErreurApi(400, "confirmation_requise");
    return e;
  }

  /* Codes montrés UNE fois ; la base ne garde qu'une empreinte HMAC. */
  function genererCodes({ formule, nombre, validiteJours, motif }, ip) {
    const maintenant = horloge();
    const codes = [];
    enTransaction(base, () => {
      for (let i = 0; i < nombre; i += 1) {
        const code = nouveauCodeActivation();
        req.insererCode.run(empreinteCodeActivation(config.jetonSecret, code), formule, iso(maintenant), iso(maintenant + validiteJours * JOUR_MS), motif.trim());
        codes.push(code);
      }
      journaliser(base, "admin_codes", { ip, details: { formule, nombre, validiteJours, motif: motif.trim() } });
    });
    return { codes, formule, expireLe: iso(maintenant + validiteJours * JOUR_MS) };
  }

  function suspendre({ electricienId, suspendu, motif, confirmation }, ip) {
    const e = exigerCompte(electricienId, confirmation);
    req.suspendre.run(suspendu ? 1 : 0, suspendu ? motif.trim() : null, suspendu ? 1 : 0, e.id);
    journaliser(base, suspendu ? "suspension" : "reactivation", { electricienId: e.id, ip, details: { motif: motif.trim() } });
    return { suspendu };
  }

  /* jours > 0 : offerts ; jours < 0 : retirés (réversion d'une offre), toujours journalisé. */
  function offrirJours({ electricienId, jours, motif, confirmation }, ip) {
    if (jours === 0) throw new ErreurApi(400, "requete_invalide");
    const e = exigerCompte(electricienId, confirmation);
    if (e.formule === "vie") throw new ErreurApi(409, "deja_a_vie");
    const maintenant = horloge();
    const actif = e.formule !== "gratuit" && e.abonne_jusqu && Date.parse(e.abonne_jusqu) > maintenant;
    if (jours < 0 && !actif) throw new ErreurApi(409, "rien_a_retirer");
    const depart = actif ? Date.parse(e.abonne_jusqu) : maintenant;
    const fin = depart + jours * JOUR_MS;
    const formule = fin <= maintenant ? "gratuit" : (actif ? e.formule : "mensuel");
    const debut = formule === "gratuit" ? null : (actif ? e.abonne_depuis : iso(maintenant));
    enTransaction(base, () => {
      req.majAbonnement.run(formule, debut, formule === "gratuit" ? null : iso(fin), e.id);
      req.abonner.run(e.id, formule, debut || iso(maintenant), iso(Math.max(fin, maintenant)), jours > 0 ? "offert" : "retrait", iso(maintenant));
      journaliser(base, jours > 0 ? "jours_offerts" : "jours_retires", { electricienId: e.id, ip, details: { jours, motif: motif.trim(), fin: iso(fin) } });
    });
    return { formule, fin: formule === "gratuit" ? null : iso(fin) };
  }

  async function reverifier(reference, ip) {
    if (!req.paiement.get(reference)) throw new ErreurApi(404, "introuvable");
    const statut = await paiements.confirmer(reference);
    journaliser(base, "admin_reverification", { ip, details: { reference, statut } });
    return { reference, statut: Object.values(STATUTS).includes(statut) ? statut : req.paiement.get(reference).statut };
  }

  async function rembourser(reference, { motif, confirmation }, ip) {
    return paiements.rembourser(reference, { adminId: "admin", motif, confirmation, ip });
  }

  /* Sauvegarde : uniquement les colonnes de la liste blanche EXPORT. */
  function sauvegarde(ip) {
    const tables = {};
    for (const [nom, requete] of Object.entries(SAUVEGARDE)) {
      tables[nom] = requete.all().map((ligne) => Object.fromEntries(EXPORT[nom].map((colonne) => [colonne, ligne[colonne]])));
    }
    journaliser(base, "admin_sauvegarde", { ip, details: { tables: Object.keys(tables).length } });
    return { format: "batiplus-sauvegarde-admin", version: 1, exporteLe: iso(horloge()), tables };
  }

  return Object.freeze({ connexion, authentifier, stats, electriciens, electriciensCsv, journal, genererCodes, suspendre, offrirJours, reverifier, rembourser, sauvegarde });
}
