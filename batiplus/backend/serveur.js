#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — backend (Node ≥ 22, zéro dépendance : node:http, node:crypto, node:fs, node:sqlite)
   Étape 12 : paiement automatique. L'étape 14 ajoute les comptes, la synchronisation et l'admin
   sur ce même serveur.
   Sécurité appliquée à TOUTES les réponses : HSTS, nosniff, X-Frame-Options DENY, no-referrer,
   CSP, Cache-Control no-store ; CORS limité aux origines du .env ; corps ≤ 1 Mo ;
   limitation de débit ; erreurs génériques (jamais de trace ni de nom de table).
   ========================================================================== */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { journaliser, ouvrirBase } from "./base.js";
import { ErreurConfiguration, chargerConfig, lireFichierEnv } from "./config.js";
import { formulesPubliques } from "./formules.js";
import { lireJetonSession } from "./jetons.js";
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
/* Limites de débit : [requêtes, fenêtre en ms] par adresse IP (ou par compte). */
const LIMITES = Object.freeze({
  general: [120, 60000],
  initier: [10, 60000],
  notification: [60, 60000]
});
const MOTIF_REFERENCE = /^BP-[A-Z0-9]{6,20}$/;

const MESSAGES = Object.freeze({
  requete_invalide: "Requête invalide.",
  non_authentifie: "Connexion requise.",
  interdit: "Accès refusé.",
  introuvable: "Introuvable.",
  trop_de_requetes: "Trop de requêtes. Réessayez dans une minute.",
  trop_volumineux: "Requête trop volumineuse.",
  erreur_interne: "Une erreur est survenue. Réessayez.",
  formule_inconnue: "Formule inconnue.",
  compte_suspendu: "Compte suspendu.",
  deja_a_vie: "Votre formule couvre déjà tout le Pro.",
  places_vie_epuisees: "Toutes les places Lifetime sont prises.",
  trop_de_tentatives: "Trop de tentatives de paiement. Réessayez dans quelques minutes.",
  paiement_indisponible: "Le paiement est momentanément indisponible."
});

function entetesSecurite(nonce) {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
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

export function creerApplication(config, { base, service, journalConsole = console }) {
  const compteurs = new Map();

  function limiter(seau, cle) {
    const [maximum, fenetre] = (config.limites || LIMITES)[seau];
    const maintenant = Date.now();
    const id = seau + "|" + cle;
    const entree = compteurs.get(id);
    if (!entree || entree.debut + fenetre <= maintenant) {
      compteurs.set(id, { debut: maintenant, n: 1 });
      if (compteurs.size > 50000) for (const [k, v] of compteurs) if (v.debut + fenetre <= maintenant) compteurs.delete(k);
      return true;
    }
    entree.n += 1;
    return entree.n <= maximum;
  }

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

  function erreur(reponse, statut, code, entetes) {
    envoyer(reponse, statut, { erreur: code, message: MESSAGES[code] || MESSAGES.erreur_interne }, entetes);
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

  /* Jeton de session → compte. Version de session comparée : un jeton révoqué est refusé. */
  function authentifier(requete) {
    const entete = String(requete.headers.authorization || "");
    if (!entete.startsWith("Bearer ")) return null;
    const lu = lireJetonSession(config.jetonSecret, entete.slice(7).trim());
    if (!lu) return null;
    const electricien = base.prepare("SELECT * FROM electriciens WHERE id = ?").get(lu.sub);
    if (!electricien || electricien.version_session !== lu.ver || electricien.suspendu) return null;
    return electricien;
  }

  function cors(requete, reponse, chemin) {
    const origine = requete.headers.origin;
    if (!origine) return { ok: true, entetes: {} };
    if (!config.origines.includes(origine) || chemin.startsWith("/api/paiements/notification/")) return { ok: false, entetes: {} };
    return {
      ok: true,
      entetes: {
        "Access-Control-Allow-Origin": origine,
        Vary: "Origin",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Max-Age": "600"
      }
    };
  }

  async function traiter(requete, reponse) {
    const ip = adresseIp(requete);
    let url;
    try {
      url = new URL(requete.url, "http://interne");
    } catch (e) {
      erreur(reponse, 400, "requete_invalide");
      return;
    }
    const chemin = url.pathname;
    const methode = requete.method;
    const origine = cors(requete, reponse, chemin);
    if (!origine.ok) {
      erreur(reponse, 403, "interdit");
      return;
    }
    const h = origine.entetes;
    if (methode === "OPTIONS") {
      reponse.writeHead(204, { ...entetesSecurite(), ...h });
      reponse.end();
      return;
    }
    const notification = chemin.match(/^\/api\/paiements\/notification\/([a-z]{3,20})\/([a-f0-9]{32})$/);
    if (!limiter(notification ? "notification" : "general", ip)) {
      erreur(reponse, 429, "trop_de_requetes", { ...h, "Retry-After": "60" });
      return;
    }

    if (methode === "GET" && chemin === "/api/sante") {
      envoyer(reponse, 200, { ok: true, version: VERSION }, h);
      return;
    }
    if (methode === "GET" && chemin === "/api/formules") {
      envoyer(reponse, 200, { formules: formulesPubliques() }, h);
      return;
    }

    /* Notification d'un agrégateur : URL secrète + signature, réponse 200 rapide, traitement après. */
    if (methode === "POST" && notification) {
      const [, fournisseur, secret] = notification;
      if (!config.paiement.actifs.includes(fournisseur) || !egalTempsConstant(secretUrlNotification(config.webhookSecret, fournisseur), secret)) {
        journaliser(base, "notification_invalide", { ip, details: { fournisseur, motif: "url" } });
        erreur(reponse, 404, "introuvable");
        return;
      }
      const brut = await lireCorps(requete);
      let corps;
      try {
        corps = analyserCorps(brut, requete.headers["content-type"]);
      } catch (e) {
        journaliser(base, "notification_invalide", { ip, details: { fournisseur, motif: "corps" } });
        erreur(reponse, 400, "requete_invalide");
        return;
      }
      const entetes = {};
      for (const [nom, valeur] of Object.entries(requete.headers)) entetes[nom.toLowerCase()] = Array.isArray(valeur) ? valeur.join(",") : String(valeur);
      const { statutHttp } = service.recevoirNotification(fournisseur, { entetes, corpsBrut: brut, corps }, ip);
      if (statutHttp === 200) envoyer(reponse, 200, { recu: true });
      else erreur(reponse, statutHttp, statutHttp === 404 ? "introuvable" : "non_authentifie");
      return;
    }

    if (methode === "POST" && chemin === "/api/paiements/initier") {
      const electricien = authentifier(requete);
      if (!electricien) {
        erreur(reponse, 401, "non_authentifie", h);
        return;
      }
      if (!limiter("initier", "compte" + electricien.id)) {
        erreur(reponse, 429, "trop_de_requetes", { ...h, "Retry-After": "60" });
        return;
      }
      let corps;
      try {
        corps = analyserCorps(await lireCorps(requete), "application/json");
      } catch (e) {
        if (e.statutHttp === 413) throw e;
        erreur(reponse, 400, "requete_invalide", h);
        return;
      }
      /* Seule la formule est lue : un « montant » envoyé par le client est ignoré. */
      const resultat = await service.initier(electricien, typeof corps.formule === "string" ? corps.formule : "", { ip });
      envoyer(reponse, 201, resultat, h);
      return;
    }

    const consultation = chemin.match(/^\/api\/paiements\/([^/]{1,40})$/);
    if (methode === "GET" && consultation) {
      const electricien = authentifier(requete);
      if (!electricien) {
        erreur(reponse, 401, "non_authentifie", h);
        return;
      }
      const reference = consultation[1];
      const etat = MOTIF_REFERENCE.test(reference) ? await service.statutPourCompte(electricien, reference) : null;
      if (!etat) erreur(reponse, 404, "introuvable", h);
      else envoyer(reponse, 200, etat, h);
      return;
    }

    if (methode === "POST" && chemin === "/api/abonnement/renouvellement-auto") {
      const electricien = authentifier(requete);
      if (!electricien) {
        erreur(reponse, 401, "non_authentifie", h);
        return;
      }
      let corps;
      try {
        corps = analyserCorps(await lireCorps(requete), "application/json");
      } catch (e) {
        if (e.statutHttp === 413) throw e;
        erreur(reponse, 400, "requete_invalide", h);
        return;
      }
      if (typeof corps.actif !== "boolean") {
        erreur(reponse, 400, "requete_invalide", h);
        return;
      }
      envoyer(reponse, 200, service.reglerRenouvellementAuto(electricien, corps.actif, ip), h);
      return;
    }

    /* Page de retour de l'agrégateur : jamais de donnée personnelle, seulement une référence validée. */
    if (methode === "GET" && chemin === "/paiement/retour") {
      const ref = url.searchParams.get("ref") || "";
      const reference = MOTIF_REFERENCE.test(ref) ? ref : "";
      if (config.urlSite && reference) {
        reponse.writeHead(303, { ...entetesSecurite(), Location: config.urlSite + "/#paiement-retour?ref=" + reference });
        reponse.end();
        return;
      }
      const annule = url.searchParams.get("annule") === "1";
      envoyerHtml(reponse, 200, pageHtml(annule ? "Paiement interrompu" : "Merci !", annule
        ? ["Le paiement n'a pas été terminé. Revenez dans BâtiPlus pour réessayer : votre travail est conservé."]
        : ["Fermez cette page pour revenir dans BâtiPlus.", "Votre formule s'active toute seule dès que le paiement est confirmé, même la nuit."]
          .concat(reference ? ["Référence : " + reference] : [])));
      return;
    }

    /* Agrégateur simulé : seulement hors production et en PAIEMENT_MODE=test. */
    const simulation = chemin.match(/^\/simulation\/payer\/(SIM-[A-Za-z0-9_-]{8,20})$/);
    if (simulation && !config.production && config.paiement.mode === "test" && config.paiement.actifs.includes("simulation")) {
      const id = simulation[1];
      const transaction = banc.transactions.get(id);
      if (!transaction) {
        erreur(reponse, 404, "introuvable");
        return;
      }
      if (methode === "GET") {
        const boutons = [["reussi", "Payer (succès)"], ["echoue", "Échec du paiement"], ["annule", "Annuler"], ["doublon", "Succès + notification en double"],
          ["montant_faux", "Montant faux (1 FCFA)"], ["webhook_perdu", "Succès, notification perdue"]]
          .map(([issue, texte], i) => "<button class=\"" + (i ? "b" : "") + "\" name=\"issue\" value=\"" + issue + "\">" + echapperHtml(texte) + "</button>").join("");
        envoyerHtml(reponse, 200, pageHtml("Paiement simulé", ["Mode test : aucun argent réel.", transaction.montant + " FCFA — " + transaction.reference],
          "<form method=\"post\">" + boutons + "</form>"));
        return;
      }
      if (methode === "POST") {
        const corps = analyserCorps(await lireCorps(requete), "application/x-www-form-urlencoded");
        const issue = ISSUES.includes(corps.issue) ? corps.issue : "";
        const fait = issue ? await banc.payer(id, issue) : false;
        reponse.writeHead(303, { ...entetesSecurite(), Location: "/paiement/retour?ref=" + transaction.reference + (fait && (issue === "annule" || issue === "echoue") ? "&annule=1" : "") });
        reponse.end();
        return;
      }
    }

    erreur(reponse, 404, "introuvable", h);
  }

  return async function gerer(requete, reponse) {
    try {
      await traiter(requete, reponse);
    } catch (e) {
      if (reponse.headersSent) {
        reponse.destroy();
        return;
      }
      if (e instanceof ErreurPaiement) {
        const origine = requete.headers.origin && config.origines.includes(requete.headers.origin)
          ? { "Access-Control-Allow-Origin": requete.headers.origin, Vary: "Origin" } : {};
        erreur(reponse, e.statutHttp, e.code, origine);
        return;
      }
      if (e && e.statutHttp === 413) {
        erreur(reponse, 413, "trop_volumineux");
        return;
      }
      const id = randomBytes(6).toString("hex");
      journalConsole.error("[erreur " + id + "]", e && e.name, e && e.message);
      erreur(reponse, 500, "erreur_interne");
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
  const serveur = createServer({ requestTimeout: 30000, headersTimeout: 15000 }, creerApplication(config, { base, service, journalConsole }));
  serveur.keepAliveTimeout = 5000;
  return {
    base, service, serveur,
    ecouter(port = config.port, hote = config.hote) {
      return new Promise((resoudre) => serveur.listen(port, hote, () => {
        service.demarrerPlanificateur();
        resoudre(serveur.address());
      }));
    },
    async arreter() {
      service.arreterPlanificateur();
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
