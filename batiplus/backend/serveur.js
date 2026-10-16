#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — backend (Node ≥ 22, zéro dépendance : node:http, node:crypto, node:fs, node:sqlite)
   Étape 12 : paiement automatique. Étape 14 : comptes, appareils, profil, devis, chantiers,
   clients, catalogue, synchronisation hors ligne, codes d'activation, administration,
   sauvegarde quotidienne chiffrée.
   Sécurité appliquée à TOUTES les réponses : HSTS (preload), nosniff, X-Frame-Options DENY,
   no-referrer, CSP, Permissions-Policy, Cache-Control no-store ; CORS limité aux origines du
   .env ; corps ≤ 1 Mo ; POST/PUT en application/json uniquement ; schémas stricts (champs
   inconnus rejetés) ; limitation de débit (429 + Retry-After) ; erreurs génériques.
   Contrôle d'accès de chaque route protégée : jeton → compte non suspendu → appartenance (404).
   ========================================================================== */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { journaliser, ouvrirBase } from "./base.js";
import { ErreurConfiguration, chargerConfig, lireFichierEnv } from "./config.js";
import { formulesPubliques } from "./formules.js";
import { ErreurApi, creerServiceComptes } from "./comptes.js";
import { creerServiceAdmin } from "./admin.js";
import { creerSauvegardes } from "./sauvegarde.js";
import {
  ErreurSchema, SCHEMA_ACTIVER_CODE, SCHEMA_ADMIN_CODES, SCHEMA_ADMIN_CONNEXION, SCHEMA_ADMIN_JOURS, SCHEMA_ADMIN_REMBOURSER, SCHEMA_ADMIN_SUSPENDRE,
  SCHEMA_CHANGER_CODE, SCHEMA_CONNEXION, SCHEMA_CREER, SCHEMA_PROFIL_PUT, SCHEMA_RENOUVELLEMENT, SCHEMA_SUPPRIMER_COMPTE, SCHEMA_SYNC, SCHEMA_VIDE,
  S, validerCatalogue, validerDevis, valider
} from "./schemas.js";
import { ErreurPaiement, creerServicePaiements, secretUrlNotification } from "./paiements/service.js";
import { egalTempsConstant } from "./paiements/interface.js";
import fabriquerLigdicash from "./paiements/ligdicash.js";
import fabriquerCinetpay from "./paiements/cinetpay.js";
import fabriquerFedapay from "./paiements/fedapay.js";
import fabriquerPaydunya from "./paiements/paydunya.js";
import fabriquerStripe from "./paiements/stripe.js";
import fabriquerSimulation, { ISSUES, banc } from "./paiements/simulation.js";

export const VERSION = "1.0.0";
const DOSSIER = dirname(fileURLToPath(import.meta.url));
const CORPS_MAX = 1024 * 1024;
const FABRIQUES = Object.freeze({
  ligdicash: fabriquerLigdicash, cinetpay: fabriquerCinetpay, fedapay: fabriquerFedapay,
  paydunya: fabriquerPaydunya, stripe: fabriquerStripe, simulation: fabriquerSimulation
});
/* Limites de débit (C.7) : [requêtes, fenêtre en ms], en mémoire, par IP et/ou par numéro ou compte.
   « connexion » compte les ÉCHECS (remis à zéro après une connexion réussie). */
export const LIMITES = Object.freeze({
  general: [120, 60000],
  connexion: [5, 15 * 60000],
  creation: [3, 3600000],
  activation: [5, 3600000],
  initier: [10, 3600000],
  admin: [10, 3600000],
  notification: [60, 60000]
});
const MOTIF_REFERENCE = /^BP-[A-Z0-9]{6,20}$/;
const MOTIF_UID = /^[A-Za-z0-9_-]{1,40}$/;

const MESSAGES = Object.freeze({
  requete_invalide: "Requête invalide.",
  type_contenu: "Contenu JSON attendu.",
  non_authentifie: "Connexion requise.",
  appareil_deconnecte: "Session fermée sur cet appareil.",
  identifiants_incorrects: "Numéro ou code incorrect.",
  trop_de_tentatives_connexion: "Trop d'essais. Réessayez plus tard.",
  creation_impossible: "Impossible de créer un compte avec ce numéro.",
  code_trop_simple: "Code trop simple.",
  code_incorrect: "Code incorrect.",
  interdit: "Accès refusé.",
  introuvable: "Introuvable.",
  trop_de_requetes: "Trop de requêtes. Réessayez dans un instant.",
  trop_volumineux: "Requête trop volumineuse.",
  erreur_interne: "Une erreur est survenue. Réessayez.",
  formule_inconnue: "Formule inconnue.",
  compte_suspendu: "Compte suspendu.",
  deja_a_vie: "Votre formule couvre déjà tout le Pro.",
  places_vie_epuisees: "Toutes les places Lifetime sont prises.",
  trop_de_tentatives: "Trop de tentatives de paiement. Réessayez dans quelques minutes.",
  paiement_indisponible: "Le paiement est momentanément indisponible.",
  limite_atteinte: "Limite de devis du mois atteinte.",
  limite_clients: "Nombre maximal de clients atteint.",
  limite_catalogue: "Nombre maximal d'articles atteint.",
  telephone_indisponible: "Ce numéro ne peut pas être utilisé.",
  abonnement_invalide: "Abonnement non reconnu.",
  code_invalide: "Code d'activation invalide ou déjà utilisé.",
  confirmation_requise: "Confirmation écrite et motif obligatoires.",
  paiement_introuvable: "Introuvable.",
  deja_traite: "Déjà traité.",
  rien_a_retirer: "Aucun jour à retirer."
});

function entetesSecurite(nonce) {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": nonce
      ? "default-src 'none'; style-src 'nonce-" + nonce + "'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      : "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store"
  };
}

function echapperHtml(texte) {
  return String(texte).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

/* Petite page HTML (retour de paiement, simulation) : texte échappé, style par nonce. */
function pageHtml(titre, paragraphes, formulaires = "") {
  const nonce = randomBytes(16).toString("base64");
  const corps = "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
    + "<title>" + echapperHtml(titre) + "</title><style nonce=\"" + nonce + "\">body{font-family:system-ui,sans-serif;background:#F4F2F9;color:#17131F;margin:0;display:grid;place-items:center;min-height:100vh}"
    + "main{background:#fff;border-radius:16px;padding:28px;max-width:420px;margin:16px;box-shadow:0 10px 30px rgba(78,10,128,.15)}h1{color:#6A0DAD;font-size:1.4rem}"
    + "button{font:inherit;font-weight:700;border:0;border-radius:12px;padding:12px 16px;margin:4px 0;width:100%;background:#6A0DAD;color:#fff;cursor:pointer}"
    + "button.b{background:#F3E9FD;color:#4E0A80}</style></head><body><main><h1>" + echapperHtml(titre) + "</h1>"
    + paragraphes.map((p) => "<p>" + echapperHtml(p) + "</p>").join("") + formulaires + "</main></body></html>";
  return { corps, nonce };
}

export function construireAdaptateurs(config) {
  const adaptateurs = {};
  for (const nom of config.paiement.actifs) {
    const secret = secretUrlNotification(config.webhookSecret, nom);
    adaptateurs[nom] = FABRIQUES[nom]({
      mode: config.paiement.mode,
      cles: config.cles[nom],
      urlPublique: config.urlPublique,
      urlNotification: config.urlPublique + "/api/paiements/notification/" + nom + "/" + secret,
      urlRetour: (reference) => config.urlPublique + "/paiement/retour?ref=" + encodeURIComponent(reference),
      urlAnnulation: (reference) => config.urlPublique + "/paiement/retour?ref=" + encodeURIComponent(reference) + "&annule=1",
      baseUrl: config.basesFournisseurs && config.basesFournisseurs[nom]
    });
  }
  return Object.freeze(adaptateurs);
}

/* Limiteur à fenêtre fixe, en mémoire. */
function creerLimiteur(limites) {
  const compteurs = new Map();
  function entree(seau, cle, maintenant) {
    const [, fenetre] = limites[seau];
    const id = seau + "|" + cle;
    let e = compteurs.get(id);
    if (!e || e.debut + fenetre <= maintenant) {
      e = { debut: maintenant, n: 0 };
      compteurs.set(id, e);
      if (compteurs.size > 50000) for (const [k, v] of compteurs) if (v.debut + limites[k.split("|")[0]][1] <= maintenant) compteurs.delete(k);
    }
    return e;
  }
  return {
    /* Compte un appel ; → 0 si permis, sinon secondes avant la fin de la fenêtre. */
    compter(seau, cle) {
      const maintenant = Date.now();
      const e = entree(seau, cle, maintenant);
      e.n += 1;
      return e.n <= limites[seau][0] ? 0 : Math.max(1, Math.ceil((e.debut + limites[seau][1] - maintenant) / 1000));
    },
    /* Sans compter (échecs de connexion : on regarde avant, on compte après). */
    consulter(seau, cle) {
      const maintenant = Date.now();
      const e = entree(seau, cle, maintenant);
      return e.n < limites[seau][0] ? 0 : Math.max(1, Math.ceil((e.debut + limites[seau][1] - maintenant) / 1000));
    },
    effacer(seau, cle) {
      compteurs.delete(seau + "|" + cle);
    }
  };
}

export function creerApplication(config, { base, service, comptes, admin, journalConsole = console }) {
  const limiteur = creerLimiteur({ ...LIMITES, ...(config.limites || {}) });

  function adresseIp(requete) {
    if (config.confianceProxy) {
      const transmis = String(requete.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (transmis) return transmis.slice(0, 64);
    }
    return String(requete.socket.remoteAddress || "").slice(0, 64);
  }

  function envoyer(reponse, statut, objet, entetes = {}) {
    const corps = objet === null ? "" : JSON.stringify(objet);
    reponse.writeHead(statut, { ...entetesSecurite(), ...entetes, ...(corps ? { "Content-Type": "application/json; charset=utf-8" } : {}), "Content-Length": Buffer.byteLength(corps) });
    reponse.end(corps);
  }

  function erreur(reponse, statut, code, entetes, extra = {}) {
    envoyer(reponse, statut, { erreur: code, message: MESSAGES[code] || MESSAGES.erreur_interne, ...extra }, entetes);
  }

  function trop(reponse, h, secondes) {
    erreur(reponse, 429, "trop_de_requetes", { ...h, "Retry-After": String(secondes) }, { reessayerDans: secondes });
  }

  function envoyerHtml(reponse, statut, page, entetes = {}) {
    reponse.writeHead(statut, { ...entetesSecurite(page.nonce), ...entetes, "Content-Type": "text/html; charset=utf-8", "Content-Length": Buffer.byteLength(page.corps) });
    reponse.end(page.corps);
  }

  function lireCorps(requete) {
    return new Promise((resoudre, rejeter) => {
      const annonce = Number(requete.headers["content-length"] || 0);
      if (annonce > CORPS_MAX) {
        rejeter(Object.assign(new Error("trop volumineux"), { statutHttp: 413 }));
        requete.resume();
        return;
      }
      const morceaux = [];
      let taille = 0;
      requete.on("data", (morceau) => {
        taille += morceau.length;
        if (taille > CORPS_MAX) {
          rejeter(Object.assign(new Error("trop volumineux"), { statutHttp: 413 }));
          requete.destroy();
          return;
        }
        morceaux.push(morceau);
      });
      requete.on("end", () => resoudre(Buffer.concat(morceaux).toString("utf8")));
      requete.on("error", rejeter);
    });
  }

  function analyserCorps(brut, type) {
    if (!brut) return {};
    if (/application\/x-www-form-urlencoded/i.test(type || "")) return Object.fromEntries(new URLSearchParams(brut));
    const objet = JSON.parse(brut);
    if (!objet || typeof objet !== "object" || Array.isArray(objet)) throw new Error("objet attendu");
    return objet;
  }

  /* Corps JSON d'une route POST/PUT : Content-Type exigé (C.6), puis schéma strict. */
  async function corpsJson(requete, schema) {
    if (!/^application\/json(\s*;\s*charset=utf-8)?$/i.test(String(requete.headers["content-type"] || "").trim())) throw new ErreurApi(415, "type_contenu");
    const brut = await lireCorps(requete);
    let objet;
    try {
      objet = analyserCorps(brut, "application/json");
    } catch (e) {
      throw new ErreurApi(400, "requete_invalide");
    }
    return valider(schema, objet);
  }

  function jetonDe(requete) {
    const entete = String(requete.headers.authorization || "");
    return entete.startsWith("Bearer ") ? entete.slice(7).trim() : "";
  }

  function appareilDe(requete) {
    const valeur = String(requete.headers["x-appareil"] || "");
    return /^[a-f0-9]{32}$/.test(valeur) ? valeur : "";
  }

  /* Ordre C.5 : jeton valide → compte non suspendu (puis chaque service vérifie l'appartenance). */
  function authentifier(requete) {
    return comptes.authentifier(jetonDe(requete), appareilDe(requete));
  }

  function cors(requete, chemin) {
    const origine = requete.headers.origin;
    if (!origine) return { ok: true, entetes: {} };
    if (!config.origines.includes(origine) || chemin.startsWith("/api/paiements/notification/")) return { ok: false, entetes: {} };
    return {
      ok: true,
      entetes: {
        "Access-Control-Allow-Origin": origine,
        Vary: "Origin",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appareil",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Expose-Headers": "Retry-After",
        "Access-Control-Max-Age": "600"
      }
    };
  }

  /* ---------- Routes de l'électricien ---------- */

  async function routesCompte(m, chemin, requete, reponse, h, ip) {
    if (m === "POST" && chemin === "/api/compte/creer") {
      const attente = limiteur.compter("creation", ip);
      if (attente) return trop(reponse, h, attente), true;
      envoyer(reponse, 201, await comptes.creer(await corpsJson(requete, SCHEMA_CREER), ip), h);
      return true;
    }
    if (m === "POST" && chemin === "/api/compte/connexion") {
      const corps = await corpsJson(requete, SCHEMA_CONNEXION);
      const attente = Math.max(limiteur.consulter("connexion", "ip:" + ip), limiteur.consulter("connexion", "tel:" + corps.telephone));
      if (attente) return trop(reponse, h, attente), true;
      try {
        const resultat = await comptes.connexion(corps, ip);
        limiteur.effacer("connexion", "ip:" + ip);
        limiteur.effacer("connexion", "tel:" + corps.telephone);
        envoyer(reponse, 200, resultat, h);
      } catch (e) {
        if (e instanceof ErreurApi && e.code === "identifiants_incorrects") {
          limiteur.compter("connexion", "ip:" + ip);
          limiteur.compter("connexion", "tel:" + corps.telephone);
        }
        throw e;
      }
      return true;
    }
    if (!chemin.startsWith("/api/compte/") && chemin !== "/api/compte") return false;
    const ctx = authentifier(requete);
    if (m === "POST" && chemin === "/api/compte/code") envoyer(reponse, 200, await comptes.changerCode(ctx, await corpsJson(requete, SCHEMA_CHANGER_CODE), ip), h);
    else if (m === "POST" && chemin === "/api/compte/deconnexion") envoyer(reponse, 200, comptes.deconnexion(ctx, ip), h);
    else if (m === "POST" && chemin === "/api/compte/deconnecter-tout") envoyer(reponse, 200, comptes.deconnecterTout(ctx, ip), h);
    else if ((m === "DELETE" && chemin === "/api/compte") || (m === "POST" && chemin === "/api/compte/supprimer")) envoyer(reponse, 200, await comptes.supprimerCompte(ctx, await corpsJson(requete, SCHEMA_SUPPRIMER_COMPTE), ip), h);
    else if (m === "GET" && chemin === "/api/compte/appareils") envoyer(reponse, 200, comptes.appareils(ctx), h);
    else erreur(reponse, 404, "introuvable", h);
    return true;
  }

  async function routesDonnees(m, chemin, requete, reponse, h, ip) {
    const unDevis = chemin.match(/^\/api\/devis\/([^/]{1,60})$/);
    const connue = ["/api/profil", "/api/devis", "/api/chantiers", "/api/clients", "/api/catalogue", "/api/sync", "/api/abonnement/activer-code", "/api/abonnement/renouvellement-auto"].includes(chemin) || unDevis;
    if (!connue) return false;
    const ctx = authentifier(requete);
    if (chemin === "/api/profil" && m === "GET") envoyer(reponse, 200, comptes.lireProfil(ctx), h);
    else if (chemin === "/api/profil" && m === "PUT") envoyer(reponse, 200, comptes.modifierProfil(ctx, await corpsJson(requete, SCHEMA_PROFIL_PUT), ip), h);
    else if (chemin === "/api/devis" && m === "GET") envoyer(reponse, 200, comptes.listerDevis(ctx), h);
    else if (chemin === "/api/devis" && m === "POST") envoyer(reponse, 201, comptes.creerDevis(ctx, await corpsJson(requete, validerDevis), ip), h);
    else if (unDevis && !MOTIF_UID.test(unDevis[1])) erreur(reponse, 404, "introuvable", h);
    else if (unDevis && m === "GET") envoyer(reponse, 200, comptes.lireUnDevis(ctx, unDevis[1]), h);
    else if (unDevis && m === "PUT") envoyer(reponse, 200, comptes.modifierDevis(ctx, unDevis[1], await corpsJson(requete, validerDevis), ip), h);
    else if (unDevis && m === "DELETE") envoyer(reponse, 200, comptes.effacerUnDevis(ctx, unDevis[1], ip), h);
    else if (chemin === "/api/chantiers" && m === "GET") envoyer(reponse, 200, comptes.listerChantiers(ctx), h);
    else if (chemin === "/api/clients" && m === "GET") envoyer(reponse, 200, comptes.listerClients(ctx), h);
    else if (chemin === "/api/catalogue" && m === "GET") envoyer(reponse, 200, comptes.catalogueDe(ctx), h);
    else if (chemin === "/api/catalogue" && m === "PUT") {
      const corps = await corpsJson(requete, S.objet({ catalogue: S.ouNul(validerCatalogue) }));
      envoyer(reponse, 200, comptes.remplacerCatalogue(ctx, corps.catalogue, ip), h);
    } else if (chemin === "/api/sync" && m === "POST") envoyer(reponse, 200, comptes.synchroniser(ctx, await corpsJson(requete, SCHEMA_SYNC), ip), h);
    else if (chemin === "/api/abonnement/activer-code" && m === "POST") {
      const attente = Math.max(limiteur.compter("activation", "ip:" + ip), limiteur.compter("activation", "compte:" + ctx.electricien.id));
      if (attente) return trop(reponse, h, attente), true;
      envoyer(reponse, 200, comptes.activerCode(ctx, await corpsJson(requete, SCHEMA_ACTIVER_CODE), ip), h);
    } else if (chemin === "/api/abonnement/renouvellement-auto" && m === "POST") {
      const corps = await corpsJson(requete, SCHEMA_RENOUVELLEMENT);
      envoyer(reponse, 200, service.reglerRenouvellementAuto(ctx.electricien, corps.actif, ip), h);
    } else erreur(reponse, 404, "introuvable", h);
    return true;
  }

  async function routesPaiement(m, chemin, requete, reponse, h, ip, notification) {
    /* Notification d'un agrégateur : URL secrète + signature, réponse 200 rapide, traitement après. */
    if (m === "POST" && notification) {
      const [, fournisseur, secret] = notification;
      if (!config.paiement.actifs.includes(fournisseur) || !egalTempsConstant(secretUrlNotification(config.webhookSecret, fournisseur), secret)) {
        journaliser(base, "notification_invalide", { ip, details: { fournisseur, motif: "url" } });
        erreur(reponse, 404, "introuvable");
        return true;
      }
      const brut = await lireCorps(requete);
      let corps;
      try {
        corps = analyserCorps(brut, requete.headers["content-type"]);
      } catch (e) {
        journaliser(base, "notification_invalide", { ip, details: { fournisseur, motif: "corps" } });
        erreur(reponse, 400, "requete_invalide");
        return true;
      }
      const entetes = {};
      for (const [nom, valeur] of Object.entries(requete.headers)) entetes[nom.toLowerCase()] = Array.isArray(valeur) ? valeur.join(",") : String(valeur);
      const { statutHttp } = service.recevoirNotification(fournisseur, { entetes, corpsBrut: brut, corps }, ip);
      if (statutHttp === 200) envoyer(reponse, 200, { recu: true });
      else erreur(reponse, statutHttp, statutHttp === 404 ? "introuvable" : "non_authentifie");
      return true;
    }
    if (m === "POST" && chemin === "/api/paiements/initier") {
      const ctx = authentifier(requete);
      const attente = limiteur.compter("initier", "compte:" + ctx.electricien.id);
      if (attente) return trop(reponse, h, attente), true;
      /* Seule la formule est lue : un « montant » envoyé par le client est ignoré (jamais utilisé). */
      if (!/^application\/json/i.test(String(requete.headers["content-type"] || ""))) throw new ErreurApi(415, "type_contenu");
      let corps;
      try {
        corps = analyserCorps(await lireCorps(requete), "application/json");
      } catch (e) {
        if (e.statutHttp === 413) throw e;
        throw new ErreurApi(400, "requete_invalide");
      }
      const resultat = await service.initier(ctx.electricien, typeof corps.formule === "string" ? corps.formule : "", { ip });
      envoyer(reponse, 201, resultat, h);
      return true;
    }
    const consultation = chemin.match(/^\/api\/paiements\/([^/]{1,40})$/);
    if (m === "GET" && consultation) {
      const ctx = authentifier(requete);
      const reference = consultation[1];
      const etat = MOTIF_REFERENCE.test(reference) ? await service.statutPourCompte(ctx.electricien, reference) : null;
      if (!etat) erreur(reponse, 404, "introuvable", h);
      else envoyer(reponse, 200, etat, h);
      return true;
    }
    return false;
  }

  /* ---------- Administration ---------- */

  async function routesAdmin(m, chemin, requete, reponse, h, ip, url) {
    if (!chemin.startsWith("/api/admin/")) return false;
    if (m === "POST" && chemin === "/api/admin/connexion") {
      const attente = limiteur.compter("admin", ip);
      if (attente) return trop(reponse, h, attente), true;
      envoyer(reponse, 200, await admin.connexion(await corpsJson(requete, SCHEMA_ADMIN_CONNEXION), ip), h);
      return true;
    }
    admin.authentifier(jetonDe(requete), appareilDe(requete), ip);
    const paiement = chemin.match(/^\/api\/admin\/paiements\/(BP-[A-Z0-9]{6,20})\/(reverifier|rembourser)$/);
    if (m === "GET" && chemin === "/api/admin/stats") envoyer(reponse, 200, admin.stats(), h);
    else if (m === "GET" && chemin === "/api/admin/electriciens") {
      const page = Math.min(199, Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0));
      if (url.searchParams.get("format") === "csv") {
        const csv = admin.electriciensCsv();
        journaliser(base, "admin_export_csv", { ip });
        reponse.writeHead(200, { ...entetesSecurite(), ...h, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"batiplus-electriciens.csv\"", "Content-Length": Buffer.byteLength(csv) });
        reponse.end(csv);
      } else envoyer(reponse, 200, admin.electriciens({ recherche: url.searchParams.get("q") || "", page }), h);
    } else if (m === "GET" && chemin === "/api/admin/journal") {
      envoyer(reponse, 200, admin.journal({ page: Math.min(10000, Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0)) }), h);
    } else if (m === "POST" && chemin === "/api/admin/codes") envoyer(reponse, 201, admin.genererCodes(await corpsJson(requete, SCHEMA_ADMIN_CODES), ip), h);
    else if (m === "POST" && chemin === "/api/admin/suspendre") envoyer(reponse, 200, admin.suspendre(await corpsJson(requete, SCHEMA_ADMIN_SUSPENDRE), ip), h);
    else if (m === "POST" && chemin === "/api/admin/offrir-jours") envoyer(reponse, 200, admin.offrirJours(await corpsJson(requete, SCHEMA_ADMIN_JOURS), ip), h);
    else if (m === "POST" && paiement && paiement[2] === "reverifier") {
      await corpsJson(requete, SCHEMA_VIDE);
      envoyer(reponse, 200, await admin.reverifier(paiement[1], ip), h);
    } else if (m === "POST" && paiement && paiement[2] === "rembourser") envoyer(reponse, 200, await admin.rembourser(paiement[1], await corpsJson(requete, SCHEMA_ADMIN_REMBOURSER), ip), h);
    else if (m === "GET" && chemin === "/api/admin/sauvegarde") {
      const corps = JSON.stringify(admin.sauvegarde(ip));
      reponse.writeHead(200, { ...entetesSecurite(), ...h, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=\"batiplus-sauvegarde-admin.json\"", "Content-Length": Buffer.byteLength(corps) });
      reponse.end(corps);
    } else erreur(reponse, 404, "introuvable", h);
    return true;
  }

  /* ---------- Pages hors API (retour de paiement, simulation) ---------- */

  async function routesPages(m, chemin, requete, reponse, url) {
    /* Page de retour de l'agrégateur : jamais de donnée personnelle, seulement une référence validée. */
    if (m === "GET" && chemin === "/paiement/retour") {
      const ref = url.searchParams.get("ref") || "";
      const reference = MOTIF_REFERENCE.test(ref) ? ref : "";
      if (config.urlSite && reference) {
        reponse.writeHead(303, { ...entetesSecurite(), Location: config.urlSite + "/#paiement-retour?ref=" + reference });
        reponse.end();
        return true;
      }
      const annule = url.searchParams.get("annule") === "1";
      envoyerHtml(reponse, 200, pageHtml(annule ? "Paiement interrompu" : "Merci !", annule
        ? ["Le paiement n'a pas été terminé. Revenez dans BâtiPlus pour réessayer : votre travail est conservé."]
        : ["Fermez cette page pour revenir dans BâtiPlus.", "Votre formule s'active toute seule dès que le paiement est confirmé, même la nuit."]
          .concat(reference ? ["Référence : " + reference] : [])));
      return true;
    }
    /* Agrégateur simulé : seulement hors production et en PAIEMENT_MODE=test. */
    const simulation = chemin.match(/^\/simulation\/payer\/(SIM-[A-Za-z0-9_-]{8,20})$/);
    if (simulation && !config.production && config.paiement.mode === "test" && config.paiement.actifs.includes("simulation")) {
      const id = simulation[1];
      const transaction = banc.transactions.get(id);
      if (!transaction) {
        erreur(reponse, 404, "introuvable");
        return true;
      }
      if (m === "GET") {
        const boutons = [["reussi", "Payer (succès)"], ["echoue", "Échec du paiement"], ["annule", "Annuler"], ["doublon", "Succès + notification en double"],
          ["montant_faux", "Montant faux (1 FCFA)"], ["webhook_perdu", "Succès, notification perdue"]]
          .map(([issue, texte], i) => "<button class=\"" + (i ? "b" : "") + "\" name=\"issue\" value=\"" + issue + "\">" + echapperHtml(texte) + "</button>").join("");
        envoyerHtml(reponse, 200, pageHtml("Paiement simulé", ["Mode test : aucun argent réel.", transaction.montant + " FCFA — " + transaction.reference],
          "<form method=\"post\">" + boutons + "</form>"));
        return true;
      }
      if (m === "POST") {
        const corps = analyserCorps(await lireCorps(requete), "application/x-www-form-urlencoded");
        const issue = ISSUES.includes(corps.issue) ? corps.issue : "";
        const fait = issue ? await banc.payer(id, issue) : false;
        reponse.writeHead(303, { ...entetesSecurite(), Location: "/paiement/retour?ref=" + transaction.reference + (fait && (issue === "annule" || issue === "echoue") ? "&annule=1" : "") });
        reponse.end();
        return true;
      }
    }
    return false;
  }

  async function traiter(requete, reponse, contexte) {
    const ip = adresseIp(requete);
    let url;
    try {
      url = new URL(requete.url, "http://interne");
    } catch (e) {
      erreur(reponse, 400, "requete_invalide");
      return;
    }
    const chemin = url.pathname;
    const m = requete.method;
    const origine = cors(requete, chemin);
    if (!origine.ok) {
      erreur(reponse, 403, "interdit");
      return;
    }
    const h = origine.entetes;
    contexte.h = h;
    if (m === "OPTIONS") {
      reponse.writeHead(204, { ...entetesSecurite(), ...h });
      reponse.end();
      return;
    }
    const notification = chemin.match(/^\/api\/paiements\/notification\/([a-z]{3,20})\/([a-f0-9]{32})$/);
    const attente = limiteur.compter(notification ? "notification" : "general", ip);
    if (attente) {
      trop(reponse, h, attente);
      return;
    }
    if (m === "GET" && chemin === "/api/sante") return envoyer(reponse, 200, { ok: true, version: VERSION }, h);
    if (m === "GET" && chemin === "/api/formules") return envoyer(reponse, 200, { formules: formulesPubliques() }, h);
    if (await routesPaiement(m, chemin, requete, reponse, h, ip, notification)) return;
    if (await routesCompte(m, chemin, requete, reponse, h, ip)) return;
    if (await routesDonnees(m, chemin, requete, reponse, h, ip)) return;
    if (await routesAdmin(m, chemin, requete, reponse, h, ip, url)) return;
    if (await routesPages(m, chemin, requete, reponse, url)) return;
    erreur(reponse, 404, "introuvable", h);
  }

  return async function gerer(requete, reponse) {
    const contexte = { h: {} };
    try {
      await traiter(requete, reponse, contexte);
    } catch (e) {
      if (reponse.headersSent) {
        reponse.destroy();
        return;
      }
      const h = contexte.h;
      if (e instanceof ErreurApi) {
        const { retryAfter, ...extra } = e.extra || {};
        erreur(reponse, e.statutHttp, e.code, retryAfter ? { ...h, "Retry-After": String(retryAfter) } : h, retryAfter ? { ...extra, reessayerDans: retryAfter } : extra);
        return;
      }
      if (e instanceof ErreurSchema) {
        erreur(reponse, 400, "requete_invalide", h);
        return;
      }
      if (e instanceof ErreurPaiement) {
        erreur(reponse, e.statutHttp, e.code, h);
        return;
      }
      if (e && e.statutHttp === 413) {
        erreur(reponse, 413, "trop_volumineux", h);
        return;
      }
      const id = randomBytes(6).toString("hex");
      journalConsole.error("[erreur " + id + "]", e && e.name, e && e.message);
      erreur(reponse, 500, "erreur_interne", h);
    }
  };
}

/* Démarrage complet (utilisé par main et par les tests). */
export function demarrer(config, { journalConsole = console, horloge } = {}) {
  const base = ouvrirBase(config.baseDonnees);
  const adaptateurs = construireAdaptateurs(config);
  const service = creerServicePaiements({
    base, config, adaptateurs, horloge,
    alerter: (alerte) => journalConsole.warn("[ALERTE paiement] " + alerte.type + " " + alerte.reference + " (" + alerte.ecarts.join(", ") + ")")
  });
  const comptes = creerServiceComptes({ base, config, paiements: service, horloge });
  const admin = creerServiceAdmin({ base, config, paiements: service, horloge });
  const sauvegardes = creerSauvegardes({ base, config, horloge, journalConsole });
  const serveur = createServer({ requestTimeout: 30000, headersTimeout: 15000 }, creerApplication(config, { base, service, comptes, admin, journalConsole }));
  serveur.keepAliveTimeout = 5000;
  return {
    base, service, comptes, admin, sauvegardes, serveur,
    ecouter(port = config.port, hote = config.hote) {
      return new Promise((resoudre) => serveur.listen(port, hote, () => {
        service.demarrerPlanificateur();
        if (config.sauvegardeAuto !== false) sauvegardes.demarrer();
        resoudre(serveur.address());
      }));
    },
    async arreter() {
      service.arreterPlanificateur();
      sauvegardes.arreter();
      await new Promise((resoudre) => serveur.close(resoudre));
      serveur.closeAllConnections();
      base.close();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let config;
  try {
    config = chargerConfig({ ...lireFichierEnv(join(DOSSIER, ".env")), ...process.env }, DOSSIER);
  } catch (e) {
    if (e instanceof ErreurConfiguration) {
      console.error("BâtiPlus — démarrage refusé.\n" + e.message);
      process.exit(1);
    }
    throw e;
  }
  const application = demarrer(config);
  application.ecouter().then((adresse) => {
    console.log("BâtiPlus API " + VERSION + " — " + adresse.address + ":" + adresse.port + " — paiement : " + config.paiement.fournisseur
      + (config.paiement.secours ? " (secours " + config.paiement.secours + ")" : "") + ", mode " + config.paiement.mode);
  });
  const fin = () => application.arreter().finally(() => process.exit(0));
  process.on("SIGTERM", fin);
  process.on("SIGINT", fin);
}
