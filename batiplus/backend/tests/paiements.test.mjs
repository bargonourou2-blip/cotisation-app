#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — tests du paiement automatique (étape 12), sans dépendance.
   Lance un vrai serveur HTTP (agrégateur simulé) + un faux agrégateur HTTP pour chacun des
   5 adaptateurs réels. Contrôles P1–P7 de l'étape 12, H.3 (㉕–㉜) et tests d'attaque H.4 #6 / #7.
   Code de sortie 1 si un seul contrôle échoue.
   ========================================================================== */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, webcrypto } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ouvrirBase, STATUTS } from "../base.js";
import { chargerConfig, ErreurConfiguration } from "../config.js";
import { FORMULES, JOUR_MS } from "../formules.js";
import { creerJetonSession } from "../jetons.js";
import { METHODES, hmacHex, verifierAdaptateur } from "../paiements/interface.js";
import { creerServicePaiements, secretUrlNotification } from "../paiements/service.js";
import { banc } from "../paiements/simulation.js";
import { demarrer } from "../serveur.js";
import fabriquerLigdicash from "../paiements/ligdicash.js";
import fabriquerCinetpay from "../paiements/cinetpay.js";
import fabriquerFedapay from "../paiements/fedapay.js";
import fabriquerPaydunya from "../paiements/paydunya.js";
import fabriquerStripe from "../paiements/stripe.js";
import fabriquerSimulation from "../paiements/simulation.js";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const RACINE = join(BACKEND, "..");
const resultats = [];
function controle(id, titre, ok, detail) {
  resultats.push({ id, titre, ok: Boolean(ok), detail: detail || "" });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const liberer = () => new Promise((resoudre) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resoudre(port)); }); });

const dossier = mkdtempSync(join(tmpdir(), "batiplus-paiements-"));
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
writeFileSync(join(dossier, "cle.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
const SECRETS = {
  JETON_SECRET: "a1".repeat(32),
  WEBHOOK_SECRET: "w3bh00k-" + "b2".repeat(16),
  SIMULATION_SECRET: "simulation-" + "c3".repeat(12)
};
const port = await liberer();
const envTest = {
  NODE_ENV: "developpement", URL_PUBLIQUE: "http://127.0.0.1:" + port, ORIGINES_AUTORISEES: "https://localhost,https://batiplus.bf",
  ABONNEMENT_CLE_PRIVEE_CHEMIN: join(dossier, "cle.pem"), PAIEMENT_FOURNISSEUR: "simulation", PAIEMENT_MODE: "test",
  BASE_DONNEES: join(dossier, "test.sqlite"), ...SECRETS
};
const decalage = { ms: 0 };
const config = { ...chargerConfig(envTest, BACKEND), limites: { general: [100000, 60000], initier: [1000, 60000], notification: [100000, 60000] } };
const app = demarrer(config, { horloge: () => Date.now() + decalage.ms, journalConsole: { error() {}, warn() {}, log() {} } });
await app.ecouter(port, "127.0.0.1");
const base = app.base;
const service = app.service;
const URL_API = "http://127.0.0.1:" + port;
const corpsRecus = [];

let numero = 0;
function nouveauCompte(extra = {}) {
  numero += 1;
  const telephone = "+2267" + String(1000000 + numero).padStart(7, "0");
  const r = base.prepare("INSERT INTO electriciens (compte_id, nom, telephone, cree_le) VALUES (?, ?, ?, ?)").run("compte-test-" + numero, "Awa Ouédraogo-Kaboré", telephone, new Date().toISOString());
  const id = Number(r.lastInsertRowid);
  for (const [cle, valeur] of Object.entries(extra)) base.prepare("UPDATE electriciens SET " + cle + " = ? WHERE id = ?").run(valeur, id);
  const electricien = base.prepare("SELECT * FROM electriciens WHERE id = ?").get(id);
  return { electricien, jeton: creerJetonSession(config.jetonSecret, electricien) };
}
const lireCompte = (id) => base.prepare("SELECT * FROM electriciens WHERE id = ?").get(id);
const lirePaiement = (reference) => base.prepare("SELECT * FROM paiements WHERE reference = ?").get(reference);
const abonnementsDe = (paiementId) => base.prepare("SELECT COUNT(*) AS n FROM abonnements WHERE paiement_id = ?").get(paiementId).n;
const activites = (action) => base.prepare("SELECT * FROM activites WHERE action = ? ORDER BY id").all(action);

async function appel(methode, chemin, { jeton, corps, entetes = {}, brut } = {}) {
  const options = { method: methode, headers: { ...entetes }, redirect: "manual" };
  if (jeton) options.headers.Authorization = "Bearer " + jeton;
  if (brut !== undefined) options.body = brut;
  else if (corps !== undefined) {
    options.body = JSON.stringify(corps);
    options.headers["Content-Type"] = "application/json";
  }
  const reponse = await fetch(URL_API + chemin, options);
  const texte = await reponse.text();
  corpsRecus.push(texte);
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  return { statut: reponse.status, entetes: reponse.headers, json, texte };
}
const idSimulation = (reference) => lirePaiement(reference).id_fournisseur;
const urlNotification = "/api/paiements/notification/simulation/" + secretUrlNotification(config.webhookSecret, "simulation");
async function notifier(reference, champs = {}, secret = SECRETS.SIMULATION_SECRET) {
  const t = banc.transactions.get(idSimulation(reference));
  const { corpsBrut, entetes } = banc.signer(secret, { id: t.id, reference, statut: "payé", montant: t.montant, devise: "XOF", moyen: "orange-money", ...champs });
  return appel("POST", urlNotification, { brut: corpsBrut, entetes });
}
async function attendreStatut(reference, attendu, delaiMs = 4000) {
  const debut = Date.now();
  while (Date.now() - debut < delaiMs) {
    if (lirePaiement(reference).statut === attendu) return true;
    await pause(50);
  }
  return lirePaiement(reference).statut === attendu;
}
async function initier(jeton, formule, extra = {}) {
  const r = await appel("POST", "/api/paiements/initier", { jeton, corps: { formule, ...extra }, entetes: { Origin: "https://localhost" } });
  return r;
}
async function verifierJetonCommeLeFront(jeton, compte) {
  const cle = await webcrypto.subtle.importKey("spki", Buffer.from(config.clePublique, "base64"), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const [corps, signature] = jeton.split(".");
  const ok = await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, cle, Buffer.from(signature, "base64url"), new TextEncoder().encode("bp-abonnement-v1." + corps));
  const charge = JSON.parse(Buffer.from(corps, "base64url").toString("utf8"));
  return ok && charge.v === 1 && charge.compteId === compte.compte_id && charge.telephone === compte.telephone ? charge : null;
}

try {
  /* ── Démarrage refusé sans secrets valides (H.2 ⑰) ── */
  const refus = [];
  const essai = (nom, env) => {
    try {
      chargerConfig(env, BACKEND);
      refus.push(nom + " : accepté");
    } catch (e) {
      if (!(e instanceof ErreurConfiguration)) refus.push(nom + " : " + e.message);
      else if (Object.values(SECRETS).some((s) => e.message.includes(s))) refus.push(nom + " : un secret apparaît dans le message");
    }
  };
  essai("production sans clés d'agrégateur", { ...envTest, NODE_ENV: "production", URL_PUBLIQUE: "https://api.exemple.bf", PAIEMENT_FOURNISSEUR: "ligdicash", PAIEMENT_MODE: "production" });
  essai("production en simulation", { ...envTest, NODE_ENV: "production", URL_PUBLIQUE: "https://api.exemple.bf", PAIEMENT_MODE: "production" });
  essai("production en mode test", { ...envTest, NODE_ENV: "production", URL_PUBLIQUE: "https://api.exemple.bf", PAIEMENT_FOURNISSEUR: "stripe", STRIPE_SECRET_KEY: "sk_xxxxxxxxxxxx", STRIPE_WEBHOOK_SECRET: "whsec_xxxxxxxxxx" });
  essai("production en http", { ...envTest, NODE_ENV: "production", PAIEMENT_FOURNISSEUR: "stripe", PAIEMENT_MODE: "production", STRIPE_SECRET_KEY: "sk_xxxxxxxxxxxx", STRIPE_WEBHOOK_SECRET: "whsec_xxxxxxxxxx" });
  essai("JETON_SECRET faible", { ...envTest, JETON_SECRET: "123456" });
  essai("WEBHOOK_SECRET absent", { ...envTest, WEBHOOK_SECRET: "" });
  essai("CORS « * »", { ...envTest, ORIGINES_AUTORISEES: "*" });
  essai("clé de signature absente", { ...envTest, ABONNEMENT_CLE_PRIVEE_CHEMIN: join(dossier, "absente.pem") });
  essai("secours = principal", { ...envTest, PAIEMENT_SECOURS: "simulation" });
  const vide = Object.fromEntries(["JETON_SECRET", "WEBHOOK_SECRET", "URL_PUBLIQUE", "ORIGINES_AUTORISEES", "ABONNEMENT_CLE_PRIVEE_CHEMIN", "PAIEMENT_FOURNISSEUR", "LIGDICASH_API_KEY", "LIGDICASH_AUTH_TOKEN"].map((k) => [k, ""]));
  const lance = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "serveur.js"], { cwd: BACKEND, env: { ...process.env, ...vide, NODE_ENV: "production", PAIEMENT_FOURNISSEUR: "ligdicash", PAIEMENT_MODE: "production" }, encoding: "utf8", timeout: 15000 });
  if (lance.status !== 1 || !lance.stderr.includes("démarrage refusé") || !lance.stderr.includes("LIGDICASH_API_KEY")) refus.push("serveur.js lancé sans .env : code " + lance.status);
  controle("S1", "le backend refuse de démarrer sans secrets valides (H.2 ⑰)", !refus.length, refus.join(" ; ") || "9 configurations refusées + serveur.js réel arrêté (code 1), aucun secret dans les messages");

  /* ── En-têtes, CORS, taille, authentification ── */
  const sante = await appel("GET", "/api/sante");
  const inconnu = await appel("GET", "/api/inconnu");
  const sansJeton = await appel("POST", "/api/paiements/initier", { corps: { formule: "mensuel" } });
  const entetesManquants = [];
  for (const r of [sante, inconnu, sansJeton]) {
    const e = r.entetes;
    if (!/max-age=\d+/.test(e.get("strict-transport-security") || "")) entetesManquants.push("HSTS");
    if (e.get("x-content-type-options") !== "nosniff") entetesManquants.push("nosniff");
    if (e.get("x-frame-options") !== "DENY") entetesManquants.push("X-Frame-Options");
    if (e.get("referrer-policy") !== "no-referrer") entetesManquants.push("Referrer-Policy");
    if (!/default-src 'none'/.test(e.get("content-security-policy") || "") || !/frame-ancestors 'none'/.test(e.get("content-security-policy") || "")) entetesManquants.push("CSP");
    if (e.get("cache-control") !== "no-store") entetesManquants.push("no-store");
  }
  controle("S2", "en-têtes de sécurité sur toutes les réponses (H.2 ⑲)", sante.statut === 200 && inconnu.statut === 404 && !entetesManquants.length,
    entetesManquants.join(", ") || "HSTS, nosniff, X-Frame-Options DENY, no-referrer, CSP (default-src 'none', frame-ancestors 'none'), no-store — sur 200, 404 et 401");

  const corsOk = await appel("GET", "/api/formules", { entetes: { Origin: "https://localhost" } });
  const corsKo = await appel("GET", "/api/formules", { entetes: { Origin: "https://pirate.exemple" } });
  const pref = await fetch(URL_API + "/api/paiements/initier", { method: "OPTIONS", headers: { Origin: "https://localhost", "Access-Control-Request-Method": "POST" } });
  controle("S3", "CORS limité aux origines du .env, jamais « * » (H.2 ⑳)",
    corsOk.entetes.get("access-control-allow-origin") === "https://localhost" && corsKo.statut === 403 && !corsKo.entetes.get("access-control-allow-origin") && pref.status === 204
      && corsOk.json.formules.length === 4,
    "https://localhost accepté, origine inconnue → 403 sans en-tête CORS, pré-vérification 204");

  const { jeton: jetonGros } = nouveauCompte();
  const gros = await appel("POST", "/api/paiements/initier", { jeton: jetonGros, brut: JSON.stringify({ formule: "mensuel", x: "a".repeat(1024 * 1024) }), entetes: { "Content-Type": "application/json" } });
  controle("S4", "corps limité à 1 Mo", gros.statut === 413 && gros.json && gros.json.erreur === "trop_volumineux", "corps de 1 Mo + → " + gros.statut);

  const compteRevoque = nouveauCompte();
  base.prepare("UPDATE electriciens SET version_session = version_session + 1 WHERE id = ?").run(compteRevoque.electricien.id);
  const revoque = await initier(compteRevoque.jeton, "mensuel");
  const falsifie = await initier(jetonGros.slice(0, -2) + (jetonGros.endsWith("AA") ? "BB" : "AA"), "mensuel");
  controle("S5", "routes de paiement protégées par jeton de session (version invalidable à distance)",
    sansJeton.statut === 401 && revoque.statut === 401 && falsifie.statut === 401 && sansJeton.json.erreur === "non_authentifie",
    "sans jeton, jeton retouché, jeton d'une session révoquée → 401 (message générique)");

  /* ── P2 / ㉕ : le montant vient du backend ── */
  const compteA = nouveauCompte();
  const tricheur = await initier(compteA.jeton, "annuel", { montant: 1, prix: 1, devise: "EUR", fournisseur: "aucun" });
  const pTriche = tricheur.json && lirePaiement(tricheur.json.reference);
  const tTriche = pTriche && banc.transactions.get(pTriche.id_fournisseur);
  const gratuit = await initier(compteA.jeton, "gratuit");
  const inconnue = await initier(compteA.jeton, "<script>");
  const prixFront = readFileSync(join(RACINE, "src", "donnees.js"), "utf8");
  const ecartsPrix = Object.entries(FORMULES).filter(([id, f]) => !new RegExp("\\b" + id + ": Object\\.freeze\\(\\{\\s*nom: \"" + f.nom + "\", prix: " + f.prix + ",").test(prixFront)).map(([id]) => id);
  controle("P2", "montant fixé par le backend uniquement (㉕ : montant faux envoyé → ignoré)",
    tricheur.statut === 201 && pTriche.montant === 25000 && pTriche.devise === "XOF" && tTriche.montant === 25000 && gratuit.statut === 400 && inconnue.statut === 400 && !ecartsPrix.length,
    "{formule:annuel, montant:1, devise:EUR} → 25 000 XOF en base ET chez l'agrégateur ; gratuit / formule inconnue → 400 ; prix identiques à l'application" + (ecartsPrix.length ? " — écarts : " + ecartsPrix.join(",") : ""));

  /* ── P7 : parcours complet en simulation ── */
  const compteB = nouveauCompte();
  const debutB = Date.now();
  const init = await initier(compteB.jeton, "mensuel");
  const ref = init.json && init.json.reference;
  const page = init.json ? await fetch(init.json.urlPaiement) : null;
  const pageTexte = page ? await page.text() : "";
  const envoi = init.json ? await fetch(init.json.urlPaiement, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "issue=reussi", redirect: "manual" }) : null;
  const retour = envoi ? await appel("GET", envoi.headers.get("location")) : null;
  await attendreStatut(ref, STATUTS.paye);
  const statutB = await appel("GET", "/api/paiements/" + ref, { jeton: compteB.jeton, entetes: { Origin: "https://localhost" } });
  const chargeB = statutB.json && statutB.json.jeton ? await verifierJetonCommeLeFront(statutB.json.jeton, lireCompte(compteB.electricien.id)) : null;
  const finB = chargeB ? Date.parse(chargeB.fin) - debutB : 0;
  const p7 = [];
  if (init.statut !== 201 || !/^BP-[A-Z0-9]{12}$/.test(ref || "") || !init.json.urlPaiement.startsWith(URL_API + "/simulation/payer/SIM-")) p7.push("initiation " + init.statut);
  if (!page || page.status !== 200 || !pageTexte.includes("Paiement simulé") || !/style-src 'nonce-/.test(page.headers.get("content-security-policy") || "")) p7.push("page de paiement simulée");
  if (!envoi || envoi.status !== 303 || !retour || retour.statut !== 200 || !retour.texte.includes(ref)) p7.push("retour " + (envoi && envoi.status));
  if (statutB.statut !== 200 || statutB.json.statut !== "paye" || statutB.json.montant !== 2500 || statutB.json.moyen !== "orange-money" || !statutB.json.payeLe) p7.push("statut " + JSON.stringify(statutB.json));
  if (!chargeB || chargeB.formule !== "mensuel" || Math.abs(finB - 30 * JOUR_MS) > 60000) p7.push("jeton d'abonnement (vérifié comme dans l'application)");
  if (abonnementsDe(lirePaiement(ref).id) !== 1 || lireCompte(compteB.electricien.id).formule !== "mensuel" || !activites("activation_abonnement").some((a) => a.details.includes(ref))) p7.push("activation en base");
  if (JSON.stringify(statutB.json).match(/secret|cle_idempotence|donnees_brutes|id_fournisseur|SIM-/)) p7.push("champ interne renvoyé");
  controle("P7", "parcours complet testé en simulation (initier → page → paiement → notification → activation → jeton)", !p7.length,
    p7.join(" ; ") || "201 + https/BP-…, page simulée (CSP à nonce), 303 → page de retour, statut « paye », jeton signé vérifié avec la clé publique comme l'application, 30 jours, 1 abonnement, journal");

  /* ── P3 / ㉖ ㉗ : signature en temps constant + re-consultation ── */
  const compteC = nouveauCompte();
  const refC = (await initier(compteC.jeton, "semaine")).json.reference;
  const avantInvalides = activites("notification_invalide").length;
  const fausseSignature = await notifier(refC, {}, "mauvais-secret-de-simulation");
  const signatureAbsente = await appel("POST", urlNotification, { corps: { reference: refC, statut: "payé", montant: 750, devise: "XOF" } });
  const mauvaiseUrl = await appel("POST", "/api/paiements/notification/simulation/" + "0".repeat(32), { corps: {} });
  const autreFournisseur = await appel("POST", "/api/paiements/notification/stripe/" + secretUrlNotification(config.webhookSecret, "stripe"), { corps: {} });
  const ancienne = (() => {
    const t = banc.transactions.get(idSimulation(refC));
    const { corpsBrut, entetes } = banc.signer(SECRETS.SIMULATION_SECRET, { id: t.id, reference: refC, statut: "payé", montant: 750, devise: "XOF" }, Math.floor(Date.now() / 1000) - 3600);
    return appel("POST", urlNotification, { brut: corpsBrut, entetes });
  })();
  const rejouee = await ancienne;
  const invalides = activites("notification_invalide").slice(avantInvalides);
  /* Notification correctement signée qui PRÉTEND « payé » alors que l'agrégateur dit « en attente » : */
  const menteuse = await notifier(refC, { statut: "payé" });
  await pause(300);
  const p3 = [];
  if (fausseSignature.statut !== 401 || signatureAbsente.statut !== 401 || rejouee.statut !== 401) p3.push("signature : " + [fausseSignature.statut, signatureAbsente.statut, rejouee.statut].join("/"));
  if (mauvaiseUrl.statut !== 404 || autreFournisseur.statut !== 404) p3.push("URL secrète : " + mauvaiseUrl.statut + "/" + autreFournisseur.statut);
  if (invalides.length < 5 || invalides.some((a) => !a.ip)) p3.push(invalides.length + " notification(s) invalide(s) journalisée(s) avec IP");
  if (menteuse.statut !== 200 || lirePaiement(refC).statut !== STATUTS.attente || lireCompte(compteC.electricien.id).formule !== "gratuit") p3.push("notification crue sans re-consultation : " + lirePaiement(refC).statut);
  const sourceService = readFileSync(join(BACKEND, "paiements", "service.js"), "utf8") + readFileSync(join(BACKEND, "paiements", "interface.js"), "utf8") + readFileSync(join(BACKEND, "jetons.js"), "utf8");
  if (!/timingSafeEqual/.test(sourceService) || /signature\s*===|===\s*signature/.test(sourceService)) p3.push("comparaison non constante");
  controle("P3", "signature vérifiée en temps constant + statut re-consulté chez l'agrégateur (㉖ ㉗)", !p3.length,
    p3.join(" ; ") || "fausse signature, sans signature, notification de plus de 5 min → 401 ; URL non secrète → 404 ; " + invalides.length + " rejets journalisés avec IP ; « payé » signé mais agrégateur « en attente » → rien n'est activé");

  /* ── P4 / ㉘ / H.4 #6 : idempotence ── */
  const compteD = nouveauCompte();
  const refD = (await initier(compteD.jeton, "mensuel")).json.reference;
  const tD = banc.transactions.get(idSimulation(refD));
  tD.statut = STATUTS.paye;
  tD.moyen = "wave";
  const dix = await Promise.all(Array.from({ length: 10 }, () => notifier(refD)));
  await attendreStatut(refD, STATUTS.paye);
  await pause(300);
  const compteDApres = lireCompte(compteD.electricien.id);
  const dureeD = Date.parse(compteDApres.abonne_jusqu) - Date.parse(lirePaiement(refD).paye_le);
  const encore = await notifier(refD);
  await pause(200);
  const statutFinal = (() => { try { base.prepare("UPDATE paiements SET statut = 'échoué' WHERE reference = ?").run(refD); return "modifiable"; } catch { return "figé"; } })();
  const montantFige = (() => { try { base.prepare("UPDATE paiements SET montant = 1 WHERE reference = ?").run(refD); return "modifiable"; } catch { return "figé"; } })();
  const doublon = nouveauCompte();
  const refDoublon = (await initier(doublon.jeton, "semaine")).json.reference;
  await banc.payer(idSimulation(refDoublon), "doublon");
  await attendreStatut(refDoublon, STATUTS.paye);
  await pause(300);
  const p4 = [];
  if (dix.some((r) => r.statut !== 200)) p4.push("réponses : " + dix.map((r) => r.statut).join(","));
  if (abonnementsDe(lirePaiement(refD).id) !== 1 || Math.abs(dureeD - 30 * JOUR_MS) > 5000 || encore.statut !== 200 || abonnementsDe(lirePaiement(refD).id) !== 1) p4.push("activations : " + abonnementsDe(lirePaiement(refD).id) + ", durée " + Math.round(dureeD / JOUR_MS) + " j");
  if (activites("activation_abonnement").filter((a) => a.details.includes(refD)).length !== 1) p4.push("journal : activation écrite plusieurs fois");
  if (statutFinal !== "figé" || montantFige !== "figé") p4.push("statut final " + statutFinal + ", montant " + montantFige);
  if (abonnementsDe(lirePaiement(refDoublon).id) !== 1) p4.push("scénario doublon de la simulation");
  controle("P4", "idempotence testée : 10 notifications simultanées = 1 seule activation (㉘, H.4 #6)", !p4.length,
    p4.join(" ; ") || "10 notifications en parallèle + 1 rejouée → 200 partout, 1 abonnement, 30 jours (pas 300), 1 ligne de journal ; statut final et montant figés par la base ; scénario « doublon » OK");

  /* ── P6 / ㉙ / H.4 #7 : montant faux → anomalie ── */
  const compteE = nouveauCompte();
  const refE = (await initier(compteE.jeton, "annuel")).json.reference;
  await banc.payer(idSimulation(refE), "montant_faux");
  await attendreStatut(refE, STATUTS.anomalie);
  const statutE = await appel("GET", "/api/paiements/" + refE, { jeton: compteE.jeton });
  const compteF = nouveauCompte();
  const refF = (await initier(compteF.jeton, "mensuel")).json.reference;
  const tF = banc.transactions.get(idSimulation(refF));
  Object.assign(tF, { statut: STATUTS.paye, devise: "EUR" });
  await notifier(refF);
  await attendreStatut(refF, STATUTS.anomalie);
  const alertes = service.alertes().map((a) => a.reference);
  controle("P6", "montant ou devise incorrects = « anomalie », sans activation, alerte admin (㉙, H.4 #7)",
    lirePaiement(refE).statut === STATUTS.anomalie && abonnementsDe(lirePaiement(refE).id) === 0 && lireCompte(compteE.electricien.id).formule === "gratuit"
      && statutE.json.statut === "anomalie" && statutE.json.jeton === null && lirePaiement(refF).statut === STATUTS.anomalie && alertes.includes(refE) && alertes.includes(refF)
      && activites("paiement_anomalie").length >= 2,
    "1 FCFA payé pour 25 000 → anomalie ; bonne somme en EUR → anomalie ; aucun abonnement, aucun jeton ; 2 alertes en tête de l'administration + journal");

  /* ── P5 / ㉚ : notification perdue rattrapée sans intervention ── */
  const compteG = nouveauCompte();
  const refG = (await initier(compteG.jeton, "semaine")).json.reference;
  await banc.payer(idSimulation(refG), "webhook_perdu");
  await pause(300);
  const avantRattrapage = lirePaiement(refG).statut;
  const tropTot = await service.rattraper();
  const apresTropTot = lirePaiement(refG).statut;
  decalage.ms = 4 * 60000;
  const bilan = await service.rattraper();
  const compteGApres = lireCompte(compteG.electricien.id);
  const compteH = nouveauCompte();
  const refH = (await initier(compteH.jeton, "semaine")).json.reference;
  banc.regler({ panne: true });
  decalage.ms = 8 * 60000;
  await service.rattraper();
  const pendantPanne = lirePaiement(refH).statut;
  banc.regler({ panne: false });
  decalage.ms = 25 * 3600000;
  await service.rattraper();
  decalage.ms = 0;
  const p5 = [];
  if (avantRattrapage !== STATUTS.attente || apresTropTot !== STATUTS.attente) p5.push("rattrapé trop tôt");
  if (lirePaiement(refG).statut !== STATUTS.paye || compteGApres.formule !== "semaine" || bilan.payes < 1) p5.push("non rattrapé : " + lirePaiement(refG).statut);
  if (pendantPanne !== STATUTS.attente || lirePaiement(refH).statut !== STATUTS.expire) p5.push("expiration après 24 h : " + pendantPanne + " → " + lirePaiement(refH).statut);
  const planif = readFileSync(join(BACKEND, "paiements", "service.js"), "utf8");
  if (!/setInterval\(/.test(planif) || !/planificateurMs: 5 \* 60000/.test(planif) || !/attenteAvantRattrapageMs: 3 \* 60000/.test(planif)) p5.push("tâche planifiée 5 min / 3 min absente");
  controle("P5", "notification perdue rattrapée sans action humaine (㉚)", !p5.length,
    p5.join(" ; ") || "payé sans notification : rien avant 3 min, activé au passage suivant de la tâche (toutes les 5 min, intégrée au backend) ; agrégateur en panne → reste en attente ; sans réponse après 24 h → « expiré »" + (tropTot.consultes ? "" : ""));

  /* ── Échec, annulation, panne à l'initiation, secours ── */
  const compteI = nouveauCompte();
  const refI = (await initier(compteI.jeton, "mensuel")).json.reference;
  await banc.payer(idSimulation(refI), "echoue");
  await attendreStatut(refI, STATUTS.echoue);
  const refJ = (await initier(compteI.jeton, "mensuel")).json.reference;
  await banc.payer(idSimulation(refJ), "annule");
  await attendreStatut(refJ, STATUTS.annule);
  const etatI = await appel("GET", "/api/paiements/" + refI, { jeton: compteI.jeton });
  banc.regler({ panne: true });
  const enPanne = await initier(compteI.jeton, "mensuel");
  banc.regler({ panne: false });
  const basePanne = ouvrirBase(":memory:");
  basePanne.prepare("INSERT INTO electriciens (compte_id, nom, telephone, cree_le) VALUES ('compte-secours-1', 'Test', '+22670000001', ?)").run(new Date().toISOString());
  const fauxEnPanne = verifierAdaptateur({ async creerPaiement() { throw new Error("panne"); }, verifierNotification: () => false, lireNotification: () => ({}), async consulterStatut() { throw new Error("panne"); }, async rembourser() {} }, "faux");
  const fauxSecours = verifierAdaptateur({ async creerPaiement() { return { urlPaiement: "https://secours.exemple/p", idFournisseur: "SEC-1" }; }, verifierNotification: () => false, lireNotification: () => ({}),
    async consulterStatut() { return { statut: STATUTS.paye, montant: 2500, devise: "XOF", moyen: "moov-money", reference: null }; }, async rembourser() {} }, "faux");
  const serviceSecours = creerServicePaiements({ base: basePanne, config: { ...config, paiement: { fournisseur: "principal", secours: "secours", mode: "test", actifs: ["principal", "secours"] } }, adaptateurs: { principal: fauxEnPanne, secours: fauxSecours } });
  const viaSecours = await serviceSecours.initier(basePanne.prepare("SELECT * FROM electriciens").get(), "mensuel");
  const ligneSecours = basePanne.prepare("SELECT * FROM paiements WHERE reference = ?").get(viaSecours.reference);
  controle("P8", "échec, annulation, agrégateur en panne, bascule sur l'agrégateur de secours",
    lirePaiement(refI).statut === STATUTS.echoue && lirePaiement(refJ).statut === STATUTS.annule && etatI.json.statut === "echoue" && etatI.json.jeton === null
      && enPanne.statut === 503 && enPanne.json.erreur === "paiement_indisponible" && lirePaiement(refI).statut === STATUTS.echoue && lireCompte(compteI.electricien.id).formule === "gratuit"
      && ligneSecours.fournisseur === "secours" && viaSecours.urlPaiement === "https://secours.exemple/p" && activites("agregateur_indisponible").length >= 1,
    "échec → « echoue », annulation → « annule » (aucune activation) ; panne → 503 « paiement_indisponible » (message clair côté application) ; principal en panne → secours utilisé, panne journalisée");
  basePanne.close();

  /* ── Appartenance (H.4 #3), injection (H.4 #4), secrets jamais renvoyés (㉑) ── */
  const autre = nouveauCompte();
  const voleur = await appel("GET", "/api/paiements/" + ref, { jeton: autre.jeton });
  const injection = await appel("GET", "/api/paiements/" + encodeURIComponent("BP-X' OR '1'='1"), { jeton: autre.jeton });
  const injectionFormule = await initier(autre.jeton, "mensuel'; DROP TABLE paiements; --");
  const tablesIntactes = base.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('paiements', 'abonnements', 'activites', 'electriciens')").get().n === 4;
  const sourceSql = readdirSync(join(BACKEND, "paiements")).map((f) => readFileSync(join(BACKEND, "paiements", f), "utf8")).join("\n") + readFileSync(join(BACKEND, "serveur.js"), "utf8");
  const concat = /prepare\([^)]*\+\s*[a-z]/i.test(sourceSql);
  const fuites = corpsRecus.filter((t) => [SECRETS.JETON_SECRET, SECRETS.WEBHOOK_SECRET, SECRETS.SIMULATION_SECRET, secretUrlNotification(config.webhookSecret, "simulation"), "secret_notification", "cle_idempotence", "donnees_brutes", "SQLITE", "at file:", "    at "].some((s) => t.includes(s)));
  controle("P9", "appartenance, injection SQL, aucune donnée interne dans les réponses (H.4 #3 #4, ㉑)",
    voleur.statut === 404 && injection.statut === 404 && injectionFormule.statut === 400 && tablesIntactes && !concat && !fuites.length,
    "paiement d'un autre compte → 404 ; « ' OR '1'='1 » et « DROP TABLE » → traités comme du texte ; requêtes préparées uniquement ; " + corpsRecus.length + " réponses sans secret, sans trace ni nom de table" + (fuites.length ? " — FUITE : " + fuites[0].slice(0, 80) : ""));

  /* ── Renouvellement anticipé, passage supérieur au prorata, Lifetime, remboursement ── */
  const t0 = Date.now();
  const p10 = [];
  const anticipe = nouveauCompte({ formule: "mensuel", abonne_depuis: new Date(t0 - 20 * JOUR_MS).toISOString(), abonne_jusqu: new Date(t0 + 10 * JOUR_MS).toISOString() });
  const periodeA = service.nouvellePeriode(anticipe.electricien, "mensuel", t0);
  if (Math.abs(Date.parse(periodeA.fin) - (t0 + 40 * JOUR_MS)) > 1000 || periodeA.formule !== "mensuel") p10.push("renouvellement anticipé : " + periodeA.fin);
  const montee = nouveauCompte({ formule: "mensuel", abonne_depuis: new Date(t0 - 10 * JOUR_MS).toISOString(), abonne_jusqu: new Date(t0 + 20 * JOUR_MS).toISOString() });
  const periodeM = service.nouvellePeriode(montee.electricien, "annuel", t0);
  const bonusAttendu = Math.floor(20 * JOUR_MS * (2500 / 30) / (25000 / 365));
  if (periodeM.formule !== "annuel" || Date.parse(periodeM.debut) !== t0 || Math.abs(Date.parse(periodeM.fin) - (t0 + 365 * JOUR_MS + bonusAttendu)) > 1000) p10.push("passage supérieur : " + periodeM.fin);
  const descente = nouveauCompte({ formule: "annuel", abonne_depuis: new Date(t0 - 10 * JOUR_MS).toISOString(), abonne_jusqu: new Date(t0 + 100 * JOUR_MS).toISOString() });
  const periodeD = service.nouvellePeriode(descente.electricien, "semaine", t0);
  if (periodeD.formule !== "annuel" || Math.abs(Date.parse(periodeD.fin) - (t0 + 107 * JOUR_MS)) > 1000) p10.push("formule inférieure : " + periodeD.formule);
  const expire = nouveauCompte({ formule: "mensuel", abonne_depuis: new Date(t0 - 40 * JOUR_MS).toISOString(), abonne_jusqu: new Date(t0 - 10 * JOUR_MS).toISOString() });
  if (Math.abs(Date.parse(service.nouvellePeriode(expire.electricien, "mensuel", t0).fin) - (t0 + 30 * JOUR_MS)) > 1000) p10.push("abonnement expiré : les jours passés ne comptent pas");
  const vie = nouveauCompte();
  const refVie = (await initier(vie.jeton, "vie")).json.reference;
  await banc.payer(idSimulation(refVie), "reussi");
  await attendreStatut(refVie, STATUTS.paye);
  const etatVie = await appel("GET", "/api/paiements/" + refVie, { jeton: vie.jeton });
  const chargeVie = etatVie.json.jeton ? await verifierJetonCommeLeFront(etatVie.json.jeton, lireCompte(vie.electricien.id)) : null;
  const encoreVie = await initier(vie.jeton, "annuel");
  if (!chargeVie || chargeVie.formule !== "vie" || chargeVie.fin !== null || encoreVie.statut !== 409 || encoreVie.json.erreur !== "deja_a_vie") p10.push("Lifetime : " + encoreVie.statut);
  const places = base.prepare("SELECT COUNT(DISTINCT electricien_id) AS n FROM abonnements WHERE formule = 'vie'").get().n;
  base.exec("BEGIN");
  for (let i = places; i < 200; i += 1) {
    const id = Number(base.prepare("INSERT INTO electriciens (compte_id, nom, telephone, cree_le) VALUES (?, 'Place', ?, ?)").run("place-vie-" + i, "+2265" + String(i).padStart(7, "0"), new Date().toISOString()).lastInsertRowid);
    base.prepare("INSERT INTO abonnements (electricien_id, formule, debut, fin, source, cree_le) VALUES (?, 'vie', ?, NULL, 'test', ?)").run(id, new Date().toISOString(), new Date().toISOString());
  }
  base.exec("COMMIT");
  const complet = await initier(nouveauCompte().jeton, "vie");
  if (complet.statut !== 409 || complet.json.erreur !== "places_vie_epuisees") p10.push("201e Lifetime : " + complet.statut);
  const motifVide = await service.rembourser(ref, { adminId: 1, motif: "", confirmation: ref }).then(() => "accepté", (e) => e.code);
  await service.rembourser(ref, { adminId: 1, motif: "Double paiement signalé par le client", confirmation: ref });
  const apresRemb = lireCompte(compteB.electricien.id);
  if (motifVide !== "confirmation_requise" || lirePaiement(ref).statut !== STATUTS.rembourse || apresRemb.formule !== "gratuit" || !activites("remboursement").length) p10.push("remboursement : " + motifVide + " / " + lirePaiement(ref).statut);
  controle("P10", "renouvellement anticipé (jours ajoutés), passage supérieur immédiat au prorata, Lifetime (200 places), remboursement journalisé", !p10.length,
    p10.join(" ; ") || "10 j restants + 30 = 40 j ; mensuel→annuel : 365 j + " + Math.round(bonusAttendu / JOUR_MS * 10) / 10 + " j de prorata ; semaine pendant un annuel : jours ajoutés, annuel gardé ; Lifetime : jeton sans fin, 2e paiement refusé, 201e place refusée ; remboursement : motif obligatoire, abonnement désactivé dans la même transaction");

  /* ── Renouvellement automatique par carte (accord explicite, J-1, sans page) ── */
  const p11 = [];
  const compteK = nouveauCompte();
  const mauvais = await appel("POST", "/api/abonnement/renouvellement-auto", { jeton: compteK.jeton, corps: { actif: "oui" } });
  const active = await appel("POST", "/api/abonnement/renouvellement-auto", { jeton: compteK.jeton, corps: { actif: true } });
  if (mauvais.statut !== 400 || active.statut !== 200 || lireCompte(compteK.electricien.id).renouvellement_auto !== 1) p11.push("réglage : " + mauvais.statut + "/" + active.statut);
  const baseCarte = ouvrirBase(":memory:");
  const tCarte = Date.now();
  baseCarte.prepare("INSERT INTO electriciens (compte_id, nom, telephone, formule, abonne_depuis, abonne_jusqu, renouvellement_auto, carte_client, carte_moyen, cree_le) VALUES ('compte-carte-1', 'Test', '+22670000002', 'mensuel', ?, ?, 1, 'cus_1', 'pm_1', ?)")
    .run(new Date(tCarte - 29.5 * JOUR_MS).toISOString(), new Date(tCarte + 12 * 3600000).toISOString(), new Date().toISOString());
  baseCarte.prepare("INSERT INTO electriciens (compte_id, nom, telephone, formule, abonne_depuis, abonne_jusqu, renouvellement_auto, carte_client, carte_moyen, cree_le) VALUES ('compte-carte-2', 'Test', '+22670000003', 'mensuel', ?, ?, 0, 'cus_2', 'pm_2', ?)")
    .run(new Date(tCarte - 29.5 * JOUR_MS).toISOString(), new Date(tCarte + 12 * 3600000).toISOString(), new Date().toISOString());
  const demandes = [];
  const fauxStripe = verifierAdaptateur({
    async creerPaiement(p) { demandes.push(p); return { urlPaiement: null, idFournisseur: "pi_test_" + demandes.length }; },
    verifierNotification: () => false, lireNotification: () => ({}),
    async consulterStatut() { return { statut: STATUTS.paye, montant: 2500, devise: "XOF", moyen: "visa", reference: null }; }, async rembourser() {}
  }, "stripe");
  const serviceCarte = creerServicePaiements({ base: baseCarte, config: { ...config, paiement: { fournisseur: "simulation", secours: "", mode: "test", actifs: ["simulation", "stripe"] } }, adaptateurs: { stripe: fauxStripe } });
  const lances = await serviceCarte.renouvellementsAuto();
  const relance = await serviceCarte.renouvellementsAuto();
  const refCarte = baseCarte.prepare("SELECT reference FROM paiements").get();
  if (refCarte) await serviceCarte.confirmer(refCarte.reference);
  const apresCarte = baseCarte.prepare("SELECT * FROM electriciens WHERE compte_id = 'compte-carte-1'").get();
  if (lances !== 1 || relance !== 0 || demandes.length !== 1 || !demandes[0].carte || demandes[0].carte.client !== "cus_1" || demandes[0].montant !== 2500) p11.push("renouvellement lancé : " + lances + "/" + relance);
  if (Math.abs(Date.parse(apresCarte.abonne_jusqu) - (tCarte + 12 * 3600000 + 30 * JOUR_MS)) > 5000) p11.push("jours non ajoutés");
  baseCarte.close();
  controle("P11", "renouvellement automatique par carte seulement sur accord (interrupteur), à J-1, jours ajoutés", !p11.length,
    p11.join(" ; ") || "réglage booléen strict ; compte sans accord ignoré ; 1 seul renouvellement par période ; 2 500 FCFA fixés par le backend ; +30 jours après confirmation");

  /* ── Journal d'audit en écriture seule (㉒) ── */
  const journalModif = (() => { try { base.prepare("UPDATE activites SET action = 'x'").run(); return "modifié"; } catch { return "refusé"; } })();
  const journalSuppr = (() => { try { base.prepare("DELETE FROM activites").run(); return "supprimé"; } catch { return "refusé"; } })();
  const actions = new Set(base.prepare("SELECT DISTINCT action FROM activites").all().map((a) => a.action));
  const attendues = ["paiement_initie", "notification_recue", "notification_invalide", "activation_abonnement", "paiement_anomalie", "paiement_expire", "agregateur_indisponible", "remboursement", "renouvellement_auto"];
  controle("P12", "journal d'audit en écriture seule (㉒)", journalModif === "refusé" && journalSuppr === "refusé" && attendues.every((a) => actions.has(a)),
    "UPDATE / DELETE refusés par la base ; actions journalisées : " + attendues.filter((a) => actions.has(a)).length + "/" + attendues.length + (attendues.some((a) => !actions.has(a)) ? " — manque " + attendues.filter((a) => !actions.has(a)).join(",") : ""));

  /* ── Limitation de débit du webhook (60 / min) ── */
  const portLimite = await liberer();
  const configLimite = { ...chargerConfig({ ...envTest, URL_PUBLIQUE: "http://127.0.0.1:" + portLimite, BASE_DONNEES: ":memory:" }, BACKEND) };
  const appLimite = demarrer(configLimite, { journalConsole: { error() {}, warn() {}, log() {} } });
  await appLimite.ecouter(portLimite, "127.0.0.1");
  const urlLimite = "http://127.0.0.1:" + portLimite + "/api/paiements/notification/simulation/" + secretUrlNotification(configLimite.webhookSecret, "simulation");
  const statuts = [];
  for (let i = 0; i < 62; i += 1) statuts.push((await fetch(urlLimite, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } })).status);
  await appLimite.arreter();
  controle("P13", "notifications limitées à 60 par minute", statuts.slice(0, 60).every((s) => s === 401) && statuts.slice(60).every((s) => s === 429), "60 premières traitées (401 : non signées), 61e et 62e → 429");

  /* ── P1 / ㉜ : aucune clé de paiement dans l'application ── */
  const fichiersFront = [];
  const parcourir = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) parcourir(p); else if (/\.(html|js|json|css|txt|map)$/.test(f)) fichiersFront.push(p); } };
  parcourir(join(RACINE, "www"));
  parcourir(join(RACINE, "src"));
  const motifsCles = /sk_(live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|LIGDICASH_(API_KEY|AUTH_TOKEN)|CINETPAY_API_(KEY|PASSWORD)|FEDAPAY_(SECRET_KEY|WEBHOOK_SECRET)|PAYDUNYA[-_](MASTER|PRIVATE)|PAYDUNYA_TOKEN|STRIPE_(SECRET|WEBHOOK)|SIMULATION_SECRET|JETON_SECRET|WEBHOOK_SECRET|api_password|BEGIN (EC )?PRIVATE KEY/;
  const fautifs = fichiersFront.filter((p) => !p.includes(join("src", "scripts")) && motifsCles.test(readFileSync(p, "utf8"))).map((p) => relative(RACINE, p));
  const index = readFileSync(join(RACINE, "www", "index.html"), "utf8");
  const corpsInitier = /JSON\.stringify\(\{ formule: id \}\)/.test(readFileSync(join(RACINE, "src", "moteur.js"), "utf8"));
  controle("P1", "aucune clé de paiement dans l'application (㉜)", !fautifs.length && !/montant\s*:/.test(index.match(/paiements\/initier[\s\S]{0,400}/)?.[0] || "") && corpsInitier,
    fautifs.length ? "trouvé dans : " + fautifs.join(", ") : fichiersFront.length + " fichiers de www/ et src/ inspectés : aucune clé, aucun secret ; la demande de paiement n'envoie que { formule }");

  /* ── Les 6 adaptateurs respectent le contrat ; les 5 réels testés contre un faux agrégateur HTTP ── */
  const recues = [];
  const portFaux = await liberer();
  const reponses = {
    "POST /ligdicash/redirect/checkout-invoice/create": () => ({ response_code: "00", token: "LGTOKEN1234567", response_text: "https://pay.ligdicash.test/i/LGTOKEN1234567", description: "", wiki: "" }),
    "GET /ligdicash/redirect/checkout-invoice/confirm/": () => ({ response_code: "00", status: "completed", montant: "2500", operator_name: "Orange Money", external_id: "BP-ADAPTATEUR1", token: "LGTOKEN1234567" }),
    "POST /cinetpay/v1/oauth/login": () => ({ code: 200, status: "OK", access_token: "jeton-cinetpay", expires_in: 300 }),
    "POST /cinetpay/v1/payment": () => ({ code: 200, status: "OK", payment_url: "https://secure.cinetpay.test/p/1", transaction_id: "cp-1", notify_token: "notify-secret-1", merchant_transaction_id: "BP-ADAPTATEUR1" }),
    "GET /cinetpay/v1/payment/BP-ADAPTATEUR1": () => ({ code: 100, status: "SUCCESS", merchant_transaction_id: "BP-ADAPTATEUR1", transaction_id: "cp-1", amount: "2500", currency: "XOF", payment_method: "OM_BF" }),
    "POST /fedapay/transactions": () => ({ "v1/transaction": { id: 4242, status: "pending" } }),
    "POST /fedapay/transactions/4242/token": () => ({ token: "fp-token", url: "https://process.fedapay.test/fp-token" }),
    "GET /fedapay/transactions/4242": () => ({ "v1/transaction": { id: 4242, status: "approved", amount: 2500, currency: { iso: "XOF" }, mode: "moov_bf", merchant_reference: "BP-ADAPTATEUR1" } }),
    "POST /paydunya/checkout-invoice/create": () => ({ response_code: "00", response_text: "https://paydunya.test/checkout/invoice/PDTOKEN1", token: "PDTOKEN1" }),
    "GET /paydunya/checkout-invoice/confirm/PDTOKEN1": () => ({ response_code: "00", status: "completed", invoice: { total_amount: 2500 }, custom_data: { reference: "BP-ADAPTATEUR1" } }),
    "POST /stripe/checkout/sessions": () => ({ id: "cs_test_1", url: "https://checkout.stripe.test/c/cs_test_1" }),
    "GET /stripe/checkout/sessions/cs_test_1": () => ({ id: "cs_test_1", payment_status: "paid", status: "complete", amount_total: 2500, currency: "xof", client_reference_id: "BP-ADAPTATEUR1",
      payment_intent: { id: "pi_test_1", status: "succeeded", setup_future_usage: "off_session", customer: "cus_test", payment_method: { id: "pm_test", card: { brand: "visa" } } } }),
    "POST /stripe/refunds": () => ({ id: "re_1", status: "succeeded" })
  };
  const faux = createServer((rq, rs) => {
    let corps = "";
    rq.on("data", (m) => { corps += m; });
    rq.on("end", () => {
      const chemin = rq.url.split("?")[0];
      recues.push({ cle: rq.method + " " + chemin, entetes: rq.headers, corps, url: rq.url });
      const fabrique = reponses[rq.method + " " + chemin];
      rs.writeHead(fabrique ? 200 : 404, { "Content-Type": "application/json" });
      rs.end(JSON.stringify(fabrique ? fabrique() : { erreur: "inconnu" }));
    });
  });
  await new Promise((r) => faux.listen(portFaux, "127.0.0.1", r));
  const urlFaux = "http://127.0.0.1:" + portFaux;
  const optionsAdaptateur = (nom, cles) => ({
    mode: "test", cles, urlPublique: "https://api.exemple.bf", urlNotification: "https://api.exemple.bf/api/paiements/notification/" + nom + "/" + "f".repeat(32),
    urlRetour: (r) => "https://api.exemple.bf/paiement/retour?ref=" + r, urlAnnulation: (r) => "https://api.exemple.bf/paiement/retour?ref=" + r + "&annule=1",
    baseUrl: urlFaux + "/" + nom + (nom === "ligdicash" ? "/" : "")
  });
  const demande = { reference: "BP-ADAPTATEUR1", montant: 2500, devise: "XOF", formule: FORMULES.mensuel, telephone: "+22670112233", nom: "Awa Ouédraogo-Kaboré", email: "" };
  const adaptateurs = {
    ligdicash: fabriquerLigdicash(optionsAdaptateur("ligdicash", { LIGDICASH_API_KEY: "cle-api-ligdicash", LIGDICASH_AUTH_TOKEN: "jeton-ligdicash" })),
    cinetpay: fabriquerCinetpay(optionsAdaptateur("cinetpay", { CINETPAY_API_KEY: "cle-cinetpay", CINETPAY_API_PASSWORD: "mdp-cinetpay" })),
    fedapay: fabriquerFedapay(optionsAdaptateur("fedapay", { FEDAPAY_SECRET_KEY: "sk_sandbox_test", FEDAPAY_WEBHOOK_SECRET: "wh_sandbox_secret" })),
    paydunya: fabriquerPaydunya(optionsAdaptateur("paydunya", { PAYDUNYA_MASTER_KEY: "maitre-paydunya", PAYDUNYA_PRIVATE_KEY: "privee-paydunya", PAYDUNYA_TOKEN: "jeton-paydunya" })),
    stripe: fabriquerStripe(optionsAdaptateur("stripe", { STRIPE_SECRET_KEY: "sk_test_stripe", STRIPE_WEBHOOK_SECRET: "whsec_test_stripe" })),
    simulation: fabriquerSimulation(optionsAdaptateur("simulation", { SIMULATION_SECRET: "secret-simulation-adaptateur" }))
  };
  const pa = [];
  const t = Math.floor(Date.now() / 1000);
  const signer = (secret, corps, schema) => "t=" + t + "," + schema + "=" + hmacHex(secret, t + "." + corps);
  const corpsFeda = JSON.stringify({ name: "transaction.approved", entity: { id: 4242, merchant_reference: "BP-ADAPTATEUR1", status: "approved", amount: 2500 } });
  const corpsStripe = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_1", client_reference_id: "BP-ADAPTATEUR1", amount_total: 2500, currency: "xof" } } });
  const empreintePd = (await import("node:crypto")).createHash("sha512").update("maitre-paydunya").digest("hex");
  const notifications = {
    ligdicash: [{ entetes: {}, corpsBrut: "", corps: { token: "LGTOKEN1234567", status: "completed", custom_data: { reference: "BP-ADAPTATEUR1" } } }, { entetes: {}, corpsBrut: "", corps: { status: "completed" } }, {}],
    cinetpay: [{ entetes: {}, corpsBrut: "", corps: { notify_token: "notify-secret-1", merchant_transaction_id: "BP-ADAPTATEUR1", transaction_id: "cp-1" } }, { entetes: {}, corpsBrut: "", corps: { notify_token: "faux", merchant_transaction_id: "BP-ADAPTATEUR1" } }, { secretNotification: "notify-secret-1" }],
    fedapay: [{ entetes: { "x-fedapay-signature": signer("wh_sandbox_secret", corpsFeda, "s") }, corpsBrut: corpsFeda, corps: JSON.parse(corpsFeda) }, { entetes: { "x-fedapay-signature": signer("autre", corpsFeda, "s") }, corpsBrut: corpsFeda, corps: JSON.parse(corpsFeda) }, {}],
    paydunya: [{ entetes: {}, corpsBrut: "", corps: { "data[hash]": empreintePd, "data[status]": "completed", "data[invoice][token]": "PDTOKEN1", "data[custom_data][reference]": "BP-ADAPTATEUR1", "data[invoice][total_amount]": "2500" } }, { entetes: {}, corpsBrut: "", corps: { "data[hash]": "0".repeat(128) } }, {}],
    stripe: [{ entetes: { "stripe-signature": signer("whsec_test_stripe", corpsStripe, "v1") }, corpsBrut: corpsStripe, corps: JSON.parse(corpsStripe) }, { entetes: { "stripe-signature": signer("whsec_test_stripe", corpsStripe + " ", "v1") }, corpsBrut: corpsStripe, corps: JSON.parse(corpsStripe) }, {}]
  };
  for (const [nom, a] of Object.entries(adaptateurs)) {
    const fonctions = Object.keys(a).filter((k) => typeof a[k] === "function").sort().join();
    if (fonctions !== [...METHODES].sort().join()) pa.push(nom + " : contrat " + fonctions);
    if (nom === "simulation") continue;
    try {
      const cree = await a.creerPaiement(demande);
      if (!/^https:\/\//.test(cree.urlPaiement) || !cree.idFournisseur) pa.push(nom + " : création " + JSON.stringify(cree));
      const etat = await a.consulterStatut(cree.idFournisseur);
      if (etat.statut !== STATUTS.paye || etat.montant !== 2500 || etat.devise !== "XOF") pa.push(nom + " : statut " + JSON.stringify(etat));
      const [bonne, mauvaise, contexte] = notifications[nom];
      if (a.verifierNotification(bonne, { secretNotification: cree.secretNotification || contexte.secretNotification }) !== true) pa.push(nom + " : notification valide refusée");
      if (a.verifierNotification(mauvaise, { secretNotification: cree.secretNotification || contexte.secretNotification }) !== false) pa.push(nom + " : notification falsifiée acceptée");
      const lu = a.lireNotification(bonne);
      if (lu.reference !== "BP-ADAPTATEUR1" && lu.idFournisseur !== cree.idFournisseur) pa.push(nom + " : lecture " + JSON.stringify(lu));
    } catch (e) {
      pa.push(nom + " : " + e.message);
    }
  }
  const remb = await adaptateurs.stripe.rembourser("cs_test_1").then(() => true, () => false);
  const rembLigdi = await adaptateurs.ligdicash.rembourser("x").then(() => "accepté", (e) => e.name);
  const corpsCreation = recues.filter((r) => /create|payment$|transactions$|sessions$/.test(r.cle) && r.cle.startsWith("POST"));
  const montantsOk = corpsCreation.length === 5 && corpsCreation.every((r) => r.corps.includes("2500"));
  const sansCarte = recues.every((r) => !/card\[number\]|cvc|pin|otp":"\d/.test(r.corps));
  const authOk = recues.some((r) => r.cle.startsWith("POST /ligdicash") && r.entetes.apikey === "cle-api-ligdicash" && r.entetes.authorization === "Bearer jeton-ligdicash")
    && recues.some((r) => r.cle === "POST /cinetpay/v1/payment" && r.entetes.authorization === "Bearer jeton-cinetpay")
    && recues.some((r) => r.cle.startsWith("POST /paydunya") && r.entetes["paydunya-master-key"] === "maitre-paydunya")
    && recues.some((r) => r.cle === "POST /stripe/checkout/sessions" && /application\/x-www-form-urlencoded/.test(r.entetes["content-type"]) && r.corps.includes("line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=2500"));
  faux.close();
  if (!remb || rembLigdi !== "ErreurFournisseur") pa.push("remboursement : stripe " + remb + ", ligdicash " + rembLigdi);
  if (!montantsOk || !sansCarte || !authOk) pa.push("requêtes sortantes : montant " + montantsOk + ", sans donnée de carte " + sansCarte + ", authentification " + authOk);
  controle("AD", "6 adaptateurs au contrat identique ; LigdiCash, CinetPay, FedaPay, PayDunya, Stripe testés contre un faux agrégateur HTTP", !pa.length,
    pa.join(" ; ") || "création (lien https), statut payé 2 500 XOF, notification valide acceptée / falsifiée refusée, lecture de la référence ; aucune donnée de carte ni code Mobile Money dans les requêtes ; remboursement Stripe par API, les autres renvoient vers l'espace marchand");
} catch (e) {
  controle("✘", "exception pendant les tests", false, (e && e.stack) || String(e));
} finally {
  await app.arreter();
  rmSync(dossier, { recursive: true, force: true });
}

const echecs = resultats.filter((r) => !r.ok);
console.log("\nBâtiPlus — paiement automatique (étape 12)\n");
for (const r of resultats) console.log((r.ok ? "✔ " : "✘ ") + r.id.padEnd(4) + r.titre + "\n       " + r.detail);
console.log("\n" + (resultats.length - echecs.length) + "/" + resultats.length + " contrôles de paiement réussis.");
process.exit(echecs.length ? 1 : 0);
