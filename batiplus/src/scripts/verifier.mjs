#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur
   Rapporte les contrôles bloquants des étapes 1-6 (①…⑫, ⑮, ⑰, ⑳, ㉑, ㉔…㉜ ; ⑬, ⑭, ⑯, ⑱, ⑲, ㉒, ㉓ dans verifier-navigateur.mjs) et les contrôles de
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
  ATTENDUS, CHANTIERS_TYPES, aleatoire, chantierAleatoire, chargerMoteur, egalAuCentime, invariants, moteurLivre, nombresInvalides, resumer, sectionMoteur
} from "./chantiers-types.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WWW = join(RACINE, "www");
const html = readFileSync(join(WWW, "index.html"), "utf8");
const resultats = [];
/* Constats de l'étape 5 relevés dans jsdom, complétés par le moteur exécuté seul (controlesMoteur). */
const etape5 = { fait: false, cas: [], persistance: [], nombres: [], bornes: [] };
/* Constats de l'étape 6 (écran Résultat) relevés dans jsdom. */
const etape6 = { fait: false, svg: [], contenu: [], total: [] };
const etape7 = { fait: false, catalogue: [], deux: [], recalcul: [] };
const etape9 = { fait: false, supprimer: [], recherche: [], fournisseurs: [], clients: [], stats: [] };
const etape8 = { fait: false, a4: [], filigrane: [], whatsapp: [], octetsPdf: 0 };

/* Lecture d'un PDF produit par l'application : en-tête, table xref (chaque position
   pointe bien sur son objet), nombre de pages déclaré = pages présentes, fin %%EOF. */
function analyserPdf(octets) {
  const texte = Array.from(octets, (o) => String.fromCharCode(o)).join("");
  const erreurs = [];
  if (!texte.startsWith("%PDF-1.4")) erreurs.push("en-tête %PDF absent");
  if (!texte.trimEnd().endsWith("%%EOF")) erreurs.push("fin %%EOF absente");
  const debut = Number((texte.match(/startxref\n(\d+)\n%%EOF/) || [])[1]);
  if (!Number.isFinite(debut) || texte.slice(debut, debut + 4) !== "xref") erreurs.push("startxref ne pointe pas sur la table xref");
  else {
    const entrees = texte.slice(debut).split("\n").slice(3).filter((l) => / 00000 n $/.test(l));
    entrees.forEach((l, i) => {
      const position = Number(l.slice(0, 10));
      if (!texte.startsWith((i + 1) + " 0 obj", position)) erreurs.push("objet " + (i + 1) + " mal placé");
    });
  }
  const pages = (texte.match(/\/Type \/Page\b(?!s)/g) || []).length;
  const declare = Number((texte.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/) || [])[1]);
  if (pages !== declare) erreurs.push(pages + " pages présentes pour " + declare + " déclarées");
  return { texte, pages, erreurs };
}

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
  const surRejet = (e) => erreurs.push("Uncaught " + String((e && (e.stack || e.message)) || e));
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
      if (c2.actif() !== "ecran-resultat" || c2.$("toast").hidden || !c2.texte("toast").includes("Studio Gounghin")) etape5.persistance.push("l'étude ne s'ouvre pas avec confirmation après l'enregistrement (" + c2.actif() + ")");
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

      /* ---------- Étape 6 : écran Résultat (㉚ structure du schéma, ㉛ onglets, ㉜ total recalculé) ---------- */
      {
        const moteur = chargerMoteur();
        const cat = Object.fromEntries(Object.entries(moteur.CATALOGUE_DEFAUT).map(([ref, article]) => [ref, { prix: article.prix }]));
        const lireEnregistres = (page) => { try { return JSON.parse(page.stockage()[KC.chantiers] || "[]"); } catch { return []; } };
        const montantUI = (page, id) => nb(page.texte(id));
        const nombresResultat = (page, ou) => {
          const ecran = page.$("ecran-resultat");
          const tout = ecran.textContent + " " + [...ecran.querySelectorAll("input")].map((i) => i.value).join(" ");
          const motif = /(?:^|[^0-9A-Za-zÀ-ÿ])(NaN|Infinity|undefined|null|-\s?\d)/;
          if (motif.test(tout)) etape6.total.push(ou + " : « " + tout.slice(Math.max(0, tout.search(motif) - 20), tout.search(motif) + 20) + " »");
        };
        const r1 = ouvrirPage(c2.stockage());
        await pause(1800);
        const lignesEtudes = r1.doc.querySelectorAll("#accueil-etudes [data-chantier]");
        const enr = lireEnregistres(r1)[0];
        const ch = JSON.parse(JSON.stringify(enr));
        let attendu = moteur.chiffrerChantier(ch, cat, "XOF");
        if (r1.$("bloc-etudes").hidden || lignesEtudes.length !== 1) etape6.contenu.push("accueil : « Dernières études » absent");
        else if (!nb(lignesEtudes[0].textContent).includes(fcfa(attendu.total.totalGeneral))) etape6.total.push("accueil : total de l'étude ≠ moteur (" + nb(lignesEtudes[0].textContent) + ")");
        if (lignesEtudes[0]) lignesEtudes[0].click();
        await pause(400);
        if (r1.actif() !== "ecran-resultat") etape6.contenu.push("étude non ouverte depuis l'accueil (" + r1.actif() + ")");
        if (r1.texte("mention-etude-texte") !== "Étude indicative. L'électricien vérifie et reste responsable de l'exécution conforme.") etape6.contenu.push("mention obligatoire absente ou modifiée");
        if (r1.texte("titre-resultat") !== "Studio Gounghin" || !nb(r1.texte("resultat-infos")).includes("25 m²")) etape6.contenu.push("en-tête : « " + r1.texte("titre-resultat") + " / " + r1.texte("resultat-infos") + " »");

        /* ㉛ Six onglets, un seul panneau visible, chacun avec son vrai contenu. */
        const onglets = [...r1.doc.querySelectorAll("#resultat-onglets [role='tab']")];
        const libelles = ["Circuits", "Tableau", "Matériel", "Main-d'œuvre", "Conformité", "Total"];
        if (onglets.map((o) => o.textContent.trim()).join("|") !== libelles.join("|")) etape6.contenu.push("onglets : " + onglets.map((o) => o.textContent.trim()).join(", "));
        const panneaux = [...r1.doc.querySelectorAll("#ecran-resultat [role='tabpanel']")];
        const contenus = {
          circuits: () => r1.doc.querySelectorAll("#liste-circuits .circuit").length === attendu.etude.circuits.length
            && r1.doc.querySelectorAll("#liste-differentiels li").length === attendu.etude.differentiels.length
            && nb(r1.texte("liste-circuits")).includes("1,5 mm²") && nb(r1.texte("liste-circuits")).includes("10 A"),
          tableau: () => r1.doc.querySelectorAll("#schema-tableau svg .module").length > 0 && r1.doc.querySelectorAll("#detail-rangees li").length === attendu.etude.coffret.rangees,
          materiel: () => r1.doc.querySelectorAll("#liste-materiel .ligne-modifiable").length === attendu.materiel.length && attendu.materiel.length >= 10,
          "main-oeuvre": () => r1.doc.querySelectorAll("#res-mo-points .ligne-modifiable").length === attendu.etude.mainOeuvre.lignes.length
            && r1.$("res-mo-forfait").value === "20000" && r1.doc.querySelectorAll("#res-mo-libres .ligne-libre").length === 1,
          conformite: () => r1.doc.querySelectorAll("#liste-conformite .point-conformite").length === attendu.conformite.length
            && [...r1.doc.querySelectorAll("#liste-conformite .point-conformite")].every((li, i) => li.dataset.etat === attendu.conformite[i].etat && li.querySelector("p").textContent.length > 30),
          total: () => montantUI(r1, "tot-general") === fcfa(attendu.total.totalGeneral) && montantUI(r1, "tot-acompte") === fcfa(attendu.total.acompte)
        };
        for (const onglet of onglets) {
          onglet.click();
          await pause(30);
          const id = onglet.dataset.onglet;
          const visibles = panneaux.filter((p) => !p.hidden).map((p) => p.id);
          if (visibles.join() !== "panneau-" + id || onglet.getAttribute("aria-selected") !== "true" || onglet.tabIndex !== 0) etape6.contenu.push(id + " : panneaux visibles " + visibles.join());
          if (!contenus[id] || !contenus[id]()) etape6.contenu.push("onglet « " + onglet.textContent.trim() + " » sans le contenu attendu");
        }
        r1.$("onglet-total").focus();
        r1.$("resultat-onglets").dispatchEvent(new r1.w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        if (r1.$("onglet-circuits").getAttribute("aria-selected") !== "true" || r1.doc.activeElement !== r1.$("onglet-circuits")) etape6.contenu.push("clavier : flèche droite depuis Total ne revient pas à Circuits");
        r1.$("resultat-onglets").dispatchEvent(new r1.w.KeyboardEvent("keydown", { key: "End", bubbles: true }));
        if (r1.$("onglet-total").getAttribute("aria-selected") !== "true") etape6.contenu.push("clavier : Fin ne mène pas à Total");
        if (r1.$("bouton-creer-devis").hidden || !r1.$("ecran-fiche-devis")) etape6.contenu.push("« Créer le devis » absent alors que la fiche devis existe");

        /* ㉚ Le schéma reprend exactement la disposition calculée par le moteur. */
        const svg = r1.doc.querySelector("#schema-tableau svg");
        if (!svg) etape6.svg.push("aucun SVG");
        else {
          const rangees = svg.querySelectorAll(".schema-rangee");
          if (rangees.length !== attendu.etude.coffret.rangees) etape6.svg.push(rangees.length + " rangée(s) dessinée(s) au lieu de " + attendu.etude.coffret.rangees);
          attendu.etude.tableau.forEach((rangee, i) => {
            const dessines = rangees[i] ? [...rangees[i].querySelectorAll(".module")].map((m) => m.dataset.type) : [];
            if (dessines.join() !== rangee.modules.map((m) => m.type).join()) etape6.svg.push("rangée " + (i + 1) + " : " + dessines.join(" "));
          });
          const disjoncteurs = [...svg.querySelectorAll(".module[data-type='disjoncteur']")].map((m) => m.querySelector("text").textContent);
          if (disjoncteurs.join() !== attendu.etude.tableau.flatMap((r) => r.modules.filter((m) => m.type === "disjoncteur").map((m) => String(m.numero))).join()) etape6.svg.push("numéros des disjoncteurs : " + disjoncteurs.join(","));
          if ([...svg.querySelectorAll("text")].some((t) => !t.textContent.trim())) etape6.svg.push("texte vide dans le schéma");
          if (svg.querySelector("script, foreignObject, [onload], [onclick]") || /<script/i.test(svg.outerHTML)) etape6.svg.push("SVG porteur de code");
          if (!/^0 0 \d+ \d+$/.test(svg.getAttribute("viewBox") || "") || svg.getAttribute("role") !== "img" || !svg.querySelector("title")) etape6.svg.push("SVG sans viewBox, rôle ou titre accessible");
          if (svg.querySelectorAll(".schema-accolade").length !== attendu.etude.differentiels.length) etape6.svg.push("accolades différentiel → circuits : " + svg.querySelectorAll(".schema-accolade").length);
        }

        /* ㉜ Chaque saisie recalcule immédiatement le total ; l'attendu est recalculé par le moteur seul. */
        const comparer = (ou) => {
          attendu = moteur.chiffrerChantier(ch, cat, "XOF");
          const t = attendu.total;
          const paires = [["total-materiel", attendu.totalMateriel], ["res-total-mo", t.mainOeuvre], ["tot-sous-total", t.sousTotal], ["tot-general", t.totalGeneral], ["resume-total", t.totalGeneral], ["tot-acompte", t.acompte], ["tot-reste", t.reste]];
          if (t.tvaActive) paires.push(["tot-tva", t.tva]);
          const ecarts = paires.filter(([id, v]) => montantUI(r1, id) !== fcfa(v)).map(([id, v]) => id + " " + montantUI(r1, id) + " ≠ " + fcfa(v));
          if (ecarts.length) etape6.total.push(ou + " : " + ecarts.join(", "));
          nombresResultat(r1, ou);
        };
        /* Saisie puis sortie du champ (input puis change), comme au doigt. */
        const saisir = (id, valeur) => {
          r1.remplir(id, valeur);
          r1.$(id).dispatchEvent(new r1.w.Event("change", { bubbles: true }));
        };
        const ligneMat = (ref, champ, valeur) => {
          saisir("mat-" + ref.replace(/\./g, "_") + "-" + champ, valeur);
          ch.materiel = ch.materiel || {};
          const l = ch.materiel[ref] || { quantite: null, prix: null };
          l[champ === "qte" ? "quantite" : "prix"] = valeur === "" ? null : Math.max(0, Number(valeur.replace(",", ".")));
          ch.materiel[ref] = l;
        };
        const totalAvant = montantUI(r1, "tot-general");
        /* Frappe seule (sans quitter le champ) : le total suit déjà. */
        r1.remplir("mat-prise-prix", "2000");
        ch.materiel = ch.materiel || {};
        ch.materiel.prise = { quantite: null, prix: 2000 };
        comparer("prix d'une prise à 2 000, pendant la frappe");
        if (montantUI(r1, "tot-general") === totalAvant) etape6.total.push("le total n'a pas bougé après un changement de prix");
        ligneMat("cable-1.5", "qte", "120");
        comparer("120 m de câble 1,5 mm²");
        ligneMat("prise", "prix", "-5");
        ch.materiel.prise.prix = 0;
        comparer("prix négatif");
        const alerte = r1.$("liste-materiel").querySelector(".ligne-modifiable .prix-a-completer:not([hidden])");
        if (!alerte || !nb(alerte.closest("li").textContent).includes("Prise 2P+T 16 A")) etape6.total.push("« Prix à compléter » absent pour un prix à 0");
        ligneMat("prise", "prix", "");
        comparer("prix vidé → catalogue");
        if (r1.$("liste-materiel").querySelector(".prix-a-completer:not([hidden])")) etape6.total.push("« Prix à compléter » resté affiché");
        ligneMat("prise", "prix", "2000");
        saisir("res-mo-prise-prix", "3000");
        ch.mainOeuvre.points.prise = { quantite: null, prix: 3000 };
        comparer("main-d'œuvre : prise à 3 000");
        saisir("res-mo-forfait", "25000");
        ch.mainOeuvre.forfait = 25000;
        comparer("forfait 25 000");
        saisir("res-remise", "10");
        ch.totaux.remise = 10;
        comparer("remise 10 %");
        if (montantUI(r1, "tot-remise") !== "− " + fcfa(attendu.total.remise) || attendu.total.remise !== Math.round(attendu.total.sousTotal * 0.1)) etape6.total.push("remise 10 % : « " + montantUI(r1, "tot-remise") + " »");
        r1.$("res-tva").click();
        ch.totaux.tva = true;
        comparer("TVA activée (18 %)");
        if (r1.$("bloc-taux-tva").hidden || r1.$("res-taux-tva").value !== "18") etape6.total.push("taux de TVA par défaut ≠ 18 % ou champ caché");
        saisir("res-taux-tva", "20");
        ch.totaux.tauxTva = 20;
        comparer("TVA 20 %");
        if (r1.$("res-acompte").value !== "40") etape6.total.push("acompte par défaut ≠ 40 %");
        saisir("res-acompte", "50");
        ch.totaux.acompte = 50;
        comparer("acompte 50 %");
        r1.doc.querySelector("input[name='res-remise-type'][value='montant']").click();
        ch.totaux.remiseType = "montant";
        ch.totaux.remise = 0;
        comparer("remise en montant (remise remise à zéro)");
        if (r1.$("res-remise").value !== "" || !r1.texte("res-remise-libelle").includes("FCFA")) etape6.total.push("passage en montant : champ ou libellé non mis à jour");
        for (const [valeur, retenu] of [["-5", 0], ["abc", 0], ["1e400", 0], ["Infinity", 0], ["999999999", 1e8]]) {
          saisir("res-remise", valeur);
          ch.totaux.remise = retenu;
          comparer("remise « " + valeur + " »");
        }
        if (montantUI(r1, "tot-general") !== fcfa(0)) etape6.total.push("remise supérieure au sous-total : total « " + montantUI(r1, "tot-general") + " » au lieu de 0");
        saisir("res-remise", "15000");
        ch.totaux.remise = 15000;
        comparer("remise 15 000");
        for (const [valeur, retenu] of [["abc", 18], ["-3", 0], ["99", 30], ["20", 20]]) {
          saisir("res-taux-tva", valeur);
          ch.totaux.tauxTva = retenu;
          comparer("taux de TVA « " + valeur + " »");
        }
        for (const [valeur, retenu] of [["120", 100], ["abc", 40], ["50", 50]]) {
          saisir("res-acompte", valeur);
          ch.totaux.acompte = retenu;
          comparer("acompte « " + valeur + " »");
        }
        r1.$("res-acompte").dispatchEvent(new r1.w.Event("change", { bubbles: true }));
        if (r1.$("res-acompte").value !== "50") etape6.total.push("champ acompte non réécrit à la sortie");

        /* Enregistrement automatique, puis réouverture : tout est retrouvé à l'identique. */
        await pause(900);
        const apres = lireEnregistres(r1);
        const stocke = apres[0] || {};
        if (apres.length !== 1 || stocke.id !== enr.id) etape6.total.push("chantier dupliqué ou perdu à l'enregistrement");
        if (!/^Modifications enregistrées à \d{2}:\d{2}$/.test(r1.texte("etat-resultat"))) etape6.total.push("indication « Modifications enregistrées à HH:MM » absente");
        if (moteur.chiffrerChantier(stocke, cat, "XOF").total.totalGeneral !== attendu.total.totalGeneral) etape6.total.push("total enregistré ≠ total affiché");
        const totalFinal = montantUI(r1, "tot-general");
        const r2 = ouvrirPage(r1.stockage());
        r1.w.close();
        await pause(1800);
        const ligne2 = r2.doc.querySelector("#accueil-etudes [data-chantier]");
        if (ligne2) ligne2.click();
        await pause(400);
        if (montantUI(r2, "tot-general") !== totalFinal || r2.$("res-acompte").value !== "50" || !r2.$("res-tva").checked || r2.$("mat-prise-prix").value !== "2000") etape6.total.push("réglages non retrouvés après réouverture");

        /* « Modifier le chantier » : retour dans l'assistant, réenregistrement sur le même chantier. */
        r2.$("bouton-modifier-chantier").click();
        await pause(500);
        if (r2.actif() !== "ecran-nouveau-chantier" || r2.texte("titre-nouveau-chantier") !== "Modifier le chantier" || r2.$("chantier-nom").value !== "Studio Gounghin" || etapeVisible(r2) !== 1) etape6.contenu.push("« Modifier le chantier » n'ouvre pas l'assistant rempli (" + r2.actif() + ")");
        for (let i = 0; i < 4; i++) await suivant(r2, 250);
        await suivant(r2, 600);
        const apresModif = lireEnregistres(r2);
        if (r2.actif() !== "ecran-resultat" || apresModif.length !== 1 || apresModif[0].id !== enr.id || !apresModif[0].materiel.prise || apresModif[0].materiel.prise.prix !== 2000) etape6.contenu.push("modification non réenregistrée sur le même chantier");

        const base7 = r2.stockage();
        /* Chantier falsifié dans le stockage : réglages bornés, aucun NaN, aucun code interprété. */
        const falsifie = { ...apresModif[0], nom: "<img src=x onerror=alert(6)>", materiel: { prise: { quantite: 1e9, prix: -3 }, "__proto__": { prix: 1 }, "<b>": { prix: 5 } }, totaux: { remiseType: "<b>", remise: -50, tva: "oui", tauxTva: 1e9, acompte: "abc" } };
        const r3 = ouvrirPage({ ...r2.stockage(), [KC.chantiers]: JSON.stringify([falsifie]) });
        r2.w.close();
        await pause(1800);
        const ligne3 = r3.doc.querySelector("#accueil-etudes [data-chantier]");
        if (ligne3) ligne3.click();
        await pause(400);
        if (r3.actif() !== "ecran-resultat" || r3.doc.querySelector("img[src='x']") || r3.$("res-taux-tva").value !== "30" || r3.$("res-acompte").value !== "40" || r3.$("res-tva").checked || r3.$("mat-prise-qte").value !== "9999") etape6.total.push("chantier falsifié mal nettoyé");
        nombresResultat(r3, "chantier falsifié");
        r3.w.close();
        etape6.fait = true;

        /* ---------- Étape 7 : Mes prix → devis (㉝), deux devis indépendants (㉞), recalcul instantané (㉟) ---------- */
        {
          const KD = { devis: "bp_v1_devis", catalogue: "bp_v1_catalogue", numeros: "bp_v1_numeros_devis" };
          const annee = new Date().getFullYear();
          const lireJsonPage = (page, cle, defaut) => { try { return JSON.parse(page.stockage()[cle] || "null") ?? defaut; } catch { return defaut; } };
          const catalogueDe = (page) => (lireJsonPage(page, KD.catalogue, {}) || {})[compte.id] || null;
          const devisDe = (page) => lireJsonPage(page, KD.devis, []).filter((d) => d && d.compteId === compte.id && Array.isArray(d.lignes));
          const resoudre = (catalogue) => Object.fromEntries(catalogue.articles.map((a) => {
            let i = a.choisi;
            if (i === null || i === undefined) {
              i = -1;
              a.fournisseurs.forEach((f, k) => { if (f.prix > 0 && (i < 0 || f.prix < a.fournisseurs[i].prix)) i = k; });
              i = Math.max(0, i);
            }
            return [a.ref, { prix: a.fournisseurs[i].prix, designation: a.designation, fournisseur: a.fournisseurs[i].nom }];
          }));
          /* Mes prix de l'électricien : 2 fournisseurs pour le câble 1,5 (le moins cher est retenu),
             interrupteur absent (prix à compléter), désignation personnelle, main-d'œuvre habituelle. */
          const monCatalogue = {
            articles: Object.entries(moteur.CATALOGUE_DEFAUT).filter(([ref]) => ref !== "interrupteur").map(([ref, a]) => ({
              ref, designation: ref === "point" ? "Point lumineux DCL complet" : a.designation, unite: a.unite, categorie: a.categorie,
              fournisseurs: ref === "cable-1.5" ? [{ nom: "Quincaillerie A", prix: 450 }, { nom: "Dépôt B", prix: 380 }] : [{ nom: "", prix: a.prix }], choisi: null
            })),
            mainOeuvre: { points: { interrupteur: 2600 }, journee: 12000 }
          };
          const habituels = monCatalogue.mainOeuvre;
          const stockage7 = { ...base7, [KD.catalogue]: JSON.stringify({ [compte.id]: monCatalogue }) };
          const montant = (page, id) => nb(page.texte(id));
          const nombresFiche = (page, ou) => {
            const ecran = page.$("ecran-fiche-devis");
            const tout = ecran.textContent + " " + [...ecran.querySelectorAll("input")].map((i) => i.value).join(" ");
            const motif = /(?:^|[^0-9A-Za-zÀ-ÿ])(NaN|Infinity|undefined|null|-\s?\d)/;
            if (motif.test(tout)) etape7.recalcul.push(ou + " : « " + tout.slice(Math.max(0, tout.search(motif) - 20), tout.search(motif) + 20) + " »");
          };
          const confirmer = async (page) => { await pause(60); page.$("bouton-modale-ok").click(); await pause(400); };

          const p7 = ouvrirPage(stockage7);
          await pause(1800);
          const chantier7 = lireEnregistres(p7)[0];
          p7.doc.querySelector("#accueil-etudes [data-chantier]").click();
          await pause(400);
          const catRes = resoudre(monCatalogue);
          const chiffrage7 = moteur.chiffrerChantier(chantier7, catRes, "XOF", habituels);
          if (montant(p7, "tot-general") !== fcfa(chiffrage7.total.totalGeneral)) etape7.catalogue.push("résultat : total ≠ moteur avec Mes prix (" + montant(p7, "tot-general") + " / " + fcfa(chiffrage7.total.totalGeneral) + ")");
          if (p7.$("mat-cable-1_5-prix").value !== "380") etape7.catalogue.push("résultat : câble 1,5 au prix « " + p7.$("mat-cable-1_5-prix").value + " » au lieu du moins cher (380)");
          if (p7.$("bouton-creer-devis").hidden || p7.texte("libelle-creer-devis") !== "Créer le devis" || !p7.$("bouton-ouvrir-devis").hidden) etape7.catalogue.push("résultat : bouton « Créer le devis » mal présenté");

          /* Création : le devis reprend exactement le chiffrage, sans aucune ressaisie. */
          p7.$("bouton-creer-devis").click();
          await pause(600);
          const tous1 = devisDe(p7);
          const d1 = tous1[0] || {};
          if (p7.actif() !== "ecran-fiche-devis" || tous1.length !== 1) etape7.catalogue.push("fiche devis non ouverte après création (" + p7.actif() + ", " + tous1.length + " devis)");
          if (d1.numero !== "BP-" + annee + "-0001" || p7.texte("devis-numero") !== "Devis BP-" + annee + "-0001") etape7.catalogue.push("numéro : « " + d1.numero + " »");
          if (d1.statut !== "brouillon" || p7.texte("devis-badge") !== "Brouillon") etape7.catalogue.push("statut initial ≠ Brouillon");
          const lignesUI = p7.doc.querySelectorAll("#devis-lignes .ligne-devis");
          if (lignesUI.length !== chiffrage7.materiel.length) etape7.catalogue.push(lignesUI.length + " lignes au lieu de " + chiffrage7.materiel.length);
          const idDe = (devis, ref) => (devis.lignes.find((l) => l.ref === ref && !l.supprimee) || {}).id;
          const cable = idDe(d1, "cable-1.5");
          if (!cable || p7.$("devis-" + cable + "-prix").value !== "380" || !p7.$("devis-lignes").querySelector("[data-ligne='" + cable + "']").textContent.includes("Dépôt B")) etape7.catalogue.push("câble 1,5 : prix ou fournisseur choisi non repris");
          const point = idDe(d1, "point");
          if (!point || p7.$("devis-" + point + "-designation").value !== "Point lumineux DCL complet") etape7.catalogue.push("désignation de Mes prix non reprise");
          if (!egalAuCentime(moteur.calculerDevis(d1, "XOF").total.totalGeneral, chiffrage7.total.totalGeneral) || montant(p7, "devis-tot-general") !== fcfa(chiffrage7.total.totalGeneral)) etape7.catalogue.push("total du devis ≠ total de l'étude (" + montant(p7, "devis-tot-general") + ")");
          if (p7.$("devis-mo-interrupteur-prix").value !== "2600" || p7.$("devis-mo-tarif").value !== "12000") etape7.catalogue.push("main-d'œuvre habituelle non reprise");
          if (!p7.$("devis-conditions").value.trim()) etape7.catalogue.push("conditions du profil absentes du devis");
          if (p7.$("devis-acompte").value !== String(chantier7.totaux.acompte) || p7.$("devis-tva").checked !== chantier7.totaux.tva) etape7.catalogue.push("réglages du total (acompte, TVA) non repris de l'étude");
          /* Prix manquant : ligne à 0, encadré jaune, « Enregistrer dans Mes prix ». */
          const inter = idDe(d1, "interrupteur");
          const liInter = inter ? p7.doc.querySelector("#devis-lignes [data-ligne='" + inter + "']") : null;
          const encadre = liInter && liInter.querySelector(".encadre-prix");
          if (!encadre || encadre.hidden || !encadre.textContent.includes("Prix à compléter") || !encadre.querySelector("[data-enregistrer-prix]").disabled || p7.$("devis-" + inter + "-prix").value !== "") etape7.catalogue.push("interrupteur sans prix : encadré « Prix à compléter » absent");
          if (p7.doc.querySelectorAll("form, [data-formulaire-prix]").length !== p7.doc.querySelectorAll("form").length) etape7.catalogue.push("formulaire de ressaisie inattendu");
          if (inter) {
            p7.remplir("devis-" + inter + "-prix", "1300");
            if (encadre.hidden || encadre.querySelector("[data-enregistrer-prix]").disabled || !encadre.textContent.includes("Prix absent de Mes prix")) etape7.catalogue.push("prix saisi : bouton « Enregistrer dans Mes prix » non proposé");
            await pause(700);
            if ((catalogueDe(p7).articles || []).some((a) => a.ref === "interrupteur")) etape7.catalogue.push("Mes prix modifié sans décision de l'électricien");
            encadre.querySelector("[data-enregistrer-prix]").click();
            await pause(400);
            const art = (catalogueDe(p7).articles || []).find((a) => a.ref === "interrupteur");
            const encadreApres = p7.doc.querySelector("#devis-lignes [data-ligne='" + inter + "'] .encadre-prix");
            if (!art || art.fournisseurs[0].prix !== 1300 || !encadreApres || !encadreApres.hidden) etape7.catalogue.push("« Enregistrer dans Mes prix » n'a pas enregistré 1 300");
          }
          /* Prix modifié : ↻ « Mettre à jour dans Mes prix ? », jamais sans confirmation. */
          if (cable) {
            p7.remplir("devis-" + cable + "-prix", "400");
            const maj = p7.doc.querySelector("#devis-lignes [data-ligne='" + cable + "'] [data-maj-prix]");
            if (!maj || maj.hidden || maj.getAttribute("aria-label") !== "Mettre à jour dans Mes prix ?") etape7.catalogue.push("icône ↻ absente après changement de prix");
            await pause(700);
            const avant = (catalogueDe(p7).articles || []).find((a) => a.ref === "cable-1.5");
            if (!avant || avant.fournisseurs[1].prix !== 380) etape7.catalogue.push("Mes prix modifié par la simple saisie d'un prix");
            maj.click();
            await pause(60);
            p7.$("bouton-modale-annuler").click();
            await pause(300);
            if ((catalogueDe(p7).articles || []).find((a) => a.ref === "cable-1.5").fournisseurs[1].prix !== 380) etape7.catalogue.push("Mes prix modifié malgré « Annuler »");
            maj.click();
            await confirmer(p7);
            const apres = (catalogueDe(p7).articles || []).find((a) => a.ref === "cable-1.5");
            if (!apres || apres.fournisseurs[1].prix !== 400 || apres.fournisseurs[0].prix !== 450) etape7.catalogue.push("↻ confirmé : prix du fournisseur retenu non mis à jour");
            if (!p7.doc.querySelector("#devis-lignes [data-ligne='" + cable + "'] [data-maj-prix]").hidden) etape7.catalogue.push("↻ encore affiché après mise à jour");
          }
          /* Ligne libre enregistrée dans Mes prix ; article de Mes prix ajouté sans ressaisie. */
          p7.choisir("devis-ajout-article", "libre");
          p7.$("devis-bouton-ajouter").click();
          await pause(100);
          let d1m = null;
          {
            const ids = [...p7.doc.querySelectorAll("#devis-lignes .ligne-devis")].map((li) => li.dataset.ligne);
            const libre = ids[ids.length - 1];
            if (p7.doc.activeElement !== p7.$("devis-" + libre + "-designation")) etape7.catalogue.push("ligne libre : la désignation n'a pas le focus");
            p7.remplir("devis-" + libre + "-designation", "Projecteur LED 50 W");
            p7.remplir("devis-" + libre + "-prix", "15000");
            p7.doc.querySelector("#devis-lignes [data-ligne='" + libre + "'] [data-enregistrer-prix]").click();
            await pause(400);
            const perso = (catalogueDe(p7).articles || []).find((a) => a.designation === "Projecteur LED 50 W");
            if (!perso || !/^perso-[a-f0-9]{8}$/.test(perso.ref) || perso.fournisseurs[0].prix !== 15000) etape7.catalogue.push("ligne libre non enregistrée comme article de Mes prix");
            p7.choisir("devis-ajout-article", perso ? perso.ref : "");
            p7.$("devis-bouton-ajouter").click();
            await pause(100);
            const ids2 = [...p7.doc.querySelectorAll("#devis-lignes .ligne-devis")].map((li) => li.dataset.ligne);
            const ajout = ids2[ids2.length - 1];
            if (ids2.length !== ids.length + 1 || p7.$("devis-" + ajout + "-prix").value !== "15000" || p7.$("devis-" + ajout + "-designation").value !== "Projecteur LED 50 W") etape7.catalogue.push("article de Mes prix ajouté sans son prix");
          }
          p7.$("devis-bouton-enregistrer").click();
          await pause(300);
          d1m = devisDe(p7)[0];

          /* ㉟ Chaque saisie recalcule tout immédiatement ; l'attendu est calculé par le moteur seul. */
          const miroir = JSON.parse(JSON.stringify(d1m));
          let saisies = 0;
          const comparer = (ou) => {
            saisies += 1;
            const c = moteur.calculerDevis(miroir, "XOF");
            const t = c.total;
            const paires = [["devis-total-materiel", c.totalMateriel], ["devis-total-mo", c.mainOeuvre.total], ["devis-tot-sous-total", t.sousTotal], ["devis-tot-general", t.totalGeneral], ["devis-resume-total", t.totalGeneral], ["devis-tot-acompte", t.acompte], ["devis-tot-reste", t.reste]];
            if (t.tvaActive) paires.push(["devis-tot-tva", t.tva]);
            const ecarts = paires.filter(([id, v]) => montant(p7, id) !== fcfa(v)).map(([id, v]) => id + " " + montant(p7, id) + " ≠ " + fcfa(v));
            if (ecarts.length) etape7.recalcul.push(ou + " : " + ecarts.join(", "));
            nombresFiche(p7, ou);
          };
          const ligneM = (id) => miroir.lignes.find((l) => l.id === id);
          comparer("ouverture");
          p7.remplir("devis-" + cable + "-qte", "120");
          ligneM(cable).quantite = 120;
          comparer("120 m de câble, pendant la frappe");
          for (const [valeur, retenu] of [["-5", 0], ["abc", 0], ["1e400", 0], ["99999999", 999999], ["37", 37]]) {
            p7.remplir("devis-" + cable + "-qte", valeur);
            p7.$("devis-" + cable + "-qte").dispatchEvent(new p7.w.Event("change", { bubbles: true }));
            ligneM(cable).quantite = retenu;
            comparer("quantité « " + valeur + " »");
          }
          p7.$("devis-" + cable + "-qte").dispatchEvent(new p7.w.Event("change", { bubbles: true }));
          if (p7.$("devis-" + cable + "-qte").value !== "37") etape7.recalcul.push("quantité non réécrite à la sortie du champ");
          const prise = idDe(miroir, "prise");
          p7.doc.querySelector("#devis-lignes [data-supprimer-ligne='" + prise + "']").click();
          await pause(50);
          ligneM(prise).supprimee = true;
          comparer("ligne « prise » supprimée");
          if (p7.$("devis-bloc-supprimees").hidden || p7.texte("devis-titre-supprimees") !== "Lignes supprimées (1)" || p7.doc.querySelector("#devis-lignes [data-ligne='" + prise + "']")) etape7.recalcul.push("ligne supprimée non déplacée dans « Lignes supprimées »");
          p7.doc.querySelector("#devis-supprimees [data-restaurer-ligne='" + prise + "']").click();
          await pause(50);
          ligneM(prise).supprimee = false;
          comparer("ligne « prise » restaurée");
          if (!p7.$("devis-bloc-supprimees").hidden || !p7.doc.querySelector("#devis-lignes [data-ligne='" + prise + "']")) etape7.recalcul.push("ligne restaurée absente");
          p7.remplir("devis-" + prise + "-designation", "Prise 2P+T 16 A Legrand");
          ligneM(prise).designation = "Prise 2P+T 16 A Legrand";
          p7.remplir("devis-mo-prise-prix", "3500");
          miroir.mainOeuvre.points.prise.prix = 3500;
          comparer("main-d'œuvre : prise à 3 500");
          for (const [mode, facteur] of [["moins", 0.9], ["plus", 1.1]]) {
            p7.doc.querySelector("[data-ajuster-devis='" + mode + "']").click();
            await pause(30);
            miroir.mainOeuvre = moteur.ajusterMainOeuvre(miroir.mainOeuvre, moteur.calculerDevis(miroir, "XOF").mainOeuvre, facteur, "XOF");
            comparer("bouton « " + (mode === "plus" ? "+ 10 %" : "− 10 %") + " »");
          }
          if (p7.$("devis-mo-prise-prix").value !== String(Math.round(Math.round(3500 * 0.9) * 1.1))) etape7.recalcul.push("± 10 % : prix de la prise « " + p7.$("devis-mo-prise-prix").value + " »");
          p7.remplir("devis-mo-forfait", "30000");
          miroir.mainOeuvre.forfait = 30000;
          comparer("forfait 30 000");
          p7.doc.querySelector("[data-ajuster-devis='habituels']").click();
          await pause(30);
          Object.keys(moteur.MAIN_OEUVRE_POINTS).forEach((id) => { miroir.mainOeuvre.points[id].prix = id === "interrupteur" ? 2600 : moteur.MAIN_OEUVRE_POINTS[id].prix; });
          miroir.mainOeuvre.journees.tarif = 12000;
          comparer("bouton « Prix habituels »");
          if (p7.$("devis-mo-forfait").value !== "30000") etape7.recalcul.push("« Prix habituels » a changé le forfait");
          p7.remplir("devis-mo-ouvriers", "2");
          p7.remplir("devis-mo-jours", "1,5");
          miroir.mainOeuvre.journees.ouvriers = 2;
          miroir.mainOeuvre.journees.jours = 1.5;
          comparer("2 ouvriers × 1,5 jour");
          p7.$("devis-ajouter-libre").click();
          await pause(30);
          p7.remplir("devis-libre-libelle-" + miroir.mainOeuvre.libres.length, "Saignées dans le béton");
          p7.remplir("devis-libre-montant-" + miroir.mainOeuvre.libres.length, "8000");
          miroir.mainOeuvre.libres.push({ libelle: "Saignées dans le béton", montant: 8000 });
          comparer("ligne libre de main-d'œuvre 8 000");
          if (montant(p7, "devis-total-mo") !== fcfa(moteur.calculerDevis(miroir, "XOF").mainOeuvre.total) || !p7.$("devis-total-mo").closest(".total-mo")) etape7.recalcul.push("total main-d'œuvre absent du bloc jaune");
          if (p7.$("devis-mo-habituels").checked) etape7.recalcul.push("« Enregistrer ces prix comme mes prix habituels » coché par défaut");
          p7.doc.querySelector("input[name='devis-remise-type'][value='pourcent']").click();
          miroir.totaux.remiseType = "pourcent";
          miroir.totaux.remise = 0;
          comparer("remise en %");
          p7.remplir("devis-remise", "10");
          miroir.totaux.remise = 10;
          comparer("remise 10 %");
          p7.doc.querySelector("input[name='devis-remise-type'][value='montant']").click();
          miroir.totaux.remiseType = "montant";
          miroir.totaux.remise = 0;
          comparer("remise en montant");
          p7.remplir("devis-remise", "25000");
          miroir.totaux.remise = 25000;
          comparer("remise 25 000");
          p7.$("devis-tva").click();
          miroir.totaux.tva = p7.$("devis-tva").checked;
          comparer("TVA basculée");
          if (!p7.$("devis-tva").checked) {
            p7.$("devis-tva").click();
            miroir.totaux.tva = true;
            comparer("TVA activée");
          }
          for (const [valeur, retenu] of [["20", 20], ["abc", 18], ["99", 30]]) {
            p7.remplir("devis-taux-tva", valeur);
            miroir.totaux.tauxTva = retenu;
            comparer("TVA « " + valeur + " »");
          }
          p7.remplir("devis-acompte", "30");
          miroir.totaux.acompte = 30;
          comparer("acompte 30 %");
          p7.choisir("devis-statut", "accepte");
          if (p7.texte("devis-badge") !== "Accepté" || p7.$("devis-badge").dataset.ton !== "ok") etape7.recalcul.push("badge du statut Accepté");
          p7.choisir("devis-statut", "paye");
          if (p7.texte("devis-badge") !== "Payé" || p7.$("devis-badge").dataset.ton !== "paye") etape7.recalcul.push("badge du statut Payé");
          p7.remplir("devis-note", "Matériel garanti un an.");
          await pause(900);
          const d1s = devisDe(p7)[0];
          if (!/^Devis enregistré à \d{2}:\d{2}$/.test(p7.texte("etat-devis"))) etape7.recalcul.push("« Devis enregistré à HH:MM » absent (enregistrement automatique)");
          if (!d1s || d1s.statut !== "paye" || d1s.note !== "Matériel garanti un an." || d1s.total !== moteur.calculerDevis(miroir, "XOF").total.totalGeneral) etape7.recalcul.push("devis enregistré ≠ devis affiché");
          const totalD1 = montant(p7, "devis-tot-general");
          const moD1 = JSON.stringify(d1s ? d1s.mainOeuvre : null);

          /* Réouverture : tout est retrouvé ; la ligne de l'accueil ouvre le devis. */
          const p8 = ouvrirPage(p7.stockage());
          p7.w.close();
          await pause(1800);
          const ligneAccueil = p8.doc.querySelector("#accueil-devis [data-devis]");
          if (!ligneAccueil || !nb(ligneAccueil.textContent).includes("BP-" + annee + "-0001") || !ligneAccueil.querySelector(".statut[data-ton='paye']")) etape7.deux.push("accueil : devis absent ou sans badge Payé");
          if (ligneAccueil) ligneAccueil.click();
          await pause(400);
          if (p8.actif() !== "ecran-fiche-devis" || montant(p8, "devis-tot-general") !== totalD1 || p8.$("devis-statut").value !== "paye" || p8.$("devis-" + prise + "-designation").value !== "Prise 2P+T 16 A Legrand") etape7.recalcul.push("devis non retrouvé à l'identique après réouverture");

          /* ㉞ Un second devis du même chantier : sa main-d'œuvre et ses prix sont indépendants. */
          p8.doc.querySelector("[data-ecran='accueil']").click();
          await pause(300);
          p8.doc.querySelector("#accueil-etudes [data-chantier]").click();
          await pause(500);
          if (p8.$("bouton-ouvrir-devis").hidden || p8.texte("libelle-ouvrir-devis") !== "Ouvrir le devis BP-" + annee + "-0001" || p8.texte("libelle-creer-devis") !== "Créer un autre devis") etape7.deux.push("résultat : « Ouvrir le devis BP-…-0001 » / « Créer un autre devis » absents");
          p8.$("bouton-creer-devis").click();
          await pause(600);
          const tous2 = devisDe(p8);
          const d2 = tous2.find((d) => d.numero === "BP-" + annee + "-0002");
          if (tous2.length !== 2 || !d2 || p8.texte("devis-numero") !== "Devis BP-" + annee + "-0002") etape7.deux.push("second devis : " + tous2.map((d) => d.numero).join(", "));
          if (d2) {
            const cable2 = idDe(d2, "cable-1.5");
            if (p8.$("devis-" + cable2 + "-prix").value !== "400") etape7.catalogue.push("second devis : le prix mis à jour dans Mes prix (400) n'est pas repris");
            if (p8.$("devis-mo-prise-prix").value !== "3000") etape7.deux.push("second devis : main-d'œuvre héritée du premier devis (« " + p8.$("devis-mo-prise-prix").value + " »)");
            p8.remplir("devis-mo-prise-prix", "5000");
            p8.remplir("devis-mo-forfait", "1000");
            p8.$("devis-mo-habituels").click();
            p8.$("devis-bouton-enregistrer").click();
            await pause(400);
            const hab = (catalogueDe(p8) || {}).mainOeuvre || {};
            if (!hab.points || hab.points.prise !== 5000 || p8.$("devis-mo-habituels").checked) etape7.deux.push("case « mes prix habituels » : prise à 5 000 non enregistrée");
          }
          const d1b = devisDe(p8).find((d) => d.numero === "BP-" + annee + "-0001");
          if (!d1b || JSON.stringify(d1b.mainOeuvre) !== moD1 || d1b.total !== d1s.total) etape7.deux.push("le premier devis a changé quand le second a été modifié");
          p8.doc.querySelector("[data-ecran='accueil']").click();
          await pause(300);
          const versD1 = [...p8.doc.querySelectorAll("#accueil-devis [data-devis]")].find((b) => nb(b.textContent).includes("-0001"));
          if (versD1) versD1.click();
          await pause(400);
          if (p8.$("devis-mo-prise-prix").value === "5000" || montant(p8, "devis-tot-general") !== totalD1) etape7.deux.push("premier devis rouvert : main-d'œuvre du second devis ou total modifié");
          /* Numéro jamais réutilisé : le devis 0002 disparaît, le suivant est 0003. */
          const sans2 = lireJsonPage(p8, KD.devis, []).filter((d) => d.numero !== "BP-" + annee + "-0002");
          const ancien = { id: "ancien1", compteId: compte.id, titre: "Devis d'avant", client: "M. Ouédraogo", total: 50000, statut: "envoye", creeLe: new Date(Date.now() - 5000).toISOString() };
          const p9 = ouvrirPage({ ...p8.stockage(), [KD.devis]: JSON.stringify([...sans2, ancien]) });
          p8.w.close();
          await pause(1800);
          const lignesAccueil = [...p9.doc.querySelectorAll("#accueil-devis li")];
          const liAncien = lignesAccueil.find((li) => li.textContent.includes("Devis d'avant"));
          if (!liAncien || liAncien.querySelector("button")) etape7.deux.push("devis ancien (sans lignes) : absent ou présenté comme ouvrable");
          p9.doc.querySelector("#accueil-etudes [data-chantier]").click();
          await pause(500);
          p9.$("bouton-creer-devis").click();
          await pause(600);
          if (p9.texte("devis-numero") !== "Devis BP-" + annee + "-0003") etape7.deux.push("numéro réutilisé : « " + p9.texte("devis-numero") + " » au lieu de BP-" + annee + "-0003");

          /* Assistant, étape 5 : boutons rapides, total en jaune, case « mes prix habituels ». */
          p9.doc.querySelector("[data-ecran='accueil']").click();
          await pause(300);
          p9.doc.querySelector("#accueil-etudes [data-chantier]").click();
          await pause(500);
          p9.$("bouton-modifier-chantier").click();
          await pause(500);
          for (let i = 0; i < 4; i++) await suivant(p9, 250);
          const hab9 = catalogueDe(p9).mainOeuvre;
          const ch9 = JSON.parse(JSON.stringify(lireEnregistres(p9)[0]));
          const totalAssistant = () => nb(p9.texte("total-mo"));
          if (etapeVisible(p9) !== 5 || !p9.$("total-mo").closest(".total-mo") || p9.$("mo-enregistrer-habituels").checked) etape7.deux.push("assistant : total MO en jaune ou case décochée absents");
          if (totalAssistant() !== fcfa(moteur.etudierChantier(ch9, "XOF", hab9).mainOeuvre.total)) etape7.deux.push("assistant : total MO ≠ moteur avec les prix habituels (" + totalAssistant() + ")");
          p9.doc.querySelector("[data-ajuster-assistant='habituels']").click();
          await pause(30);
          Object.values(ch9.mainOeuvre.points).forEach((p) => { p.prix = null; });
          ch9.mainOeuvre.journees.tarif = null;
          if (totalAssistant() !== fcfa(moteur.etudierChantier(ch9, "XOF", hab9).mainOeuvre.total)) etape7.deux.push("assistant : « Prix habituels » (" + totalAssistant() + ")");
          p9.doc.querySelector("[data-ajuster-assistant='plus']").click();
          await pause(30);
          const plus = moteur.ajusterMainOeuvre(ch9.mainOeuvre, moteur.etudierChantier(ch9, "XOF", hab9).mainOeuvre, 1.1, "XOF");
          const ch9b = { ...ch9, mainOeuvre: { ...ch9.mainOeuvre, points: plus.points, forfait: plus.forfait, journees: { ...ch9.mainOeuvre.journees, tarif: plus.journees.tarif }, libres: plus.libres } };
          const moPlus = moteur.etudierChantier(ch9b, "XOF", hab9).mainOeuvre;
          if (totalAssistant() !== fcfa(moPlus.total)) etape7.deux.push("assistant : « + 10 % » (" + totalAssistant() + " ≠ " + fcfa(moPlus.total) + ")");
          p9.$("mo-enregistrer-habituels").click();
          await suivant(p9, 700);
          const hab9b = catalogueDe(p9).mainOeuvre;
          if (p9.actif() !== "ecran-resultat" || hab9b.points.prise !== moPlus.lignes.find((l) => l.id === "prise").prix || hab9b.journee !== moPlus.journees.tarif) etape7.deux.push("assistant : prix habituels non enregistrés avec le chantier");
          const devis9 = devisDe(p9);
          if (JSON.stringify(devis9.find((d) => d.numero.endsWith("-0001")).mainOeuvre) !== moD1) etape7.deux.push("premier devis modifié par le changement des prix habituels");
          const stockageFinal = p9.stockage();
          p9.w.close();

          /* Écran Mes prix : groupes, recherche, fournisseurs, comparaison, ajout, suppression, réinitialisation. */
          const m = ouvrirPage(stockageFinal);
          await pause(1800);
          const lienPrix = m.doc.querySelector("#tiroir-menu [data-ecran='prix']");
          if (!lienPrix || lienPrix.hidden || m.doc.querySelector("#onglets [data-ecran='prix']").hidden) etape7.catalogue.push("Mes prix absent du menu ou des onglets");
          if (lienPrix) lienPrix.click();
          await pause(400);
          const catM = catalogueDe(m);
          if (m.actif() !== "ecran-prix" || m.doc.querySelectorAll("#prix-groupes .groupe-prix").length !== new Set(catM.articles.map((a) => a.categorie)).size || m.doc.querySelectorAll("#prix-groupes .article-prix").length !== catM.articles.length) etape7.catalogue.push("Mes prix : articles non groupés par catégorie");
          m.remplir("prix-recherche", "CABLE");
          const visibles = [...m.doc.querySelectorAll("#prix-groupes .liste-articles > li")].filter((li) => !li.hidden).map((li) => li.dataset.ref);
          if (!visibles.includes("cable-1.5") || !visibles.includes("cable-terre") || visibles.some((ref) => /^(prise|interrupteur|coffret|disjoncteur)/.test(ref))) etape7.catalogue.push("recherche « CABLE » : " + visibles.join(", "));
          m.remplir("prix-recherche", "depot b");
          const visibles2 = [...m.doc.querySelectorAll("#prix-groupes .liste-articles > li")].filter((li) => !li.hidden).map((li) => li.dataset.ref);
          if (visibles2.join() !== "cable-1.5") etape7.catalogue.push("recherche par fournisseur : " + visibles2.join(", "));
          m.remplir("prix-recherche", "zzz");
          if (m.$("prix-vide").hidden) etape7.catalogue.push("recherche sans résultat : message absent");
          m.remplir("prix-recherche", "");
          const detailsPrise = m.$("article-prise");
          m.remplir("art-prise-f0-prix", "1800");
          if (!nb(detailsPrise.querySelector("summary").textContent).includes("1 800 FCFA l'unité")) etape7.catalogue.push("modification directe : résumé non mis à jour");
          detailsPrise.querySelector("[data-ajouter-fournisseur]").click();
          await pause(30);
          m.remplir("art-prise-f1-nom", "Grossiste C");
          m.remplir("art-prise-f1-prix", "1700");
          const badges = [...detailsPrise.querySelectorAll("[data-badge-fournisseur]")].filter((b) => !b.hidden).map((b) => b.dataset.badgeFournisseur);
          if (badges.join() !== "1" || !nb(detailsPrise.querySelector("summary").textContent).includes("1 700 FCFA") || !detailsPrise.querySelector("summary").textContent.includes("Grossiste C")) etape7.catalogue.push("comparaison des fournisseurs : le moins cher n'est pas retenu");
          const radio0 = detailsPrise.querySelector("[data-choisir-fournisseur='0']");
          radio0.checked = true;
          radio0.dispatchEvent(new m.w.Event("change", { bubbles: true }));
          if (!nb(detailsPrise.querySelector("summary").textContent).includes("1 800 FCFA")) etape7.catalogue.push("fournisseur choisi à la main non retenu");
          m.remplir("prix-mo-prise", "2800");
          await pause(800);
          const catM2 = catalogueDe(m);
          const prise2 = catM2.articles.find((a) => a.ref === "prise");
          if (!prise2 || prise2.fournisseurs.length !== 2 || prise2.choisi !== 0 || prise2.fournisseurs[1].prix !== 1700 || catM2.mainOeuvre.points.prise !== 2800) etape7.catalogue.push("Mes prix : modifications non enregistrées automatiquement");
          if (!/^Prix enregistrés à \d{2}:\d{2}$/.test(m.texte("etat-prix"))) etape7.catalogue.push("« Prix enregistrés à HH:MM » absent");
          /* Ajout d'un article : désignation obligatoire, prix valide. */
          await m.soumettre("form-nouvel-article", 200);
          if (!m.$("article-designation").closest(".champ").classList.contains("invalide")) etape7.catalogue.push("ajout sans désignation accepté");
          m.$("article-designation").value = "Projecteur LED 100 W";
          m.$("article-prix").value = "abc";
          await m.soumettre("form-nouvel-article", 200);
          if (!m.$("article-prix").closest(".champ").classList.contains("invalide")) etape7.catalogue.push("prix « abc » accepté");
          m.$("article-prix").value = "25000";
          m.choisir("article-categorie", "appareillage");
          await m.soumettre("form-nouvel-article", 400);
          const ajoute = catalogueDe(m).articles.find((a) => a.designation === "Projecteur LED 100 W");
          if (!ajoute || ajoute.categorie !== "appareillage" || ajoute.fournisseurs[0].prix !== 25000 || !m.doc.querySelector("#prix-groupes [data-categorie='appareillage'] [data-ref='" + ajoute.ref + "']")) etape7.catalogue.push("article ajouté absent ou mal rangé");
          if (ajoute) {
            m.doc.querySelector("#article-" + ajoute.ref + " [data-supprimer-article]").click();
            await confirmer(m);
            if (catalogueDe(m).articles.some((a) => a.ref === ajoute.ref) || m.$("article-" + ajoute.ref)) etape7.catalogue.push("suppression d'un article");
          }
          /* Double confirmation : « Non » à la seconde question ne change rien. */
          m.$("bouton-reinitialiser-prix").click();
          await confirmer(m);
          const secondeQuestion = m.texte("modale-titre");
          await pause(60);
          m.$("bouton-modale-annuler").click();
          await pause(300);
          if (secondeQuestion !== "Vraiment tout réinitialiser ?" || catalogueDe(m) === null) etape9.supprimer.push("Mes prix : « Réinitialiser » sans double confirmation (« " + secondeQuestion + " »)");
          m.$("bouton-reinitialiser-prix").click();
          await confirmer(m);
          await confirmer(m);
          if (catalogueDe(m) !== null || m.$("art-prise-f0-prix").value !== "1500" || m.$("prix-mo-prise").value !== "2500" || m.doc.querySelectorAll("#prix-groupes .article-prix").length !== Object.keys(moteur.CATALOGUE_DEFAUT).length) etape7.catalogue.push("« Réinitialiser » ne revient pas aux prix de départ");
          if (devisDe(m).length !== 2 || JSON.stringify(devisDe(m).find((d) => d.numero.endsWith("-0001")).mainOeuvre) !== moD1) etape7.catalogue.push("« Réinitialiser » a modifié des devis");
          m.w.close();

          /* Données falsifiées : catalogue et devis piégés, affichés en texte, montants bornés. */
          const piege = { articles: [
            { ref: "prise", designation: "<img src=x onerror=alert(7)>", unite: "<b>", categorie: "__proto__", fournisseurs: [{ nom: "<b>pirate</b>", prix: -5 }, { nom: "x", prix: "abc" }, { nom: "y", prix: 1e308 }, 4, null, { nom: "z", prix: 1 }, { nom: "trop", prix: 2 }], choisi: 99 },
            { ref: "../../x", designation: "Hors catalogue", fournisseurs: [] }, { ref: "__proto__", designation: "proto" }, "texte", null
          ], mainOeuvre: { points: { prise: -50, inconnu: 5 }, journee: "abc" } };
          const devisPiege = { ...d1s, id: "piege1", numero: "BP-" + annee + "-0099", titre: "<img src=x onerror=alert(8)>", total: 999999999999,
            lignes: [{ id: "l1", ref: "<b>", designation: "<b>gras</b>", unite: "km", categorie: "x", quantite: -3, prix: "1e400", supprimee: "oui" }, null, 7],
            mainOeuvre: { points: { prise: { quantite: 1e9, prix: -1 } }, forfait: NaN, journees: "x", libres: [{ libelle: "<i>", montant: -9 }] }, totaux: { remiseType: "<b>", remise: -5, tva: "oui", tauxTva: 1e9, acompte: "abc" } };
          const f = ouvrirPage({ ...stockageFinal, [KD.catalogue]: JSON.stringify({ [compte.id]: piege }), [KD.devis]: JSON.stringify([devisPiege]) });
          await pause(1800);
          if (nb(f.texte("cpt-montant")).includes("999 999 999 999")) etape7.recalcul.push("total falsifié pris dans les statistiques");
          f.doc.querySelector("#accueil-devis [data-devis]").click();
          await pause(400);
          if (f.actif() !== "ecran-fiche-devis" || f.doc.querySelector("img[src='x']") || f.doc.querySelector("#ecran-fiche-devis b, #ecran-fiche-devis i") || f.$("devis-tva").checked || f.$("devis-taux-tva").value !== "30" || f.$("devis-acompte").value !== "40") etape7.recalcul.push("devis falsifié mal nettoyé");
          nombresFiche(f, "devis falsifié");
          f.doc.querySelector("#tiroir-menu [data-ecran='prix']").click();
          await pause(400);
          const articlesF = f.doc.querySelectorAll("#prix-groupes .article-prix");
          const priseF = f.$("article-prise");
          if (articlesF.length !== 1 || !priseF || f.doc.querySelector("img[src='x']") || f.doc.querySelector("#prix-groupes b") || priseF.querySelectorAll(".ligne-fournisseur").length !== 5
            || !nb(priseF.querySelector("summary").textContent).includes("1 FCFA") || f.$("prix-mo-prise").value !== "2500" || f.$("prix-mo-journee").value !== "10000") etape7.catalogue.push("catalogue falsifié mal nettoyé (" + articlesF.length + " article(s), "
            + (priseF ? priseF.querySelectorAll(".ligne-fournisseur").length + " fournisseur(s), « " + nb(priseF.querySelector("summary").textContent) + " »" : "prise absente") + ", MO " + f.$("prix-mo-prise").value + "/" + f.$("prix-mo-journee").value + ")");
          f.w.close();

          /* ---------- Étape 8 : feuille A4, PDF, WhatsApp (parcours réel) ---------- */
          const g = ouvrirPage(stockageFinal);
          await pause(1800);
          let blobCapture = null;
          g.w.URL.createObjectURL = (blob) => { blobCapture = blob; return "blob:https://batiplus.local/essai"; };
          g.w.URL.revokeObjectURL = () => {};
          const entreeD1 = g.doc.querySelector("#accueil-devis [data-devis='" + d1s.id + "']");
          if (entreeD1) entreeD1.click();
          await pause(400);
          if (g.actif() !== "ecran-fiche-devis") etape8.a4.push("devis 0001 non ouvert (" + g.actif() + ")");
          const clientPiege = "Dupont & Fils <b>#1</b> ? 100 % « é » ⚡";
          g.remplir("devis-client", clientPiege);
          g.remplir("devis-client-telephone", "70 12-34.56");
          g.$("devis-client-telephone").dispatchEvent(new g.w.Event("change", { bubbles: true }));
          await pause(50);
          const lienFiche = g.$("devis-lien-whatsapp");
          const href = lienFiche.getAttribute("href") || "";
          const [baseWa, texteWa] = href.split("?text=");
          let decode = "";
          try { decode = decodeURIComponent(texteWa || ""); } catch { decode = ""; }
          if (baseWa !== "https://wa.me/22670123456") etape8.whatsapp.push("numéro non nettoyé : « " + baseWa + " »");
          if (!/^[A-Za-z0-9%._~!*'()-]+$/.test(texteWa || "")) etape8.whatsapp.push("texte non encodé (caractère brut dans le lien)");
          if (lienFiche.getAttribute("rel") !== "noopener noreferrer" || lienFiche.getAttribute("target") !== "_blank") etape8.whatsapp.push("lien sans rel=\"noopener noreferrer\"");
          if (g.$("devis-client-telephone").value !== "+226 70 12 34 56") etape8.whatsapp.push("téléphone du client non reformaté (« " + g.$("devis-client-telephone").value + " »)");
          const attendusWa = ["Bonjour " + clientPiege + ",", "Voici votre devis BP-" + annee + "-0001", "Total : " + montant(g, "devis-tot-general"), "Acompte à la commande", nb(g.texte("devis-tot-acompte")), "Devis réalisé avec BâtiPlus"];
          const manquentWa = attendusWa.filter((a) => !decode.includes(a));
          if (manquentWa.length) etape8.whatsapp.push("message incomplet : " + manquentWa.join(" | "));
          if (!/Résumé : \d+ circuits?, \d+ prises?, \d+ points? lumineux\./.test(decode)) etape8.whatsapp.push("résumé circuits/prises/points absent");
          if (!decode.includes(nb(compte.nom).split(" ")[0]) && !decode.includes("+226")) etape8.whatsapp.push("nom ou téléphone de l'électricien absent");
          g.remplir("devis-client-telephone", "12");
          g.$("devis-client-telephone").dispatchEvent(new g.w.Event("change", { bubbles: true }));
          await pause(50);
          if (!(g.$("devis-lien-whatsapp").getAttribute("href") || "").startsWith("https://wa.me/?text=") || !g.texte("err-devis-client-telephone") || !g.texte("devis-aide-whatsapp")) etape8.whatsapp.push("numéro incomplet : lien, erreur ou aide incorrects");
          g.remplir("devis-client-telephone", "+226 70 12 34 56");
          g.$("devis-client-telephone").dispatchEvent(new g.w.Event("change", { bubbles: true }));
          await pause(900);
          const d1g = devisDe(g).find((d) => d.id === d1s.id) || {};
          if (d1g.clientTelephone !== "+22670123456" || d1g.client !== clientPiege) etape8.whatsapp.push("téléphone ou client non enregistrés dans le devis");

          /* Feuille A4 : tout vient du devis, rien n'est tronqué ni injecté. */
          g.$("devis-bouton-imprimer").click();
          await pause(600);
          if (g.actif() !== "ecran-feuille") etape8.a4.push("« Imprimer ou PDF » n'ouvre pas la feuille A4 (" + g.actif() + ")");
          const fa = g.$("feuille-a4");
          const tables = fa.querySelectorAll(".f-table");
          const entetes = [...fa.querySelectorAll(".f-table thead th")].map((th) => th.textContent).join("|");
          if (tables.length !== 2 || entetes !== "Désignation|Unité|Qté|Prix unitaire|Montant|Désignation|Unité|Qté|Prix unitaire|Montant") etape8.a4.push("tableaux Matériel et Main-d'œuvre absents ou colonnes incorrectes");
          const lignesAttendues = d1g.lignes.filter((l) => !l.supprimee && l.quantite > 0).length;
          const lignesFeuille = tables[0] ? tables[0].querySelectorAll("tbody tr:not(.f-sous-total)").length : 0;
          if (lignesFeuille !== lignesAttendues) etape8.a4.push(lignesFeuille + " lignes de matériel sur la feuille au lieu de " + lignesAttendues);
          const calc8 = moteur.calculerDevis(d1g, "XOF");
          const sousTotaux = [...fa.querySelectorAll(".f-sous-total td:last-child")].map((td) => nb(td.textContent));
          if (sousTotaux[0] !== fcfa(calc8.totalMateriel) || sousTotaux[1] !== fcfa(calc8.mainOeuvre.total)) etape8.a4.push("sous-totaux ≠ devis (" + sousTotaux.join(" / ") + ")");
          const tg = fa.querySelector(".f-total-general td");
          if (!tg || nb(tg.textContent) !== fcfa(calc8.total.totalGeneral)) etape8.a4.push("TOTAL GÉNÉRAL ≠ devis");
          if (nb(fa.querySelector(".f-lettres").textContent) !== nb("Arrêté le présent devis à la somme de " + moteur.montantEnLettres(calc8.total.totalGeneral, "XOF") + ".")) etape8.a4.push("montant en lettres incorrect");
          if (fa.querySelectorAll(".f-signature").length !== 2 || !fa.querySelector(".f-mention") || !nb(fa.textContent).includes("Matériel garanti un an.")) etape8.a4.push("signatures, mention ou note absentes");
          if (fa.querySelector("b, img[src='x']") || !fa.textContent.includes("<b>#1</b>")) etape8.a4.push("nom du client interprété comme du HTML");
          if (!fa.querySelector(".f-initiales") || fa.querySelector(".f-logo")) etape8.a4.push("formule gratuite : initiales attendues, pas de logo");
          if (!g.$("feuille-a-completer").hidden === (calc8.lignes.filter((l) => !l.supprimee && l.quantite > 0 && l.prix === 0).length === 0)) etape8.a4.push("alerte « prix à 0 » incohérente");
          const pied = fa.querySelector(".f-pied");
          const regleFiligrane = [...g.doc.styleSheets].flatMap((s) => [...s.cssRules]).find((r) => r.selectorText === ".f-filigrane");
          if (!pied || !pied.classList.contains("f-filigrane") || pied.textContent !== moteur.PIED_DEVIS || !regleFiligrane || regleFiligrane.style.opacity !== "0.22") etape8.filigrane.push("formule gratuite : pied en filigrane (opacité 0,22) absent");
          const styleLivre = g.doc.querySelector("head style").textContent;
          const impression = styleLivre.slice(styleLivre.indexOf("@media print"));
          if (!/@page\s*\{\s*size:\s*A4;\s*margin:\s*12mm;?\s*\}/.test(impression) || !/[^-]print-color-adjust:\s*exact/.test(impression) || !/\.f-table thead\s*\{\s*display:\s*table-header-group;?\s*\}/.test(styleLivre)) etape8.a4.push("règles d'impression A4 absentes (@page A4 12 mm, print-color-adjust, thead répété)");
          const waFeuille = g.$("feuille-lien-whatsapp").getAttribute("href");
          if (waFeuille !== g.$("devis-lien-whatsapp").getAttribute("href")) etape8.whatsapp.push("lien WhatsApp de la feuille ≠ lien du devis");

          /* PDF téléchargé (navigateur) : nom, structure, une page, filigrane. */
          g.$("feuille-bouton-pdf").click();
          await pause(500);
          const nomAttendu = moteur.nomFichierDevis("BP-" + annee + "-0001", clientPiege);
          if (g.texte("etat-feuille") !== "PDF téléchargé : " + nomAttendu) etape8.a4.push("PDF : message « " + g.texte("etat-feuille") + " » (attendu " + nomAttendu + ")");
          if (!blobCapture || blobCapture.type !== "application/pdf") etape8.a4.push("PDF non produit");
          else {
            const octets = await new Promise((resoudre) => {
              const lecteur = new g.w.FileReader();
              lecteur.onload = () => resoudre(new Uint8Array(lecteur.result));
              lecteur.onerror = () => resoudre(new Uint8Array(0));
              lecteur.readAsArrayBuffer(blobCapture);
            });
            const bilan = analyserPdf(octets);
            if (process.env.ESSAI_PDF) (await import("node:fs")).writeFileSync(process.env.ESSAI_PDF, octets);
            if (bilan.erreurs.length || bilan.pages !== 1) etape8.a4.push("PDF du devis : " + bilan.pages + " page(s) " + bilan.erreurs.join(", "));
            if (!bilan.texte.includes("(TOTAL G\\311N\\311RAL)") || !bilan.texte.includes("/GS1 gs") || !bilan.texte.includes("BRG")) etape8.filigrane.push("PDF gratuit : total ou pied en filigrane absent");
            etape8.octetsPdf = octets.length;
          }
          g.w.close();
          etape8.fait = true;
          etape7.fait = true;
        }
      }
      etape5.fait = true;
    }

    /* ---------- Étape 9 : Mes devis, Mes chantiers, Mes clients, Statistiques ---------- */
    {
      const moteur9 = chargerMoteur();
      const an = new Date().getFullYear();
      const ici = new Date();
      const iso = (jours, heure) => new Date(ici.getFullYear(), ici.getMonth(), ici.getDate() - jours, heure === undefined ? 9 : heure).toISOString();
      const cat9 = Object.fromEntries(Object.entries(moteur9.CATALOGUE_DEFAUT).map(([r, art]) => [r, { ...art }]));
      const type9 = (cle) => CHANTIERS_TYPES.find((t) => t.cle === cle);
      const base9 = (cle) => moteur9.devisDepuisChiffrage(moteur9.chiffrerChantier(type9(cle).chantier, cat9, "XOF", null));
      const devis9 = (id, n, cle, titre, client, statut, jours, extra) => ({ ...base9(cle), id, compteId: compte.id, numero: "BP-" + an + "-000" + n, statut,
        creeLe: iso(jours), modifieLe: iso(jours), titre, client, clientTelephone: "", lieu: "Ouagadougou", chantierId: null, conditions: "", note: "", ...extra });
      const fixtures = [
        devis9("e1", 1, "villa", "Villa R+1 Ouaga 2000", "Société Dupont & Fils", "accepte", 1, { clientTelephone: "+22670123456" }),
        devis9("e2", 2, "boutique", "Rénovation tableau", "Mme Sawadogo Aminata", "envoye", 3),
        devis9("e3", 3, "studio", "Éclairage boutique", "société dupont & fils", "paye", 40),
        devis9("e4", 4, "studio", "Studio Gounghin", "M. Kaboré", "refuse", 20),
        devis9("e5", 5, "boutique", "Studio Gounghin bis", "M. Kaboré", "brouillon", 0, { creeLe: iso(0, 0), modifieLe: iso(0, 0) }),
        { id: "l1", compteId: compte.id, titre: "Ancien chantier", client: "M. Ilboudo", total: 100000, statut: "accepte", creeLe: iso(400) },
        { ...devis9("x9", 9, "villa", "Pas à moi", "Inconnu", "accepte", 0), compteId: "autre-compte" }
      ];
      const totalDe = (d) => (Array.isArray(d.lignes) ? moteur9.calculerDevis(d, "XOF").total.totalGeneral : d.total);
      const miens = fixtures.filter((d) => d.compteId === compte.id).map((d) => ({ ...d, total: totalDe(d) }));
      const chantier9 = (id, cle, nom, client, telephone, jours) => ({ ...JSON.parse(JSON.stringify(type9(cle).chantier)), id, compteId: compte.id, statut: "etudie",
        etape: 5, etapeMax: 5, nom, lieu: "Ouagadougou", type: cle, client: { nom: client, telephone }, creeLe: iso(jours), modifieLe: iso(jours) });
      const chantiers9 = [chantier9("chantier-villa-01", "villa", "Villa Ouaga 2000", "M. Kaboré", "", 2), chantier9("chantier-boutique-02", "boutique", "Boutique Zogona", "Hôtel Laïco", "+22625000000", 5)];
      const brouillon9 = { [compte.id]: { ...chantier9("brouillon-studio-03", "studio", "Studio en cours", "Client du brouillon", "", 0), statut: "brouillon", etape: 2, etapeMax: 2 } };
      const clients9 = [
        { id: "cm1", compteId: compte.id, nom: "Nouveau Client Manuel", telephone: "+22676000000", creeLe: iso(1), modifieLe: iso(1) },
        { id: "cm2", compteId: compte.id, nom: "m. kabore", telephone: "+22605608608", creeLe: iso(1), modifieLe: iso(1) },
        { id: "<b>x</b>", compteId: compte.id, nom: "Pirate" }, { id: "cm3", compteId: "autre-compte", nom: "Pas à moi" }, { id: "cm4", compteId: compte.id, nom: "" }, "texte", null, [1]
      ];
      const e = ouvrirPage({ ...q.stockage(), [K.devis]: JSON.stringify(fixtures), bp_v1_chantiers: JSON.stringify(chantiers9),
        bp_v1_brouillon_chantier: JSON.stringify(brouillon9), bp_v1_clients: JSON.stringify(clients9) });
      await pause(3600);
      const ids = (liste) => [...e.doc.querySelectorAll("#" + liste + " > li")].map((li) => li.dataset.element);
      const stocke = (cle) => JSON.parse(e.stockage()[cle] || "null");
      const confirmer9 = async () => { await pause(60); e.$("bouton-modale-ok").click(); await pause(400); };
      const refuser9 = async () => { await pause(60); e.$("bouton-modale-annuler").click(); await pause(300); };
      const cliquer9 = async (selecteur, ms) => { const el = e.doc.querySelector(selecteur); if (el) el.click(); await pause(ms || 300); return Boolean(el); };
      const nb9 = (s) => s.replace(/[\s\u202f\u00a0]/g, " ");
      const fcfa = (v) => nb9(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v)) + " FCFA";

      /* ST : mêmes chiffres sur l'accueil, le profil et l'écran Statistiques. */
      const attendu = moteur9.statistiquesDetaillees(miens, new Date(), 8);
      const montantTotal = miens.reduce((s, d) => s + d.total, 0);
      if (e.actif() !== "ecran-accueil") etape9.stats.push("accueil absent (" + e.actif() + ")");
      if (nb9(e.texte("cpt-montant")) !== fcfa(montantTotal)) etape9.stats.push("accueil montant « " + e.texte("cpt-montant") + " » ≠ " + fcfa(montantTotal));
      if (e.texte("cpt-devis") !== String(attendu.mois.nombre) || e.texte("cpt-acceptes") !== "3") etape9.stats.push("accueil compteurs " + e.texte("cpt-devis") + "/" + e.texte("cpt-acceptes") + " (attendu " + attendu.mois.nombre + "/3)");
      await cliquer9(".raccourci[data-ecran='profil']", 600);
      if (e.texte("stat-devis") !== "6" || e.texte("stat-clients") !== "4" || e.texte("stat-acceptes") !== "3" || e.texte("stat-taux") !== "50\u00A0%") etape9.stats.push("profil : " + ["stat-devis", "stat-clients", "stat-acceptes", "stat-taux"].map((id) => e.texte(id)).join(" | "));
      await cliquer9("#carte-stats [data-ecran='stats']", 400);
      if (e.actif() !== "ecran-stats") etape9.stats.push("bouton « Voir toutes les statistiques » → " + e.actif());
      if (nb9(e.texte("stats-montant")) !== fcfa(montantTotal) || e.texte("stats-taux") !== e.texte("stat-taux")) etape9.stats.push("Statistiques : " + e.texte("stats-montant") + " / " + e.texte("stats-taux") + " ≠ accueil/profil");
      const accepteAttendu = miens.filter((d) => d.statut === "accepte" || d.statut === "paye").reduce((s, d) => s + d.total, 0);
      if (nb9(e.texte("stats-accepte")) !== fcfa(accepteAttendu)) etape9.stats.push("montant accepté « " + e.texte("stats-accepte") + " » ≠ " + fcfa(accepteAttendu));
      const barres = [...e.doc.querySelectorAll("#stats-clients > li")];
      const dupont = fcfa(miens[0].total + miens[2].total);
      if (barres.length !== 4 || !barres[0].textContent.includes("Société Dupont & Fils · 2 devis") || nb9(barres[0].querySelector(".stats-barre-montant").textContent) !== dupont
        || barres[0].querySelector(".stats-piste span").style.width !== "100%" || !barres[3].textContent.includes("M. Ilboudo")) etape9.stats.push("montant par client : " + barres.map((b) => nb9(b.textContent)).join(" | "));
      const svg = e.doc.querySelector("#stats-graphique svg");
      const jours = new Date(ici.getFullYear(), ici.getMonth() + 1, 0).getDate();
      if (!svg || svg.getAttribute("viewBox") !== "0 0 360 168" || !svg.querySelector("title") || !svg.getAttribute("aria-label").includes(attendu.mois.nombre ? "devis" : "aucun")
        || svg.querySelectorAll(".graphique-futur").length !== jours - ici.getDate()) etape9.stats.push("graphique du mois incomplet");
      if (attendu.mois.nombre && svg && !svg.querySelector(".graphique-aujourdhui") && miens.some((d) => d.statut === "brouillon" && d.total > 0)) etape9.stats.push("bâton d'aujourd'hui absent");
      const statuts = [...e.doc.querySelectorAll("#stats-statuts li")].map((li) => li.textContent).join("|");
      if (statuts !== "Brouillon1|Envoyé1|Accepté2|Refusé1|Payé1") etape9.stats.push("répartition par statut : " + statuts);

      /* ㊶ Mes devis : recherche, filtre, tri. */
      await cliquer9(".raccourci[data-ecran='accueil'], [data-ecran='accueil']", 300);
      if (!await cliquer9(".lien-tous[data-ecran='devis']", 400) || e.actif() !== "ecran-devis") etape9.recherche.push("« Voir tous mes devis » → " + e.actif());
      const verifier = (libelle, attenduIds) => { const vus = ids("liste-devis").join(","); if (vus !== attenduIds) etape9.recherche.push(libelle + " : " + vus + " (attendu " + attenduIds + ")"); };
      verifier("liste complète, plus récents d'abord", "e5,e1,e2,e4,e3,l1");
      if (e.texte("devis-compte") !== "6 devis") etape9.recherche.push("compteur « " + e.texte("devis-compte") + " »");
      e.remplir("devis-recherche", "fils  DUPONT");
      await pause(50);
      verifier("« fils  DUPONT »", "e1,e3");
      if (e.texte("devis-compte") !== "2 sur 6 devis") etape9.recherche.push("compteur filtré « " + e.texte("devis-compte") + " »");
      e.remplir("devis-recherche", "eclairage");
      verifier("« eclairage » sans accent", "e3");
      e.remplir("devis-recherche", "bp-" + an + "-0004");
      verifier("numéro", "e4");
      e.remplir("devis-recherche", "payé");
      verifier("statut cherché « payé »", "e3");
      e.remplir("devis-recherche", "<img src=x onerror=alert(9)>");
      verifier("requête piégée", "");
      if (e.$("devis-vide").hidden || !e.texte("devis-vide").includes("Aucun devis ne correspond")) etape9.recherche.push("message « aucun résultat » absent");
      e.remplir("devis-recherche", "");
      const radio = (v) => e.doc.querySelector("#devis-filtre-statut [data-filtre-statut='" + v + "']");
      if (!radio("accepte") || nb9(radio("accepte").nextElementSibling.textContent) !== "Accepté (2)") etape9.recherche.push("puce « Accepté (2) » absente");
      radio("accepte").checked = true;
      radio("accepte").dispatchEvent(new e.w.Event("change", { bubbles: true }));
      verifier("filtre Accepté", "e1,l1");
      radio("tous").checked = true;
      radio("tous").dispatchEvent(new e.w.Event("change", { bubbles: true }));
      e.choisir("devis-tri", "montant-desc");
      verifier("tri montant décroissant (égalité → plus récent)", "e1,e5,e2,e4,e3,l1");
      e.choisir("devis-tri", "montant-asc");
      verifier("tri montant croissant", "l1,e4,e3,e5,e2,e1");
      e.choisir("devis-tri", "anciens");
      verifier("tri plus anciens", "l1,e3,e4,e2,e1,e5");
      e.choisir("devis-tri", "recents");
      if (e.doc.querySelector("#liste-devis [data-element='l1'] [data-ouvrir-devis], #liste-devis [data-element='l1'] [data-dupliquer-devis]")) etape9.recherche.push("ancien devis ouvrable ou duplicable");
      if (e.doc.querySelector("#liste-devis img, #liste-devis b")) etape9.recherche.push("balise injectée dans la liste");

      /* Envoyer : lien WhatsApp calculé au toucher, encodé, sûr. */
      const envoyer = e.doc.querySelector("#liste-devis [data-envoyer-devis='e1']");
      envoyer.addEventListener("click", (ev) => ev.preventDefault());
      envoyer.click();
      const href = envoyer.getAttribute("href");
      if (!/^https:\/\/wa\.me\/22670123456\?text=[A-Za-z0-9%._~!*'()-]+$/.test(href) || !decodeURIComponent(href.split("text=")[1]).includes("BP-" + an + "-0001")
        || envoyer.getAttribute("rel") !== "noopener noreferrer") etape9.recherche.push("Envoyer : lien « " + href.slice(0, 60) + " »");

      /* Dupliquer : nouveau numéro, brouillon, mêmes lignes. */
      await cliquer9("#liste-devis [data-dupliquer-devis='e1']", 600);
      const apresCopie = stocke(K.devis).filter((d) => d.compteId === compte.id);
      const copie = apresCopie.find((d) => !fixtures.some((f) => f.id === d.id));
      const original = apresCopie.find((d) => d.id === "e1");
      if (!copie || copie.statut !== "brouillon" || copie.numero !== "BP-" + an + "-0006" || copie.lignes.length !== original.lignes.length || copie.lignes.map((l) => l.designation).join() !== original.lignes.map((l) => l.designation).join()
        || totalDe(copie) !== totalDe(original) || copie.client !== original.client || copie.id === original.id || !ids("liste-devis").includes(copie.id))
        etape9.supprimer.push("Dupliquer un devis : " + (copie ? copie.numero + " " + copie.statut + " total " + totalDe(copie) + "/" + totalDe(original) + " liste " + ids("liste-devis").join(",") : "aucune copie"));

      /* ㊵ Supprimer : confirmation, « Garder » ne supprime rien, « Annuler » (5 s) remet tout. */
      const avant = e.stockage()[K.devis];
      await cliquer9("#liste-devis [data-supprimer-devis='e2']", 100);
      const titreModale = e.texte("modale-titre");
      const texteModale = e.texte("modale-contenu");
      await refuser9();
      if (titreModale !== "Supprimer ce devis ?" || !texteModale.includes("BP-" + an + "-0002") || e.stockage()[K.devis] !== avant || !ids("liste-devis").includes("e2")) etape9.supprimer.push("devis : pas de confirmation ou « Garder » a supprimé");
      await cliquer9("#liste-devis [data-supprimer-devis='e2']", 0);
      await confirmer9();
      if (stocke(K.devis).some((d) => d.id === "e2") || ids("liste-devis").includes("e2")) etape9.supprimer.push("devis confirmé non supprimé");
      if (e.$("annulation").hidden || !e.texte("annulation-texte").includes("BP-" + an + "-0002") || !e.$("annulation-barre").classList.contains("decompte")) etape9.supprimer.push("bandeau « Annuler » absent");
      e.$("bouton-annuler-suppression").click();
      await pause(400);
      if (e.stockage()[K.devis] !== avant || ids("liste-devis").join(",") !== copie.id + ",e5,e1,e2,e4,e3,l1" || !e.$("annulation").hidden) etape9.supprimer.push("« Annuler » ne remet pas le devis à sa place");
      await cliquer9("#liste-devis [data-supprimer-devis='e4']", 0);
      await confirmer9();
      await pause(5300);
      if (!e.$("annulation").hidden || stocke(K.devis).some((d) => d.id === "e4")) etape9.supprimer.push("après 5 s : bandeau encore là ou devis revenu");

      /* Mes chantiers : brouillon d'abord, rouvrir, dupliquer, supprimer + annuler, effacer le brouillon + annuler. */
      await cliquer9(".lien-tous[data-ecran='chantiers'], [data-ecran='chantiers']", 600);
      if (e.actif() !== "ecran-chantiers") etape9.supprimer.push("Mes chantiers → " + e.actif());
      if (ids("liste-chantiers").join(",") !== "brouillon-brouillon-studio-03,chantier-villa-01,chantier-boutique-02") etape9.supprimer.push("ordre des chantiers : " + ids("liste-chantiers").join(","));
      e.remplir("chantiers-recherche", "laico");
      if (ids("liste-chantiers").join(",") !== "chantier-boutique-02") etape9.recherche.push("chantiers « laico » : " + ids("liste-chantiers").join(","));
      e.remplir("chantiers-recherche", "zzz");
      if (ids("liste-chantiers").length || e.$("chantiers-vide").hidden) etape9.recherche.push("chantiers : aucun résultat mal signalé");
      e.remplir("chantiers-recherche", "");
      await cliquer9("#liste-chantiers [data-dupliquer-chantier='chantier-villa-01']", 600);
      const chantiersApres = stocke("bp_v1_chantiers");
      if (chantiersApres.length !== 3 || !chantiersApres.some((c) => c.nom === "Villa Ouaga 2000 (copie)" && c.id !== "chantier-villa-01")) etape9.supprimer.push("Dupliquer un chantier");
      const avantChantiers = e.stockage().bp_v1_chantiers;
      await cliquer9("#liste-chantiers [data-supprimer-chantier='chantier-boutique-02']", 0);
      const titreChantier = e.texte("modale-titre");
      await confirmer9();
      if (titreChantier !== "Supprimer ce chantier ?" || stocke("bp_v1_chantiers").some((c) => c.id === "chantier-boutique-02") || e.$("annulation").hidden) etape9.supprimer.push("chantier : confirmation ou suppression");
      e.$("bouton-annuler-suppression").click();
      await pause(500);
      if (e.stockage().bp_v1_chantiers !== avantChantiers || !ids("liste-chantiers").includes("chantier-boutique-02")) etape9.supprimer.push("chantier : « Annuler » ne le remet pas");
      await cliquer9("#liste-chantiers [data-effacer-brouillon-chantier]", 0);
      await confirmer9();
      if (e.stockage().bp_v1_brouillon_chantier || ids("liste-chantiers").some((id) => id.startsWith("brouillon-"))) etape9.supprimer.push("brouillon non effacé : " + String(e.stockage().bp_v1_brouillon_chantier).slice(0, 80) + " " + ids("liste-chantiers").join(","));
      e.$("bouton-annuler-suppression").click();
      await pause(500);
      if (!e.stockage().bp_v1_brouillon_chantier || !ids("liste-chantiers")[0].startsWith("brouillon-")) etape9.supprimer.push("brouillon : « Annuler » ne le remet pas");
      await cliquer9("#liste-chantiers [data-ouvrir-chantier='chantier-villa-01']", 700);
      if (e.actif() !== "ecran-resultat" || !e.texte("titre-resultat").includes("Villa Ouaga 2000")) etape9.supprimer.push("rouvrir un chantier → " + e.actif() + " « " + e.texte("titre-resultat") + " »");

      /* CL : carnet de clients. */
      await cliquer9(".raccourci[data-ecran='accueil'], [data-ecran='accueil']", 300);
      await cliquer9(".raccourci[data-ecran='clients']", 600);
      if (e.actif() !== "ecran-clients") etape9.clients.push("Mes clients → " + e.actif());
      const noms = [...e.doc.querySelectorAll("#liste-clients > li strong")].map((s) => s.textContent);
      const nomsAttendus = ["Hôtel Laïco", "M. Ilboudo", "M. Kaboré", "Mme Sawadogo Aminata", "Nouveau Client Manuel", "Société Dupont & Fils"];
      if (JSON.stringify(noms) !== JSON.stringify(nomsAttendus)) etape9.clients.push("carnet : " + noms.join(" | "));
      if (e.texte("clients-compte") !== "6 clients") etape9.clients.push("compteur « " + e.texte("clients-compte") + " »");
      const ligneClient = (nom) => [...e.doc.querySelectorAll("#liste-clients > li")].find((li) => li.querySelector("strong").textContent === nom);
      const kabore = ligneClient("M. Kaboré");
      const appeler = kabore && kabore.querySelector("a[href^='tel:']");
      const wa = kabore && kabore.querySelector("a.action-whatsapp");
      if (!appeler || appeler.getAttribute("href") !== "tel:+22605608608" || !wa || !/^https:\/\/wa\.me\/22605608608\?text=/.test(wa.getAttribute("href")) || wa.getAttribute("rel") !== "noopener noreferrer" || wa.target !== "_blank")
        etape9.clients.push("M. Kaboré : liens Appeler / WhatsApp (numéro saisi à la main prioritaire)");
      /* À ce stade : e4 supprimé (1 devis pour M. Kaboré), e1 dupliqué (3 devis pour Dupont). */
      if (kabore && (!nb9(kabore.textContent).includes("1 devis · " + fcfa(miens[4].total)) || kabore.querySelector("[data-supprimer-client]"))) etape9.clients.push("M. Kaboré : nb de devis, total ou suppression permise : " + nb9(kabore.textContent));
      const dupontLigne = ligneClient("Société Dupont & Fils");
      if (!dupontLigne || !nb9(dupontLigne.textContent).includes("3 devis · " + fcfa(2 * miens[0].total + miens[2].total)) || dupontLigne.querySelector("a[href^='tel:']").getAttribute("href") !== "tel:+22670123456") etape9.clients.push("Société Dupont & Fils : " + (dupontLigne ? nb9(dupontLigne.textContent) : "absente"));
      const ilboudo = ligneClient("M. Ilboudo");
      if (!ilboudo || ilboudo.querySelector("a[href^='tel:']") || !ilboudo.querySelector("button.action-liste[disabled]") || !ilboudo.textContent.includes("Pas de numéro")) etape9.clients.push("client sans numéro : boutons non désactivés");
      e.remplir("clients-recherche", "70 12");
      if (ids("liste-clients").length !== 1 || e.doc.querySelector("#liste-clients strong").textContent !== "Société Dupont & Fils") etape9.recherche.push("clients « 70 12 » : " + ids("liste-clients").join(","));
      e.remplir("clients-recherche", "KABORE");
      if (ids("liste-clients").length !== 1) etape9.recherche.push("clients « KABORE » : " + ids("liste-clients").length);
      e.remplir("clients-recherche", "");
      /* « Ses devis » ouvre Mes devis filtré sur le client. */
      await cliquer9("#liste-clients [data-devis-client='m. kabore']", 500);
      if (e.actif() !== "ecran-devis" || e.$("devis-recherche").value !== "M. Kaboré" || ids("liste-devis").join(",") !== "e5") etape9.clients.push("« Ses devis » → " + e.actif() + " « " + e.$("devis-recherche").value + " » " + ids("liste-devis").join(","));
      e.remplir("devis-recherche", "");
      await cliquer9(".raccourci[data-ecran='accueil'], [data-ecran='accueil']", 300);
      await cliquer9(".raccourci[data-ecran='clients']", 500);
      /* Ajout à la main : nom piégé affiché en texte, numéro normalisé, pas de doublon. */
      e.remplir("client-nom", "<img src=x onerror=alert(9)>Zongo");
      e.remplir("client-telephone", "12");
      await e.soumettre("form-client", 300);
      const nbZongo = () => (stocke("bp_v1_clients") || []).filter((c) => c && typeof c.nom === "string" && c.nom.toLowerCase() === "<img src=x onerror=alert(9)>zongo").length;
      if (!e.$("client-telephone").getAttribute("aria-invalid") && !e.texte("err-client-telephone")) etape9.clients.push("numéro invalide accepté");
      e.remplir("client-telephone", "70 99 88 77");
      await e.soumettre("form-client", 400);
      const zongo = (stocke("bp_v1_clients") || []).find((c) => c && c.nom === "<img src=x onerror=alert(9)>Zongo");
      if (!zongo || zongo.telephone !== "+22670998877" || nbZongo() !== 1 || e.doc.querySelector("#liste-clients img") || !e.texte("msg-client").includes("ajouté")) etape9.clients.push("ajout manuel : " + JSON.stringify(zongo) + " « " + e.texte("msg-client") + " »");
      e.remplir("client-nom", "<IMG SRC=X ONERROR=ALERT(9)>ZONGO");
      e.remplir("client-telephone", "");
      await e.soumettre("form-client", 400);
      if (nbZongo() !== 1 || !e.texte("msg-client").includes("mis à jour")) etape9.clients.push("même nom (casse différente) dupliqué");
      /* Modifier le téléphone d'un client venu des devis. */
      await cliquer9("#liste-clients [data-modifier-client='mme sawadogo aminata']", 200);
      if (!e.$("client-nom").readOnly || e.$("client-nom").value !== "Mme Sawadogo Aminata" || e.$("bouton-client-annuler").hidden) etape9.clients.push("Modifier : formulaire non prérempli");
      e.remplir("client-telephone", "+226 65 43 21 09");
      await e.soumettre("form-client", 400);
      const sawadogo = ligneClient("Mme Sawadogo Aminata");
      if (!sawadogo || sawadogo.querySelector("a[href^='tel:']").getAttribute("href") !== "tel:+22665432109" || e.$("client-nom").readOnly) etape9.clients.push("Modifier : numéro non retenu");
      /* Supprimer un client ajouté à la main, puis annuler. */
      const avantClients = e.stockage().bp_v1_clients;
      await cliquer9("#liste-clients [data-supprimer-client='cm1']", 0);
      const titreClient = e.texte("modale-titre");
      await confirmer9();
      if (titreClient !== "Supprimer ce client ?" || ligneClient("Nouveau Client Manuel") || e.$("annulation").hidden) etape9.supprimer.push("client : confirmation ou suppression");
      e.$("bouton-annuler-suppression").click();
      await pause(500);
      if (e.stockage().bp_v1_clients !== avantClients || !ligneClient("Nouveau Client Manuel")) etape9.supprimer.push("client : « Annuler » ne le remet pas");
      if (!(stocke("bp_v1_clients") || []).some((c) => c && c.id === "cm3" && c.compteId === "autre-compte")) etape9.clients.push("les clients d'un autre compte ont été effacés");

      /* ㊷ Mes prix : le badge « Le moins cher » suit les prix saisis ; le devis prend le bon. */
      await cliquer9(".raccourci[data-ecran='accueil'], [data-ecran='accueil']", 300);
      await cliquer9("[data-ecran='prix']", 700);
      if (e.actif() !== "ecran-prix") etape9.fournisseurs.push("Mes prix → " + e.actif());
      else {
        const details = e.doc.querySelector("#prix-groupes [data-ref='prise']");
        const badge = () => [...details.querySelectorAll("[data-badge-fournisseur]")].filter((b) => !b.hidden).map((b) => b.dataset.badgeFournisseur).join(",");
        const prixF = (i, v) => { const champ = e.$("art-prise-f" + i + "-prix"); champ.value = v; champ.dispatchEvent(new e.w.Event("input", { bubbles: true })); champ.dispatchEvent(new e.w.Event("change", { bubbles: true })); };
        if (badge() !== "") etape9.fournisseurs.push("badge affiché avec un seul fournisseur");
        details.querySelector("[data-ajouter-fournisseur]").click();
        await pause(50);
        details.querySelector("[data-ajouter-fournisseur]").click();
        await pause(50);
        prixF(1, "1 200");
        prixF(2, "1800");
        const cas = [];
        cas.push(badge() === "1");
        prixF(2, "900");
        cas.push(badge() === "2");
        prixF(0, "900");
        cas.push(badge() === "0");
        prixF(0, "");
        prixF(1, "abc");
        cas.push(badge() === "2");
        if (cas.some((ok) => !ok)) etape9.fournisseurs.push("badge : " + cas.map((ok) => (ok ? "✔" : "✘")).join(""));
        await pause(1200);
        const catalogue = stocke("bp_v1_catalogue");
        const prise = catalogue && catalogue[compte.id] && catalogue[compte.id].articles.find((a) => a.ref === "prise");
        if (!prise || prise.fournisseurs.map((f) => f.prix).join(",") !== "0,0,900" || prise.choisi !== null) etape9.fournisseurs.push("catalogue enregistré : " + JSON.stringify(prise && prise.fournisseurs));
        if (!nb9(details.querySelector("summary").textContent).includes("900")) etape9.fournisseurs.push("le résumé de l'article n'affiche pas le prix retenu (900) : " + nb9(details.querySelector("summary").textContent));
      }
      e.w.close();
      etape9.fait = true;
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
    const manifeste = readFileSync(join(RACINE, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
    const permissions = [...manifeste.matchAll(/<uses-permission\s[^>]*>/g)].map((t) => t[0]);
    const permises = new Set(["android.permission.INTERNET"]);
    for (const p of permissions) {
      const nom = (p.match(/android:name="([^"]+)"/) || [])[1];
      const stockage = /EXTERNAL_STORAGE$/.test(nom || "");
      if (!permises.has(nom) && !(stockage && /android:maxSdkVersion="29"/.test(p))) problemes.push("permission Android non justifiée : " + nom);
    }
    if (!/WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29"/.test(manifeste)) problemes.push("WRITE_EXTERNAL_STORAGE (maxSdkVersion 29) absente pour Documents/BatiPlus/");
    android = "android/ présent, applicationId correct, " + permissions.length + " permissions (INTERNET, stockage limité à Android ≤ 10)";
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
    persistance.join(" ; ") || "brouillon écrit 600 ms après la saisie (« Brouillon enregistré à HH:MM »), page fermée puis rouverte → étape 2, 3 pièces et champs repris ; enregistrement final → statut étudié, brouillon effacé, ouverture de l'étude avec confirmation");

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

/* ---------- Étape 6 : écran Résultat ---------- */
function controlesResultat() {
  const absent = etape6.fait ? [] : ["parcours de l'écran Résultat non exécuté (jsdom)"];
  const svg = [...absent, ...etape6.svg];
  controle("㉚", "le schéma SVG du tableau s'affiche correctement", svg.length === 0,
    svg.join(" ; ") || "rangées, modules (différentiels, disjoncteurs, libres) et numéros identiques à la disposition du moteur ; accolades ID → circuits ; viewBox, rôle img et titre ; aucun code dans le SVG (mesures à l'écran : SV dans verifier-navigateur)");
  const contenu = [...absent, ...etape6.contenu];
  controle("㉛", "chaque onglet a un vrai contenu", contenu.length === 0,
    contenu.join(" ; ") || "6 onglets ARIA (clic, flèches, Fin) : circuits et différentiels, schéma et détail des rangées, matériel ligne par ligne, main-d'œuvre, conformité expliquée, total ; mention obligatoire ; accès depuis l'accueil ; « Modifier le chantier » réenregistre le même chantier ; « Créer le devis » présent (fiche devis de l'étape 7)");
  const total = [...absent, ...etape6.total];
  controle("㉜", "le total se recalcule à chaque modification", total.length === 0,
    total.join(" ; ") || "25 saisies (prix, quantités, main-d'œuvre, forfait, remise % et montant, TVA, acompte, valeurs piégées) : chaque total affiché = moteur seul ; « Prix à compléter » à 0 ; enregistré 600 ms après, retrouvé après réouverture ; chantier falsifié borné");
}

/* ---------- Étape 7 : devis et Mes prix ---------- */
function controlesDevis() {
  const absent = etape7.fait ? [] : ["parcours devis et Mes prix non exécuté (jsdom)"];
  const catalogue = [...absent, ...etape7.catalogue];
  controle("㉝", "un prix du catalogue arrive dans le devis sans ressaisie", catalogue.length === 0,
    catalogue.join(" ; ") || "Mes prix (2 fournisseurs, le moins cher retenu, désignation personnelle, main-d'œuvre habituelle) → résultat et devis identiques au moteur ; prix manquant : ligne à 0, encadré « Prix à compléter », « Enregistrer dans Mes prix » ; prix changé : ↻ avec confirmation (Annuler ne change rien) ; ligne libre enregistrée comme article ; écran Mes prix : groupes, recherche sans accents (article et fournisseur), modification directe, comparaison, choix manuel, ajout validé, suppression, main-d'œuvre par défaut, Réinitialiser ; catalogue piégé nettoyé");
  const deux = [...absent, ...etape7.deux];
  controle("㉞", "deux devis ont chacun leur main-d'œuvre, sans interférence", deux.length === 0,
    deux.join(" ; ") || "devis BP-AAAA-0001 et 0002 du même chantier : main-d'œuvre et prix modifiés dans le second sans effet sur le premier (prix figés), ni par les prix habituels ni par « Réinitialiser » ; numéro jamais réutilisé (0003) ; devis ancien listé non ouvrable ; assistant étape 5 : Prix habituels, + 10 %, total en jaune, case décochée par défaut appliquée à l'enregistrement");
  const recalcul = [...absent, ...etape7.recalcul];
  controle("㉟", "le devis se recalcule à chaque modification", recalcul.length === 0,
    recalcul.join(" ; ") || "saisies successives (quantités piégées, ligne supprimée puis restaurée, désignation, main-d'œuvre, − 10 % / + 10 %, Prix habituels, forfait, journées, ligne libre, remise % et montant, TVA, acompte) : chaque total affiché = moteur seul ; statuts Accepté/Payé en badge ; enregistré 600 ms après, retrouvé après réouverture ; devis falsifié nettoyé, total recalculé");
}

/* ---------- Étape 8 : feuille A4, PDF et WhatsApp ---------- */
function controlesFeuille() {
  const m = chargerMoteur();
  const absent = etape8.fait ? [] : ["parcours feuille A4 non exécuté (jsdom)"];
  const pages = [...absent, ...etape8.a4];
  const filigrane = [...absent, ...etape8.filigrane];
  const whatsapp = [...absent, ...etape8.whatsapp];
  const emetteur = { nom: "Marie-Christine Ouédraogo", entreprise: "Électricité Générale du Faso", telephone: "+226 05 60 86 08", ville: "Bobo-Dioulasso", pays: "Burkina Faso" };
  const catalogue = Object.fromEntries(Object.entries(m.CATALOGUE_DEFAUT).map(([r, a]) => [r, { ...a }]));
  const devisType = (t) => ({ ...m.devisDepuisChiffrage(m.chiffrerChantier(t.chantier, catalogue, "XOF", null)), numero: "BP-2026-0042", titre: t.titre,
    client: "Société Dupont & Fils (Ouaga)", lieu: "Ouaga 2000", creeLe: "2026-10-15T10:00:00Z", conditions: "Validité 30 jours.\nAcompte de 40 % à la commande.", note: "Matériel garanti un an." });
  const jpeg = { octets: Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xFF, 0xD9]), largeur: 4, hauteur: 3 };
  const resume = [];

  /* ㊲ Pages : Studio et Boutique sur 1 page, Villa sur 2 au plus ; 120 lignes → en-tête répété et « Page i / n ». */
  const attendus = { studio: 1, boutique: 1, villa: 2 };
  for (const t of CHANTIERS_TYPES) {
    const bilan = analyserPdf(m.creerPdfDevis(m.modeleFeuille(devisType(t), "XOF", "gratuit", emetteur, "+226 70 12 34 56"), null));
    resume.push(t.cle + " " + bilan.pages);
    if (bilan.erreurs.length) pages.push(t.cle + " : " + bilan.erreurs.join(", "));
    if (bilan.pages > attendus[t.cle]) pages.push(t.cle + " : " + bilan.pages + " pages (attendu ≤ " + attendus[t.cle] + ")");
    if (bilan.pages > 1 && !bilan.texte.includes(m.chainePdf("Page " + bilan.pages + " / " + bilan.pages))) pages.push(t.cle + " : numéro de page absent");
    if (bilan.pages === 1 && bilan.texte.includes("(Page 1 / 1)")) pages.push(t.cle + " : « Page 1 / 1 » inutile");
  }
  const studio = devisType(CHANTIERS_TYPES.find((t) => t.cle === "studio"));
  const long = { ...studio, lignes: Array.from({ length: 120 }, (_, i) => ({ id: "x" + i, ref: "libre-" + i, designation: "Article de test numéro " + (i + 1) + (i % 7 === 0 ? " avec une désignation volontairement très longue pour vérifier le retour à la ligne aux espaces" : ""), unite: "u", categorie: "libre", quantite: 999999, prix: 99999999, fournisseur: "", supprimee: false })) };
  const modLong = m.modeleFeuille(long, "XOF", "gratuit", emetteur, "");
  const bilanLong = analyserPdf(m.creerPdfDevis(modLong, null));
  const entetes = (bilanLong.texte.match(/\(D\\351signation\) Tj/g) || []).length;
  if (bilanLong.erreurs.length || bilanLong.pages < 3 || entetes < bilanLong.pages - 1) pages.push("120 lignes : " + bilanLong.pages + " pages, " + entetes + " en-têtes " + bilanLong.erreurs.join(", "));
  const manquantes = modLong.materiel.filter((l) => !bilanLong.texte.includes(m.chainePdf(l.montant))).length;
  if (manquantes || !bilanLong.texte.includes(m.chainePdf(modLong.totalGeneral)) || !bilanLong.texte.includes(m.chainePdf("Page " + bilanLong.pages + " / " + bilanLong.pages))) pages.push("montants géants coupés ou absents du PDF (" + manquantes + ")");
  const coupe = m.couperPdf("Disjoncteur différentiel 40 A 30 mA type A — Legrand", 60, false, 8);
  const espaces = (s) => String(s).replace(/[\u00a0\u202f]/g, " ");
  if (espaces(coupe.join(" ")) !== "Disjoncteur différentiel 40 A 30 mA type A — Legrand" || coupe.some((l, i) => i > 0 && /^(A|mA)\b/.test(l))) pages.push("désignation coupée au milieu d'un mot ou d'une valeur (" + coupe.join(" | ") + ")");
  const lettres = [[80, "quatre-vingts"], [81, "quatre-vingt-un"], [71, "soixante et onze"], [200, "deux cents"], [201, "deux cent un"], [1000, "mille"], [80000, "quatre-vingt mille"], [1000000, "un million"], [200000000, "deux cents millions"], [197700, "cent quatre-vingt-dix-sept mille sept cents"]];
  const fausses = lettres.filter(([v, t]) => m.nombreEnLettres(v) !== t).map(([v]) => v);
  if (fausses.length || m.montantEnLettres(1000000, "XOF") !== "un million de francs CFA" || m.montantEnLettres(1250.5, "EUR") !== "mille deux cent cinquante euros et cinquante centimes") pages.push("montant en lettres faux : " + fausses.join(", "));
  if (m.nomFichierDevis("BP-2026-0042", "Société Dupont & Fils (Ouaga)") !== "Devis_BP-2026-0042_Societe_Dupont_Fils_Ouaga.pdf" || !/^Devis_BP-2026-0042(_[A-Za-z0-9]+)*\.pdf$/.test(m.nomFichierDevis("BP-2026-0042", "../../<script>"))) pages.push("nom du fichier PDF non nettoyé");
  controle("㊲", "devis A4 : une page pour un petit chantier, PDF valide", pages.length === 0,
    pages.join(" ; ") || "PDF produit dans l'application (" + resume.join(", ") + " page(s)) : xref exacte, pages déclarées = présentes ; 120 lignes à 99 999 999 FCFA → " + bilanLong.pages + " pages, en-tête répété, « Page i / n », aucun montant coupé ; montant en lettres (80, 81, 71, 200, 80 000, 200 000 000…) ; nom Devis_BP-…_Client.pdf ; parcours réel : feuille = devis (lignes, sous-totaux, total, lettres, signatures), HTML du client affiché en texte, PDF téléchargé " + etape8.octetsPdf + " octets, 1 page");

  /* ㊳ Filigrane : seulement la formule gratuite ; logo seulement pour un abonné. */
  for (const formule of Object.keys(m.FORMULES)) {
    const payante = m.formulePayante(formule);
    const mod = m.modeleFeuille(studio, "XOF", formule, emetteur, "");
    const texte = analyserPdf(m.creerPdfDevis(mod, jpeg)).texte;
    const aPied = texte.includes("/GS1 gs") && texte.includes(m.chainePdf(m.PIED_DEVIS));
    if (payante === (mod.pied !== null) || payante === aPied) filigrane.push(formule + " : pied " + (aPied ? "présent" : "absent"));
    if (payante !== mod.emetteur.logo || payante !== texte.includes("/Im1 Do") || payante !== texte.includes("/DCTDecode")) filigrane.push(formule + " : logo " + (texte.includes("/Im1 Do") ? "présent" : "absent"));
    if (!payante && !texte.includes("/ca " + m.OPACITE_FILIGRANE)) filigrane.push(formule + " : opacité du filigrane ≠ " + m.OPACITE_FILIGRANE);
  }
  if (m.OPACITE_FILIGRANE !== 0.22 || m.formulePayante("__proto__") || m.formulePayante("vie ") || !m.PIED_DEVIS.includes("+226 05 60 86 08") || !m.PIED_DEVIS.includes("+226 68 52 42 90")) filigrane.push("formule inconnue payante ou pied incomplet");
  if (m.creerPdfDevis(m.modeleFeuille(studio, "XOF", "annuel", emetteur, ""), { ...jpeg, octets: Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0, 0]) }).length && analyserPdf(m.creerPdfDevis(m.modeleFeuille(studio, "XOF", "annuel", emetteur, ""), { ...jpeg, octets: Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0, 0]) })).texte.includes("/Im1 Do")) filigrane.push("logo non JPEG intégré");
  controle("㊳", "pied BâtiPlus en filigrane pour la formule gratuite seulement", filigrane.length === 0,
    filigrane.join(" ; ") || "5 formules : gratuit → pied « Devis réalisé avec BâtiPlus… » (2 numéros) en filigrane /ca 0,22 et initiales ; semaine, mensuel, annuel, vie → aucun pied, logo JPEG intégré ; formule inconnue = gratuite ; logo non JPEG refusé ; feuille HTML : .f-filigrane opacité 0,22");

  /* ㊴ WhatsApp : lien wa.me encodé, chiffres seuls, aucun numéro → choix du contact. */
  const piege = "Bonjour & bienvenue ? #1 100 % é ⚡\nligne 2 javascript:alert(1)";
  const lien = m.lienWhatsApp("+226 70-12.34 56", piege);
  const [base, texte] = lien.split("?text=");
  if (base !== "https://wa.me/22670123456" || decodeURIComponent(texte) !== piege || !/^[A-Za-z0-9%._~!*'()-]+$/.test(texte)) whatsapp.push("lien mal encodé : " + lien.slice(0, 60));
  for (const mauvais of ["javascript:alert(1)", "12", "+226 70 12 34 56 78 90 12 34", "", null, "+0 000"]) {
    if (!m.lienWhatsApp(mauvais, "x").startsWith("https://wa.me/?text=")) whatsapp.push("numéro invalide accepté : « " + mauvais + " »");
  }
  const modS = m.modeleFeuille(studio, "XOF", "gratuit", emetteur, "+226 70 12 34 56");
  const msg = m.messageWhatsApp(modS);
  const r = m.resumeDevis(m.calculerDevis(studio, "XOF"));
  for (const attendu of ["Bonjour Société Dupont & Fils (Ouaga),", "Voici votre devis BP-2026-0042", "Résumé : " + r.circuits + " circuits, " + r.prises + " prises, " + r.points + " points lumineux.", "Total : " + espaces(modS.totalGeneral), "Électricité Générale du Faso", "+226 05 60 86 08", "Devis réalisé avec BâtiPlus"]) {
    if (!msg.includes(attendu)) whatsapp.push("message sans « " + attendu + " »");
  }
  controle("㊴", "partage WhatsApp : lien wa.me propre et message complet", whatsapp.length === 0,
    whatsapp.join(" ; ") || "wa.me/<chiffres>?text= encodé (& ? # % é ⚡ retour à la ligne) et relu à l'identique ; 6 numéros invalides → wa.me/?text= (choix du contact) ; message : client, numéro, titre, résumé " + r.circuits + " circuits/" + r.prises + " prises/" + r.points + " points, total, acompte, électricien, « Devis réalisé avec BâtiPlus » ; parcours réel : téléphone reformaté +226 70 12 34 56, erreur si incomplet, lien identique fiche/feuille, rel=noopener noreferrer");
}

/* ---------- Étape 9 : listes, carnet, statistiques ---------- */
function controlesListes() {
  const m = chargerMoteur();
  const absent = etape9.fait ? [] : ["parcours de l'étape 9 non exécuté (jsdom)"];
  const D = (id, numero, titre, client, statut, total, creeLe) => ({ id, numero, titre, client, statut, total, creeLe, lieu: "" });
  const devis = [
    D("a", "BP-2026-0001", "Villa R+1 Ouaga 2000", "Société Dupont & Fils", "accepte", 500000, "2026-10-02T10:00:00"),
    D("b", "BP-2026-0002", "Rénovation tableau", "Mme Sawadogo Aminata", "envoye", 120000, "2026-10-10T10:00:00"),
    D("c", "BP-2026-0003", "Éclairage boutique", "société dupont & fils", "paye", 80000, "2026-09-05T10:00:00"),
    D("d", "BP-2026-0004", "Studio Gounghin", "M. Kaboré", "refuse", 80000, "2026-09-20T10:00:00"),
    D("e", "BP-2026-0005", "Studio Gounghin bis", "M. Kaboré", "brouillon", 0, "2026-10-14T10:00:00")
  ];
  const ids = (liste) => liste.map((d) => d.id).join("");

  /* ㊶ recherche, filtre et tri (fonctions pures + parcours réel) */
  const recherche = [...absent, ...etape9.recherche];
  const cas = [
    [{}, "ebadc"], [{ tri: "montant-desc" }, "abdce"], [{ tri: "montant-asc" }, "edcba"], [{ tri: "anciens" }, "cdabe"],
    [{ requete: "ECLAIRAGE" }, "c"], [{ requete: "fils  DUPONT" }, "ac"], [{ requete: "bp-2026-0004" }, "d"], [{ requete: "payé" }, "c"],
    [{ requete: "kabore", statut: "refuse" }, "d"], [{ statut: "accepte" }, "a"], [{ statut: "__proto__", tri: "constructor" }, "ebadc"],
    [{ requete: "x".repeat(500) }, ""], [{ requete: "   " }, "ebadc"], [null, "ebadc"]
  ];
  cas.forEach(([options, attendu]) => {
    const obtenu = ids(m.filtrerDevis(devis, options));
    if (obtenu !== attendu) recherche.push("filtrerDevis(" + JSON.stringify(options) + ") = " + obtenu + " (attendu " + attendu + ")");
  });
  if (JSON.stringify(m.comptesParStatut([...devis, { statut: "<b>" }, null])) !== JSON.stringify({ tous: 5, brouillon: 1, envoye: 1, accepte: 1, refuse: 1, paye: 1 })) recherche.push("comptesParStatut");
  if (!m.correspondRecherche(["Hôtel Laïco"], "laico HOTEL") || m.correspondRecherche(["Hôtel"], "laico")) recherche.push("correspondRecherche (accents, ordre des mots)");
  controle("㊶", "la recherche filtre correctement", recherche.length === 0,
    recherche.join(" ; ") || "sans accents ni majuscules, tous les mots, numéro/titre/client/lieu/statut ; filtre par statut (puces avec compteurs) ; tri date ↑↓ et montant ↑↓, égalité → plus récent ; options piégées ignorées ; parcours réel : Mes devis, Mes chantiers, Mes clients (nom et numéro), « Ses devis », requête HTML affichée en texte");

  /* ㊵ supprimer : confirmation + annulation 5 s */
  const supprimer = [...absent, ...etape9.supprimer];
  controle("㊵", "supprimer demande confirmation et permet d'annuler", supprimer.length === 0,
    supprimer.join(" ; ") || "devis, chantier, brouillon et client : modale (« Garder » ne touche à rien), bandeau 5 s avec décompte, « Annuler » remet l'élément à sa place exacte dans le stockage, passé 5 s la suppression est définitive ; « Réinitialiser » Mes prix : double confirmation ; Dupliquer (devis → nouveau numéro, brouillon ; chantier → « (copie) ») ; rouvrir une étude");

  /* ㊷ comparaison des fournisseurs */
  const fournisseurs = [...absent, ...etape9.fournisseurs];
  controle("㊷", "la comparaison de fournisseurs indique le bon", fournisseurs.length === 0,
    fournisseurs.join(" ; ") || "badge « Le moins cher » recalculé à chaque saisie : 1 500/1 200/1 800 → n°2 ; 900 → n°3 ; égalité 900/900 → le premier ; prix vides ou invalides ignorés ; aucun badge avec un seul fournisseur ; prix retenu enregistré et affiché");

  /* CL carnet de clients */
  const clients = [...absent, ...etape9.clients];
  const carnet = m.carnetClients(
    [{ id: "c1", nom: "M. Kaboré", telephone: "+22605608608" }, { id: "c2", nom: "Nouveau client", telephone: "" }, { id: "c3", nom: "Faux", telephone: "05 60" }, null, "x"],
    [...devis, { ...devis[1], id: "f", client: "mme  SAWADOGO aminata", clientTelephone: "+22670123456", creeLe: "2026-10-08T10:00:00", total: 30000 }],
    [{ client: { nom: "Hôtel Laïco", telephone: "+22625000000" }, modifieLe: "2026-10-01T00:00:00" }, { client: { nom: "M. Kaboré", telephone: "+22699999999" }, modifieLe: "2026-10-03T00:00:00" }, { client: null }]);
  const vu = carnet.map((c) => [c.nom, c.telephone, c.nombreDevis, c.total, c.nombreChantiers].join("|")).join(" / ");
  const attenduCarnet = "Faux||0|0|0 / Hôtel Laïco|+22625000000|0|0|1 / M. Kaboré|+22605608608|2|80000|1 / Mme Sawadogo Aminata|+22670123456|2|150000|0 / Nouveau client||0|0|0 / Société Dupont & Fils||2|580000|0";
  if (vu !== attenduCarnet) clients.push("carnetClients : " + vu);
  if (m.filtrerClients(carnet, "70 12").length !== 1 || m.filtrerClients(carnet, "kabore").length !== 1) clients.push("filtrerClients");
  controle("CL", "carnet de clients : depuis les devis + ajout manuel, appeler, WhatsApp", clients.length === 0,
    clients.join(" ; ") || "un client par nom (sans accents ni casse), nb de devis et total, téléphone : saisi > devis récent > chantier ; Appeler tel:+…, WhatsApp wa.me (rel noopener) ; sans numéro → boutons désactivés ; ajout manuel (nom piégé affiché en texte, numéro normalisé E.164, invalide refusé, même nom = mise à jour) ; Modifier le téléphone ; suppression réservée aux clients sans document ; données d'un autre compte conservées");

  /* ST statistiques */
  const stats = [...absent, ...etape9.stats];
  const s = m.statistiquesDetaillees(devis, new Date("2026-10-15T12:00:00"), 2);
  if (s.total !== 5 || s.montant !== 780000 || s.acceptes !== 2 || s.montantAccepte !== 580000 || s.taux !== 40 || s.clients !== 3) stats.push("totaux : " + JSON.stringify([s.total, s.montant, s.acceptes, s.montantAccepte, s.taux, s.clients]));
  if (s.parClient.length !== 3 || s.parClient[2].nom !== "1 autre client" || !s.parClient[2].autres || s.parClient.reduce((t, c) => t + c.montant, 0) !== s.montant) stats.push("montant par client : " + JSON.stringify(s.parClient));
  if (s.mois.jours.length !== 31 || s.mois.nombre !== 3 || s.mois.montant !== 620000 || s.mois.jours[1].montant !== 500000 || s.mois.cumuls[30] !== 620000) stats.push("mois en cours : " + JSON.stringify([s.mois.nombre, s.mois.montant, s.mois.jours.length]));
  if (s.moisPrecedent.nombre !== 2 || s.moisPrecedent.montantMemeJour !== 80000 || s.variation !== 675) stats.push("comparaison au mois précédent : " + JSON.stringify(s.moisPrecedent) + " " + s.variation);
  const bornes = m.statistiquesDetaillees([D("g", "", "", "A", "accepte", 10, "2026-09-30T23:59:00"), D("h", "", "", "A", "envoye", 20, "2026-10-01T00:00:00")], new Date("2026-10-01T08:00:00"), 8);
  if (bornes.mois.nombre !== 1 || bornes.moisPrecedent.nombre !== 1 || bornes.mois.jours[0].montant !== 20) stats.push("limite de mois (23 h 59 / 0 h 00, heure locale)");
  const vide = m.statistiquesDetaillees([], new Date("2026-02-10T12:00:00"), 8);
  if (vide.taux !== null || vide.variation !== null || vide.mois.jours.length !== 28 || vide.montant !== 0) stats.push("aucun devis : " + JSON.stringify([vide.taux, vide.variation, vide.mois.jours.length]));
  controle("ST", "statistiques : chiffre devisé, taux, montant par client, évolution du mois", stats.length === 0,
    stats.join(" ; ") || "une seule fonction pour l'accueil, le profil et l'écran Statistiques (mêmes chiffres vérifiés à l'écran) ; payé compté comme accepté ; clients au-delà de 8 regroupés « N autres clients » ; histogramme du mois en SVG (jours à venir distincts) ; comparaison à date égale avec le mois précédent ; bornes de mois en heure locale ; aucun devis → « — »");
}

/* ---------- Rapport ---------- */
await controlesExecution();
controlesMoteur();
controlesResultat();
controlesDevis();
controlesFeuille();
controlesListes();
controleCapacitor();
controleGitignore();
controlesSecurite();
controlesIdentite();

const ordre = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑨b", "⑩", "⑪", "⑫", "⑮", "⑰", "⑳", "㉑", "㉔", "㉕", "IC", "PA", "㉖", "㉗", "㉘", "㉙", "㉚", "㉛", "㉜", "㉝", "㉞", "㉟", "㊲", "㊳", "㊴", "㊵", "㊶", "㊷", "CL", "ST", "D", "A", "N3", "P", "S①", "S②", "S③", "S④", "S⑤", "S⑥", "S⑦", "S⑪", "S+"];
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
