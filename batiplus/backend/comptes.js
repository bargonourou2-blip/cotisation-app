/* ==========================================================================
   BâtiPlus — backend : comptes, appareils, profil, données métier et synchronisation (étape 14)
   Règles :
   - code secret haché en scrypt (codes.js) ; erreur toujours générique « Numéro ou code incorrect » ;
   - blocage progressif EN BASE après 5 échecs (30 s → 1 min → 5 min → 15 min), par numéro,
     que le compte existe ou non : effacer les données du téléphone n'efface pas le blocage ;
   - 2 appareils actifs par compte : le 3e déconnecte le plus ancien ;
   - chaque accès vérifie jeton → compte non suspendu → appartenance (sinon 404) ;
   - le compteur de devis du mois est tenu ICI, vérifié et incrémenté dans la MÊME transaction ;
     un devis écrit hors ligne est accepté à la synchronisation (jamais de travail détruit,
     tolérance bornée), mais toute nouvelle création est alors bloquée ;
   - plafonds en base : 200 clients (gratuit) / 5 000 (Pro), 300 articles / 3 000 ;
   - la synchronisation vérifie la signature du jeton d'abonnement renvoyé par l'application :
     falsifié → refus, journal, et l'état de la base est renvoyé (H.4 n°1) ;
   - dernière écriture gagnante, à l'heure de l'opération (bornée à +5 min de l'heure de l'API) ;
   - aucun hachage, sel ni jeton d'un autre usage ne sort d'ici.
   ========================================================================== */
import { createHash } from "node:crypto";
import { enTransaction, journaliser } from "./base.js";
import { codeTrivial, empreinteCodeActivation, hacherCode, verifierCode } from "./codes.js";
import { PLACES_VIE, formulePayante } from "./formules.js";
import { RENOUVELLEMENT_APRES_MS, creerJetonSession, egalTempsConstant, empreinteAppareil, lireJetonSession, verifierJetonAbonnement } from "./jetons.js";
import { ErreurSchema, REGLES, SCHEMA_CHANTIER, SCHEMA_CLIENT, SCHEMA_PROFIL_SYNC, validerCatalogue, validerDevis } from "./schemas.js";

export class ErreurApi extends Error {
  constructor(statutHttp, code, extra = {}) {
    super(code);
    this.statutHttp = statutHttp;
    this.code = code;
    this.extra = extra;
  }
}

export const LIMITES_COMPTE = Object.freeze({
  appareilsMax: 2,
  clients: Object.freeze({ gratuit: 200, pro: 5000 }),
  articles: Object.freeze({ gratuit: 300, pro: 3000 }),
  chantiersMax: 5000,
  devisMax: 20000,
  toleranceHorsLigne: 5,
  lotChangements: 100,
  avanceHorlogeMs: 5 * 60000,
  vuToutesLesMs: 3600000,
  historiqueMs: 24 * 3600000
});

export function creerServiceComptes({ base, config, paiements, horloge = () => Date.now() }) {
  const iso = (instant) => new Date(instant).toISOString();
  const moisDe = (instant) => iso(instant).slice(0, 7);
  const BLOCAGE = REGLES.blocage;

  const req = {
    electricien: base.prepare("SELECT * FROM electriciens WHERE id = ?"),
    parTelephone: base.prepare("SELECT * FROM electriciens WHERE telephone = ? AND supprime_le IS NULL"),
    existe: base.prepare("SELECT id FROM electriciens WHERE telephone = ? OR compte_id = ?"),
    autreTelephone: base.prepare("SELECT id FROM electriciens WHERE telephone = ? AND id <> ?"),
    inserer: base.prepare(`INSERT INTO electriciens (compte_id, nom, telephone, entreprise, ville, pays, devise, code_hash, code_sel, cree_le, profil_modifie_le, derniere_activite)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    activite: base.prepare("UPDATE electriciens SET derniere_activite = ? WHERE id = ?"),
    seq: base.prepare("UPDATE electriciens SET seq = seq + 1 WHERE id = ? RETURNING seq"),
    nouveauCode: base.prepare("UPDATE electriciens SET code_hash = ?, code_sel = ?, version_session = version_session + 1 WHERE id = ?"),
    versionPlus: base.prepare("UPDATE electriciens SET version_session = version_session + 1 WHERE id = ?"),
    profil: base.prepare(`UPDATE electriciens SET nom = ?, entreprise = ?, ville = ?, pays = ?, devise = ?, conditions = ?, photo = ?, logo = ?,
      profil_version = ?, profil_modifie_le = ? WHERE id = ?`),
    telephone: base.prepare("UPDATE electriciens SET telephone = ? WHERE id = ?"),
    blocage: base.prepare("SELECT echecs, jusqu FROM blocages WHERE cle = ?"),
    ecrireBlocage: base.prepare(`INSERT INTO blocages (cle, echecs, jusqu, maj_le) VALUES (?, ?, ?, ?)
      ON CONFLICT (cle) DO UPDATE SET echecs = excluded.echecs, jusqu = excluded.jusqu, maj_le = excluded.maj_le`),
    effacerBlocage: base.prepare("DELETE FROM blocages WHERE cle = ?"),
    appareil: base.prepare("SELECT * FROM appareils WHERE id = ? AND electricien_id = ?"),
    appareilParEmpreinte: base.prepare("SELECT id FROM appareils WHERE electricien_id = ? AND empreinte = ?"),
    reactiverAppareil: base.prepare("UPDATE appareils SET revoque_le = NULL, vu_le = ?, nom = ? WHERE id = ?"),
    insererAppareil: base.prepare("INSERT INTO appareils (electricien_id, empreinte, nom, cree_le, vu_le) VALUES (?, ?, ?, ?, ?)"),
    appareilsActifs: base.prepare("SELECT id FROM appareils WHERE electricien_id = ? AND revoque_le IS NULL ORDER BY vu_le DESC, id DESC"),
    revoquerAppareil: base.prepare("UPDATE appareils SET revoque_le = ? WHERE id = ? AND revoque_le IS NULL"),
    revoquerTous: base.prepare("UPDATE appareils SET revoque_le = ? WHERE electricien_id = ? AND revoque_le IS NULL"),
    voirAppareil: base.prepare("UPDATE appareils SET vu_le = ? WHERE id = ?"),
    listeAppareils: base.prepare("SELECT id, nom, cree_le, vu_le FROM appareils WHERE electricien_id = ? AND revoque_le IS NULL ORDER BY vu_le DESC"),
    devisDuMois: base.prepare("SELECT COUNT(*) AS n FROM devis WHERE electricien_id = ? AND mois = ?"),
    horsLigneDuMois: base.prepare("SELECT COUNT(*) AS n FROM devis WHERE electricien_id = ? AND mois = ? AND hors_ligne = 1"),
    devisTous: base.prepare("SELECT COUNT(*) AS n FROM devis WHERE electricien_id = ?"),
    devis: base.prepare("SELECT * FROM devis WHERE electricien_id = ? AND uid = ?"),
    devisListe: base.prepare("SELECT donnees FROM devis WHERE electricien_id = ? AND supprime = 0 ORDER BY modifie_le DESC LIMIT 1000"),
    insererDevis: base.prepare(`INSERT INTO devis (electricien_id, uid, numero, statut, client, total, donnees, cree_le, mois, modifie_le, version, hors_ligne, appareil_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    majDevis: base.prepare(`UPDATE devis SET numero = ?, statut = ?, client = ?, total = ?, donnees = ?, modifie_le = ?, version = ?, supprime = 0, appareil_id = ?
      WHERE id = ?`),
    supprimerDevis: base.prepare("UPDATE devis SET supprime = 1, donnees = NULL, modifie_le = ?, version = ?, appareil_id = ? WHERE id = ?"),
    chantier: base.prepare("SELECT * FROM chantiers WHERE electricien_id = ? AND uid = ?"),
    chantiersTous: base.prepare("SELECT COUNT(*) AS n FROM chantiers WHERE electricien_id = ? AND supprime = 0"),
    chantiersListe: base.prepare("SELECT donnees FROM chantiers WHERE electricien_id = ? AND supprime = 0 ORDER BY modifie_le DESC LIMIT 1000"),
    insererChantier: base.prepare("INSERT INTO chantiers (electricien_id, uid, nom, statut, donnees, cree_le, modifie_le, version, appareil_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
    majChantier: base.prepare("UPDATE chantiers SET nom = ?, statut = ?, donnees = ?, modifie_le = ?, version = ?, supprime = 0, appareil_id = ? WHERE id = ?"),
    supprimerChantier: base.prepare("UPDATE chantiers SET supprime = 1, donnees = NULL, modifie_le = ?, version = ?, appareil_id = ? WHERE id = ?"),
    client: base.prepare("SELECT * FROM clients WHERE electricien_id = ? AND uid = ?"),
    clientsTous: base.prepare("SELECT COUNT(*) AS n FROM clients WHERE electricien_id = ? AND supprime = 0"),
    clientsListe: base.prepare("SELECT donnees FROM clients WHERE electricien_id = ? AND supprime = 0 ORDER BY nom LIMIT 5000"),
    insererClient: base.prepare("INSERT INTO clients (electricien_id, uid, nom, telephone, donnees, cree_le, modifie_le, version, appareil_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"),
    majClient: base.prepare("UPDATE clients SET nom = ?, telephone = ?, donnees = ?, modifie_le = ?, version = ?, supprime = 0, appareil_id = ? WHERE id = ?"),
    supprimerClient: base.prepare("UPDATE clients SET supprime = 1, donnees = NULL, modifie_le = ?, version = ?, appareil_id = ? WHERE id = ?"),
    changementsDevis: base.prepare(`SELECT uid, donnees, supprime, version FROM devis WHERE electricien_id = ? AND version > ? AND (appareil_id IS NULL OR appareil_id <> ?)
      ORDER BY version LIMIT ?`),
    changementsChantiers: base.prepare(`SELECT uid, donnees, supprime, version FROM chantiers WHERE electricien_id = ? AND version > ? AND (appareil_id IS NULL OR appareil_id <> ?)
      ORDER BY version LIMIT ?`),
    changementsClients: base.prepare(`SELECT uid, donnees, supprime, version FROM clients WHERE electricien_id = ? AND version > ? AND (appareil_id IS NULL OR appareil_id <> ?)
      ORDER BY version LIMIT ?`),
    articles: base.prepare("SELECT id, ref, designation, unite, categorie, choisi FROM catalogue WHERE electricien_id = ? ORDER BY rang"),
    fournisseursDe: base.prepare("SELECT nom, prix FROM fournisseurs WHERE article_id = ? ORDER BY rang"),
    viderCatalogue: base.prepare("DELETE FROM catalogue WHERE electricien_id = ?"),
    insererArticle: base.prepare("INSERT INTO catalogue (electricien_id, ref, rang, designation, unite, categorie, choisi) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    insererFournisseur: base.prepare("INSERT INTO fournisseurs (article_id, rang, nom, prix) VALUES (?, ?, ?, ?)"),
    majCatalogue: base.prepare("UPDATE electriciens SET main_oeuvre = ?, catalogue_perso = ?, catalogue_version = ?, catalogue_modifie_le = ? WHERE id = ?"),
    code: base.prepare("SELECT * FROM codes_activation WHERE empreinte = ?"),
    utiliserCode: base.prepare("UPDATE codes_activation SET utilise_par = ?, utilise_le = ? WHERE id = ? AND utilise_par IS NULL AND utilise_le IS NULL AND revoque_le IS NULL"),
    placesVie: base.prepare("SELECT COUNT(DISTINCT electricien_id) AS n FROM abonnements WHERE formule = 'vie'"),
    majAbonnement: base.prepare("UPDATE electriciens SET formule = ?, abonne_depuis = ?, abonne_jusqu = ? WHERE id = ?"),
    abonner: base.prepare("INSERT INTO abonnements (electricien_id, formule, debut, fin, source, paiement_id, cree_le) VALUES (?, ?, ?, ?, ?, NULL, ?)"),
    effacerDevis: base.prepare("DELETE FROM devis WHERE electricien_id = ?"),
    effacerChantiers: base.prepare("DELETE FROM chantiers WHERE electricien_id = ?"),
    effacerClients: base.prepare("DELETE FROM clients WHERE electricien_id = ?"),
    effacerAppareils: base.prepare("DELETE FROM appareils WHERE electricien_id = ?"),
    anonymiser: base.prepare(`UPDATE electriciens SET compte_id = ?, telephone = ?, nom = 'Compte supprimé', email = NULL, entreprise = '', ville = '', conditions = '',
      photo = '', logo = '', code_hash = NULL, code_sel = NULL, main_oeuvre = NULL, catalogue_perso = 0, carte_client = NULL, carte_moyen = NULL,
      renouvellement_auto = 0, version_session = version_session + 1, supprime_le = ? WHERE id = ?`)
  };

  /* ---------- Abonnement et quotas ---------- */

  function estPro(e, maintenant) {
    if (e.formule === "vie") return true;
    return Boolean(formulePayante(e.formule) && e.abonne_jusqu && Date.parse(e.abonne_jusqu) > maintenant);
  }

  function quota(e, maintenant) {
    const pro = estPro(e, maintenant);
    const mois = moisDe(maintenant);
    return { formule: pro ? e.formule : "gratuit", mois, utilises: req.devisDuMois.get(e.id, mois).n, limite: pro ? null : REGLES.limiteGratuite };
  }

  function etatAbonnement(e, maintenant) {
    const frais = req.electricien.get(e.id);
    return { abonnement: paiements.jetonPour(frais, maintenant), quota: quota(frais, maintenant) };
  }

  /* ---------- Profil public : liste blanche (jamais code_hash, code_sel, carte, version) ---------- */

  function profilPublic(e) {
    return {
      compteId: e.compte_id, telephone: e.telephone, nom: e.nom, entreprise: e.entreprise, ville: e.ville, pays: e.pays, devise: e.devise,
      conditions: e.conditions, photo: e.photo, logo: e.logo, modifieLe: e.profil_modifie_le || e.cree_le,
      formule: e.formule, abonneJusqu: e.formule === "vie" ? null : e.abonne_jusqu
    };
  }

  /* ---------- Blocage progressif en base (par numéro, compte existant ou non) ---------- */

  function cleBlocage(telephone) {
    return "connexion:" + createHash("sha256").update(telephone).digest("hex");
  }

  function lireBlocage(cle) {
    return req.blocage.get(cle) || { echecs: 0, jusqu: 0 };
  }

  function noterEchec(cle, maintenant) {
    const actuel = lireBlocage(cle);
    const echecs = actuel.echecs + 1;
    let jusqu = 0;
    if (echecs >= BLOCAGE.essaisLibres) jusqu = maintenant + BLOCAGE.durees[Math.min(echecs - BLOCAGE.essaisLibres, BLOCAGE.durees.length - 1)];
    req.ecrireBlocage.run(cle, echecs, jusqu, iso(maintenant));
    return { echecs, jusqu };
  }

  function refuserSiBloque(cle, maintenant) {
    const actuel = lireBlocage(cle);
    if (actuel.jusqu > maintenant) throw new ErreurApi(429, "trop_de_tentatives_connexion", { retryAfter: Math.ceil((actuel.jusqu - maintenant) / 1000) });
  }

  function erreurIdentifiants(blocage, maintenant) {
    const extra = blocage.jusqu > maintenant ? { reessayerDans: Math.ceil((blocage.jusqu - maintenant) / 1000) } : {};
    return new ErreurApi(401, "identifiants_incorrects", extra);
  }

  /* ---------- Appareils (2 au plus ; le 3e déconnecte le plus ancien) ---------- */

  function enregistrerAppareil(e, identifiant, nom, maintenant, ip) {
    const empreinte = empreinteAppareil(identifiant);
    const existant = req.appareilParEmpreinte.get(e.id, empreinte);
    let id;
    if (existant) {
      req.reactiverAppareil.run(iso(maintenant), nom || "", existant.id);
      id = existant.id;
    } else {
      id = Number(req.insererAppareil.run(e.id, empreinte, nom || "", iso(maintenant), iso(maintenant)).lastInsertRowid);
    }
    const actifs = req.appareilsActifs.all(e.id).filter((a) => a.id !== id);
    for (const ancien of actifs.slice(LIMITES_COMPTE.appareilsMax - 1)) {
      req.revoquerAppareil.run(iso(maintenant), ancien.id);
      journaliser(base, "appareil_deconnecte", { electricienId: e.id, ip, details: { appareil: ancien.id, motif: "troisieme_appareil" } });
    }
    return id;
  }

  function ouvrirSession(e, appareilId, maintenant) {
    return creerJetonSession(config.jetonSecret, req.electricien.get(e.id), appareilId, maintenant);
  }

  /* ---------- Authentification d'une requête (ordre C.5) ---------- */

  function authentifier(jeton, identifiantAppareil) {
    const maintenant = horloge();
    const lu = lireJetonSession(config.jetonSecret, jeton, maintenant);
    if (!lu) throw new ErreurApi(401, "non_authentifie");
    const e = req.electricien.get(lu.sub);
    if (!e || e.supprime_le || e.version_session !== lu.ver) throw new ErreurApi(401, "non_authentifie");
    const appareil = req.appareil.get(lu.app, e.id);
    if (!appareil || typeof identifiantAppareil !== "string" || !egalTempsConstant(appareil.empreinte, empreinteAppareil(identifiantAppareil))) throw new ErreurApi(401, "non_authentifie");
    if (appareil.revoque_le) throw new ErreurApi(401, "appareil_deconnecte");
    if (e.suspendu) throw new ErreurApi(403, "compte_suspendu");
    if (maintenant - Date.parse(appareil.vu_le) > LIMITES_COMPTE.vuToutesLesMs) {
      req.voirAppareil.run(iso(maintenant), appareil.id);
      req.activite.run(iso(maintenant), e.id);
    }
    return { electricien: e, appareil, lu };
  }

  /* Renouvellement glissant : un jeton de plus d'un jour est remplacé (compte actif). */
  function jetonRenouvele(ctx) {
    const maintenant = horloge();
    return maintenant - ctx.lu.iat >= RENOUVELLEMENT_APRES_MS ? ouvrirSession(ctx.electricien, ctx.appareil.id, maintenant) : null;
  }

  /* ---------- Création de compte et connexion ---------- */

  async function creer(donnees, ip) {
    if (codeTrivial(donnees.code)) throw new ErreurApi(400, "code_trop_simple");
    const { hash, sel } = await hacherCode(donnees.code);
    const maintenant = horloge();
    return enTransaction(base, () => {
      if (req.existe.get(donnees.telephone, donnees.compteId)) {
        journaliser(base, "creation_refusee", { ip, details: { motif: "numero_ou_compte_existant" } });
        throw new ErreurApi(409, "creation_impossible");
      }
      const id = Number(req.inserer.run(donnees.compteId, donnees.nom, donnees.telephone, donnees.entreprise, donnees.ville, donnees.pays, donnees.devise,
        hash, sel, iso(maintenant), iso(maintenant), iso(maintenant)).lastInsertRowid);
      const e = req.electricien.get(id);
      const appareilId = enregistrerAppareil(e, donnees.appareil, donnees.nomAppareil, maintenant, ip);
      journaliser(base, "compte_cree", { electricienId: id, ip, details: { pays: donnees.pays } });
      return { jeton: ouvrirSession(e, appareilId, maintenant), compte: profilPublic(e), ...etatAbonnement(e, maintenant) };
    });
  }

  async function connexion(donnees, ip) {
    const cle = cleBlocage(donnees.telephone);
    refuserSiBloque(cle, horloge());
    const e = req.parTelephone.get(donnees.telephone);
    const ok = await verifierCode(donnees.code, e ? e.code_hash : null, e ? e.code_sel : null);
    const maintenant = horloge();
    if (!ok) {
      const blocage = noterEchec(cle, maintenant);
      journaliser(base, "connexion_echec", { electricienId: e ? e.id : null, ip, details: { echecs: blocage.echecs } });
      throw erreurIdentifiants(blocage, maintenant);
    }
    req.effacerBlocage.run(cle);
    if (e.suspendu) {
      journaliser(base, "connexion_refusee", { electricienId: e.id, ip, details: { motif: "suspendu" } });
      throw new ErreurApi(403, "compte_suspendu");
    }
    return enTransaction(base, () => {
      const appareilId = enregistrerAppareil(e, donnees.appareil, donnees.nomAppareil, maintenant, ip);
      req.activite.run(iso(maintenant), e.id);
      journaliser(base, "connexion", { electricienId: e.id, ip, details: { appareil: appareilId } });
      return { jeton: ouvrirSession(e, appareilId, maintenant), compte: profilPublic(req.electricien.get(e.id)), ...etatAbonnement(e, maintenant) };
    });
  }

  /* Vérifie le code d'un compte déjà authentifié (changement de code, suppression). */
  async function exigerCode(e, code, ip, action) {
    const cle = cleBlocage(e.telephone);
    refuserSiBloque(cle, horloge());
    if (!await verifierCode(code, e.code_hash, e.code_sel)) {
      const maintenant = horloge();
      const blocage = noterEchec(cle, maintenant);
      journaliser(base, action + "_echec", { electricienId: e.id, ip, details: { echecs: blocage.echecs } });
      throw erreurIdentifiants(blocage, maintenant);
    }
    req.effacerBlocage.run(cle);
  }

  async function changerCode(ctx, { ancien, nouveau }, ip) {
    const e = ctx.electricien;
    await exigerCode(e, ancien, ip, "changement_code");
    if (codeTrivial(nouveau) || nouveau === ancien) throw new ErreurApi(400, "code_trop_simple");
    const { hash, sel } = await hacherCode(nouveau);
    const maintenant = horloge();
    return enTransaction(base, () => {
      req.nouveauCode.run(hash, sel, e.id);
      journaliser(base, "changement_code", { electricienId: e.id, ip });
      return { jeton: ouvrirSession(e, ctx.appareil.id, maintenant) };
    });
  }

  function deconnexion(ctx, ip) {
    req.revoquerAppareil.run(iso(horloge()), ctx.appareil.id);
    journaliser(base, "deconnexion", { electricienId: ctx.electricien.id, ip, details: { appareil: ctx.appareil.id } });
    return { deconnecte: true };
  }

  /* « Déconnecter tous mes appareils » : version de session + 1 → tous les jetons tombent. */
  function deconnecterTout(ctx, ip) {
    enTransaction(base, () => {
      req.versionPlus.run(ctx.electricien.id);
      req.revoquerTous.run(iso(horloge()), ctx.electricien.id);
      journaliser(base, "deconnexion_partout", { electricienId: ctx.electricien.id, ip });
    });
    return { deconnecte: true };
  }

  /* Suppression du compte : données effacées réellement ; la ligne est anonymisée pour garder
     les justificatifs de paiement (10 ans, obligation comptable), sans nom ni numéro. */
  async function supprimerCompte(ctx, { code }, ip) {
    const e = ctx.electricien;
    await exigerCode(e, code, ip, "suppression_compte");
    enTransaction(base, () => {
      req.effacerDevis.run(e.id);
      req.effacerChantiers.run(e.id);
      req.effacerClients.run(e.id);
      req.viderCatalogue.run(e.id);
      req.effacerAppareils.run(e.id);
      req.anonymiser.run("supprime-" + e.id, "supprime-" + e.id, iso(horloge()), e.id);
      journaliser(base, "compte_supprime", { electricienId: e.id, ip });
    });
    return { supprime: true };
  }

  function appareils(ctx) {
    return { appareils: req.listeAppareils.all(ctx.electricien.id).map((a) => ({ nom: a.nom, depuis: a.cree_le, vuLe: a.vu_le, actuel: a.id === ctx.appareil.id })), maximum: LIMITES_COMPTE.appareilsMax };
  }

  /* ---------- Profil ---------- */

  function lireProfil(ctx) {
    const maintenant = horloge();
    return { compte: profilPublic(ctx.electricien), ...etatAbonnement(ctx.electricien, maintenant) };
  }

  function ecrireProfil(e, p, maintenant) {
    const seq = req.seq.get(e.id).seq;
    req.profil.run(p.nom, p.entreprise, p.ville, p.pays, p.devise, p.conditions, p.photo, p.logo, seq, iso(maintenant), e.id);
  }

  function modifierProfil(ctx, donnees, ip) {
    const e = ctx.electricien;
    const maintenant = horloge();
    return enTransaction(base, () => {
      if (donnees.telephone && donnees.telephone !== e.telephone) {
        if (req.autreTelephone.get(donnees.telephone, e.id)) throw new ErreurApi(409, "telephone_indisponible");
        req.telephone.run(donnees.telephone, e.id);
        journaliser(base, "changement_telephone", { electricienId: e.id, ip });
      }
      ecrireProfil(e, donnees, maintenant);
      journaliser(base, "profil_modifie", { electricienId: e.id, ip });
      const frais = req.electricien.get(e.id);
      return { compte: profilPublic(frais), ...etatAbonnement(frais, maintenant) };
    });
  }

  /* ---------- Écritures (communes à l'API REST et à la synchronisation) ---------- */

  function lireJson(texte) {
    return texte ? JSON.parse(texte) : null;
  }

  /* → { ok, erreur?, ignore?, horsLigne? }. hors ligne = vient de la file d'attente de l'application. */
  function ecrireDevis(e, appareilId, d, quand, maintenant, { horsLigne }, ip) {
    const existant = req.devis.get(e.id, d.id);
    const json = JSON.stringify(d);
    if (existant) {
      if (quand < existant.modifie_le) return { ok: true, ignore: true };
      req.majDevis.run(d.numero, d.statut, d.client, d.total, json, quand, req.seq.get(e.id).seq, appareilId, existant.id);
      return { ok: true };
    }
    if (req.devisTous.get(e.id).n >= LIMITES_COMPTE.devisMax) return { ok: false, erreur: "limite_atteinte" };
    /* Historique d'avant la liaison : un devis créé sur le téléphone AVANT la création du compte
       en ligne, envoyé pendant les 24 h qui suivent, est rangé dans SON mois sans refus (le travail
       existait déjà). Passé ce délai, ou daté après la création du compte, la règle du mois courant
       s'applique : antidater un devis ne contourne pas la limite. */
    const cree = Math.min(Date.parse(d.creeLe), maintenant);
    const creationCompte = Date.parse(e.cree_le);
    const historique = horsLigne && cree < creationCompte && maintenant - creationCompte < LIMITES_COMPTE.historiqueMs;
    const mois = historique ? moisDe(cree) : moisDe(maintenant);
    let horsLimite = 0;
    if (!historique && !estPro(e, maintenant) && req.devisDuMois.get(e.id, mois).n >= REGLES.limiteGratuite) {
      /* Créé en ligne : refus strict. Créé hors ligne : accepté (travail conservé), dans une tolérance bornée. */
      if (!horsLigne || req.horsLigneDuMois.get(e.id, mois).n >= LIMITES_COMPTE.toleranceHorsLigne) {
        journaliser(base, "devis_refuse_limite", { electricienId: e.id, ip, details: { horsLigne: Boolean(horsLigne) } });
        return { ok: false, erreur: "limite_atteinte" };
      }
      horsLimite = 1;
    }
    req.insererDevis.run(e.id, d.id, d.numero, d.statut, d.client, d.total, json, iso(maintenant), mois, quand, req.seq.get(e.id).seq, horsLimite, appareilId);
    journaliser(base, "devis_cree", { electricienId: e.id, ip, details: { numero: d.numero, horsLigne: Boolean(horsLigne), horsLimite: Boolean(horsLimite) } });
    return { ok: true, horsLimite: Boolean(horsLimite) };
  }

  function ecrireChantier(e, appareilId, c, quand) {
    const existant = req.chantier.get(e.id, c.id);
    const json = JSON.stringify(c);
    if (existant) {
      if (quand < existant.modifie_le) return { ok: true, ignore: true };
      req.majChantier.run(c.nom, c.statut, json, quand, req.seq.get(e.id).seq, appareilId, existant.id);
      return { ok: true };
    }
    if (req.chantiersTous.get(e.id).n >= LIMITES_COMPTE.chantiersMax) return { ok: false, erreur: "limite_chantiers" };
    req.insererChantier.run(e.id, c.id, c.nom, c.statut, json, c.creeLe, quand, req.seq.get(e.id).seq, appareilId);
    return { ok: true };
  }

  function ecrireClient(e, appareilId, c, quand, maintenant) {
    const existant = req.client.get(e.id, c.id);
    const json = JSON.stringify(c);
    if (existant) {
      if (quand < existant.modifie_le) return { ok: true, ignore: true };
      req.majClient.run(c.nom, c.telephone, json, quand, req.seq.get(e.id).seq, appareilId, existant.id);
      return { ok: true };
    }
    const plafond = estPro(e, maintenant) ? LIMITES_COMPTE.clients.pro : LIMITES_COMPTE.clients.gratuit;
    if (req.clientsTous.get(e.id).n >= plafond) return { ok: false, erreur: "limite_clients" };
    req.insererClient.run(e.id, c.id, c.nom, c.telephone, json, c.creeLe, quand, req.seq.get(e.id).seq, appareilId);
    return { ok: true };
  }

  function supprimer(e, appareilId, type, uid, quand) {
    const [lire, effacer] = { devis: [req.devis, req.supprimerDevis], chantier: [req.chantier, req.supprimerChantier], client: [req.client, req.supprimerClient] }[type];
    const existant = lire.get(e.id, uid);
    if (!existant) return { ok: true };
    if (quand < existant.modifie_le) return { ok: true, ignore: true };
    effacer.run(quand, req.seq.get(e.id).seq, appareilId, existant.id);
    return { ok: true };
  }

  /* Catalogue : tables catalogue (articles) + fournisseurs (un ou plusieurs prix par article). */
  function ecrireCatalogue(e, catalogue, quand, maintenant) {
    if (e.catalogue_modifie_le && quand < e.catalogue_modifie_le) return { ok: true, ignore: true };
    if (catalogue) {
      const plafond = estPro(e, maintenant) ? LIMITES_COMPTE.articles.pro : LIMITES_COMPTE.articles.gratuit;
      if (catalogue.articles.length > plafond) return { ok: false, erreur: "limite_catalogue" };
    }
    req.viderCatalogue.run(e.id);
    if (catalogue) {
      catalogue.articles.forEach((a, rang) => {
        const id = Number(req.insererArticle.run(e.id, a.ref, rang, a.designation, a.unite, a.categorie, a.choisi).lastInsertRowid);
        a.fournisseurs.forEach((f, i) => req.insererFournisseur.run(id, i, f.nom, f.prix));
      });
    }
    req.majCatalogue.run(catalogue ? JSON.stringify(catalogue.mainOeuvre) : null, catalogue ? 1 : 0, req.seq.get(e.id).seq, quand, e.id);
    return { ok: true };
  }

  function lireCatalogue(eid) {
    const e = req.electricien.get(eid);
    if (!e.catalogue_perso) return null;
    const articles = req.articles.all(eid).map((a) => ({
      ref: a.ref, designation: a.designation, unite: a.unite, categorie: a.categorie,
      fournisseurs: req.fournisseursDe.all(a.id).map((f) => ({ nom: f.nom, prix: f.prix })), choisi: a.choisi
    }));
    return { articles, mainOeuvre: lireJson(e.main_oeuvre) || { points: {}, journee: null } };
  }

  /* ---------- Routes REST : devis, chantiers, clients, catalogue ---------- */

  function exigerProprietaire(e, d) {
    if (d.compteId !== e.compte_id) throw new ErreurApi(404, "introuvable");
  }

  function listerDevis(ctx) {
    return { devis: req.devisListe.all(ctx.electricien.id).map((r) => lireJson(r.donnees)) };
  }

  function lireUnDevis(ctx, uid) {
    const r = req.devis.get(ctx.electricien.id, uid);
    if (!r || r.supprime) throw new ErreurApi(404, "introuvable");
    return { devis: lireJson(r.donnees) };
  }

  /* POST /api/devis : vérification de la limite ET création dans la même transaction (A.2). */
  function creerDevis(ctx, d, ip) {
    const e = ctx.electricien;
    exigerProprietaire(e, d);
    const maintenant = horloge();
    return enTransaction(base, () => {
      const frais = req.electricien.get(e.id);
      const resultat = ecrireDevis(frais, ctx.appareil.id, d, iso(maintenant), maintenant, { horsLigne: false }, ip);
      if (!resultat.ok) throw new ErreurApi(403, resultat.erreur, { quota: quota(frais, maintenant) });
      return { id: d.id, quota: quota(frais, maintenant) };
    });
  }

  function modifierDevis(ctx, uid, d, ip) {
    const e = ctx.electricien;
    exigerProprietaire(e, d);
    if (d.id !== uid) throw new ErreurApi(400, "requete_invalide");
    const maintenant = horloge();
    return enTransaction(base, () => {
      const existant = req.devis.get(e.id, uid);
      if (!existant || existant.supprime) throw new ErreurApi(404, "introuvable");
      ecrireDevis(e, ctx.appareil.id, d, iso(maintenant), maintenant, { horsLigne: false }, ip);
      journaliser(base, "devis_modifie", { electricienId: e.id, ip, details: { numero: d.numero } });
      return { id: uid };
    });
  }

  function effacerUnDevis(ctx, uid, ip) {
    const e = ctx.electricien;
    return enTransaction(base, () => {
      const existant = req.devis.get(e.id, uid);
      if (!existant || existant.supprime) throw new ErreurApi(404, "introuvable");
      supprimer(e, ctx.appareil.id, "devis", uid, iso(horloge()));
      journaliser(base, "devis_supprime", { electricienId: e.id, ip, details: { numero: existant.numero } });
      return { supprime: true };
    });
  }

  function listerChantiers(ctx) {
    return { chantiers: req.chantiersListe.all(ctx.electricien.id).map((r) => lireJson(r.donnees)) };
  }

  function listerClients(ctx) {
    return { clients: req.clientsListe.all(ctx.electricien.id).map((r) => lireJson(r.donnees)) };
  }

  function catalogueDe(ctx) {
    return { catalogue: lireCatalogue(ctx.electricien.id) };
  }

  function remplacerCatalogue(ctx, catalogue, ip) {
    const maintenant = horloge();
    return enTransaction(base, () => {
      const resultat = ecrireCatalogue(req.electricien.get(ctx.electricien.id), catalogue, iso(maintenant), maintenant);
      if (!resultat.ok) throw new ErreurApi(403, resultat.erreur);
      journaliser(base, "catalogue_modifie", { electricienId: ctx.electricien.id, ip, details: { articles: catalogue ? catalogue.articles.length : 0 } });
      return { ok: true };
    });
  }

  /* ---------- Code d'activation (offert par BRG Électro+) ---------- */

  function activerCode(ctx, { code }, ip) {
    const e = ctx.electricien;
    const maintenant = horloge();
    return enTransaction(base, () => {
      const ligne = req.code.get(empreinteCodeActivation(config.jetonSecret, code));
      const valide = ligne && !ligne.utilise_par && !ligne.utilise_le && !ligne.revoque_le && Date.parse(ligne.expire_le) > maintenant;
      if (!valide) {
        journaliser(base, "code_activation_refuse", { electricienId: e.id, ip });
        throw new ErreurApi(404, "code_invalide");
      }
      const frais = req.electricien.get(e.id);
      if (frais.formule === "vie") throw new ErreurApi(409, "deja_a_vie");
      if (ligne.formule === "vie" && req.placesVie.get().n >= PLACES_VIE) throw new ErreurApi(409, "places_vie_epuisees");
      if (req.utiliserCode.run(e.id, iso(maintenant), ligne.id).changes === 0) throw new ErreurApi(404, "code_invalide");
      const periode = paiements.nouvellePeriode(frais, ligne.formule, maintenant);
      req.majAbonnement.run(periode.formule, periode.debut, periode.fin, e.id);
      req.abonner.run(e.id, periode.formule, periode.debut, periode.fin, "code", iso(maintenant));
      journaliser(base, "abonnement_active", { electricienId: e.id, ip, details: { source: "code", formule: periode.formule, fin: periode.fin } });
      return { formule: periode.formule, fin: periode.fin, ...etatAbonnement(frais, maintenant) };
    });
  }

  /* ---------- Synchronisation ---------- */

  /* Jeton d'abonnement renvoyé par l'application : authentique et à ce compte, ou falsifié. */
  function abonnementFalsifie(e, jeton) {
    if (!jeton) return null;
    const charge = verifierJetonAbonnement(config.clePrivee, jeton);
    if (!charge) return "signature";
    if (charge.compteId !== e.compte_id) return "autre_compte";
    return null;
  }

  function appliquer(e, appareilId, op, maintenant, ip) {
    const quand = iso(Math.min(Date.parse(op.quand), maintenant + LIMITES_COMPTE.avanceHorlogeMs));
    const sortie = (r) => ({ type: op.type, id: op.id, ...r });
    try {
      if (op.type === "profil") {
        if (op.id !== "profil" || op.action !== "ecrire") return sortie({ ok: false, erreur: "requete_invalide" });
        const p = SCHEMA_PROFIL_SYNC(op.donnees, "donnees");
        const frais = req.electricien.get(e.id);
        if (frais.profil_modifie_le && quand < frais.profil_modifie_le) return sortie({ ok: true, ignore: true });
        ecrireProfil(frais, p, Date.parse(quand));
        return sortie({ ok: true });
      }
      if (op.type === "catalogue") {
        if (op.id !== "catalogue") return sortie({ ok: false, erreur: "requete_invalide" });
        const catalogue = op.action === "ecrire" ? validerCatalogue(op.donnees, "donnees") : null;
        return sortie(ecrireCatalogue(req.electricien.get(e.id), catalogue, quand, maintenant));
      }
      if (op.action === "supprimer") return sortie(supprimer(e, appareilId, op.type, op.id, quand));
      const valideur = { devis: validerDevis, chantier: SCHEMA_CHANTIER, client: SCHEMA_CLIENT }[op.type];
      const doc = valideur(op.donnees, "donnees");
      /* Appartenance : un document d'un autre compte n'est jamais écrit (et rien n'est révélé). */
      if (doc.id !== op.id || doc.compteId !== e.compte_id) return sortie({ ok: false, erreur: "introuvable" });
      if (op.type === "devis") return sortie(ecrireDevis(req.electricien.get(e.id), appareilId, doc, quand, maintenant, { horsLigne: true }, ip));
      if (op.type === "chantier") return sortie(ecrireChantier(e, appareilId, doc, quand));
      return sortie(ecrireClient(req.electricien.get(e.id), appareilId, doc, quand, maintenant));
    } catch (erreur) {
      if (erreur instanceof ErreurSchema) return sortie({ ok: false, erreur: "donnees_invalides", champ: erreur.chemin.slice(0, 80) });
      throw erreur;
    }
  }

  function lireChangements(e, curseur, appareilId) {
    const lot = LIMITES_COMPTE.lotChangements;
    const frais = req.electricien.get(e.id);
    const tables = { devis: req.changementsDevis, chantiers: req.changementsChantiers, clients: req.changementsClients };
    const changements = {};
    let encore = false;
    let prochain = frais.seq;
    for (const [nom, requete] of Object.entries(tables)) {
      const lignes = requete.all(e.id, curseur, appareilId, lot);
      changements[nom] = lignes.map((l) => (l.supprime ? { id: l.uid, supprime: true } : { id: l.uid, supprime: false, donnees: lireJson(l.donnees) }));
      if (lignes.length === lot) {
        encore = true;
        prochain = Math.min(prochain, lignes[lignes.length - 1].version);
      }
    }
    if (frais.profil_version > curseur) changements.profil = profilPublic(frais);
    if (frais.catalogue_version > curseur) changements.catalogue = { perso: Boolean(frais.catalogue_perso), catalogue: lireCatalogue(e.id) };
    return { changements, curseur: prochain, encore };
  }

  function synchroniser(ctx, corps, ip) {
    const e = ctx.electricien;
    const maintenant = horloge();
    const falsifie = abonnementFalsifie(e, corps.abonnement);
    if (falsifie) {
      journaliser(base, "abonnement_falsifie", { electricienId: e.id, ip, details: { motif: falsifie } });
      throw new ErreurApi(409, "abonnement_invalide", etatAbonnement(e, maintenant));
    }
    const resultats = enTransaction(base, () => corps.operations.map((op) => appliquer(e, ctx.appareil.id, op, maintenant, ip)));
    const lecture = lireChangements(e, corps.curseur, ctx.appareil.id);
    const jeton = jetonRenouvele(ctx);
    return { resultats, ...lecture, ...etatAbonnement(e, maintenant), ...(jeton ? { jeton } : {}), maintenant: iso(maintenant) };
  }

  return Object.freeze({
    authentifier, creer, connexion, changerCode, deconnexion, deconnecterTout, supprimerCompte, appareils,
    lireProfil, modifierProfil, listerDevis, lireUnDevis, creerDevis, modifierDevis, effacerUnDevis,
    listerChantiers, listerClients, catalogueDe, remplacerCatalogue, activerCode, synchroniser, quota, estPro, profilPublic
  });
}
