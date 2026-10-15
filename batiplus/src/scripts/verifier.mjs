#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur
   Rapporte les contrôles bloquants des étapes 1-5 (①…⑫, ⑮, ⑰, ⑳, ㉑, ㉔…㉙ ; ⑬, ⑭, ⑯, ⑱, ⑲, ㉒, ㉓ dans verifier-navigateur.mjs) et les contrôles de
   sécurité du front (S①…S⑪) sur le fichier livré www/index.html.
   Code de sortie 1 si un seul contrôle échoue.
   Le contrôle ⑩ (console au chargement) exécute la page dans jsdom :
     npm i --no-save jsdom   (outil de vérification, jamais embarqué)
   Usage : npm run verifier
   ========================================================================== */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  ATTENDUS, CHANTIERS_TYPES, aleatoire, chantierAleatoire, chargerMoteur, invariants, moteurLivre, nombresInvalides, resumer, sectionMoteur
} from "./chantiers-types.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WWW = join(RACINE, "www");
const html = readFileSync(join(WWW, "index.html"), "utf8");
const resultats = [];
/* Constats de l'étape 5 relevés dans jsdom, complétés par le moteur exécuté seul (controlesMoteur). */
const etape5 = { fait: false, cas: [], persistance: [], nombres: [], bornes: [] };

function controle(numero, libelle, ok, detail) {
  resultats.push({ numero, libelle, ok: Boolean(ok), detail: detail || "" });
}

function compter(texte, regex) {
  return (texte.match(regex) || []).length;
}

/* ---------- Découpage du document ---------- */
const tete = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
const corpsComplet = html.slice(html.indexOf("<body>"), html.indexOf("</body>"));
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
const js = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || "";
const corpsSansScript = corpsComplet.replace(/<script>[\s\S]*?<\/script>/, "");
const idsPresents = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const fonctionsDeclarees = [...js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);

/* ① une seule <style>, dans <head> */
controle("①", "une seule <style>, dans <head>",
  compter(html, /<style[\s>]/g) === 1 && compter(tete, /<style[\s>]/g) === 1,
  compter(html, /<style[\s>]/g) + " balise(s) <style>");

/* ② une seule <script>, en fin de <body> */
const apresScript = html.slice(html.lastIndexOf("</script>") + 9);
controle("②", "une seule <script>, en fin de <body>",
  compter(html, /<script[\s>]/g) === 1 && /^\s*<\/body>\s*<\/html>\s*$/.test(apresScript),
  compter(html, /<script[\s>]/g) + " balise(s) <script>");

/* ③ aucun CSS/JS en dehors */
const horsBalises = [
  [/\sstyle\s*=/i, "attribut style="],
  [/\son[a-z]+\s*=\s*"/i, "gestionnaire en attribut"],
  [/<link[^>]+rel="stylesheet"/i, "feuille externe"],
  [/javascript:/i, "lien javascript:"]
].filter(([re]) => re.test(html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<script>[\s\S]*?<\/script>/, "")));
controle("③", "aucun CSS/JS en dehors des balises", horsBalises.length === 0,
  horsBalises.map(([, nom]) => nom).join(", ") || "aucun attribut style/on*, aucune feuille externe");

/* ④ accolades/parenthèses/crochets équilibrés */
let jsValide = true;
let erreurJs = "";
try { new vm.Script(js, { filename: "index.html<script>" }); } catch (e) { jsValide = false; erreurJs = e.message; }
const cssNettoye = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, "\"\"");
const cssEquilibre = compter(cssNettoye, /\{/g) === compter(cssNettoye, /\}/g)
  && compter(cssNettoye, /\(/g) === compter(cssNettoye, /\)/g)
  && compter(cssNettoye, /\[/g) === compter(cssNettoye, /\]/g);
controle("④", "accolades/parenthèses/crochets équilibrés", jsValide && cssEquilibre,
  jsValide ? (cssEquilibre ? "JS analysé sans erreur, CSS équilibré" : "CSS déséquilibré") : erreurJs);

/* ⑤ chaque getElementById / $("…") trouve son élément */
const idsDemandes = [...js.matchAll(/(?:getElementById|\$)\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
const idsManquants = [...new Set(idsDemandes)].filter((id) => !idsPresents.has(id));
controle("⑤", "chaque getElementById trouve son élément", idsManquants.length === 0,
  idsManquants.length ? "manquants : " + idsManquants.join(", ") : new Set(idsDemandes).size + " identifiants vérifiés");

/* ⑥ chaque addEventListener pointe vers une fonction définie */
const ecouteurs = [...js.matchAll(/addEventListener\(\s*"[^"]+"\s*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)].map((m) => m[1]);
const ecouteursOrphelins = [...new Set(ecouteurs)].filter((nom) => !fonctionsDeclarees.includes(nom));
const doublons = fonctionsDeclarees.filter((nom, i) => fonctionsDeclarees.indexOf(nom) !== i);
controle("⑥", "chaque addEventListener pointe vers une fonction définie",
  ecouteursOrphelins.length === 0 && doublons.length === 0,
  ecouteursOrphelins.length ? "orphelins : " + ecouteursOrphelins.join(", ")
    : doublons.length ? "fonctions redéclarées : " + doublons.join(", ")
      : new Set(ecouteurs).size + " écouteurs nommés vérifiés, aucune fonction redéclarée");

/* ⑦ chaque montrer("…") vise un écran existant */
const ecransVises = [...js.matchAll(/montrer\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]);
const depart = (js.match(/const ECRAN_DEPART = "([^"]+)"/) || [])[1];
if (depart) ecransVises.push(depart);
const ecransManquants = [...new Set(ecransVises)].filter((id) => !idsPresents.has("ecran-" + id));
controle("⑦", "chaque montrer(\"…\") vise un écran existant", ecransVises.length > 0 && ecransManquants.length === 0,
  ecransManquants.length ? "absents : " + ecransManquants.join(", ")
    : "écran(s) visé(s) : " + [...new Set(ecransVises)].join(", ") + " ; menus filtrés sur les écrans existants");

/* ⑧ aucun marqueur oublié */
const marqueurs = ["XXX", "TODO", "FIXME", "${", "@@", "lorem", "prochaines étapes"].filter((m) => html.toLowerCase().includes(m.toLowerCase()));
controle("⑧", "aucun marqueur oublié (XXX, TODO, ${…})", marqueurs.length === 0, marqueurs.join(", ") || "aucun");

/* ⑨ aucun autre métier que l'électricien */
const metiers = /plombi|ma[çc]on|menuisi|peintre|carreleu|soudeu|couvreu|m[ée]canicien|frigoriste|charpenti|serruri/i;
const metierTrouve = html.match(metiers);
controle("⑨", "aucune mention d'un autre métier", !metierTrouve, metierTrouve ? "trouvé : " + metierTrouve[0] : "électricien uniquement");

/* ⑨b le mot « serveur » n'apparaît jamais (texte visible, attributs, messages du script) */
const motInterdit = html.match(/serveur/i);
controle("⑨b", "le mot « serveur » n'apparaît nulle part dans l'application", !motInterdit, motInterdit ? "trouvé" : "0 occurrence dans index.html (interface, attributs, messages)");

/* ⑩ ⑮ ⑰ ⑳ ㉑ exécution réelle de la page dans jsdom (contexte https).
   Le script est enfermé dans une IIFE : rien n'est exposé, tout passe par l'interface. */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function controlesExecution() {
  let JSDOM, VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = await import("jsdom"));
  } catch {
    for (const n of ["⑩", "⑮", "⑰", "⑳", "㉑"]) controle(n, "exécution dans jsdom", false, "jsdom absent : npm i --no-save jsdom");
    return;
  }
  const { webcrypto } = await import("node:crypto");
  const { TextEncoder } = await import("node:util");
  const erreurs = [];
  const ignorees = [];
  const surRejet = (e) => erreurs.push("Uncaught " + String((e && e.message) || e));
  process.on("unhandledRejection", surRejet);
  process.on("uncaughtException", surRejet);
  const fenetres = [];

  function ouvrirPage(stockage, capacitor) {
    const consoleVirtuelle = new VirtualConsole();
    consoleVirtuelle.on("error", (m) => erreurs.push(String(m)));
    consoleVirtuelle.on("warn", (m) => erreurs.push("warn: " + String(m)));
    consoleVirtuelle.on("log", (m) => erreurs.push("log inattendu (DEBUG ?) : " + String(m)));
    consoleVirtuelle.on("jsdomError", (e) => {
      const msg = String(e.message || e);
      /* jsdom n'implémente ni le dessin <canvas> ni le défilement : limites de l'outil, pas de l'application. */
      if (/Not implemented: (HTMLCanvasElement(\.prototype\.|'s )getContext|(window\.|Window's )scrollTo|navigation to another Document)/.test(msg)) ignorees.push(msg.split("\n")[0]);
      else erreurs.push(msg.split("\n")[0]);
    });
    const dom = new JSDOM(html, {
      url: "https://batiplus.local/",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole: consoleVirtuelle,
      beforeParse(window) {
        window.matchMedia = (requete) => ({
          matches: Boolean(capacitor) && /max-width/.test(requete), media: requete, onchange: null,
          addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; }
        });
        /* Ce que jsdom ne fournit pas et qu'un vrai WebView fournit. */
        if (!window.crypto || !window.crypto.subtle) Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
        if (!window.TextEncoder) window.TextEncoder = TextEncoder;
        if (window.isSecureContext !== true) Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
        if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};
        if (capacitor) window.Capacitor = capacitor;
        window.localStorage.clear();
        for (const [cle, valeur] of Object.entries(stockage || {})) window.localStorage.setItem(cle, valeur);
      }
    });
    fenetres.push(dom.window);
    const w = dom.window;
    const doc = w.document;
    const $ = (id) => doc.getElementById(id);
    return {
      w, doc, $,
      actif: () => (doc.querySelector(".ecran.actif") || {}).id || "",
      texte: (id) => ($(id) || {}).textContent || "",
      taper(id, touches) {
        for (const key of touches) $(id).dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true }));
      },
      remplir(id, valeur) {
        $(id).value = valeur;
        $(id).dispatchEvent(new w.Event("input", { bubbles: true }));
      },
      choisir(id, valeur) {
        $(id).value = valeur;
        $(id).dispatchEvent(new w.Event("change", { bubbles: true }));
      },
      async soumettre(id, ms) {
        $(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
        await pause(ms || 900);
      },
      stockage: () => ({ ...w.localStorage })
    };
  }

  try {
    /* ---------- Page 1 : première ouverture, stockage vierge ---------- */
    const K = { pres: "bp_v1_presentation_vue", comptes: "bp_v1_comptes", session: "bp_v1_session", verrou: "bp_v1_verrou", devis: "bp_v1_devis" };
    const p = ouvrirPage();
    await pause(300);
    const splash = p.actif() === "ecran-demarrage" && p.doc.body.dataset.mode === "entree"
      && p.doc.querySelector("#ecran-demarrage [data-logo] img") !== null;
    await pause(1500);
    const apresSplash = p.actif();
    controle("D", "écran de démarrage puis présentation à la 1re ouverture", splash && apresSplash === "ecran-presentation",
      "démarrage plein écran (mode entrée, logo image) → " + apresSplash.replace("ecran-", "") + " après 1,5 s");

    const plateforme = p.texte("etat-plateforme");
    p.$("bouton-theme").click();
    await pause(50);
    const themeApres = p.doc.documentElement.getAttribute("data-theme");
    p.$("bouton-diapo-suivante").click();
    const diapo2 = p.$("diapos").style.transform === "translateX(-100%)" && p.texte("libelle-diapo-suivante") === "Suivant";
    p.$("bouton-diapo-suivante").click();
    p.$("bouton-diapo-suivante").click();
    const derniere = p.texte("libelle-diapo-suivante") === "Commencer";
    p.$("bouton-diapo-suivante").click();
    await pause(100);
    const versAuth = p.actif() === "ecran-connexion" && p.stockage()[K.pres] === "1"
      && p.$("panneau-connexion").hidden && !p.$("panneau-inscription").hidden;
    const fonctionne = plateforme === "Navigateur web" && themeApres === "sombre" && diapo2 && derniere && versAuth;

    /* ⑮ détection du pays (saisie réelle dans le champ téléphone de l'inscription) */
    const cas = [
      ["+226 05 60 86 08", "BF", "BF", "+22605608608"],
      ["0022670123456", "SN", "BF", "+22670123456"],
      ["70 12 34 56", "BF", "BF", "+22670123456"],
      ["+225 07 08 09 10 11", "BF", "CI", "+2250708091011"],
      ["+221 77 123 45 67", "BF", "SN", "+221771234567"],
      ["+237 6 71 23 45 67", "BF", "CM", "+237671234567"],
      ["+33 6 12 34 56 78", "BF", "FR", "+33612345678"],
      ["+234 0803 123 4567", "BF", "NG", "+2348031234567"],
      ["+1 514 555 0199", "BF", "CA", "+15145550199"],
      ["+1 212 555 0199", "US", "US", "+12125550199"],
      ["+27 82 123 4567", "BF", "ZA", "+27821234567"]
    ];
    const devisesAttendues = { BF: "XOF", CI: "XOF", SN: "XOF", CM: "XAF", FR: "EUR", NG: "NGN", CA: "CAD", US: "USD", ZA: "ZAR" };
    const ratesPays = cas.filter(([saisie, pref, iso, e164]) => {
      p.remplir("ins-telephone", "");
      p.choisir("ins-pays", pref);
      p.remplir("ins-telephone", saisie);
      const apercu = p.texte("apercu-ins-telephone");
      const numero = (apercu.split(" — ")[1] || "").replace(/\s/g, "");
      return p.$("ins-pays").value !== iso || p.$("ins-devise").value !== devisesAttendues[iso] || numero !== e164;
    }).map((c) => c[0]);
    const refus = ["+226 5 60", "+999 123456789", "12", "+226 05 60 86 08 99"].filter((saisie) => {
      p.choisir("ins-pays", "BF");
      p.remplir("ins-telephone", saisie);
      return p.texte("apercu-ins-telephone").includes(" — ");
    });
    p.remplir("ins-telephone", "");
    p.choisir("ins-pays", "BF");
    controle("⑮", "pays et devise détectés depuis l'indicatif", ratesPays.length === 0 && refus.length === 0,
      ratesPays.length ? "ratés : " + ratesPays.join(" ; ")
        : refus.length ? "acceptés à tort : " + refus.join(" ; ")
          : cas.length + " numéros (226 avant 22, préfixe 00, 0 national, +1 CA/US) + 4 refus ; pays, devise et format +226 05 60 86 08");

    /* ⑰ inscription, session, déconnexion, connexion, blocage, injection */
    const problemes = [];
    const nomPiege = "<img src=x onerror=alert(1)>Awa Traoré";
    p.$("ins-nom").value = "";
    await p.soumettre("panneau-inscription", 100);
    if (p.w.document.activeElement !== p.$("ins-nom") || !p.texte("err-ins-nom")) problemes.push("formulaire vide : pas d'erreur sur le 1er champ");
    p.remplir("ins-nom", nomPiege);
    p.remplir("ins-ville", "Ouagadougou");
    p.remplir("ins-telephone", "+226 70 11 22 33");
    p.taper("ins-code", ["1", "2", "3", "4"]);
    p.taper("ins-confirmation", ["1", "2", "3", "4"]);
    p.$("ins-conditions").checked = true;
    await p.soumettre("panneau-inscription", 200);
    if (!p.texte("err-ins-code").includes("trop simple")) problemes.push("code 1234 accepté");
    p.taper("ins-code", ["Backspace", "Backspace", "Backspace", "Backspace", "2", "5", "8", "0", "7", "1"]);
    p.taper("ins-confirmation", ["Backspace", "Backspace", "Backspace", "Backspace", "2", "5", "8", "0", "7", "9"]);
    await p.soumettre("panneau-inscription", 200);
    if (!p.texte("err-ins-confirmation")) problemes.push("confirmation différente acceptée");
    p.taper("ins-confirmation", ["Backspace", "1"]);
    const html1 = p.doc.documentElement.outerHTML;
    if (html1.includes("258071") || [...p.doc.querySelectorAll("input")].some((i) => i.value.includes("258071"))) problemes.push("code visible dans le DOM");
    if (p.doc.querySelectorAll("#ins-code .code-case.pleine").length !== 6) problemes.push("cases du code non remplies");
    await p.soumettre("panneau-inscription", 1200);
    if (p.actif() !== "ecran-accueil") problemes.push("inscription n'ouvre pas l'accueil (" + p.actif() + " : " + p.texte("msg-inscription") + ")");
    if (p.doc.querySelector("#tiroir [data-nom]").textContent !== nomPiege) problemes.push("nom mal affiché");
    if (p.doc.querySelector("img[src='x']")) problemes.push("XSS : balise injectée");
    if (p.texte("accueil-telephone") !== "+226 70 11 22 33") problemes.push("téléphone mal formaté : " + p.texte("accueil-telephone"));
    if (JSON.stringify(p.stockage()).includes("258071")) problemes.push("code en clair dans le stockage");
    const comptes = JSON.parse(p.stockage()[K.comptes] || "[]");
    const compte = comptes[0];
    if (!compte || compte.iterations < 150000 || !compte.sel || !compte.empreinte || compte.code) problemes.push("empreinte PBKDF2 absente");
    const stockageInscrit = p.stockage();

    p.$("bouton-deconnexion").click();
    await pause(150);
    if (p.actif() !== "ecran-connexion" || p.stockage()[K.session]) problemes.push("déconnexion incomplète");
    if (p.doc.querySelectorAll("#comptes-liste .compte-puce").length !== 1 || p.$("comptes-appareil").hidden) problemes.push("compte de l'appareil non proposé");
    else if (p.texte("comptes-liste").includes("70 11 22 33")) problemes.push("numéro complet affiché dans la liste des comptes");

    p.remplir("cnx-telephone", "+226 70 11 22 33");
    for (let i = 1; i <= 4; i++) {
      p.taper("cnx-code", ["9", "9", "9", "1"]);
      await p.soumettre("panneau-connexion", 700);
    }
    if (!p.texte("msg-connexion").includes("Encore 1 essai")) problemes.push("compteur d'essais absent : « " + p.texte("msg-connexion") + " »");
    p.taper("cnx-code", ["9", "9", "9", "1"]);
    await p.soumettre("panneau-connexion", 700);
    if (p.$("msg-blocage").hidden || !p.$("bouton-connexion").disabled) problemes.push("pas de blocage après 5 échecs");
    p.taper("cnx-code", ["2", "5", "8", "0", "7", "1"]);
    await p.soumettre("panneau-connexion", 700);
    if (p.actif() === "ecran-accueil") problemes.push("connexion acceptée pendant le blocage");
    const blocage = p.texte("texte-blocage");
    const verrou = JSON.parse(p.stockage()[K.verrou] || "{}");

    /* Inconnu : même message générique, rien ne révèle si le numéro existe. */
    const q = ouvrirPage({ [K.pres]: "1", [K.comptes]: stockageInscrit[K.comptes] });
    await pause(1800);
    if (q.actif() !== "ecran-connexion" || q.$("panneau-connexion").hidden) problemes.push("sans session : connexion attendue");
    q.remplir("cnx-telephone", "+226 70 99 88 77");
    q.taper("cnx-code", ["2", "5", "8", "0", "7", "1"]);
    await q.soumettre("panneau-connexion", 700);
    if (!q.texte("msg-connexion").startsWith("Téléphone ou code incorrect.")) problemes.push("message différent pour un numéro inconnu");
    /* Un appui sur le compte de l'appareil remplit le téléphone. */
    q.doc.querySelector("#comptes-liste .compte-puce").click();
    await pause(100);
    if (q.$("cnx-telephone").value.replace(/\s/g, "") !== "+22670112233") problemes.push("le choix du compte ne remplit pas le téléphone");
    q.taper("cnx-code", ["2", "5", "8", "0", "7", "1"]);
    await q.soumettre("panneau-connexion", 900);
    if (q.actif() !== "ecran-accueil") problemes.push("bon code refusé (" + q.texte("msg-connexion") + ")");
    if (q.stockage()[K.verrou]) problemes.push("compteur non remis à zéro après succès");

    /* Session reprise au redémarrage ; compte affaibli (itérations) rejeté. */
    const r = ouvrirPage(q.stockage());
    await pause(1800);
    if (r.actif() !== "ecran-accueil" || r.doc.querySelector("#tiroir [data-nom]").textContent !== nomPiege) problemes.push("session non reprise au redémarrage");
    const affaibli = JSON.stringify([{ ...compte, iterations: 1 }]);
    const t = ouvrirPage({ ...q.stockage(), [K.comptes]: affaibli });
    await pause(1800);
    if (t.actif() !== "ecran-accueil" && t.actif() !== "ecran-connexion") problemes.push("état inattendu");
    if (t.actif() === "ecran-accueil") problemes.push("compte affaibli accepté");
    const u = ouvrirPage({ [K.pres]: "1", [K.verrou]: JSON.stringify({ echecs: 9, jusqua: Date.now() + 9e12 }) });
    await pause(1800);
    const texteU = u.texte("texte-blocage");
    const minutes = Number((texteU.match(/(\d+):\d\d/) || [])[1]);
    if (!(minutes <= 15)) problemes.push("verrou falsifié non plafonné : " + texteU);

    controle("⑰", "compte : inscription, connexion, blocage, aucune injection", problemes.length === 0,
      problemes.join(" ; ") || "1er champ invalide ciblé, 1234 refusé, codes différents refusés, code absent du DOM et du stockage (PBKDF2 "
        + compte.iterations.toLocaleString("fr-FR") + "), nom piégé affiché en texte, déconnexion, comptes de l'appareil (numéro masqué), 5 échecs → verrou " + verrou.echecs
        + " et « " + blocage + " », message identique pour un inconnu, bon code accepté, session reprise, compte affaibli rejeté, verrou plafonné à 15 min");

    /* ---------- Étape 3 : migration des anciennes clés ---------- */
    const sessionActive = q.stockage()[K.session];
    const migration = [];
    const m = ouvrirPage({ "bp.presentation-vue": "1", "bp.comptes": stockageInscrit[K.comptes], "bp.session": sessionActive, "bp.theme": "sombre" });
    await pause(1800);
    const sm = m.stockage();
    if (m.actif() !== "ecran-accueil") migration.push("session d'avant v1 non reprise (" + m.actif() + ")");
    if (Object.keys(sm).some((cle) => cle.startsWith("bp."))) migration.push("anciennes clés non supprimées");
    if (sm[K.comptes] !== stockageInscrit[K.comptes] || sm.bp_v1_theme !== "sombre") migration.push("valeurs non reprises");
    const m2 = ouvrirPage({ [K.pres]: "1", "bp.comptes": "[]", [K.comptes]: stockageInscrit[K.comptes], [K.session]: sessionActive });
    await pause(1800);
    if (m2.stockage()[K.comptes] !== stockageInscrit[K.comptes]) migration.push("une ancienne clé a écrasé une clé v1");
    controle("S⑤", "stockage versionné bp_v1_*, anciennes clés reprises une seule fois", migration.length === 0,
      migration.join(" ; ") || "bp.* → bp_v1_* au démarrage, anciennes clés supprimées, jamais d'écrasement d'une clé v1 existante");

    /* ---------- Étape 3 : accueil, compteurs, derniers devis ---------- */
    const maintenant = Date.now();
    const jour = 86400000;
    const listeDevis = [
      { id: "d1", compteId: compte.id, titre: "Villa R+1 Ouaga 2000", client: "<img src=x onerror=alert(2)>Kaboré", total: 125000000, statut: "accepte", creeLe: new Date(maintenant - 1000).toISOString() },
      { id: "d2", compteId: compte.id, titre: "Boutique Zogona", client: "Mme Sawadogo", total: 850000, statut: "envoye", creeLe: new Date(maintenant - 2000).toISOString() },
      { id: "d3", compteId: compte.id, titre: "Atelier Kossodo", client: "M. Ilboudo", total: 2400000, statut: "brouillon", creeLe: new Date(maintenant - 3000).toISOString() },
      { id: "d4", compteId: compte.id, titre: "Ancien chantier", client: "M. Ilboudo", total: 100000, statut: "accepte", creeLe: new Date(maintenant - 400 * jour).toISOString() },
      { id: "x1", compteId: "autre-compte", titre: "Pas à moi", client: "Inconnu", total: 999, statut: "accepte", creeLe: new Date(maintenant).toISOString() },
      { id: "x2", compteId: compte.id, titre: "Invalide", client: "Faux", total: -5, statut: "accepte", creeLe: new Date(maintenant).toISOString() },
      { id: "x3", compteId: compte.id, titre: "Statut inconnu", client: "Faux", total: 5, statut: "<b>pirate</b>", creeLe: new Date(maintenant).toISOString() }
    ];
    const a = ouvrirPage({ ...q.stockage(), [K.devis]: JSON.stringify(listeDevis), bp_v1_abonnement: JSON.stringify({ formule: "vie", fin: null }) });
    /* Échantillonne le compteur pendant l'animation : il doit passer par des valeurs intermédiaires. */
    const valeursCompteur = new Set();
    for (let i = 0; i < 64; i++) {
      await pause(40);
      if (a.actif() === "ecran-accueil") valeursCompteur.add(a.texte("cpt-montant"));
    }
    const accueil = [];
    const nb = (s) => s.replace(/[\s\u202f\u00a0]/g, " ");
    const montantAttendu = nb(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(128350000)) + " FCFA";
    if (a.actif() !== "ecran-accueil") accueil.push("accueil absent");
    if (a.texte("accueil-prenom") !== "<img") accueil.push("prénom : « " + a.texte("accueil-prenom") + " »");
    if (nb(a.texte("cpt-montant")) !== montantAttendu) accueil.push("montant total : « " + a.texte("cpt-montant") + " » au lieu de « " + montantAttendu + " »");
    if (a.texte("cpt-devis") !== "3") accueil.push("devis du mois : " + a.texte("cpt-devis"));
    if (a.texte("cpt-acceptes") !== "2") accueil.push("acceptés : " + a.texte("cpt-acceptes"));
    if (a.texte("cpt-jours") !== "∞") accueil.push("jours restants : " + a.texte("cpt-jours"));
    if (a.texte("accueil-quota") !== "3 / 5 devis ce mois") accueil.push("quota : « " + a.texte("accueil-quota") + " »");
    const lignes = [...a.doc.querySelectorAll("#accueil-devis li")];
    if (lignes.length !== 3 || !lignes[0].textContent.includes("Villa R+1") || !lignes[2].textContent.includes("Atelier Kossodo")) accueil.push("3 derniers devis mal triés");
    if (lignes[0] && !lignes[0].querySelector(".statut[data-ton='ok']")) accueil.push("statut en pastille absent");
    if (a.doc.querySelector("img[src='x']") || a.doc.querySelector("#accueil-devis b")) accueil.push("XSS dans les devis");
    if (!a.texte("astuce-texte") || !/\d{4}/.test(a.texte("accueil-date"))) accueil.push("astuce ou date absente");
    if (!a.$("accueil-devis-vide").hidden) accueil.push("message « aucun devis » affiché");
    if (a.$("bouton-nouveau-chantier").hidden !== !a.$("ecran-nouveau-chantier")) accueil.push("bouton Nouveau chantier : visibilité incohérente avec l'écran");
    if ([...a.doc.querySelectorAll("[data-ecran]")].some((l) => !l.hidden && !a.$("ecran-" + l.dataset.ecran))) accueil.push("lien vers un écran absent visible");
    if (valeursCompteur.size < 3) accueil.push("compteur non animé (" + valeursCompteur.size + " valeur(s))");
    controle("A", "accueil : compteurs animés, 3 derniers devis, astuce du jour", accueil.length === 0,
      accueil.join(" ; ") || "4 compteurs animés (" + valeursCompteur.size + " valeurs vues en 700 ms) : " + a.texte("cpt-montant").replace(/\s/g, " ") + ", 3 ce mois, 2 acceptés, ∞ ; devis d'un autre compte et devis falsifiés ignorés ; client piégé affiché en texte");

    /* ⑳ une seule formule partout, jamais lue dans le stockage */
    const formules = [...a.doc.querySelectorAll("[data-formule]")].map((el) => el.textContent);
    const formuleOk = formules.length >= 3 && formules.every((f) => f === "Gratuit");
    controle("⑳", "la formule affichée est identique partout", formuleOk,
      formuleOk ? formules.length + " emplacements (menu, accueil, profil) = « Gratuit » via libelleFormule() ; « vie » injecté dans le stockage ignoré"
        : "affichages : " + JSON.stringify(formules));

    /* Recherche, navigation, historique */
    const nav = [];
    a.$("bouton-recherche").click();
    await pause(50);
    if (a.$("recherche").hidden) nav.push("recherche fermée");
    a.remplir("recherche-saisie", "CODE secret");
    const resultats = [...a.doc.querySelectorAll("#recherche-resultats .recherche-resultat")].map((b) => b.textContent);
    if (!resultats.length || !/code secret/i.test(resultats[0])) nav.push("recherche « CODE secret » : " + JSON.stringify(resultats));
    a.remplir("recherche-saisie", "electricite");
    a.remplir("recherche-saisie", "zzzz");
    if (a.$("recherche-vide").hidden) nav.push("aucun message si rien ne correspond");
    a.remplir("recherche-saisie", "propos");
    a.$("recherche-saisie").dispatchEvent(new a.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await pause(100);
    if (a.actif() !== "ecran-a-propos" || !a.$("recherche").hidden) nav.push("Entrée n'ouvre pas À propos (" + a.actif() + ")");
    a.doc.querySelector("#tiroir-menu [data-ecran='profil']").click();
    await pause(100);
    if (a.actif() !== "ecran-profil") nav.push("menu → profil : " + a.actif());
    const menu = [...a.doc.querySelectorAll("#tiroir-menu [data-ecran]")].map((l) => l.dataset.ecran);
    if (menu.some((e) => !a.$("ecran-" + e))) nav.push("menu vers un écran absent : " + menu.join(","));
    if (a.doc.querySelector("#tiroir-menu [data-ecran='profil']").getAttribute("aria-current") !== "page") nav.push("aria-current absent");
    if (a.texte("etat-version") !== "1.0.0") nav.push("version absente");
    controle("N3", "navigation : recherche, menu, liens filtrés", nav.length === 0,
      nav.join(" ; ") || "recherche sans accents ni majuscules, Entrée ouvre le 1er résultat, menu limité aux écrans existants (" + menu.join(", ") + "), aria-current");

    /* Profil : informations, conditions, code secret */
    const profil = [];
    if (a.$("pro-nom").value !== nomPiege || a.$("pro-ville").value !== "Ouagadougou" || a.$("pro-pays").value !== "BF" || a.$("pro-devise").value !== "XOF") profil.push("profil mal rempli");
    if (a.texte("profil-telephone") !== "+226 70 11 22 33") profil.push("téléphone du profil : " + a.texte("profil-telephone"));
    if (a.texte("stat-devis") !== "4" || a.texte("stat-clients") !== "3" || a.texte("stat-acceptes") !== "2" || a.texte("stat-taux") !== "50\u00A0%") profil.push("statistiques : " + ["stat-devis", "stat-clients", "stat-taux", "stat-acceptes"].map((id) => a.texte(id)).join(" | "));
    a.remplir("pro-nom", "");
    await a.soumettre("carte-infos", 200);
    if (!a.texte("err-pro-nom") || a.doc.activeElement !== a.$("pro-nom")) profil.push("nom vide accepté");
    a.remplir("pro-nom", "Awa Traoré");
    a.remplir("pro-entreprise", "Lumière Pro");
    a.remplir("pro-ville", "Bobo-Dioulasso");
    a.remplir("pro-telephone", "+225 07 08 09 10 11");
    await a.soumettre("carte-infos", 300);
    if (a.$("pro-pays").value !== "CI" || a.$("pro-devise").value !== "XOF") profil.push("détection du pays dans le profil");
    const apresProfil = JSON.parse(a.stockage()[K.comptes])[0];
    if (apresProfil.nom !== "Awa Traoré" || apresProfil.ville !== "Bobo-Dioulasso" || apresProfil.telephone !== "+2250708091011" || apresProfil.pays !== "CI") profil.push("profil non enregistré : " + a.texte("msg-profil"));
    if ([...a.doc.querySelectorAll("[data-nom]")].some((el) => el.textContent !== "Awa Traoré")) profil.push("nom non propagé au menu");
    a.doc.querySelector("#tiroir-menu [data-ecran='accueil']").click();
    await pause(100);
    if (a.texte("accueil-prenom") !== "Awa") profil.push("prénom de l'accueil : " + a.texte("accueil-prenom"));
    a.doc.querySelector("#tiroir-menu [data-ecran='profil']").click();
    await pause(100);
    if ([...a.doc.querySelectorAll("[data-initiales]")].some((el) => el.textContent !== "AT")) profil.push("initiales : " + a.doc.querySelector("[data-initiales]").textContent);
    if (apresProfil.empreinte !== compte.empreinte) profil.push("le profil a modifié l'empreinte du code");
    a.remplir("pro-conditions", "Acompte de 50 % à la commande.\n\n\n\n<b>Solde</b> à la réception.");
    if (!/\d+ \/ 1000/.test(a.texte("compteur-conditions").replace(/\s/g, " "))) profil.push("compteur des conditions : " + a.texte("compteur-conditions"));
    await a.soumettre("carte-conditions", 200);
    const conditions = JSON.parse(a.stockage()[K.comptes])[0].conditions;
    if (conditions !== "Acompte de 50 % à la commande.\n\n<b>Solde</b> à la réception.") profil.push("conditions : " + JSON.stringify(conditions));
    a.taper("pro-ancien", ["1", "1", "1", "1", "1", "2"]);
    a.taper("pro-nouveau", ["3", "6", "9", "2", "4", "7"]);
    a.taper("pro-confirmation", ["3", "6", "9", "2", "4", "7"]);
    await a.soumettre("carte-code", 900);
    if (!a.texte("err-pro-ancien").includes("incorrect")) profil.push("ancien code faux accepté : " + a.texte("err-pro-ancien"));
    a.taper("pro-ancien", ["2", "5", "8", "0", "7", "1"]);
    a.taper("pro-nouveau", ["3", "6", "9", "2", "4", "7"]);
    a.taper("pro-confirmation", ["3", "6", "9", "2", "4", "7"]);
    if (a.doc.documentElement.outerHTML.includes("369247")) profil.push("nouveau code visible dans le DOM");
    await a.soumettre("carte-code", 1500);
    const apresCode = JSON.parse(a.stockage()[K.comptes])[0];
    if (!a.texte("msg-code").startsWith("Code secret changé") || apresCode.empreinte === compte.empreinte || apresCode.sel === compte.sel) profil.push("code non changé : " + a.texte("msg-code") + a.texte("err-pro-ancien") + a.texte("err-pro-nouveau"));
    if (JSON.stringify(a.stockage()).includes("369247")) profil.push("nouveau code en clair");
    controle("P", "profil : infos, conditions, code secret, statistiques", profil.length === 0,
      profil.join(" ; ") || "nom vide refusé, pays/devise détectés (CI), nom et initiales propagés, conditions nettoyées (texte brut, 1000 max), ancien code faux refusé, nouveau code dérivé avec un nouveau sel, jamais en clair");

    /* Export et import de sauvegarde */
    const sauvegarde = [];
    let exporte = null;
    a.w.URL.createObjectURL = (blob) => { exporte = blob; return "blob:https://batiplus.local/test"; };
    a.w.URL.revokeObjectURL = () => {};
    a.$("bouton-exporter").click();
    await pause(100);
    const contenuExport = exporte ? JSON.parse(await exporte.text()) : {};
    if (contenuExport.format !== "batiplus-sauvegarde" || contenuExport.version !== 1 || contenuExport.profil?.nom !== "Awa Traoré") sauvegarde.push("export incomplet");
    const texteExport = JSON.stringify(contenuExport);
    if (/empreinte|sel|iterations|telephone|formule|abonnement|session/.test(texteExport)) sauvegarde.push("l'export contient des données sensibles");
    async function importer(contenu, nom, ok) {
      const fichier = new a.w.File([contenu], nom || "sauvegarde.json", { type: "application/json" });
      Object.defineProperty(a.$("fichier-sauvegarde"), "files", { value: [fichier], configurable: true });
      a.$("fichier-sauvegarde").dispatchEvent(new a.w.Event("change", { bubbles: true }));
      await pause(300);
      if (ok && !a.$("modale").hidden) {
        a.$("bouton-modale-ok").click();
        await pause(400);
      }
      return a.texte("msg-sauvegarde");
    }
    const valide = { format: "batiplus-sauvegarde", version: 1, exporteLe: new Date().toISOString(),
      profil: { nom: "Issa Ouédraogo", entreprise: "BRG test", ville: "Koudougou", pays: "BF", devise: "XOF", conditions: "Paiement à 30 jours." } };
    const msgValide = await importer(JSON.stringify(valide), "ok.json", true);
    const apresImport = JSON.parse(a.stockage()[K.comptes])[0];
    if (msgValide !== "Sauvegarde importée." || apresImport.nom !== "Issa Ouédraogo" || apresImport.ville !== "Koudougou") sauvegarde.push("import valide refusé : " + msgValide);
    if (apresImport.telephone !== "+2250708091011" || apresImport.empreinte !== apresCode.empreinte) sauvegarde.push("l'import a touché au téléphone ou au code");
    if (a.$("pro-ville").value !== "Koudougou") sauvegarde.push("profil non rafraîchi");
    const refusImport = [
      ["formule à la racine", JSON.stringify({ ...valide, formule: "vie" })],
      ["abonnement dans le profil", JSON.stringify({ ...valide, profil: { ...valide.profil, abonnement: { formule: "vie" } } })],
      ["prototype", "{\"format\":\"batiplus-sauvegarde\",\"version\":1,\"exporteLe\":\"2026-01-01\",\"profil\":{\"nom\":\"A\",\"ville\":\"B\",\"pays\":\"BF\",\"devise\":\"XOF\",\"__proto__\":{\"x\":1}}}"],
      ["JSON invalide", "{pas du json"],
      ["autre format", JSON.stringify({ ...valide, format: "autre" })],
      ["pays inconnu", JSON.stringify({ ...valide, profil: { ...valide.profil, pays: "XX" } })],
      ["image SVG", JSON.stringify({ ...valide, profil: { ...valide.profil, photo: "data:image/svg+xml;base64,PHN2Zz4=" } })],
      ["plus de 2 Mo", "x".repeat(2 * 1024 * 1024 + 10)]
    ];
    for (const [nomCas, contenu] of refusImport) {
      const msg = await importer(contenu, nomCas + ".json", false);
      if (!a.$("modale").hidden) { a.$("bouton-modale-annuler").click(); await pause(100); sauvegarde.push(nomCas + " : confirmation proposée"); }
      if (msg === "Sauvegarde importée." || !msg) sauvegarde.push(nomCas + " : accepté");
    }
    if (JSON.parse(a.stockage()[K.comptes])[0].nom !== "Issa Ouédraogo") sauvegarde.push("un import refusé a modifié le compte");
    if ([...a.doc.querySelectorAll("[data-formule]")].some((el) => el.textContent !== "Gratuit")) sauvegarde.push("formule modifiée par un import");
    controle("S⑥", "sauvegarde : export sans secret, import validé champ par champ", sauvegarde.length === 0,
      sauvegarde.join(" ; ") || "export JSON (profil seul, ni code ni téléphone ni abonnement) ; import valide confirmé ; " + refusImport.length + " fichiers refusés (formule, abonnement, __proto__, JSON invalide, format, pays, SVG, > 2 Mo)");

    /* Accès admin caché : appui long 3 s, code vérifié par l'API uniquement */
    const admin = [];
    const appels = [];
    a.w.fetch = async (url, options) => { appels.push({ url, options }); return { status: 401, ok: false }; };
    a.w.AbortController = a.w.AbortController || AbortController;
    a.doc.querySelector("#tiroir-menu [data-ecran='a-propos']").click();
    await pause(100);
    const logoApropos = a.$("logo-apropos");
    logoApropos.dispatchEvent(new a.w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    await pause(1000);
    logoApropos.dispatchEvent(new a.w.MouseEvent("pointerup", { bubbles: true }));
    await pause(2300);
    if (a.actif() === "ecran-admin") admin.push("appui court de 1 s accepté");
    logoApropos.dispatchEvent(new a.w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    await pause(3150);
    if (a.actif() !== "ecran-admin") admin.push("appui long de 3 s sans effet (" + a.actif() + ")");
    a.$("adm-code").value = "123456";
    await a.soumettre("form-admin", 200);
    if (appels.length !== 1 || appels[0].url !== "https://api.batiplus.bf/api/admin/session" || appels[0].options.credentials !== "omit") admin.push("appel API inattendu : " + JSON.stringify(appels.map((x) => x.url)));
    if (a.texte("msg-admin") !== "Code incorrect." || a.$("adm-code").value !== "") admin.push("réponse 401 : " + a.texte("msg-admin"));
    if (/admin.{0,20}[:=]\s*["']\d{4,}/i.test(js)) admin.push("code admin dans le script");
    controle("S⑦", "accès admin caché, code vérifié par l'API seulement", admin.length === 0,
      admin.join(" ; ") || "appui de 1 s ignoré, appui de 3 s → écran de code ; code envoyé en POST à l'API (credentials omit), 401 → « Code incorrect. », champ vidé ; aucun code dans l'application");

    /* ---------- Étape 5 : assistant Nouveau chantier (㉖ ㉗ ㉘ ㉙, partie interface) ---------- */
    {
      const KC = { chantiers: "bp_v1_chantiers", brouillon: "bp_v1_brouillon_chantier" };
      const base = { [K.pres]: "1", [K.comptes]: stockageInscrit[K.comptes], [K.session]: sessionActive };
      const brouillonDe = (page) => {
        try { return JSON.parse(page.stockage()[KC.brouillon] || "{}")[compte.id] || null; } catch { return null; }
      };
      const nb = (s) => s.replace(/[\s\u202f\u00a0]/g, " ");
      const fcfa = (n) => nb(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)) + " FCFA";
      const suivant = async (page, ms) => { page.$("bouton-etape-suivante").click(); await pause(ms || 150); };
      const etapeVisible = (page) => [1, 2, 3, 4, 5].find((n) => !page.$("etape-chantier-" + n).hidden) || 0;
      const nombresEcran = (page, ou) => {
        const texte = page.$("ecran-nouveau-chantier").textContent;
        const valeurs = [...page.$("ecran-nouveau-chantier").querySelectorAll("input")].map((i) => i.value).join(" ");
        const motif = /(?:^|[^0-9A-Za-zÀ-ÿ])(NaN|Infinity|undefined|-\s?\d)/;
        const tout = texte + " " + valeurs;
        if (motif.test(tout)) etape5.nombres.push(ou + " : « " + tout.slice(Math.max(0, tout.search(motif) - 20), tout.search(motif) + 20) + " »");
      };

      const c1 = ouvrirPage(base);
      await pause(1800);
      const onglet = c1.doc.querySelector("#onglets [data-ecran='nouveau-chantier']");
      if (!onglet || onglet.hidden || c1.$("bouton-nouveau-chantier").hidden) etape5.persistance.push("accès Nouveau chantier absent (onglet ou accueil)");
      c1.$("bouton-nouveau-chantier").click();
      await pause(200);
      if (c1.actif() !== "ecran-nouveau-chantier") etape5.persistance.push("écran non ouvert (" + c1.actif() + ")");
      if (c1.doc.querySelectorAll("#progression-chantier .progression-pas").length !== 5) etape5.persistance.push("progression sans 5 étapes");
      await suivant(c1);
      if (etapeVisible(c1) !== 1 || !c1.texte("err-chantier-client")) etape5.persistance.push("étape 1 vide acceptée");
      c1.remplir("chantier-client", "<img src=x onerror=alert(5)>Ouédraogo");
      c1.remplir("chantier-telephone", "70 11 22 44");
      c1.remplir("chantier-nom", "Studio Gounghin");
      c1.remplir("chantier-lieu", "Gounghin, Ouagadougou");
      c1.doc.querySelector("input[name='chantier-type'][value='appartement']").click();
      await suivant(c1, 250);
      if (etapeVisible(c1) !== 2) etape5.persistance.push("étape 1 valide refusée (" + c1.texte("err-chantier-telephone") + ")");
      await suivant(c1);
      if (etapeVisible(c1) !== 2 || !c1.texte("msg-etape-2")) etape5.persistance.push("étape 2 sans pièce acceptée");

      /* ㉙ à la saisie : 0,2 et 5 000 refusés (et quelques pièges), 0,5 et 2 000 acceptés. */
      const ajouter = async (type, surface) => {
        c1.choisir("piece-type", type);
        c1.remplir("piece-surface", surface);
        c1.$("bouton-ajouter-piece").click();
        await pause(40);
      };
      const refusees = [];
      for (const s of ["0,2", "5000", "5 000", "abc", "2000,5", "-3", "0,49", "", "1e3", "Infinity"]) {
        await ajouter("sejour", s);
        if (c1.doc.querySelectorAll("#liste-pieces .piece").length !== 0) { refusees.push(s); c1.doc.querySelector("#liste-pieces [data-action-piece='supprimer']").click(); }
      }
      if (refusees.length) etape5.bornes.push("surfaces acceptées à tort : " + refusees.join(", "));
      if (!c1.texte("err-piece-surface").includes("0,5") || !c1.texte("err-piece-surface").includes("2 000")) etape5.bornes.push("message de bornes absent : « " + c1.texte("err-piece-surface") + " »");
      await ajouter("garage", "0,5");
      await ajouter("garage", "2000");
      if (c1.doc.querySelectorAll("#liste-pieces .piece").length !== 2) etape5.bornes.push("0,5 ou 2 000 m² refusé");
      for (let i = 0; i < 5 && c1.doc.querySelector("#liste-pieces [data-action-piece='supprimer']"); i++) c1.doc.querySelector("#liste-pieces [data-action-piece='supprimer']").click();
      await pause(40);
      await ajouter("sejour", "18");
      await ajouter("salle-eau", "4");
      await ajouter("wc", "3");
      const cartes = c1.doc.querySelectorAll("#liste-pieces .piece");
      if (cartes.length !== 3) etape5.persistance.push(cartes.length + " pièce(s) au lieu de 3");
      else {
        const p1 = cartes[0].querySelector("[data-champ-piece='surface']");
        for (const s of ["5000", "0,2"]) {
          c1.remplir(p1.id, s);
          if (!p1.closest(".champ").classList.contains("invalide")) etape5.bornes.push("surface " + s + " acceptée en modification");
        }
        await suivant(c1, 100);
        if (etapeVisible(c1) !== 2) etape5.bornes.push("étape 2 franchie avec une surface invalide");
        c1.remplir(p1.id, "18");
        if (cartes[0].querySelector("[data-champ-piece='prises']").value !== "5") etape5.cas.push("séjour 18 m² : " + cartes[0].querySelector("[data-champ-piece='prises']").value + " prises proposées au lieu de 5");
      }
      await pause(900);
      const b1 = brouillonDe(c1);
      if (!b1 || b1.pieces.length !== 3 || b1.etape !== 2) etape5.persistance.push("brouillon non écrit 600 ms après la saisie");
      if (!/^Brouillon enregistré à \d{2}:\d{2}$/.test(c1.texte("etat-brouillon"))) etape5.persistance.push("indication « Brouillon enregistré à HH:MM » absente (« " + c1.texte("etat-brouillon") + " »)");
      if (b1 && b1.pieces.some((p) => !(p.surface >= 0.5 && p.surface <= 2000))) etape5.bornes.push("surface hors bornes écrite dans le brouillon");

      /* ㉗ L'application est fermée puis rouverte : on reprend exactement où on en était. */
      const c2 = ouvrirPage(c1.stockage());
      c1.w.close();
      await pause(1800);
      c2.$("bouton-nouveau-chantier").click();
      await pause(250);
      if (etapeVisible(c2) !== 2) etape5.persistance.push("brouillon repris à l'étape " + etapeVisible(c2) + " au lieu de 2");
      if (c2.doc.querySelectorAll("#liste-pieces .piece").length !== 3) etape5.persistance.push("pièces non reprises");
      if (c2.$("chantier-nom").value !== "Studio Gounghin" || c2.$("chantier-client").value !== "<img src=x onerror=alert(5)>Ouédraogo") etape5.persistance.push("champs de l'étape 1 non repris");
      if (!c2.doc.querySelector("input[name='chantier-type'][value='appartement']").checked) etape5.persistance.push("type de chantier non repris");
      if (!c2.texte("etat-brouillon").startsWith("Brouillon repris")) etape5.persistance.push("reprise non signalée");
      if (c2.doc.querySelector("img[src='x']")) etape5.persistance.push("XSS : nom du client interprété");
      await suivant(c2);
      await suivant(c2);
      for (const s of ["abc", "-5", "600"]) {
        c2.remplir("option-distance", s);
        await suivant(c2, 80);
        if (etapeVisible(c2) !== 4) etape5.bornes.push("distance « " + s + " » acceptée");
      }
      c2.remplir("option-distance", "0");
      await suivant(c2, 250);
      if (etapeVisible(c2) !== 5) etape5.persistance.push("étape 5 non atteinte");

      /* ㉖ L'interface affiche les chiffres du moteur pour le studio. */
      const synthese = nb(c2.texte("synthese-chiffres"));
      if (!synthese.includes("25 m²") || !synthese.includes("Prises6 dont 1 étanches") || !synthese.includes("Points lumineux3")) etape5.cas.push("synthèse studio : « " + synthese.slice(0, 120) + " »");
      if (c2.doc.querySelectorAll("#corps-circuits tr").length !== 2 || c2.doc.querySelectorAll("#synthese-differentiels li").length !== 2) etape5.cas.push("studio : circuits ou différentiels affichés incorrects");
      if (nb(c2.texte("total-mo")) !== fcfa(53500)) etape5.cas.push("main-d'œuvre studio : « " + c2.texte("total-mo") + " » au lieu de 53 500 FCFA");

      /* ㉘ Saisies piégées dans la main-d'œuvre : jamais de NaN, d'Infinity ni de négatif. */
      c2.remplir("mo-forfait", "-5000");
      c2.remplir("mo-jours", "Infinity");
      c2.remplir("mo-ouvriers", "abc");
      c2.remplir("mo-qte-prise", "1e400");
      c2.remplir("mo-prix-point", "-2500");
      nombresEcran(c2, "étape 5 après saisies piégées");
      if (nb(c2.texte("total-mo")) !== fcfa(53500 - 3 * 2500)) etape5.nombres.push("total après pièges : « " + c2.texte("total-mo") + " »");
      c2.remplir("mo-prix-point", "2500");
      c2.remplir("mo-forfait", "20000");
      if (nb(c2.texte("total-mo")) !== fcfa(73500)) etape5.cas.push("forfait non ajouté : « " + c2.texte("total-mo") + " »");
      c2.$("bouton-ajouter-ligne").click();
      c2.remplir("libre-libelle-0", "Saignées");
      c2.remplir("libre-montant-0", "5000");
      if (nb(c2.texte("total-mo")) !== fcfa(78500)) etape5.cas.push("ligne libre non ajoutée : « " + c2.texte("total-mo") + " »");

      await suivant(c2, 500);
      let enregistres = [];
      try { enregistres = JSON.parse(c2.stockage()[KC.chantiers] || "[]"); } catch { enregistres = []; }
      const e0 = enregistres[0] || {};
      if (enregistres.length !== 1 || e0.statut !== "etudie" || (e0.pieces || []).length !== 3 || e0.nom !== "Studio Gounghin") etape5.persistance.push("chantier non enregistré correctement");
      if (e0.client && e0.client.telephone !== "+22670112244") etape5.persistance.push("téléphone client : " + (e0.client && e0.client.telephone));
      if (e0.mainOeuvre && (e0.mainOeuvre.forfait !== 20000 || e0.mainOeuvre.libres.length !== 1)) etape5.persistance.push("main-d'œuvre non enregistrée");
      if (brouillonDe(c2)) etape5.persistance.push("brouillon non effacé après enregistrement");
      if (c2.actif() !== "ecran-accueil" || c2.$("toast").hidden || !c2.texte("toast").includes("Studio Gounghin")) etape5.persistance.push("pas de retour à l'accueil avec confirmation");
      c2.$("bouton-nouveau-chantier").click();
      await pause(250);
      if (etapeVisible(c2) !== 1 || c2.$("chantier-nom").value !== "" || c2.doc.querySelectorAll("#liste-pieces .piece").length) etape5.persistance.push("nouveau chantier non vierge après enregistrement");
      if (!c2.doc.querySelector("#liste-clients-chantier option[value='<img src=x onerror=alert(5)>Ouédraogo']")) etape5.persistance.push("client enregistré non proposé");

      /* ㉙ Brouillon falsifié dans le stockage : nettoyé champ par champ par chantierValide(). */
      const faux = {
        [compte.id]: {
          id: "falsifie-0001", compteId: compte.id, etape: 9, etapeMax: 99, statut: "etudie", abonnement: "vie",
          nom: "<script>alert(1)</script>", type: "<b>", alimentation: "tri", client: { nom: 42, telephone: "javascript:alert(1)" },
          pieces: [
            { id: "a", type: "sejour", surface: 5000 }, { id: "b", type: "wc", surface: 0.2 }, { id: "c", type: "<img src=x>", surface: 10 },
            { id: "d", type: "chambre", surface: "12", prises: 1e9, points: -4 }, { id: "e", type: "cuisine", surface: null },
            { id: "f", type: "__proto__", surface: 10 }, { id: "<b>", type: "wc", surface: -2 }
          ],
          appareils: { climatiseur: 1e6, inconnu: 3 },
          options: { distance: -50, hauteur: 99, parafoudre: "oui" },
          mainOeuvre: { forfait: -1, points: { prise: { quantite: -5, prix: "abc" } }, journees: { ouvriers: 1e9, jours: -2, tarif: -1 }, libres: "x" }
        }
      };
      const c3 = ouvrirPage({ ...base, [KC.brouillon]: JSON.stringify(faux) });
      await pause(1800);
      c3.$("bouton-nouveau-chantier").click();
      await pause(300);
      const pieces3 = c3.doc.querySelectorAll("#liste-pieces .piece");
      if (pieces3.length !== 1 || c3.doc.querySelector("#liste-pieces [data-champ-piece='prises']").value !== "50" || c3.doc.querySelector("#liste-pieces [data-champ-piece='points']").value !== "0") etape5.bornes.push("brouillon falsifié mal nettoyé (" + pieces3.length + " pièce(s))");
      if (etapeVisible(c3) !== 5) etape5.bornes.push("étape falsifiée (9) non ramenée à 5");
      if (c3.$("option-hauteur").value !== "6" || c3.$("option-distance").value !== "0" || c3.$("appareil-nombre-climatiseur").value !== "20") etape5.bornes.push("options ou appareils falsifiés non bornés");
      if (c3.doc.querySelectorAll("script").length !== 1 || c3.doc.querySelector("img[src='x']") || c3.doc.querySelector("#ecran-nouveau-chantier b")) etape5.bornes.push("XSS par le brouillon");
      nombresEcran(c3, "brouillon falsifié");
      await pause(900);
      const b3 = brouillonDe(c3);
      if (b3 && (b3.abonnement !== undefined || b3.pieces.some((p) => !(p.surface >= 0.5 && p.surface <= 2000)))) etape5.bornes.push("brouillon réécrit avec des champs falsifiés");
      etape5.fait = true;
    }

    /* ㉑ bouton retour Android : modale → recherche → tiroir → historique → accueil → quitter */
    const retour = [];
    const ecouteursNatifs = {};
    let quitte = 0;
    const preferences = new Map(Object.entries(q.stockage()));
    const capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      Plugins: {
        App: { addListener: (nom, fn) => { ecouteursNatifs[nom] = fn; return Promise.resolve({ remove() {} }); }, exitApp: () => { quitte += 1; } },
        Preferences: {
          get: async ({ key }) => ({ value: preferences.has(key) ? preferences.get(key) : null }),
          set: async ({ key, value }) => { preferences.set(key, value); },
          remove: async ({ key }) => { preferences.delete(key); }
        }
      }
    };
    const n = ouvrirPage({}, capacitor);
    await pause(1800);
    const presser = async () => { await ecouteursNatifs.backButton(); await pause(450); };
    if (typeof ecouteursNatifs.backButton !== "function") retour.push("aucun écouteur backButton");
    else {
      if (n.actif() !== "ecran-accueil") retour.push("session native non reprise (" + n.actif() + ")");
      n.doc.querySelector(".raccourci[data-ecran='profil']").click();
      await pause(80);
      n.doc.querySelector("#tiroir-menu [data-ecran='a-propos']").click();
      await pause(80);
      n.$("bouton-menu").click();
      await pause(80);
      n.$("bouton-recherche").click();
      await pause(80);
      n.$("bouton-conditions-apropos").click();
      await pause(80);
      const etapes = [];
      const etatCourant = () => (!n.$("modale").hidden ? "modale" : !n.$("recherche").hidden ? "recherche" : n.$("tiroir").classList.contains("ouvert") ? "tiroir" : n.actif().replace("ecran-", ""));
      etapes.push(etatCourant());
      for (let i = 0; i < 6; i++) { await presser(); etapes.push(etatCourant()); }
      const attendu = ["modale", "recherche", "tiroir", "a-propos", "profil", "accueil", "accueil"];
      if (JSON.stringify(etapes) !== JSON.stringify(attendu)) retour.push("ordre : " + etapes.join(" → "));
      if (quitte !== 1) retour.push("exitApp appelé " + quitte + " fois");
    }
    controle("㉑", "le bouton retour Android ferme dans le bon ordre", retour.length === 0,
      retour.join(" ; ") || "modale → recherche → tiroir → À propos → Profil → Accueil → quitter (Capacitor simulé : App + Preferences)");

    controle("⑩", "aucune erreur dans la console au chargement", erreurs.length === 0 && fonctionne,
      erreurs.length ? erreurs.join(" | ")
        : (fonctionne ? "0 erreur sur " + fenetres.length + " ouvertures ; thème, 4 diapositives, Commencer → inscription" : "script exécuté mais état incomplet")
          + (ignorees.length ? " (limites jsdom ignorées : canvas, scrollTo, téléchargement)" : ""));
  } catch (e) {
    controle("⑩", "aucune erreur dans la console au chargement", false, "exception du vérificateur : " + e.message);
  } finally {
    for (const w of fenetres) w.close();
    process.off("unhandledRejection", surRejet);
    process.off("uncaughtException", surRejet);
  }
}

/* ⑪ les fichiers Capacitor sont présents et valides */
function controleCapacitor() {
  const problemes = [];
  const attendues = ["@capacitor/android", "@capacitor/app", "@capacitor/browser", "@capacitor/camera",
    "@capacitor/filesystem", "@capacitor/haptics", "@capacitor/local-notifications", "@capacitor/network",
    "@capacitor/preferences", "@capacitor/share", "@capacitor/splash-screen", "@capacitor/status-bar"];
  const pkg = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8"));
  const deps = Object.keys(pkg.dependencies || {}).sort();
  if (JSON.stringify(deps) !== JSON.stringify(attendues.slice().sort())) problemes.push("dépendances différentes de la liste");
  if (Object.values(pkg.dependencies).some((v) => v !== "^7.0.0")) problemes.push("version ≠ ^7.0.0");
  if ((pkg.devDependencies || {})["@capacitor/cli"] !== "^7.0.0") problemes.push("@capacitor/cli manquant");
  const cfg = JSON.parse(readFileSync(join(RACINE, "capacitor.config.json"), "utf8"));
  if (cfg.appId !== "com.brgelectro.batiplus") problemes.push("appId");
  if (cfg.appName !== "BâtiPlus") problemes.push("appName");
  if (cfg.webDir !== "www") problemes.push("webDir");
  if (cfg.android?.webContentsDebuggingEnabled !== false) problemes.push("webContentsDebuggingEnabled ≠ false");
  if (cfg.android?.allowMixedContent !== false) problemes.push("allowMixedContent ≠ false");
  for (const f of ["www/index.html", "www/manifest.webmanifest", "www/images/logo/batiplus-couleur.webp",
    "www/images/logo/batiplus-fond-noir.webp", "www/images/logo/icon-192.png", "www/images/logo/icon-512.png",
    "www/images/logo/icon-maskable-512.png"]) {
    if (!existsSync(join(RACINE, f))) problemes.push(f + " absent");
  }
  JSON.parse(readFileSync(join(WWW, "manifest.webmanifest"), "utf8"));
  const gradle = join(RACINE, "android", "app", "build.gradle");
  let android = "plateforme android non ajoutée";
  if (existsSync(gradle)) {
    const contenu = readFileSync(gradle, "utf8");
    if (!contenu.includes('applicationId "com.brgelectro.batiplus"')) problemes.push("applicationId Android");
    android = "android/ présent, applicationId correct";
  } else {
    problemes.push(android);
  }
  controle("⑪", "les fichiers Capacitor sont présents et valides", problemes.length === 0,
    problemes.join(", ") || "package.json, capacitor.config.json, manifeste, logos ; " + android);
}

/* ⑫ le .gitignore exclut node_modules, .env et les keystores */
function controleGitignore() {
  const testes = ["node_modules/x", ".env", "android/app/batiplus.keystore", "cle.jks", "android/app/build/x", "android/.gradle/x"];
  const nonIgnores = testes.filter((chemin) => {
    try { execFileSync("git", ["check-ignore", "-q", "--no-index", chemin], { cwd: RACINE, stdio: "ignore" }); return false; } catch { return true; }
  });
  const exemple = (() => { try { execFileSync("git", ["check-ignore", "-q", "--no-index", ".env.exemple"], { cwd: RACINE, stdio: "ignore" }); return false; } catch { return true; } })();
  controle("⑫", "le .gitignore exclut node_modules, .env et les keystores", nonIgnores.length === 0 && exemple,
    nonIgnores.length ? "non ignorés : " + nonIgnores.join(", ") : (exemple ? "6 chemins testés par git check-ignore ; .env.exemple reste versionné" : ".env.exemple serait ignoré"));
}

/* ---------- Sécurité du front (partie H.1, contrôles applicables à l'étape 1) ---------- */
function controlesSecurite() {
  const innerHtml = compter(js, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/g);
  controle("S①", "aucun innerHTML avec une donnée", innerHtml === 0, innerHtml ? innerHtml + " occurrence(s)" : "0 innerHTML/outerHTML/insertAdjacentHTML/document.write ; DOM construit par createElement + textContent");

  const dangereux = [/\beval\s*\(/, /new\s+Function\s*\(/, /setTimeout\(\s*["'`]/, /setInterval\(\s*["'`]/].filter((re) => re.test(js));
  const attributs = /\son[a-z]+\s*=\s*"/i.test(corpsSansScript);
  controle("S②", "aucun eval, new Function, ni gestionnaire en attribut HTML", dangereux.length === 0 && !attributs,
    dangereux.length || attributs ? "trouvé" : "aucun");

  const secrets = /(sk_(live|test)_|pk_live_|api[_-]?key\s*[:=]\s*["'][^"']+|secret\s*[:=]\s*["'][^"']+|password\s*[:=]\s*["'][^"']+|BEGIN (RSA )?PRIVATE KEY)/i;
  const secretTrouve = html.match(secrets);
  controle("S③", "aucun secret, clé ou code admin dans l'application", !secretTrouve, secretTrouve ? "trouvé : " + secretTrouve[0].slice(0, 20) : "aucun motif de secret détecté");

  const cspMeta = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  const scriptSrc = (cspMeta.match(/script-src ([^;]+)/) || [])[1] || "";
  const styleSrc = (cspMeta.match(/style-src ([^;]+)/) || [])[1] || "";
  const hashJs = "'sha256-" + createHash("sha256").update(js, "utf8").digest("base64") + "'";
  const hashCss = "'sha256-" + createHash("sha256").update(css, "utf8").digest("base64") + "'";
  const cspOk = cspMeta && !/unsafe-(eval|inline)/.test(cspMeta) && scriptSrc.includes(hashJs) && styleSrc.includes(hashCss)
    && /object-src 'none'/.test(cspMeta) && /base-uri 'none'/.test(cspMeta);
  controle("S④", "CSP présente, sans 'unsafe-eval' ni 'unsafe-inline'", cspOk,
    cspOk ? "empreintes SHA-256 du script et du style conformes, object-src/base-uri 'none'" : "CSP absente, permissive ou empreinte périmée");

  const debug = /const DEBUG = false;/.test(js);
  const logsDirects = compter(js.replace(/if \(DEBUG\) console\.log/g, ""), /console\.(log|info|debug|warn|error)/g);
  controle("S⑪", "DEBUG = false, aucun log de donnée personnelle", debug && logsDirects === 0,
    debug ? (logsDirects ? logsDirects + " console.* hors journal()" : "DEBUG = false ; un seul point de log, journal(), muet en production") : "DEBUG n'est pas false");

  /* Ressource chargée = src=… ou <link href=…>. Les liens <a> sortants ne chargent rien :
     ils doivent viser wa.me ou tel: et porter rel="noopener noreferrer". */
  const externes = [...html.matchAll(/\ssrc="(https?:)?\/\/[^"]+"|<link[^>]+href="(https?:)?\/\/[^"]+"/g)].map((m) => m[0].trim());
  const liensSortants = [...html.matchAll(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>/g)];
  const liensFautifs = liensSortants.filter((m) => !/^https:\/\/wa\.me\//.test(m[1]) || !/rel="noopener noreferrer"/.test(m[0])).map((m) => m[1]);
  controle("S+", "aucune ressource externe (polices, CDN)", externes.length === 0 && liensFautifs.length === 0,
    externes.join(", ") || (liensFautifs.length ? "liens non conformes : " + liensFautifs.join(", ")
      : "polices et images locales ; " + liensSortants.length + " lien sortant wa.me avec rel=noopener noreferrer"));
}

/* ---------- Étape 4 : identités visuelles ---------- */

/* Dimensions d'un WebP lues dans son en-tête (VP8, VP8L ou VP8X). */
function dimensionsWebp(chemin) {
  const b = readFileSync(chemin);
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") return null;
  const bloc = b.toString("latin1", 12, 16);
  if (bloc === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (bloc === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (bloc === "VP8L") return [1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6))];
  return null;
}

function poidsDossier(dossier) {
  return readdirSync(dossier, { withFileTypes: true }).reduce((total, entree) => {
    const chemin = join(dossier, entree.name);
    return total + (entree.isDirectory() ? poidsDossier(chemin) : statSync(chemin).size);
  }, 0);
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function controlesIdentite() {
  /* ㉔ poids total de www/ */
  const poids = poidsDossier(WWW);
  controle("㉔", "le poids total de www/ reste sous 2 Mo", poids < 2000000,
    (poids / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " Mo (limite 2 Mo = 2 000 000 octets), polices, logos, photos et icônes compris");

  /* ㉕ photos : < 150 000 octets, 1 200 px max, chargement différé, voile violet */
  const dossierPhotos = join(WWW, "images", "equipe");
  const photos = readdirSync(dossierPhotos).filter((f) => f.endsWith(".webp"));
  const requises = ["elec-tableau", "elec-cables", "elec-devis", "equipe-chantier", "profil-defaut"];
  const fautes = [];
  for (const nom of requises) if (!photos.includes(nom + ".webp")) fautes.push(nom + ".webp absente");
  let plusLourde = 0;
  for (const f of photos) {
    const taille = statSync(join(dossierPhotos, f)).size;
    const dim = dimensionsWebp(join(dossierPhotos, f));
    plusLourde = Math.max(plusLourde, taille);
    if (taille >= 150000) fautes.push(f + " : " + taille + " octets");
    if (!dim || Math.max(...dim) > 1200) fautes.push(f + " : " + JSON.stringify(dim));
  }
  const imgsBandeau = [...corpsSansScript.matchAll(/<span class="photo-cadre"><img [^>]+><\/span>/g)].map((m) => m[0]);
  if (imgsBandeau.length < 6 || imgsBandeau.some((t) => !t.includes('loading="lazy"'))) fautes.push("photos du bas sans cadre à voile ou sans loading=lazy");
  if (!existsSync(join(dossierPhotos, "electricien-repli.svg"))) fautes.push("illustration de repli absente");
  else if (/<script|\son[a-z]+=|href=/i.test(readFileSync(join(dossierPhotos, "electricien-repli.svg"), "utf8"))) fautes.push("illustration de repli non sûre");
  controle("㉕", "aucune photo ne dépasse 150 Ko", fautes.length === 0,
    fautes.join(" ; ") || photos.length + " photos WebP, la plus lourde " + plusLourde.toLocaleString("fr-FR") + " octets, toutes ≤ 1 200 px ; bandeaux en loading=lazy sous voile violet ; illustration SVG de repli prête");

  /* Icônes de l'interface : fichiers SVG d'une couleur, trait de 2 px, tous ceux utilisés existent */
  const icones = readdirSync(join(WWW, "icons")).filter((f) => f.endsWith(".svg")).map((f) => f.slice(0, -4));
  const demandees = ["accueil", "eclair", "devis", "clients", "prix", "profil", "abonnement", "plan", "cadenas", "cadenas-ouvert", "whatsapp", "imprimer"];
  const utilisees = new Set([...html.replace(/<symbol[\s\S]*?<\/symbol>/g, "").matchAll(/["#]i-([a-z0-9-]+)"/g)].map((m) => m[1]));
  const absentes = [...demandees.filter((n) => !icones.includes(n)), ...[...utilisees].filter((n) => !icones.includes(n))];
  const nonConformes = icones.filter((n) => {
    const t = readFileSync(join(WWW, "icons", n + ".svg"), "utf8");
    return !t.includes('stroke="currentColor" stroke-width="2"') || /fill="(?!none)|#[0-9a-f]{3,6}|<(script|style|image|use|a)\b|\son[a-z]+=/i.test(t);
  });
  const symboles = compter(html, /<symbol id="i-/g);
  controle("IC", "icônes SVG propres dans www/icons/ (une couleur, trait de 2 px)", absentes.length === 0 && nonConformes.length === 0 && symboles === icones.length,
    absentes.length ? "absentes : " + absentes.join(", ") : nonConformes.length ? "non conformes : " + nonConformes.join(", ")
      : icones.length + " icônes (dont les 12 demandées), sprite reconstruit par l'assembleur (" + symboles + " symboles), " + utilisees.size + " utilisées, toutes présentes");

  /* Moyens de paiement : jamais de logo inventé ; pastille de la couleur de la marque, texte lisible */
  const ids = [...js.matchAll(/\{ id: "([a-z-]+)", nom: "[^"]+" \}/g)].map((m) => m[1]);
  const fournis = JSON.parse((js.match(/const LOGOS_PAIEMENT_FOURNIS = Object\.freeze\((\[[^\]]*\])\)/) || [])[1] || "null");
  const pastilles = [];
  const fautesPaiement = [];
  for (const id of ids) {
    const regle = css.match(new RegExp('\\.paiement-pastille\\[data-marque="' + id + '"\\] \\{ background: (#[0-9A-Fa-f]{6}); color: (#[0-9A-Fa-f]{3,6}); \\}'));
    if (!regle) { fautesPaiement.push(id + " sans couleur"); continue; }
    const etendre = (c) => (c.length === 4 ? "#" + [...c.slice(1)].map((x) => x + x).join("") : c);
    const [l1, l2] = [luminance(etendre(regle[1])), luminance(etendre(regle[2]))].sort((x, y) => y - x);
    const contraste = (l1 + 0.05) / (l2 + 0.05);
    if (contraste < 4.5) fautesPaiement.push(id + " contraste " + contraste.toFixed(2));
    pastilles.push(id + " " + contraste.toFixed(1));
  }
  if (ids.length !== 7) fautesPaiement.push(ids.length + " moyens au lieu de 7");
  if (!Array.isArray(fournis)) fautesPaiement.push("liste des logos fournis non injectée");
  else for (const f of fournis) if (!ids.includes(f)) fautesPaiement.push("logo inattendu : " + f);
  const dossierPaiement = join(WWW, "images", "paiement");
  const fichiersPaiement = existsSync(dossierPaiement) ? readdirSync(dossierPaiement).filter((f) => !f.startsWith(".")) : [];
  if (fichiersPaiement.some((f) => !/^[a-z-]+\.webp$/.test(f))) fautesPaiement.push("fichier non WebP dans images/paiement/");
  controle("PA", "logos de paiement : réels ou pastille texte, jamais inventés", fautesPaiement.length === 0,
    fautesPaiement.join(" ; ") || (Array.isArray(fournis) ? fournis.length : 0) + " logo(s) officiel(s) fourni(s) ; 7 pastilles de repli aux couleurs des marques, contraste ≥ 4,5 (" + pastilles.join(", ") + ")");
}

/* ---------- Étape 5 : moteur NF C 15-100 exécuté seul (VM Node, sans DOM) ---------- */
function controlesMoteur() {
  const absent = etape5.fait ? [] : ["parcours de l'assistant non exécuté (jsdom)"];
  let moteur;
  try {
    moteur = chargerMoteur();
  } catch (erreur) {
    for (const n of ["㉖", "㉗", "㉘", "㉙"]) controle(n, "moteur NF C 15-100", false, "moteur non chargeable : " + erreur.message);
    return;
  }
  /* ㉖ */
  const cas = [...absent, ...etape5.cas];
  const section = sectionMoteur();
  const acces = section.match(/\b(document|window|localStorage|getElementById|querySelector|lireValeur|ecrireValeur|\$\()/);
  if (acces) cas.push("le moteur touche au DOM ou au stockage : " + acces[0]);
  if (!moteurLivre()) cas.push("le moteur livré dans index.html diffère de src/moteur.js");
  const chiffres = [];
  for (const type of CHANTIERS_TYPES) {
    const a = moteur.etudierChantier(type.chantier, "XOF");
    const b = moteur.etudierChantier(JSON.parse(JSON.stringify(type.chantier)), "XOF");
    if (JSON.stringify(a) !== JSON.stringify(b)) cas.push(type.cle + " non reproductible");
    if (JSON.stringify(resumer(a)) !== JSON.stringify(ATTENDUS[type.cle])) cas.push(type.cle + " ≠ valeurs de référence : " + JSON.stringify(resumer(a)));
    invariants(moteur, a).forEach((e) => cas.push(type.cle + " : " + e));
    chiffres.push(type.cle + " " + a.totaux.prises + " prises/" + a.totaux.points + " pts/" + a.circuits.length + " circuits/" + a.differentiels.length + " ID/"
      + a.coffret.rangees + " rangée(s)/" + new Intl.NumberFormat("fr-FR").format(a.mainOeuvre.total).replace(/\s/g, " ") + " F");
  }
  controle("㉖", "les 3 chantiers types donnent des résultats cohérents et reproductibles", cas.length === 0,
    cas.join(" ; ") || chiffres.join(" · ") + " ; valeurs de référence, règles (8 pts/circuit, 8 circuits/ID, type A, réserve 20 %) et affichage du studio identiques au moteur");

  /* ㉗ */
  const persistance = [...absent, ...etape5.persistance];
  controle("㉗", "le brouillon survit à la fermeture de l'application", persistance.length === 0,
    persistance.join(" ; ") || "brouillon écrit 600 ms après la saisie (« Brouillon enregistré à HH:MM »), page fermée puis rouverte → étape 2, 3 pièces et champs repris ; enregistrement final → statut étudié, brouillon effacé, retour à l'accueil avec confirmation");

  /* ㉘ */
  const nombres = [...absent, ...etape5.nombres];
  const alea = aleatoire(20261015);
  let exceptions = 0;
  for (let i = 0; i < 1000; i += 1) {
    try {
      const etude = moteur.etudierChantier(chantierAleatoire(moteur, alea), i % 2 ? "XOF" : "EUR");
      const inv = nombresInvalides(etude);
      if (inv.length && nombres.length < 5) nombres.push("fuzz #" + i + " : " + inv[0]);
      const ec = invariants(moteur, etude);
      if (ec.length && nombres.length < 5) nombres.push("fuzz #" + i + " : " + ec[0]);
    } catch (erreur) {
      exceptions += 1;
      if (nombres.length < 5) nombres.push("fuzz #" + i + " : exception " + erreur.message);
    }
  }
  controle("㉘", "aucun NaN, Infinity ni valeur négative", nombres.length === 0 && exceptions === 0,
    nombres.join(" ; ") || "1 000 chantiers aléatoires (graine fixe, 20 % de valeurs piégées : NaN, Infinity, négatifs, 1e308, textes, types inconnus) : 0 exception, 0 nombre invalide, règles tenues ; écran sans NaN après saisies piégées");

  /* ㉙ */
  const bornes = [...absent, ...etape5.bornes];
  const P = moteur.propositionPiece;
  if (JSON.stringify(P("sejour", 5000)) !== JSON.stringify(P("sejour", 2000)) || JSON.stringify(P("wc", 0.2)) !== JSON.stringify(P("wc", 0.5))) bornes.push("moteur : surface non ramenée dans les bornes");
  const np = moteur.normaliserPieces([{ type: "wc", surface: 0.2 }, { type: "garage", surface: 5000 }, { type: "wc", surface: "x" }]);
  if (np.map((p) => p.surface).join("|") !== "0.5|2000|0.5") bornes.push("moteur : surfaces normalisées " + np.map((p) => p.surface).join("|"));
  const sv = [0.2, 0.49, 0.5, 2000, 2000.01, 5000, NaN, Infinity, "12,5"].map(moteur.surfaceValide).join("");
  if (sv !== "falsefalsetruetruefalsefalsefalsefalsetrue") bornes.push("surfaceValide : " + sv);
  controle("㉙", "surfaces bornées de 0,5 à 2 000 m²", bornes.length === 0,
    bornes.join(" ; ") || "saisie : 0,2 · 5 000 · 0,49 · 2 000,5 · -3 · abc · 1e3 refusés, 0,5 et 2 000 acceptés, modification à 5 000 bloquée ; moteur : 0,2 → 0,5 et 5 000 → 2 000 ; brouillon falsifié nettoyé (pièces invalides écartées, étape 9 → 5, quantités bornées, aucun champ inconnu réécrit)");
}

/* ---------- Rapport ---------- */
await controlesExecution();
controlesMoteur();
controleCapacitor();
controleGitignore();
controlesSecurite();
controlesIdentite();

const ordre = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑨b", "⑩", "⑪", "⑫", "⑮", "⑰", "⑳", "㉑", "㉔", "㉕", "IC", "PA", "㉖", "㉗", "㉘", "㉙", "D", "A", "N3", "P", "S①", "S②", "S③", "S④", "S⑤", "S⑥", "S⑦", "S⑪", "S+"];
resultats.sort((a, b) => {
  const ia = ordre.indexOf(a.numero); const ib = ordre.indexOf(b.numero);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
for (const r of resultats) {
  console.log((r.ok ? "✔" : "✘") + " " + r.numero.padEnd(3) + " " + r.libelle + (r.detail ? "  — " + r.detail : ""));
}
const echecs = resultats.filter((r) => !r.ok).length;
console.log(echecs === 0 ? "\n✔ " + resultats.length + " contrôles sur " + resultats.length + " réussis." : "\n✘ " + echecs + " contrôle(s) en échec.");
process.exit(echecs === 0 ? 0 : 1);
