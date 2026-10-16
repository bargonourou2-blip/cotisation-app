#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — tests de l'étape 14 (comptes, appareils, données, synchronisation, administration,
   sauvegarde chiffrée), sans dépendance. Lance de vrais serveurs HTTP sur des bases temporaires.
   Contrôles ⑬–⑰ de l'étape 14, H.2 (⑬–㉔ côté serveur) et tests d'attaque H.4 n° 1, 2, 3, 4, 8, 10.
   Code de sortie 1 si un seul contrôle échoue.
   ========================================================================== */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, request as requeteHttp } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { ouvrirBase } from "../base.js";
import { chargerConfig, ErreurConfiguration } from "../config.js";
import { formaterHachageAdmin, hacherCode } from "../codes.js";
import { JOUR_MS } from "../formules.js";
import { signerJetonAbonnement } from "../jetons.js";
import { REGLES } from "../schemas.js";
import { dechiffrer } from "../sauvegarde.js";
import { demarrer, LIMITES } from "../serveur.js";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const RACINE = join(BACKEND, "..");
const resultats = [];
function controle(id, titre, ok, detail) {
  resultats.push({ id, titre, ok: Boolean(ok), detail: detail || "" });
}
const liberer = () => new Promise((resoudre) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resoudre(port)); }); });
const silencieux = { error() {}, warn() {}, log() {} };

const dossier = mkdtempSync(join(tmpdir(), "batiplus-comptes-"));
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
writeFileSync(join(dossier, "cle.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
const CODE_ADMIN = "20261016885533";
const SECRETS = {
  JETON_SECRET: "5e8d1c0b9a7f6e2d".repeat(4),
  WEBHOOK_SECRET: "w3bh00k-" + "a9b8c7d6e5f40312".repeat(2),
  SIMULATION_SECRET: "simulation-" + "c3d5e7f9".repeat(3),
  SAUVEGARDE_CLE: "7f3a0e1d2c4b5968".repeat(4)
};
const HACHAGE_ADMIN = formaterHachageAdmin(await hacherCode(CODE_ADMIN));
function envPour(port, nom) {
  return {
    NODE_ENV: "developpement", URL_PUBLIQUE: "http://127.0.0.1:" + port, ORIGINES_AUTORISEES: "https://localhost,capacitor://localhost,https://batiplus.bf",
    ABONNEMENT_CLE_PRIVEE_CHEMIN: join(dossier, "cle.pem"), PAIEMENT_FOURNISSEUR: "simulation", PAIEMENT_MODE: "test",
    BASE_DONNEES: join(dossier, nom + ".sqlite"), SAUVEGARDE_DOSSIER: join(dossier, "sauvegardes-" + nom), ADMIN_CODE_HASH: HACHAGE_ADMIN, ...SECRETS
  };
}

/* Serveur principal : limites larges (on teste les règles métier) et IP lue dans X-Forwarded-For
   (confianceProxy) pour simuler plusieurs adresses. Serveur « limites » : limites RÉELLES de C.7. */
const port = await liberer();
const decalage = { ms: 0 };
const horloge = () => Date.now() + decalage.ms;
const config = {
  ...chargerConfig(envPour(port, "principal"), BACKEND), confianceProxy: true, sauvegardeAuto: false,
  limites: { general: [100000, 60000], connexion: [100000, 60000], creation: [100000, 60000], activation: [100000, 60000], initier: [1000, 60000], admin: [100000, 60000] }
};
const app = demarrer(config, { horloge, journalConsole: silencieux });
await app.ecouter(port, "127.0.0.1");
const portLimites = await liberer();
const configLimites = { ...chargerConfig(envPour(portLimites, "limites"), BACKEND), confianceProxy: true, sauvegardeAuto: false };
const appLimites = demarrer(configLimites, { journalConsole: silencieux });
await appLimites.ecouter(portLimites, "127.0.0.1");

const base = app.base;
const corpsRecus = [];
const appareilAleatoire = () => randomBytes(16).toString("hex");
const activites = (action) => base.prepare("SELECT * FROM activites WHERE action = ? ORDER BY id").all(action);
let ipNumero = 0;
const nouvelleIp = () => { ipNumero += 1; return "10.0." + Math.floor(ipNumero / 250) + "." + (ipNumero % 250 + 1); };

async function appel(methode, chemin, { jeton, appareil, corps, entetes = {}, brut, ip = "10.9.9.9", portCible = port } = {}) {
  const options = { method: methode, headers: { "X-Forwarded-For": ip, ...entetes }, redirect: "manual" };
  if (appareil) options.headers["X-Appareil"] = appareil;
  if (jeton) options.headers.Authorization = "Bearer " + jeton;
  if (brut !== undefined) options.body = brut;
  else if (corps !== undefined) {
    options.body = JSON.stringify(corps);
    options.headers["Content-Type"] = "application/json";
  }
  const reponse = await fetch("http://127.0.0.1:" + portCible + chemin, options);
  const texte = await reponse.text();
  corpsRecus.push(texte);
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  return { statut: reponse.status, entetes: reponse.headers, json, texte };
}

let compteur = 0;
function identite(extra = {}) {
  compteur += 1;
  return {
    compteId: "compte-essai-" + String(compteur).padStart(4, "0") + "-" + randomBytes(4).toString("hex"),
    telephone: "+2266" + String(2000000 + compteur).padStart(7, "0"), code: "258071",
    nom: "Awa Ouédraogo-Kaboré", entreprise: "BRG Électro+", ville: "Ouagadougou", pays: "BF", devise: "XOF", appareil: appareilAleatoire(), ...extra
  };
}
async function creerCompte(extra = {}, ip = nouvelleIp()) {
  const donnees = identite(extra);
  const r = await appel("POST", "/api/compte/creer", { corps: donnees, ip });
  if (r.statut !== 201) throw new Error("création impossible : " + r.statut + " " + r.texte);
  const ligne = base.prepare("SELECT * FROM electriciens WHERE compte_id = ?").get(donnees.compteId);
  return { ...donnees, jeton: r.json.jeton, id: ligne.id, reponse: r.json, ip };
}
const sur = (c, jeton = c.jeton, appareil = c.appareil) => ({ jeton, appareil, ip: c.ip });
const maintenantIso = () => new Date(horloge()).toISOString();
function devis(c, uid, extra = {}) {
  return { id: uid, compteId: c.compteId, statut: "brouillon", creeLe: maintenantIso(), modifieLe: maintenantIso(), titre: "Villa R+1", client: "M. Sawadogo", total: 1250000, complet: false, numero: "", ...extra };
}
function client(c, uid, nom = "Client " + uid) {
  return { id: uid, compteId: c.compteId, nom, telephone: "+22670000000", creeLe: maintenantIso(), modifieLe: maintenantIso() };
}
function chantier(c, uid) {
  return {
    id: uid, compteId: c.compteId, creeLe: maintenantIso(), modifieLe: maintenantIso(), statut: "brouillon", etape: 1, etapeMax: 1,
    client: { nom: "M. Ilboudo", telephone: "" }, nom: "Boutique", lieu: "Koudougou", type: REGLES.typesChantier[0], alimentation: REGLES.alimentations[0],
    pieces: [{ id: "p1", type: REGLES.typesPieces[0], surface: 12.5, prises: 3, points: 2 }], appareils: {},
    options: { distance: 10, hauteur: 2.8, parafoudre: false, terreNeuve: true, tableauARemplacer: false },
    mainOeuvre: { points: {}, forfait: 0, journees: { ouvriers: 0, jours: 0, tarif: null }, libres: [] }, materiel: {},
    totaux: { remiseType: "pourcent", remise: 0, tva: false, tauxTva: 18, acompte: 0 }
  };
}
const op = (type, id, donnees, action = "ecrire", quand = maintenantIso()) => ({ type, id, action, quand, ...(action === "ecrire" ? { donnees } : {}) });
const sync = (c, corps, jeton = c.jeton, appareil = c.appareil) => appel("POST", "/api/sync", { ...sur(c, jeton, appareil), corps: { curseur: 0, abonnement: "", operations: [], ...corps } });

let jetonAdmin = "";
const APPAREIL_ADMIN = appareilAleatoire();
const admin = (methode, chemin, corps) => appel(methode, chemin, { jeton: jetonAdmin, appareil: APPAREIL_ADMIN, corps, ip: "10.200.0.1" });

try {
  /* ---------- ⑬ / H.4 n°4 : SQL paramétré ---------- */
  {
    const fichiers = [];
    const parcourir = (d) => {
      for (const nom of readdirSync(d)) {
        const p = join(d, nom);
        if (statSync(p).isDirectory()) { if (!["tests", "node_modules", "donnees"].includes(nom)) parcourir(p); }
        else if (/\.(m?js|cjs)$/.test(nom)) fichiers.push(p);
      }
    };
    parcourir(BACKEND);
    const problemes = [];
    let requetes = 0;
    for (const f of fichiers) {
      const texte = readFileSync(f, "utf8");
      for (const correspondance of texte.matchAll(/\.(prepare|exec)\(/g)) {
        requetes += 1;
        const suite = texte.slice(correspondance.index + correspondance[0].length);
        const guillemet = suite[0];
        if (guillemet === "\"" || guillemet === "'" || guillemet === "`") {
          const fin = suite.indexOf(guillemet, 1);
          const litteral = suite.slice(1, fin);
          const apres = suite.slice(fin + 1).trimStart();
          if ((guillemet === "`" && litteral.includes("${")) || !apres.startsWith(")")) problemes.push(relative(BACKEND, f) + " : requête assemblée");
        } else if (!(correspondance[1] === "exec" && /^(SCHEMA|instruction)\)/.test(suite))) problemes.push(relative(BACKEND, f) + " : requête non littérale");
      }
    }
    const a = await creerCompte();
    const injections = ["' OR '1'='1", "\"; DROP TABLE electriciens; --", "1; DELETE FROM devis"];
    const refus = [];
    for (const t of injections) {
      const r = await appel("POST", "/api/compte/connexion", { corps: { telephone: t, code: "258071", appareil: appareilAleatoire() }, ip: nouvelleIp() });
      if (r.statut !== 400) refus.push("téléphone « " + t + " » → " + r.statut);
    }
    const nomPiege = "Robert'); DROP TABLE clients; --";
    await sync(a, { operations: [op("client", "cli-sql", client(a, "cli-sql", nomPiege))] });
    const relu = await appel("GET", "/api/clients", sur(a));
    const tableIntacte = base.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('clients','electriciens','devis')").get().n === 3;
    const parUid = await appel("GET", "/api/devis/" + encodeURIComponent("x' OR '1'='1"), sur(a));
    if (!relu.json || relu.json.clients[0].nom !== nomPiege) refus.push("nom de client piégé non relu tel quel");
    if (parUid.statut !== 404) refus.push("identifiant piégé → " + parUid.statut);
    controle("⑬", "toutes les requêtes SQL sont préparées et littérales (aucune concaténation) — H.4 n°4", !problemes.length && !refus.length && tableIntacte && requetes > 100,
      (problemes.concat(refus).join(" ; ") || requetes + " appels prepare/exec analysés dans " + fichiers.length + " fichiers, tous littéraux (exec : SCHEMA ou instruction figée) ; injections dans le numéro → 400 ; nom « Robert'); DROP TABLE… » enregistré et relu comme texte ; tables intactes"));
  }

  /* ---------- ⑭ / H.4 n°3 : jeton ET appartenance ---------- */
  {
    const a = await creerCompte();
    const b = await creerCompte();
    await appel("POST", "/api/devis", { ...sur(a), corps: devis(a, "devis-a-1") });
    await sync(a, { operations: [op("client", "cli-a", client(a, "cli-a")), op("chantier", "chantier-a-0001", chantier(a, "chantier-a-0001"))] });
    const p = [];
    const attendre = (nom, r, statut) => { if (r.statut !== statut) p.push(nom + " → " + r.statut + " (attendu " + statut + ")"); };
    attendre("B lit le devis de A", await appel("GET", "/api/devis/devis-a-1", sur(b)), 404);
    attendre("B modifie le devis de A", await appel("PUT", "/api/devis/devis-a-1", { ...sur(b), corps: devis(b, "devis-a-1") }), 404);
    attendre("B supprime le devis de A", await appel("DELETE", "/api/devis/devis-a-1", sur(b)), 404);
    attendre("B crée un devis au nom de A", await appel("POST", "/api/devis", { ...sur(b), corps: devis(a, "devis-b-pirate") }), 404);
    const pirate = await sync(b, { operations: [op("devis", "devis-a-1", devis(a, "devis-a-1", { total: 1 })), op("client", "cli-a", client(a, "cli-a", "Pirate")), op("devis", "devis-a-1", null, "supprimer")] });
    const intact = base.prepare("SELECT total, supprime FROM devis WHERE uid = 'devis-a-1' AND electricien_id = ?").get(a.id);
    const clientIntact = base.prepare("SELECT nom FROM clients WHERE uid = 'cli-a' AND electricien_id = ?").get(a.id);
    if (!pirate.json || pirate.json.resultats[0].erreur !== "introuvable" || intact.total !== 1250000 || intact.supprime !== 0 || clientIntact.nom !== "Client cli-a") p.push("synchronisation de B sur les données de A : " + JSON.stringify(pirate.json && pirate.json.resultats));
    const listeB = await appel("GET", "/api/devis", sur(b));
    if (listeB.json.devis.length) p.push("B voit des devis de A");
    attendre("sans jeton", await appel("GET", "/api/profil", { appareil: a.appareil }), 401);
    attendre("jeton retouché", await appel("GET", "/api/profil", sur(a, a.jeton.slice(0, -3) + (a.jeton.endsWith("AAA") ? "BBB" : "AAA"))), 401);
    attendre("jeton sans X-Appareil", await appel("GET", "/api/profil", { jeton: a.jeton }), 401);
    attendre("jeton volé utilisé depuis un autre appareil", await appel("GET", "/api/profil", sur(a, a.jeton, appareilAleatoire())), 401);
    base.prepare("UPDATE electriciens SET suspendu = 1 WHERE id = ?").run(b.id);
    attendre("compte suspendu, jeton valide", await appel("GET", "/api/profil", sur(b)), 403);
    attendre("compte suspendu, jeton invalide (ordre jeton → suspension)", await appel("GET", "/api/profil", sur(b, "v1.faux.faux")), 401);
    base.prepare("UPDATE electriciens SET suspendu = 0 WHERE id = ?").run(b.id);
    controle("⑭", "chaque route protégée vérifie jeton → compte non suspendu → appartenance (404 si pas à vous) — H.4 n°3", !p.length,
      p.join(" ; ") || "devis de A lu / modifié / supprimé / créé par B → 404 ; synchronisation de B sur les documents de A → refusée sans rien révéler, données de A intactes ; sans jeton / retouché / sans appareil / autre appareil → 401 ; suspendu → 403 (après le contrôle du jeton)");
  }

  /* ---------- Création et connexion : erreurs génériques, codes triviaux, schéma strict ---------- */
  let compteRef;
  {
    const p = [];
    compteRef = await creerCompte();
    const r0 = compteRef.reponse;
    if (!r0.jeton || r0.compte.telephone !== compteRef.telephone || r0.quota.limite !== 5 || r0.abonnement !== null) p.push("réponse de création incomplète");
    const doublon = await appel("POST", "/api/compte/creer", { corps: identite({ telephone: compteRef.telephone }), ip: nouvelleIp() });
    if (doublon.statut !== 409 || doublon.json.erreur !== "creation_impossible") p.push("numéro déjà pris → " + doublon.statut);
    const trivial = await appel("POST", "/api/compte/creer", { corps: identite({ code: "123456" }), ip: nouvelleIp() });
    if (trivial.statut !== 400 || trivial.json.erreur !== "code_trop_simple") p.push("code 123456 accepté");
    const inconnu = await appel("POST", "/api/compte/creer", { corps: { ...identite(), formule: "vie" }, ip: nouvelleIp() });
    if (inconnu.statut !== 400) p.push("champ inconnu « formule » → " + inconnu.statut);
    const sansType = await appel("POST", "/api/compte/creer", { brut: JSON.stringify(identite()), ip: nouvelleIp() });
    if (sansType.statut !== 415) p.push("sans Content-Type JSON → " + sansType.statut);
    const mauvais = await appel("POST", "/api/compte/connexion", { corps: { telephone: compteRef.telephone, code: "999999", appareil: appareilAleatoire() }, ip: nouvelleIp() });
    const absent = await appel("POST", "/api/compte/connexion", { corps: { telephone: "+22699999999", code: "999999", appareil: appareilAleatoire() }, ip: nouvelleIp() });
    if (mauvais.statut !== 401 || mauvais.texte !== absent.texte || mauvais.json.message !== "Numéro ou code incorrect.") p.push("erreur de connexion non générique : " + mauvais.texte + " / " + absent.texte);
    const bon = await appel("POST", "/api/compte/connexion", { corps: { telephone: compteRef.telephone, code: "258071", appareil: compteRef.appareil }, ip: nouvelleIp() });
    if (bon.statut !== 200 || bon.json.compte.compteId !== compteRef.compteId) p.push("connexion valide → " + bon.statut);
    else compteRef.jeton = bon.json.jeton;
    controle("CC", "création / connexion : « Numéro ou code incorrect » identique (numéro inconnu ou code faux), 409 générique, code trivial refusé, champs inconnus rejetés, JSON exigé", !p.length,
      p.join(" ; ") || "création 201 (jeton, compte, abonnement nul, quota 5) ; doublon 409 « creation_impossible » ; 123456 → 400 ; « formule: vie » ajouté au corps → 400 ; corps sans Content-Type → 415 ; mauvais code et numéro inconnu → même réponse 401, octet pour octet");
  }

  /* ---------- ⑮ : aucun hachage, sel ni jeton ne sort ---------- */
  {
    const a = await creerCompte();
    await appel("PUT", "/api/profil", { ...sur(a), corps: { nom: "Awa", entreprise: "BRG", ville: "Bobo-Dioulasso", pays: "BF", devise: "XOF", conditions: "", photo: "", logo: "" } });
    await appel("GET", "/api/profil", sur(a));
    await appel("GET", "/api/compte/appareils", sur(a));
    const lignes = base.prepare("SELECT code_hash, code_sel FROM electriciens WHERE code_hash IS NOT NULL").all();
    const empreintes = base.prepare("SELECT empreinte FROM appareils").all().map((l) => l.empreinte);
    const interdits = [...lignes.flatMap((l) => [l.code_hash, l.code_sel]), ...empreintes, SECRETS.JETON_SECRET, SECRETS.SAUVEGARDE_CLE, HACHAGE_ADMIN.split("$").pop(), "code_hash", "code_sel", "version_session"];
    const fuites = corpsRecus.filter((t) => interdits.some((s) => s && t.includes(s)));
    const cles = Object.keys((await appel("GET", "/api/profil", sur(a))).json.compte).sort().join(",");
    controle("⑮", "aucun hachage, sel, empreinte ni secret ne sort de l'API (scrypt N=16384 r=8 p=1, comparaison timingSafeEqual)", !fuites.length && !/hash|sel|empreinte|version/.test(cles),
      fuites.length ? fuites.length + " réponse(s) contiennent une valeur interdite" : corpsRecus.length + " réponses analysées : aucun code_hash, code_sel, empreinte d'appareil, secret ni hachage admin ; profil = liste blanche (" + cles + ")");
  }

  /* ---------- ⑯ : jetons à version de session, invalidables ; 3e appareil ---------- */
  {
    const p = [];
    const a = await creerCompte();
    const app2 = appareilAleatoire();
    const app3 = appareilAleatoire();
    const c2 = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: app2, nomAppareil: "Tablette" }, ip: nouvelleIp() });
    decalage.ms += 1000;
    const c3 = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: app3, nomAppareil: "Second téléphone" }, ip: nouvelleIp() });
    const vieux = await appel("GET", "/api/profil", sur(a));
    if (vieux.statut !== 401 || vieux.json.erreur !== "appareil_deconnecte") p.push("3e appareil : le plus ancien reste connecté (" + vieux.statut + ")");
    if ((await appel("GET", "/api/profil", sur(a, c2.json.jeton, app2))).statut !== 200 || (await appel("GET", "/api/profil", sur(a, c3.json.jeton, app3))).statut !== 200) p.push("les 2 appareils récents doivent rester connectés");
    const liste = await appel("GET", "/api/compte/appareils", sur(a, c3.json.jeton, app3));
    if (liste.json.appareils.length !== 2) p.push("liste des appareils : " + liste.json.appareils.length);
    const change = await appel("POST", "/api/compte/code", { ...sur(a, c3.json.jeton, app3), corps: { ancien: a.code, nouveau: "480613" } });
    if (change.statut !== 200) p.push("changement de code → " + change.statut);
    if ((await appel("GET", "/api/profil", sur(a, c2.json.jeton, app2))).statut !== 401) p.push("après changement de code, l'autre appareil reste connecté");
    if ((await appel("GET", "/api/profil", sur(a, c3.json.jeton, app3))).statut !== 401) p.push("l'ancien jeton de cet appareil reste valable");
    if ((await appel("GET", "/api/profil", sur(a, change.json.jeton, app3))).statut !== 200) p.push("le nouveau jeton remis ne fonctionne pas");
    const ancienCode = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: app2 }, ip: nouvelleIp() });
    if (ancienCode.statut !== 401) p.push("ancien code encore accepté");
    const partout = await appel("POST", "/api/compte/deconnecter-tout", sur(a, change.json.jeton, app3));
    if (partout.statut !== 200 || (await appel("GET", "/api/profil", sur(a, change.json.jeton, app3))).statut !== 401) p.push("« déconnecter tous mes appareils » sans effet");
    decalage.ms += 31 * JOUR_MS;
    const re = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: "480613", appareil: app2 }, ip: nouvelleIp() });
    decalage.ms += 31 * JOUR_MS;
    if ((await appel("GET", "/api/profil", sur(a, re.json.jeton, app2))).statut !== 401) p.push("jeton encore valable après 30 jours");
    decalage.ms -= 62 * JOUR_MS;
    const journalOk = activites("appareil_deconnecte").length >= 1 && activites("changement_code").length >= 1 && activites("deconnexion_partout").length >= 1;
    if (!journalOk) p.push("journal incomplet");
    controle("⑯", "jetons HMAC-SHA256 à version de session : changement de code / « déconnecter partout » invalident tout ; 30 jours ; 2 appareils, le 3e déconnecte le plus ancien", !p.length,
      p.join(" ; ") || "3e connexion → le 1er appareil reçoit 401 « appareil_deconnecte », les 2 récents restent ; changement de code → anciens jetons 401 sur les deux appareils, nouveau jeton remis à celui qui change ; ancien code refusé ; déconnexion partout effective ; jeton expiré après 30 jours ; tout journalisé");
  }

  /* ---------- ⑰ : le serveur refuse de démarrer sans secrets valides ---------- */
  {
    const p = [];
    const essais = {
      "ADMIN_CODE_HASH absent": { ADMIN_CODE_HASH: "" },
      "code admin en clair": { ADMIN_CODE_HASH: "123456" },
      "SAUVEGARDE_CLE absente": { SAUVEGARDE_CLE: "" },
      "SAUVEGARDE_CLE = JETON_SECRET": { SAUVEGARDE_CLE: SECRETS.JETON_SECRET },
      "JETON_SECRET trop peu varié": { JETON_SECRET: "a1".repeat(32) },
      "JETON_SECRET d'exemple": { JETON_SECRET: "changez-moi-changez-moi-changez-moi-changez-moi-changez-moi-1234" },
      "SAUVEGARDE_CLE d'un seul caractère": { SAUVEGARDE_CLE: "0".repeat(64) },
      "JETON_SECRET trop court": { JETON_SECRET: "court" }
    };
    for (const [nom, modifs] of Object.entries(essais)) {
      try {
        chargerConfig({ ...envPour(port, "refus"), ...modifs }, BACKEND);
        p.push(nom + " : accepté");
      } catch (e) {
        if (!(e instanceof ErreurConfiguration)) p.push(nom + " : " + e.name);
        else if (Object.values(SECRETS).concat([HACHAGE_ADMIN]).some((s) => e.message.includes(s))) p.push(nom + " : un secret apparaît dans le message");
      }
    }
    const lance = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(BACKEND, "serveur.js")], {
      env: { PATH: process.env.PATH, NODE_ENV: "developpement", ADMIN_CODE_HASH: "", SAUVEGARDE_CLE: "" }, cwd: dossier, encoding: "utf8", timeout: 20000
    });
    if (lance.status !== 1 || !/démarrage refusé/.test(lance.stderr) || !/ADMIN_CODE_HASH/.test(lance.stderr) || !/SAUVEGARDE_CLE/.test(lance.stderr)) p.push("serveur.js sans .env : statut " + lance.status);
    controle("⑰", "le serveur refuse de démarrer sans secrets valides (code admin haché, clé de sauvegarde distincte, valeurs d'exemple refusées)", !p.length,
      p.join(" ; ") || Object.keys(essais).length + " configurations refusées (" + Object.keys(essais).join(", ") + "), aucun secret dans les messages ; serveur.js sans .env → code 1, « démarrage refusé », ADMIN_CODE_HASH et SAUVEGARDE_CLE cités");
  }

  /* ---------- H.4 n°8 / ⑥ : blocage progressif tenu par le serveur ---------- */
  {
    const p = [];
    const a = await creerCompte();
    const essai = (code, appareil = appareilAleatoire()) => appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code, appareil }, ip: nouvelleIp() });
    const statuts = [];
    for (let i = 0; i < 5; i += 1) statuts.push((await essai("111111")).statut);
    const sixieme = await essai("258071");
    const retry = Number(sixieme.entetes.get("retry-after"));
    if (statuts.join() !== "401,401,401,401,401" || sixieme.statut !== 429 || !(retry > 25 && retry <= 30)) p.push("5 échecs puis bon code : " + statuts.join() + " / " + sixieme.statut + " Retry-After " + retry);
    const enBase = base.prepare("SELECT echecs, jusqu FROM blocages WHERE cle LIKE 'connexion:%' ORDER BY maj_le DESC LIMIT 1").get();
    if (!enBase || enBase.echecs !== 5) p.push("compteur absent de la base");
    const autreAppareil = await essai("258071", appareilAleatoire());
    if (autreAppareil.statut !== 429) p.push("données du téléphone effacées (nouvel appareil) : blocage contourné");
    decalage.ms += 31000;
    const sixiemeEchec = await essai("111111");
    const r2 = await essai("258071");
    const retry2 = Number(r2.entetes.get("retry-after"));
    if (sixiemeEchec.statut !== 401 || sixiemeEchec.json.reessayerDans !== 60 || r2.statut !== 429 || !(retry2 > 55 && retry2 <= 60)) p.push("6e échec : blocage non progressif (" + sixiemeEchec.statut + ", " + JSON.stringify(sixiemeEchec.json) + ")");
    decalage.ms += 61000;
    await essai("111111");
    const r3 = await essai("258071");
    if (Number(r3.entetes.get("retry-after")) < 290) p.push("7e échec : 5 min attendues");
    decalage.ms += 301000;
    const ok = await essai("258071", a.appareil);
    const remis = base.prepare("SELECT COUNT(*) AS n FROM blocages WHERE cle = ?").get("connexion:" + (await import("node:crypto")).createHash("sha256").update(a.telephone).digest("hex")).n;
    if (ok.statut !== 200 || remis !== 0) p.push("après l'attente, le bon code doit ouvrir et remettre le compteur à zéro");
    decalage.ms -= 393000;
    controle("H4-8", "6 mauvais codes → blocage progressif 30 s → 1 min → 5 min, compteur EN BASE (effacer les données du téléphone ne débloque pas)", !p.length,
      p.join(" ; ") || "5 échecs → 429 + Retry-After 30 ; nouvel appareil toujours bloqué ; 6e échec → 60 s ; 7e → 300 s ; bon code après l'attente → 200 et compteur effacé");
  }

  /* ---------- H.4 n°2 / A.2 : limite gratuite tenue par le serveur ---------- */
  {
    const p = [];
    const a = await creerCompte();
    const statuts = [];
    for (let i = 1; i <= 6; i += 1) statuts.push((await appel("POST", "/api/devis", { ...sur(a), corps: devis(a, "d6-" + i) })).statut);
    const sixieme = await appel("POST", "/api/devis", { ...sur(a), corps: devis(a, "d6-7") });
    if (statuts.join() !== "201,201,201,201,201,403" || sixieme.json.erreur !== "limite_atteinte" || sixieme.json.quota.utilises !== 5) p.push("6 devis : " + statuts.join());
    await appel("DELETE", "/api/devis/d6-1", sur(a));
    if ((await appel("POST", "/api/devis", { ...sur(a), corps: devis(a, "d6-8") })).statut !== 403) p.push("supprimer un devis rend une place (contournement)");
    const b = await creerCompte();
    const rafale = await Promise.all(Array.from({ length: 10 }, (_, i) => appel("POST", "/api/devis", { ...sur(b), corps: devis(b, "rafale-" + i) })));
    const crees = rafale.filter((r) => r.statut === 201).length;
    if (crees !== 5 || base.prepare("SELECT COUNT(*) AS n FROM devis WHERE electricien_id = ?").get(b.id).n !== 5) p.push("10 créations simultanées : " + crees + " acceptées");
    const horsLigne = await sync(a, { operations: [1, 2, 3, 4, 5, 6].map((i) => op("devis", "hl-" + i, devis(a, "hl-" + i))) });
    const acceptes = horsLigne.json.resultats.filter((r) => r.ok).length;
    if (acceptes !== 5 || horsLigne.json.resultats[5].erreur !== "limite_atteinte") p.push("devis hors ligne au-delà de la limite : " + acceptes + " acceptés (tolérance 5)");
    /* Liaison d'un téléphone qui avait déjà 12 devis (mois passés) : tous acceptés, rangés dans leur mois. */
    const lie = await creerCompte();
    const passe = (jours) => new Date(horloge() - jours * JOUR_MS).toISOString();
    base.prepare("UPDATE electriciens SET cree_le = ? WHERE id = ?").run(new Date(horloge() - 3600000).toISOString(), lie.id);
    const historique = await sync(lie, { operations: Array.from({ length: 12 }, (_, i) => op("devis", "hist-" + i, devis(lie, "hist-" + i, { creeLe: passe(40 + i) }))) });
    if (!historique.json.resultats.every((r) => r.ok) || historique.json.quota.utilises !== 0) p.push("historique d'avant la liaison : " + JSON.stringify(historique.json.quota));
    base.prepare("UPDATE electriciens SET cree_le = ? WHERE id = ?").run(new Date(horloge() - 2 * JOUR_MS).toISOString(), lie.id);
    const antidates = await sync(lie, { operations: Array.from({ length: 11 }, (_, i) => op("devis", "anti-" + i, devis(lie, "anti-" + i, { creeLe: passe(60) }))) });
    if (antidates.json.resultats.filter((r) => r.ok).length !== 10) p.push("devis antidatés après 24 h : " + antidates.json.resultats.filter((r) => r.ok).length + " acceptés (5 + tolérance 5 attendus)");
    const pro = await creerCompte();
    base.prepare("UPDATE electriciens SET formule = 'mensuel', abonne_depuis = ?, abonne_jusqu = ? WHERE id = ?").run(maintenantIso(), new Date(horloge() + 10 * JOUR_MS).toISOString(), pro.id);
    for (let i = 1; i <= 7; i += 1) if ((await appel("POST", "/api/devis", { ...sur(pro), corps: devis(pro, "pro-" + i) })).statut !== 201) p.push("Pro bloqué au devis " + i);
    controle("H4-2", "6 devis en gratuit → 403 au 6e (compteur en base, transaction) ; suppression ne rend pas de place ; hors ligne : travail conservé dans une tolérance de 5", !p.length,
      p.join(" ; ") || "201 ×5 puis 403 « limite_atteinte » (quota 5/5) ; supprimer puis recréer → 403 ; 10 créations simultanées → exactement 5 ; 6 devis écrits hors ligne → 5 acceptés et marqués, le 6e refusé ; liaison d'un téléphone avec 12 anciens devis → tous gardés, rangés dans leur mois ; antidater après 24 h ne contourne rien ; Pro : illimité");
  }

  /* ---------- A.3 : plafonds clients / catalogue ---------- */
  {
    const p = [];
    const a = await creerCompte();
    for (let lot = 0; lot < 4; lot += 1) {
      const ops = Array.from({ length: 50 }, (_, i) => op("client", "c" + (lot * 50 + i), client(a, "c" + (lot * 50 + i))));
      await sync(a, { operations: ops.slice(0, 50) });
    }
    const plein = await sync(a, { operations: [op("client", "c-200", client(a, "c-200"))] });
    if (base.prepare("SELECT COUNT(*) AS n FROM clients WHERE electricien_id = ?").get(a.id).n !== 200 || plein.json.resultats[0].erreur !== "limite_clients") p.push("201e client accepté en gratuit");
    const articles = (n) => Array.from({ length: n }, (_, i) => ({ ref: "perso-" + i.toString(16).padStart(8, "0"), designation: "Article " + i, unite: "u", categorie: "autres", fournisseurs: [{ nom: "Quincaillerie", prix: 1000 }], choisi: 0 }));
    const trop = await appel("PUT", "/api/catalogue", { ...sur(a), corps: { catalogue: { articles: articles(301), mainOeuvre: { points: {}, journee: null } } } });
    const assez = await appel("PUT", "/api/catalogue", { ...sur(a), corps: { catalogue: { articles: articles(300), mainOeuvre: { points: {}, journee: 15000 } } } });
    const relu = await appel("GET", "/api/catalogue", sur(a));
    if (trop.statut !== 403 || assez.statut !== 200 || relu.json.catalogue.articles.length !== 300 || relu.json.catalogue.mainOeuvre.journee !== 15000) p.push("catalogue : 301 → " + trop.statut + ", 300 → " + assez.statut);
    const inconnu = await appel("PUT", "/api/catalogue", { ...sur(a), corps: { catalogue: { articles: [{ ...articles(1)[0], ref: "article-invente" }], mainOeuvre: { points: {}, journee: null } } } });
    if (inconnu.statut !== 400) p.push("article hors catalogue accepté");
    controle("A3", "plafonds en base : 200 clients et 300 articles en gratuit ; catalogue relu identique (tables catalogue + fournisseurs)", !p.length,
      p.join(" ; ") || "201e client → « limite_clients » ; 301 articles → 403, 300 → 200 et relus (main-d'œuvre comprise) ; référence inventée → 400");
  }

  /* ---------- H.4 n°1 / ㉛ : abonnement modifié en local ---------- */
  {
    const p = [];
    const a = await creerCompte();
    const faux = signerJetonAbonnement(generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey, { compteId: a.compteId, telephone: a.telephone, formule: "vie", debut: maintenantIso(), fin: null, emisLe: maintenantIso() });
    const r1 = await sync(a, { abonnement: faux });
    if (r1.statut !== 409 || r1.json.erreur !== "abonnement_invalide" || r1.json.abonnement !== null || r1.json.quota.formule !== "gratuit") p.push("jeton signé par une autre clé : " + r1.statut);
    const vrai = signerJetonAbonnement(config.clePrivee, { compteId: a.compteId, telephone: a.telephone, formule: "mensuel", debut: maintenantIso(), fin: maintenantIso(), emisLe: maintenantIso() });
    const [corps, signature] = vrai.split(".");
    const retouche = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corps, "base64url").toString()), formule: "vie", fin: null })).toString("base64url") + "." + signature;
    const r2 = await sync(a, { abonnement: retouche });
    if (r2.statut !== 409) p.push("formule retouchée dans le jeton : " + r2.statut);
    const b = await creerCompte();
    const r3 = await sync(b, { abonnement: vrai });
    if (r3.statut !== 409) p.push("jeton authentique d'un autre compte accepté");
    const r4 = await sync(a, { abonnement: vrai });
    if (r4.statut !== 200 || r4.json.quota.formule !== "gratuit") p.push("jeton authentique : " + r4.statut);
    if (activites("abonnement_falsifie").length < 3) p.push("falsifications non journalisées");
    controle("H4-1", "formule modifiée dans le stockage local → refusée (409), l'état réel est renvoyé : « gratuit » (㉛)", !p.length,
      p.join(" ; ") || "jeton signé par une autre clé, formule retouchée, jeton d'un autre compte → 409 « abonnement_invalide » + abonnement nul + quota gratuit ; jeton authentique → 200 ; 3 lignes « abonnement_falsifie » au journal");
  }

  /* ---------- Synchronisation bidirectionnelle + ⑰ réseau coupé (rejeu idempotent) ---------- */
  {
    const p = [];
    const a = await creerCompte();
    const app2 = appareilAleatoire();
    const c2 = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: app2 }, ip: nouvelleIp() });
    const operations = [
      op("devis", "sync-1", devis(a, "sync-1")), op("client", "sync-c1", client(a, "sync-c1")), op("chantier", "chantier-sync-0001", chantier(a, "chantier-sync-0001")),
      op("profil", "profil", { nom: "Awa K.", entreprise: "BRG Électro+", ville: "Koudougou", pays: "BF", devise: "XOF", conditions: "Acompte 50 %", photo: "", logo: "" })
    ];
    /* Coupure : un relais transmet la requête puis ferme la connexion AVANT la réponse. */
    const relais = createServer((req, res) => {
      const morceaux = [];
      req.on("data", (m) => morceaux.push(m));
      req.on("end", () => {
        const sortie = requeteHttp({ host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers }, (rep) => { rep.resume(); rep.on("end", () => res.socket.destroy()); });
        sortie.end(Buffer.concat(morceaux));
      });
    });
    await new Promise((r) => relais.listen(0, "127.0.0.1", r));
    const coupe = await fetch("http://127.0.0.1:" + relais.address().port + "/api/sync", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + a.jeton, "X-Appareil": a.appareil, "X-Forwarded-For": a.ip },
      body: JSON.stringify({ curseur: 0, abonnement: "", operations })
    }).then(() => "réponse reçue", () => "réseau coupé");
    relais.close();
    if (coupe !== "réseau coupé") p.push("la coupure n'a pas été simulée");
    const rejeu = await sync(a, { operations });
    const nDevis = base.prepare("SELECT COUNT(*) AS n FROM devis WHERE electricien_id = ?").get(a.id).n;
    const quotaApres = rejeu.json && rejeu.json.quota.utilises;
    if (rejeu.statut !== 200 || !rejeu.json.resultats.every((r) => r.ok) || nDevis !== 1 || quotaApres !== 1) p.push("rejeu après coupure : " + nDevis + " devis, quota " + quotaApres);
    const tire = await sync(a, { curseur: 0 }, c2.json.jeton, app2);
    const ch = tire.json.changements;
    if (ch.devis.length !== 1 || ch.clients.length !== 1 || ch.chantiers.length !== 1 || !ch.profil || ch.profil.ville !== "Koudougou" || ch.devis[0].donnees.total !== 1250000) p.push("le 2e appareil ne reçoit pas tout");
    const propres = await sync(a, { curseur: 0 });
    if (propres.json.changements.devis.length !== 0) p.push("l'appareil reçoit ses propres écritures");
    const ancien = new Date(horloge() - 3600000).toISOString();
    const lww = await sync(a, { operations: [op("devis", "sync-1", devis(a, "sync-1", { total: 5 }), "ecrire", ancien)] }, c2.json.jeton, app2);
    if (!lww.json.resultats[0].ignore || base.prepare("SELECT total FROM devis WHERE uid = 'sync-1'").get().total !== 1250000) p.push("une écriture plus ancienne écrase la plus récente");
    await sync(a, { operations: [op("devis", "sync-1", null, "supprimer")] });
    const suppr = await sync(a, { curseur: tire.json.curseur }, c2.json.jeton, app2);
    if (!suppr.json.changements.devis.some((d) => d.id === "sync-1" && d.supprime)) p.push("suppression non propagée");
    const ops60 = Array.from({ length: 60 }, (_, i) => op("client", "page-" + i, client(a, "page-" + i)));
    await sync(a, { operations: ops60 });
    await sync(a, { operations: Array.from({ length: 60 }, (_, i) => op("client", "page2-" + i, client(a, "page2-" + i))) });
    let curseur = 0;
    let recus = 0;
    let tours = 0;
    for (; tours < 10; tours += 1) {
      const r = await sync(a, { curseur }, c2.json.jeton, app2);
      recus += r.json.changements.clients.length;
      curseur = r.json.curseur;
      if (!r.json.encore) break;
    }
    if (recus < 121 || tours < 1) p.push("pagination : " + recus + " clients reçus en " + (tours + 1) + " lots");
    const invalide = await sync(a, { operations: [op("devis", "x1", { ...devis(a, "x1"), script: "<script>" })] });
    if (invalide.json.resultats[0].erreur !== "donnees_invalides") p.push("champ inconnu dans un devis accepté");
    const tropOps = await sync(a, { operations: Array.from({ length: 61 }, (_, i) => op("client", "t" + i, client(a, "t" + i))) });
    if (tropOps.statut !== 400) p.push("61 opérations en un lot acceptées");
    controle("SY", "synchronisation : envoi puis réception, 2e appareil complet, dernière écriture gagnante, suppressions, pagination ; coupure réseau pendant l'envoi → rejeu sans doublon (⑰)", !p.length,
      p.join(" ; ") || "réponse perdue par coupure, rejeu identique → 1 devis, quota 1 ; 2e appareil reçoit devis, client, chantier, profil ; pas d'écho de ses propres écritures ; écriture plus ancienne ignorée ; suppression propagée ; 121 clients reçus par lots de 100 ; champ inconnu → « donnees_invalides » ; 61 opérations → 400");
  }

  /* ---------- Code d'activation ---------- */
  let compteSuspendu;
  {
    const p = [];
    const connexion = await appel("POST", "/api/admin/connexion", { corps: { code: CODE_ADMIN, appareil: APPAREIL_ADMIN }, ip: "10.200.0.1" });
    jetonAdmin = connexion.json && connexion.json.jeton;
    const codes = await admin("POST", "/api/admin/codes", { formule: "mensuel", nombre: 2, validiteJours: 30, motif: "Lancement Ouagadougou" });
    if (codes.statut !== 201 || codes.json.codes.length !== 2) p.push("génération → " + codes.statut);
    const enClair = base.prepare("SELECT COUNT(*) AS n FROM codes_activation WHERE empreinte = ?").get(codes.json.codes[0]).n;
    if (enClair) p.push("code stocké en clair");
    const a = await creerCompte();
    const active = await appel("POST", "/api/abonnement/activer-code", { ...sur(a), corps: { code: codes.json.codes[0] } });
    if (active.statut !== 200 || active.json.formule !== "mensuel" || !active.json.abonnement) p.push("activation → " + active.statut);
    const b = await creerCompte();
    const reutilise = await appel("POST", "/api/abonnement/activer-code", { ...sur(b), corps: { code: codes.json.codes[0] } });
    const invente = await appel("POST", "/api/abonnement/activer-code", { ...sur(b), corps: { code: "BP-AAAA-BBBB-CCCC" } });
    if (reutilise.statut !== 404 || invente.statut !== 404 || reutilise.texte !== invente.texte) p.push("code réutilisé / inventé : " + reutilise.statut + " / " + invente.statut);
    const court = await admin("POST", "/api/admin/codes", { formule: "semaine", nombre: 1, validiteJours: 1, motif: "Essai expiration" });
    decalage.ms += 2 * JOUR_MS;
    const expire = await appel("POST", "/api/abonnement/activer-code", { ...sur(b), corps: { code: court.json.codes[0] } });
    decalage.ms -= 2 * JOUR_MS;
    const second = await appel("POST", "/api/abonnement/activer-code", { ...sur(b), corps: { code: codes.json.codes[1] } });
    if (second.statut !== 200) p.push("second code valide refusé : " + second.statut);
    if (expire.statut !== 404) p.push("code expiré accepté");
    compteSuspendu = a;
    controle("CA", "codes d'activation : affichés une fois, stockés en empreinte HMAC, usage unique, expirés refusés", !p.length,
      p.join(" ; ") || "2 codes générés ; base sans le code en clair ; activation → mensuel + jeton signé ; réutilisé et inventé → même 404 ; expiré → 404 ; second code valide → 200");
  }

  /* ---------- Administration (H.4 n°10) ---------- */
  {
    const p = [];
    const ipAttaque = "10.201.0.1";
    const sansCode = await appel("GET", "/api/admin/stats", { ip: ipAttaque, appareil: appareilAleatoire() });
    const fauxJeton = await appel("GET", "/api/admin/electriciens", { ip: ipAttaque, appareil: appareilAleatoire(), jeton: "adm.faux.faux" });
    if (sansCode.statut !== 401 || fauxJeton.statut !== 401 || /telephone|electriciens"/.test(sansCode.texte + fauxJeton.texte)) p.push("écran admin sans code : " + sansCode.statut + " / " + fauxJeton.statut);
    const essais = [];
    for (let i = 0; i < 4; i += 1) essais.push((await appel("POST", "/api/admin/connexion", { corps: { code: "1357924680" + i, appareil: appareilAleatoire() }, ip: ipAttaque })).statut);
    const bonBloque = await appel("POST", "/api/admin/connexion", { corps: { code: CODE_ADMIN, appareil: appareilAleatoire() }, ip: ipAttaque });
    if (essais.join() !== "401,401,429,429" || bonBloque.statut !== 429 || Number(bonBloque.entetes.get("retry-after")) < 3500 || !activites("admin_bloque").length) p.push("3 échecs admin : " + essais.join() + " puis " + bonBloque.statut);
    const volé = await appel("GET", "/api/admin/stats", { jeton: jetonAdmin, appareil: appareilAleatoire(), ip: "10.200.0.1" });
    if (volé.statut !== 401) p.push("jeton admin utilisé depuis un autre appareil → " + volé.statut);
    const stats = await admin("GET", "/api/admin/stats");
    if (stats.statut !== 200 || Object.keys(stats.json)[0] !== "anomalies" || typeof stats.json.electriciens.total !== "number") p.push("stats : " + stats.statut);
    const piege = await creerCompte({ nom: "=HYPERLINK(\"http://x\",\"clic\")" });
    const recherche = await admin("GET", "/api/admin/electriciens?q=" + encodeURIComponent("%' OR 1=1 --"));
    if (recherche.statut !== 200 || recherche.json.electriciens.length !== 0) p.push("recherche piégée : " + (recherche.json && recherche.json.electriciens.length) + " résultats");
    const parNumero = await admin("GET", "/api/admin/electriciens?q=" + encodeURIComponent(piege.telephone));
    if (parNumero.json.electriciens.length !== 1 || /hash|sel|empreinte/.test(Object.keys(parNumero.json.electriciens[0]).join())) p.push("liste admin");
    const csv = await admin("GET", "/api/admin/electriciens?format=csv");
    if (!csv.texte.includes("\"'=HYPERLINK(") || /code_hash|empreinte/.test(csv.texte)) p.push("export CSV : formule non neutralisée");
    const a = compteSuspendu;
    const sansConfirmation = await admin("POST", "/api/admin/suspendre", { electricienId: a.id, suspendu: true, motif: "Fraude au code", confirmation: "+22600000000" });
    const suspendu = await admin("POST", "/api/admin/suspendre", { electricienId: a.id, suspendu: true, motif: "Fraude au code", confirmation: a.telephone });
    const bloque = await appel("GET", "/api/profil", sur(a));
    const connexionSuspendue = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: a.appareil }, ip: nouvelleIp() });
    await admin("POST", "/api/admin/suspendre", { electricienId: a.id, suspendu: false, motif: "Vérification faite", confirmation: a.telephone });
    const retour = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: a.appareil }, ip: nouvelleIp() });
    if (sansConfirmation.statut !== 400 || suspendu.statut !== 200 || bloque.statut !== 401 || connexionSuspendue.statut !== 403 || retour.statut !== 200) p.push("suspension : " + [sansConfirmation.statut, suspendu.statut, bloque.statut, connexionSuspendue.statut, retour.statut].join("/"));
    const g = await creerCompte();
    const offre = await admin("POST", "/api/admin/offrir-jours", { electricienId: g.id, jours: 7, motif: "Geste commercial", confirmation: g.telephone });
    const pro = await appel("GET", "/api/profil", sur(g));
    const retrait = await admin("POST", "/api/admin/offrir-jours", { electricienId: g.id, jours: -7, motif: "Erreur de compte", confirmation: g.telephone });
    const gratuit = await appel("GET", "/api/profil", sur(g));
    if (offre.json.formule !== "mensuel" || !pro.json.abonnement || retrait.json.formule !== "gratuit" || gratuit.json.abonnement !== null) p.push("offrir / retirer des jours");
    const journal = await admin("GET", "/api/admin/journal");
    const actions = new Set(journal.json.activites.map((l) => l.action));
    for (const attendue of ["admin_connexion", "admin_codes", "suspension", "reactivation", "jours_offerts", "jours_retires"]) if (!actions.has(attendue)) p.push("journal sans « " + attendue + " »");
    if (journal.json.activites.length > 100) p.push("journal : plus de 100 lignes");
    const sauvegarde = await admin("GET", "/api/admin/sauvegarde");
    const interdits = ["code_hash", "code_sel", "empreinte", "carte_client", "secret_notification", "donnees_brutes", "cle_idempotence", "blocages", "version_session"];
    const presents = interdits.filter((m) => sauvegarde.texte.includes("\"" + m + "\""));
    const hachages = base.prepare("SELECT code_hash FROM electriciens WHERE code_hash IS NOT NULL").all().some((l) => sauvegarde.texte.includes(l.code_hash));
    if (sauvegarde.statut !== 200 || presents.length || hachages || !sauvegarde.json.tables.electriciens.length) p.push("sauvegarde admin : " + presents.join(", ") + (hachages ? " + hachage" : ""));
    decalage.ms += 2 * 3600000 + 1000;
    const expire = await admin("GET", "/api/admin/stats");
    decalage.ms -= 2 * 3600000 + 1000;
    if (expire.statut !== 401) p.push("jeton admin encore valable après 2 h");
    controle("H4-10", "écran admin sans le code → aucun accès, aucune donnée ; 3 échecs → 1 h de blocage ; jeton 2 h lié à l'appareil ; confirmation + motif ; CSV neutralisé ; sauvegarde sans secrets (㉑)", !p.length,
      p.join(" ; ") || "sans code / faux jeton → 401 sans donnée ; 3 échecs → 429 Retry-After 3 600 (même avec le bon code) ; jeton admin d'un autre appareil → 401 ; stats (anomalies en tête) ; recherche « %' OR 1=1 -- » → 0 résultat ; CSV « '=HYPERLINK » ; suspension sans confirmation → 400, suspendu → jetons invalidés (401) et connexion 403, réactivé → connexion 200 ; ±7 jours ; journal complet ; sauvegarde sans hachage, sel, empreinte, carte, secret ni donnée brute ; jeton expiré après 2 h");
  }

  /* ---------- ⑱ : limitation de débit (limites réelles) ---------- */
  {
    const p = [];
    const sur2 = (o) => ({ ...o, portCible: portLimites });
    const ipC = "10.50.0.1";
    const identites = [identite(), identite(), identite(), identite()];
    const creations = [];
    for (const donnees of identites) creations.push(await appel("POST", "/api/compte/creer", sur2({ corps: donnees, ip: ipC })));
    const r4 = creations[3];
    if (creations.slice(0, 3).some((r) => r.statut !== 201) || r4.statut !== 429 || !(Number(r4.entetes.get("retry-after")) > 3500)) p.push("création : " + creations.map((r) => r.statut).join());
    const ipL = "10.50.0.2";
    const echecs = [];
    for (let i = 0; i < 6; i += 1) echecs.push((await appel("POST", "/api/compte/connexion", sur2({ corps: { telephone: "+226650000" + String(10 + i), code: "111111", appareil: appareilAleatoire() }, ip: ipL }))).statut);
    if (echecs.join() !== "401,401,401,401,401,429") p.push("5 échecs / 15 min par IP : " + echecs.join());
    const numero = "+22665000099";
    const parNumero = [];
    for (let i = 0; i < 6; i += 1) parNumero.push((await appel("POST", "/api/compte/connexion", sur2({ corps: { telephone: numero, code: "111111", appareil: appareilAleatoire() }, ip: "10.51.0." + (i + 1) }))).statut);
    if (parNumero.join() !== "401,401,401,401,401,429") p.push("5 échecs / 15 min par numéro (IP différentes) : " + parNumero.join());
    const activations = [];
    for (let i = 0; i < 6; i += 1) activations.push((await appel("POST", "/api/abonnement/activer-code", sur2({ jeton: creations[0].json.jeton, appareil: identites[0].appareil, corps: { code: "BP-AAAA-BBBB-CCCC" }, ip: "10.52.0." + (i + 1) }))).statut);
    if (activations.join() !== "404,404,404,404,404,429") p.push("5 codes / h par compte : " + activations.join());
    const paiements = [];
    for (let i = 0; i < 11; i += 1) paiements.push((await appel("POST", "/api/paiements/initier", sur2({ jeton: creations[1].json.jeton, appareil: identites[1].appareil, corps: { formule: "inconnue" }, ip: "10.53.0." + (i + 1) }))).statut);
    if (paiements[10] !== 429 || paiements[9] === 429) p.push("10 paiements / h : " + paiements.join());
    const adm = [];
    for (let i = 0; i < 11; i += 1) adm.push((await appel("POST", "/api/admin/connexion", sur2({ corps: { code: "97531864" + i, appareil: appareilAleatoire() }, ip: "10.50.0.4" }))).statut);
    if (adm[10] !== 429) p.push("admin : " + adm.join());
    const ipG = "10.50.0.5";
    let premier429 = 0;
    for (let i = 1; i <= 125 && !premier429; i += 1) if ((await appel("GET", "/api/sante", sur2({ ip: ipG }))).statut === 429) premier429 = i;
    if (premier429 !== 121) p.push("général : premier 429 à l'appel " + premier429);
    controle("⑱", "limitation de débit active (429 + Retry-After) : 3 créations/h, 5 échecs de connexion/15 min par IP ET par numéro, 5 codes/h, 10 paiements/h, 10 connexions admin/h, 120 appels/min", !p.length,
      p.join(" ; ") || "4e création → 429 (Retry-After ≈ 3 600) ; 6e échec depuis une IP → 429 ; 6e échec sur un numéro depuis 6 IP → 429 ; 6e code d\'activation → 429 ; 11e paiement → 429 ; 11e connexion admin → 429 ; 121e appel/min → 429 ; limites : " + Object.entries(LIMITES).map(([k, [n, f]]) => k + " " + n + "/" + (f / 60000) + " min").join(", "));
  }

  /* ---------- ⑲ ⑳ : en-têtes et CORS ---------- */
  {
    const p = [];
    const reponses = [await appel("GET", "/api/sante"), await appel("GET", "/api/profil"), await appel("POST", "/api/compte/connexion", { corps: {} }), await appel("GET", "/inexistant")];
    for (const r of reponses) {
      const e = r.entetes;
      if (!/preload/.test(e.get("strict-transport-security") || "") || e.get("x-content-type-options") !== "nosniff" || e.get("x-frame-options") !== "DENY"
        || e.get("referrer-policy") !== "no-referrer" || !e.get("content-security-policy") || !/camera=\(\)/.test(e.get("permissions-policy") || "") || e.get("cache-control") !== "no-store") p.push("en-têtes manquants (" + r.statut + ")");
    }
    const pre = await appel("OPTIONS", "/api/devis/x", { entetes: { Origin: "capacitor://localhost", "Access-Control-Request-Method": "PUT" } });
    if (pre.statut !== 204 || pre.entetes.get("access-control-allow-origin") !== "capacitor://localhost" || !/PUT/.test(pre.entetes.get("access-control-allow-methods")) || !/DELETE/.test(pre.entetes.get("access-control-allow-methods"))
      || !/X-Appareil/.test(pre.entetes.get("access-control-allow-headers"))) p.push("pré-vol capacitor://localhost");
    const etranger = await appel("GET", "/api/sante", { entetes: { Origin: "https://pirate.example" } });
    if (etranger.statut !== 403 || etranger.entetes.get("access-control-allow-origin")) p.push("origine étrangère acceptée");
    try {
      chargerConfig({ ...envPour(port, "x"), NODE_ENV: "production", ORIGINES_AUTORISEES: "*" }, BACKEND);
      p.push("« * » accepté en production");
    } catch { /* attendu */ }
    controle("⑲⑳", "en-têtes de sécurité sur toutes les réponses (HSTS preload, nosniff, DENY, no-referrer, CSP, Permissions-Policy, no-store) ; CORS limité, capacitor://localhost explicite, « * » refusé", !p.length,
      p.join(" ; ") || "4 réponses (200, 401, 400, 404) complètes ; pré-vol de l'application Android → 204 (PUT, DELETE, X-Appareil) ; origine étrangère → 403 ; « * » refusé au démarrage en production");
  }

  /* ---------- ㉒ : journal d'audit ---------- */
  {
    const attendues = ["compte_cree", "connexion", "connexion_echec", "changement_code", "deconnexion_partout", "appareil_deconnecte", "devis_cree", "devis_refuse_limite",
      "abonnement_active", "abonnement_falsifie", "admin_connexion", "admin_echec", "admin_bloque", "suspension", "reactivation", "jours_offerts", "admin_codes", "admin_sauvegarde", "admin_export_csv"];
    const manquantes = attendues.filter((a) => !activites(a).length);
    const recent = base.prepare("SELECT id FROM activites ORDER BY id DESC LIMIT 1").get().id;
    let suppressionRefusee = false;
    try { base.prepare("DELETE FROM activites WHERE id = ?").run(recent); } catch { suppressionRefusee = true; }
    const sansSecret = !base.prepare("SELECT COUNT(*) AS n FROM activites WHERE details LIKE '%258071%' OR details LIKE ?").get("%" + CODE_ADMIN + "%").n;
    controle("㉒", "le journal d'audit enregistre les actions listées, sans code ni secret, et refuse la suppression avant 12 mois", !manquantes.length && suppressionRefusee && sansSecret,
      manquantes.length ? "absentes : " + manquantes.join(", ") : attendues.length + " actions présentes (" + attendues.join(", ") + ") ; DELETE d'une ligne récente refusé par déclencheur ; aucun code dans les détails");
  }

  /* ---------- Suppression du compte ---------- */
  {
    const p = [];
    const a = await creerCompte();
    await appel("POST", "/api/devis", { ...sur(a), corps: devis(a, "avant-suppression") });
    const mauvais = await appel("DELETE", "/api/compte", { ...sur(a), corps: { code: "999999", confirmation: "SUPPRIMER" } });
    const sansMot = await appel("DELETE", "/api/compte", { ...sur(a), corps: { code: a.code, confirmation: "oui" } });
    const ok = await appel("DELETE", "/api/compte", { ...sur(a), corps: { code: a.code, confirmation: "SUPPRIMER" } });
    const reste = base.prepare("SELECT COUNT(*) AS n FROM devis WHERE electricien_id = ?").get(a.id).n;
    const ligne = base.prepare("SELECT telephone, nom, code_hash FROM electriciens WHERE id = ?").get(a.id);
    const apres = await appel("GET", "/api/profil", sur(a));
    const reconnexion = await appel("POST", "/api/compte/connexion", { corps: { telephone: a.telephone, code: a.code, appareil: a.appareil }, ip: nouvelleIp() });
    const recreation = await appel("POST", "/api/compte/creer", { corps: identite({ telephone: a.telephone }), ip: nouvelleIp() });
    if (mauvais.statut !== 401 || sansMot.statut !== 400 || ok.statut !== 200 || reste !== 0 || ligne.telephone === a.telephone || ligne.code_hash !== null || apres.statut !== 401 || reconnexion.statut !== 401 || recreation.statut !== 201) {
      p.push([mauvais.statut, sansMot.statut, ok.statut, reste, apres.statut, reconnexion.statut, recreation.statut].join("/"));
    }
    controle("SC", "suppression du compte : code + mot « SUPPRIMER » exigés, données effacées, ligne anonymisée (justificatifs de paiement gardés), numéro réutilisable", !p.length,
      p.join(" ; ") || "mauvais code → 401 ; sans confirmation → 400 ; supprimé → devis effacés, numéro et hachage retirés, jeton 401, connexion 401 ; le numéro peut recréer un compte");
  }

  /* ---------- Sauvegarde quotidienne chiffrée ---------- */
  {
    const p = [];
    const fichier = app.sauvegardes.sauvegarder();
    const brut = readFileSync(fichier);
    const mode = statSync(fichier).mode & 0o777;
    if (brut.includes(Buffer.from("SQLite format 3")) || brut.includes(Buffer.from(compteRef.telephone))) p.push("fichier lisible en clair");
    if (mode !== 0o600) p.push("droits " + mode.toString(8));
    const clair = dechiffrer(SECRETS.SAUVEGARDE_CLE, brut);
    if (!clair.subarray(0, 15).equals(Buffer.from("SQLite format 3"))) p.push("déchiffrement : pas une base SQLite");
    const restauree = join(dossier, "restauree.sqlite");
    writeFileSync(restauree, clair);
    const db = new DatabaseSync(restauree, { readOnly: true });
    const n = db.prepare("SELECT COUNT(*) AS n FROM electriciens").get().n;
    db.close();
    if (n < 10) p.push("base restaurée incomplète (" + n + ")");
    const modifie = Buffer.from(brut);
    modifie[modifie.length - 5] ^= 1;
    let refusModif = false;
    try { dechiffrer(SECRETS.SAUVEGARDE_CLE, modifie); } catch { refusModif = true; }
    let refusCle = false;
    try { dechiffrer("ab".repeat(32), brut); } catch { refusCle = true; }
    if (!refusModif || !refusCle) p.push("fichier modifié ou mauvaise clé acceptés");
    const outil = spawnSync(process.execPath, [join(BACKEND, "outils", "dechiffrer-sauvegarde.mjs"), fichier, join(dossier, "outil.sqlite")], { env: { PATH: process.env.PATH, SAUVEGARDE_CLE: SECRETS.SAUVEGARDE_CLE }, encoding: "utf8" });
    if (outil.status !== 0 || !existsSync(join(dossier, "outil.sqlite"))) p.push("outil de restauration : " + outil.stderr);
    for (let i = 0; i < 32; i += 1) { decalage.ms += 86400000; app.sauvegardes.sauvegarder(); }
    decalage.ms -= 32 * 86400000;
    if (app.sauvegardes.fichiers().length !== 30) p.push("rotation : " + app.sauvegardes.fichiers().length + " fichiers gardés");
    controle("SV", "sauvegarde quotidienne chiffrée (VACUUM INTO → AES-256-GCM, 0600, 30 gardées) et restauration vérifiée", !p.length,
      p.join(" ; ") || "fichier sans « SQLite format 3 » ni numéro en clair, droits 600 ; déchiffré → base valide (" + n + " électriciens) ; 1 bit modifié ou mauvaise clé → refus ; outils/dechiffrer-sauvegarde.mjs OK ; 33 sauvegardes → 30 gardées");
  }

  /* ---------- Migration d'une base de l'étape 12 ---------- */
  {
    const p = [];
    const chemin = join(dossier, "etape12.sqlite");
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec(`CREATE TABLE electriciens (id INTEGER PRIMARY KEY AUTOINCREMENT, compte_id TEXT NOT NULL UNIQUE, nom TEXT NOT NULL, telephone TEXT NOT NULL UNIQUE,
      email TEXT, metier TEXT NOT NULL DEFAULT 'electricien' CHECK (metier = 'electricien'), formule TEXT NOT NULL DEFAULT 'gratuit', abonne_depuis TEXT, abonne_jusqu TEXT, renouvellement_auto INTEGER NOT NULL DEFAULT 0, carte_client TEXT, carte_moyen TEXT,
      suspendu INTEGER NOT NULL DEFAULT 0, version_session INTEGER NOT NULL DEFAULT 1, cree_le TEXT NOT NULL);
      INSERT INTO electriciens (compte_id, nom, telephone, cree_le) VALUES ('compte-ancien-1', 'Ancien', '+22670000001', '2026-01-01T00:00:00.000Z');`);
    ancienne.close();
    const migree = ouvrirBase(chemin);
    const colonnes = migree.prepare("SELECT name FROM pragma_table_info('electriciens')").all().map((c) => c.name);
    const version = migree.prepare("PRAGMA user_version").get().user_version;
    const ligne = migree.prepare("SELECT nom, seq, code_hash FROM electriciens WHERE compte_id = 'compte-ancien-1'").get();
    migree.close();
    for (const c of ["code_hash", "code_sel", "ville", "pays", "devise", "metier", "seq", "supprime_le"]) if (!colonnes.includes(c)) p.push("colonne " + c + " absente");
    if (version !== 2 || !ligne || ligne.nom !== "Ancien") p.push("version " + version);
    controle("MG", "base de l'étape 12 migrée sans perte (PRAGMA user_version 0 → 2, colonnes ajoutées par instructions figées)", !p.length,
      p.join(" ; ") || colonnes.length + " colonnes ; ligne existante conservée ; user_version = 2");
  }

  /* ---------- Exploitation : PM2, .env.exemple, règles partagées ---------- */
  {
    const p = [];
    const pm2 = readFileSync(join(BACKEND, "ecosystem.config.cjs"), "utf8");
    if (!/autorestart:\s*true/.test(pm2) || !/serveur\.js/.test(pm2) || !/NODE_ENV:\s*"production"/.test(pm2) || /SECRET|CLE\s*:/.test(pm2)) p.push("ecosystem.config.cjs");
    const exemple = readFileSync(join(BACKEND, ".env.exemple"), "utf8");
    for (const v of ["ADMIN_CODE_HASH", "ADMIN_IPS", "SAUVEGARDE_CLE", "SAUVEGARDE_DOSSIER", "JETON_SECRET"]) if (!exemple.includes(v + "=")) p.push(".env.exemple sans " + v);
    const regles = spawnSync(process.execPath, [join(RACINE, "src", "scripts", "regles-api.mjs"), "--verifier"], { encoding: "utf8" });
    if (regles.status !== 0) p.push("regles-donnees.json périmé");
    const paquet = JSON.parse(readFileSync(join(BACKEND, "package.json"), "utf8"));
    if (paquet.dependencies && Object.keys(paquet.dependencies).length) p.push("dépendances déclarées");
    controle("EX", "exploitation : PM2 (redémarrage auto), .env.exemple complet, règles de saisie partagées à jour, zéro dépendance", !p.length,
      p.join(" ; ") || "ecosystem.config.cjs (autorestart, NODE_ENV production, aucun secret) ; .env.exemple : ADMIN_CODE_HASH, ADMIN_IPS, SAUVEGARDE_* ; regles-donnees.json = sources de l'application ; package.json sans dépendance");
  }
} catch (e) {
  controle("✘", "exception pendant les tests", false, (e && e.stack) || String(e));
} finally {
  await app.arreter();
  await appLimites.arreter();
  rmSync(dossier, { recursive: true, force: true });
}

const echecs = resultats.filter((r) => !r.ok);
console.log("\nBâtiPlus — comptes, synchronisation et administration (étape 14)\n");
for (const r of resultats) console.log((r.ok ? "✔ " : "✘ ") + r.id.padEnd(6) + r.titre + "\n         " + r.detail);
console.log("\n" + (resultats.length - echecs.length) + "/" + resultats.length + " contrôles de l'étape 14 réussis.");
process.exit(echecs.length ? 1 : 0);
