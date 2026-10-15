#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur
   Rapporte les contrôles bloquants des étapes 1-2 (①…⑫, ⑭, ⑮, ⑰ ; ⑬ et ⑯ dans verifier-navigateur.mjs) et les contrôles de
   sécurité du front (S①…S⑪) sur le fichier livré www/index.html.
   Code de sortie 1 si un seul contrôle échoue.
   Le contrôle ⑩ (console au chargement) exécute la page dans jsdom :
     npm i --no-save jsdom   (outil de vérification, jamais embarqué)
   Usage : npm run verifier
   ========================================================================== */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WWW = join(RACINE, "www");
const html = readFileSync(join(WWW, "index.html"), "utf8");
const resultats = [];

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

/* ⑩ ⑭ ⑮ ⑰ exécution réelle de la page dans jsdom (contexte https).
   Le script est enfermé dans une IIFE : rien n'est exposé, tout passe par l'interface. */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function controlesExecution() {
  let JSDOM, VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = await import("jsdom"));
  } catch {
    for (const n of ["⑩", "⑭", "⑮", "⑰"]) controle(n, "exécution dans jsdom", false, "jsdom absent : npm i --no-save jsdom");
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

  function ouvrirPage(stockage) {
    const consoleVirtuelle = new VirtualConsole();
    consoleVirtuelle.on("error", (m) => erreurs.push(String(m)));
    consoleVirtuelle.on("warn", (m) => erreurs.push("warn: " + String(m)));
    consoleVirtuelle.on("log", (m) => erreurs.push("log inattendu (DEBUG ?) : " + String(m)));
    consoleVirtuelle.on("jsdomError", (e) => {
      const msg = String(e.message || e);
      /* jsdom n'implémente ni le dessin <canvas> ni le défilement : limites de l'outil, pas de l'application. */
      if (/Not implemented: (HTMLCanvasElement(\.prototype\.|'s )getContext|(window\.|Window's )scrollTo)/.test(msg)) ignorees.push(msg.split("\n")[0]);
      else erreurs.push(msg.split("\n")[0]);
    });
    const dom = new JSDOM(html, {
      url: "https://batiplus.local/",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole: consoleVirtuelle,
      beforeParse(window) {
        window.matchMedia = (requete) => ({
          matches: false, media: requete, onchange: null,
          addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; }
        });
        /* Ce que jsdom ne fournit pas et qu'un vrai WebView fournit. */
        if (!window.crypto || !window.crypto.subtle) Object.defineProperty(window, "crypto", { value: webcrypto, configurable: true });
        if (!window.TextEncoder) window.TextEncoder = TextEncoder;
        if (window.isSecureContext !== true) Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
        if (!window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};
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
    const p = ouvrirPage();
    await pause(300);
    const splash = p.actif() === "ecran-demarrage" && p.doc.body.dataset.mode === "entree"
      && p.doc.querySelector("#ecran-demarrage [data-logo] img") !== null;
    await pause(1500);
    const apresSplash = p.actif();
    controle("⑭", "écran de démarrage puis présentation à la 1re ouverture", splash && apresSplash === "ecran-presentation",
      "démarrage plein écran (mode entrée, logo image) → " + apresSplash.replace("ecran-", "") + " après 1,5 s");

    const theme = p.texte("etat-theme");
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
    const versAuth = p.actif() === "ecran-connexion" && p.stockage()["bp.presentation-vue"] === "1"
      && p.$("panneau-connexion").hidden && !p.$("panneau-inscription").hidden;
    const fonctionne = theme !== "Détection…" && plateforme === "Navigateur web" && themeApres === "sombre" && diapo2 && derniere && versAuth;

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
    const nomPiege = "<img src=x onerror=alert(1)>Awa";
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
    if (p.texte("compte-nom") !== nomPiege) problemes.push("nom mal affiché");
    if (p.doc.querySelector("img[src='x']")) problemes.push("XSS : balise injectée");
    if (p.texte("compte-telephone") !== "+226 70 11 22 33") problemes.push("téléphone mal formaté : " + p.texte("compte-telephone"));
    if (p.texte("compte-devise").replace(/\s/g, " ") !== "Franc CFA (UEMOA) · 25 000 FCFA") problemes.push("montant mal formaté : " + p.texte("compte-devise"));
    if (JSON.stringify(p.stockage()).includes("258071")) problemes.push("code en clair dans le stockage");
    const comptes = JSON.parse(p.stockage()["bp.comptes"] || "[]");
    const compte = comptes[0];
    if (!compte || compte.iterations < 150000 || !compte.sel || !compte.empreinte || compte.code) problemes.push("empreinte PBKDF2 absente");
    const stockageInscrit = p.stockage();

    p.$("bouton-deconnexion").click();
    await pause(100);
    if (p.actif() !== "ecran-connexion" || p.stockage()["bp.session"]) problemes.push("déconnexion incomplète");

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
    const verrou = JSON.parse(p.stockage()["bp.verrou"] || "{}");

    /* Inconnu : même message générique, rien ne révèle si le numéro existe. */
    const q = ouvrirPage({ "bp.presentation-vue": "1", "bp.comptes": stockageInscrit["bp.comptes"] });
    await pause(1800);
    if (q.actif() !== "ecran-connexion" || q.$("panneau-connexion").hidden) problemes.push("sans session : connexion attendue");
    q.remplir("cnx-telephone", "+226 70 99 88 77");
    q.taper("cnx-code", ["2", "5", "8", "0", "7", "1"]);
    await q.soumettre("panneau-connexion", 700);
    if (!q.texte("msg-connexion").startsWith("Téléphone ou code incorrect.")) problemes.push("message différent pour un numéro inconnu");
    q.remplir("cnx-telephone", "+22670112233");
    q.taper("cnx-code", ["2", "5", "8", "0", "7", "1"]);
    await q.soumettre("panneau-connexion", 900);
    if (q.actif() !== "ecran-accueil") problemes.push("bon code refusé (" + q.texte("msg-connexion") + ")");
    if (q.stockage()["bp.verrou"]) problemes.push("compteur non remis à zéro après succès");

    /* Session reprise au redémarrage ; compte affaibli (itérations) rejeté. */
    const r = ouvrirPage(q.stockage());
    await pause(1800);
    if (r.actif() !== "ecran-accueil" || r.texte("compte-nom") !== nomPiege) problemes.push("session non reprise au redémarrage");
    const affaibli = JSON.stringify([{ ...compte, iterations: 1 }]);
    const t = ouvrirPage({ ...q.stockage(), "bp.comptes": affaibli });
    await pause(1800);
    if (t.actif() !== "ecran-accueil" && t.actif() !== "ecran-connexion") problemes.push("état inattendu");
    if (t.actif() === "ecran-accueil") problemes.push("compte affaibli accepté");
    const u = ouvrirPage({ "bp.presentation-vue": "1", "bp.verrou": JSON.stringify({ echecs: 9, jusqua: Date.now() + 9e12 }) });
    await pause(1800);
    const texteU = u.texte("texte-blocage");
    const minutes = Number((texteU.match(/(\d+):\d\d/) || [])[1]);
    if (!(minutes <= 15)) problemes.push("verrou falsifié non plafonné : " + texteU);

    controle("⑰", "compte : inscription, connexion, blocage, aucune injection", problemes.length === 0,
      problemes.join(" ; ") || "1er champ invalide ciblé, 1234 refusé, codes différents refusés, code absent du DOM et du stockage (PBKDF2 "
        + compte.iterations.toLocaleString("fr-FR") + "), nom piégé affiché en texte, déconnexion, 5 échecs → verrou " + verrou.echecs
        + " et « " + blocage + " », message identique pour un inconnu, bon code accepté, session reprise, compte affaibli rejeté, verrou plafonné à 15 min");

    controle("⑩", "aucune erreur dans la console au chargement", erreurs.length === 0 && fonctionne,
      erreurs.length ? erreurs.join(" | ")
        : (fonctionne ? "0 erreur sur 6 ouvertures ; thème, 4 diapositives, Commencer → inscription" : "script exécuté mais état incomplet")
          + (ignorees.length ? " (limites jsdom ignorées : canvas, scrollTo)" : ""));
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

/* ---------- Rapport ---------- */
await controlesExecution();
controleCapacitor();
controleGitignore();
controlesSecurite();

const ordre = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑭", "⑮", "⑰"];
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
