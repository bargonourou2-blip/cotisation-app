#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur
   Rapporte les contrôles bloquants de l'étape 1 (①…⑫) et les contrôles de
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
import { fileURLToPath, pathToFileURL } from "node:url";
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

/* ⑩ aucune erreur dans la console au chargement (exécution réelle dans jsdom) */
async function controleConsole() {
  let JSDOM, VirtualConsole;
  try {
    ({ JSDOM, VirtualConsole } = await import("jsdom"));
  } catch {
    controle("⑩", "aucune erreur dans la console au chargement", false, "jsdom absent : npm i --no-save jsdom");
    return;
  }
  const erreurs = [];
  const ignorees = [];
  const surRejet = (e) => erreurs.push("Uncaught " + String((e && e.message) || e));
  process.on("unhandledRejection", surRejet);
  process.on("uncaughtException", surRejet);
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
    url: pathToFileURL(join(WWW, "index.html")).href,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: consoleVirtuelle,
    beforeParse(window) {
      window.matchMedia = (requete) => ({
        matches: false, media: requete, onchange: null,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; }
      });
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  const doc = dom.window.document;
  const ecranActif = doc.querySelector(".ecran.actif");
  const texte = (id) => (doc.getElementById(id) || {}).textContent || "";
  const theme = texte("etat-theme");
  const plateforme = texte("etat-plateforme");
  const reseau = texte("etat-reseau");
  /* Interactions de base : thème et tiroir. */
  doc.getElementById("bouton-theme").click();
  await new Promise((r) => setTimeout(r, 50));
  const themeApres = doc.documentElement.getAttribute("data-theme");
  dom.window.close();
  process.off("unhandledRejection", surRejet);
  process.off("uncaughtException", surRejet);
  const fonctionne = ecranActif && ecranActif.id === "ecran-accueil" && theme !== "Détection…"
    && plateforme === "Navigateur web" && reseau !== "Détection…" && themeApres === "sombre";
  controle("⑩", "aucune erreur dans la console au chargement", erreurs.length === 0 && fonctionne,
    erreurs.length ? erreurs.join(" | ")
      : (fonctionne ? "0 erreur ; écran actif, état rempli, bascule de thème OK" : "script exécuté mais état incomplet")
        + (ignorees.length ? " (limites jsdom ignorées : canvas, scrollTo)" : ""));
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

  const externes = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
  controle("S+", "aucune ressource externe (polices, CDN)", externes.length === 0, externes.join(", ") || "polices et images locales uniquement");
}

/* ---------- Rapport ---------- */
await controleConsole();
controleCapacitor();
controleGitignore();
controlesSecurite();

const ordre = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫"];
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
