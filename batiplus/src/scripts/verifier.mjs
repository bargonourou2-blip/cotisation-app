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
import { codeGele, lireRegles } from "./regles.mjs";
import { permissionsFusionnees, verifierAndroid } from "./verifier-android.mjs";

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
/* Constats de l'étape 10 (sécurité du front) relevés dans jsdom. */
const etape10 = { fait: false, verrou: [], saisie: [], dom: [], codes: [], champsVus: 0, pagesVues: 0, cas: [] };
/* Constats de l'étape 11 (abonnement) relevés dans jsdom. */
const etape12 = { fait: false, suivi: [], echecs: [], retour: [], renouvellement: [], cas: [] };
/* Constats de l'étape 13 (photo du tableau électrique) relevés dans jsdom. */
const etape13 = { fait: false, photo: [], natif: [] };
/* JPEG d'essai 40 × 30 (3 composantes), produit une fois avec Pillow. */
const JPEG_ESSAI = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0/Xtet/D9rDcXFvc3HnzrBHHbIGdnIJAwSPSsv/hNv+pX8R/+AH/2VHjb/mX/APsN23/s1bc+r6ZazNDcajawyr95JJlVh35BNb/u4QTkr38zaMLpWjdmJ/wm3/Ur+I//AAA/+yo/4Tb/AKlfxH/4Af8A2Va/9vaN/wBBax/8CU/xp0et6TLIsceqWbu5Cqq3CEsT0AGan2tH+X8S/ZTX2H+JFoOvW/iC1muLe3ubfyJ2gkjuUCurgAkYBPrRWX4J/wCZg/7Ddz/7LRRWiozaRhNJSshvjqWOCLQpZZFjjj1q3Z3c4CgbsknsKtT3/g26maa4u9Dmlb7zySQsx7ck1r3djZ6hEIr20guYw24JNGHAPrg9+T+dVP8AhGdA/wCgHp3/AICR/wCFPmpygozT0NIVOVaNp+Rn/aPA/wDz20D/AL6hp0d34KikWSO40FHQhlZXhBUjoQavf8IzoH/QD07/AMBI/wDCj/hGdA/6Aenf+Akf+FLlw/Z/gX7eT+0/vMnwLLHPFrssUiyRya1cMjochgduCD3FFdDaWNnp8RisrSC2jLbikMYQE+uB34H5UUqs1ObkjCTu7n//2Q==";
const etape11 = { fait: false, formules: [], logos: [], jeton: [], quota: [], relances: [], cadenas: [], recu: [], paiement: [], cas: [] };
const REGLES = lireRegles();

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

  /* Étape 11 : paire de clés d'ESSAI créée pour la vérification. La page livrée n'a aucune clé
     (échec fermé : tout compte en Gratuit) ; htmlPro porte la clé publique d'essai. */
  const paireAbo = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const autrePaire = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spkiAbo = Buffer.from(await webcrypto.subtle.exportKey("spki", paireAbo.publicKey)).toString("base64");
  const metaVide = '<meta name="batiplus-cle-abonnement" content="">';
  const htmlPro = html.replace(metaVide, '<meta name="batiplus-cle-abonnement" content="' + spkiAbo + '">');
  const b64url = (octets) => Buffer.from(octets).toString("base64url");
  async function jetonAbo(charge, cle) {
    const corps = b64url(Buffer.from(JSON.stringify(charge), "utf8"));
    const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle || paireAbo.privateKey, new TextEncoder().encode("bp-abonnement-v1." + corps));
    return corps + "." + b64url(new Uint8Array(signature));
  }

  /* options.activiteFigee : garder la date d'activité de la session telle quelle (test du verrouillage) ;
     sinon une session reprise vient d'être utilisée. options.decalage : objet { ms } ajouté à Date.now(). */
  function ouvrirPage(stockage, capacitor, options) {
    const reglages = options || {};
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
    const dom = new JSDOM(reglages.html || html, {
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
        if (reglages.preparer) reglages.preparer(window);
        window.localStorage.clear();
        for (const [cle, valeur] of Object.entries(stockage || {})) {
          let ecrite = valeur;
          if (cle === "bp_v1_session" && !reglages.activiteFigee && valeur) { const sess = JSON.parse(valeur); sess.derniereActivite = Date.now(); ecrite = JSON.stringify(sess); }
          window.localStorage.setItem(cle, ecrite);
        }
        if (reglages.decalage) {
          const maintenantReel = window.Date.now.bind(window.Date);
          window.Date.now = () => maintenantReel() + reglages.decalage.ms;
        }
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
      /* Comme au doigt : le champ prend le focus (focusin), puis la valeur change (input). */
      remplir(id, valeur) {
        $(id).dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
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

  /* ㊸ ㊹ ㊻ sur la page telle qu'elle est rendue (données piégées comprises) : aucun attribut on*,
     une seule balise <script>, aucun cadre, liens et images sur des schémas sûrs ; chaque champ
     numérique porte une règle connue, chaque champ texte une longueur maximale bornée. */
  function inspecterPage(page, ou) {
    const d = page.doc;
    etape10.pagesVues += 1;
    for (const el of d.querySelectorAll("*")) {
      for (const attr of el.attributes) if (/^on/i.test(attr.name)) etape10.dom.push(ou + " : attribut " + attr.name + " sur <" + el.tagName.toLowerCase() + ">");
    }
    if (d.querySelectorAll("script").length !== 1) etape10.dom.push(ou + " : " + d.querySelectorAll("script").length + " balises <script>");
    if (d.querySelector("iframe, frame, object, embed, base, meta[http-equiv='refresh']")) etape10.dom.push(ou + " : cadre, objet ou redirection inséré");
    for (const a of d.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href");
      if (!/^(https:\/\/[^\s]+|tel:\+?\d+|blob:https:\/\/[^\s]+|#[\w-]*)$/.test(href)) etape10.dom.push(ou + " : lien « " + href.slice(0, 40) + " »");
      if (a.target === "_blank" && a.rel !== "noopener noreferrer") etape10.dom.push(ou + " : lien sortant sans rel=noopener noreferrer");
    }
    for (const img of d.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      if (!/^(images\/[\w./-]+\.webp|data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*|blob:https:\/\/\S+)$/.test(src)) etape10.dom.push(ou + " : image « " + src.slice(0, 40) + " »");
    }
    for (const champ of d.querySelectorAll("input")) {
      const mode = champ.getAttribute("inputmode");
      if ((mode === "decimal" || mode === "numeric") && champ.type !== "password") {
        etape10.champsVus += 1;
        if (!champ.dataset.regle || !Object.prototype.hasOwnProperty.call(REGLES.nombres, champ.dataset.regle)) etape10.saisie.push(ou + " : " + champ.id + " sans règle de saisie");
      } else if (["text", "tel", "search", "password"].includes(champ.type) && !(champ.maxLength > 0 && champ.maxLength <= REGLES.textes.court.max)) {
        etape10.saisie.push(ou + " : " + champ.id + " maxlength " + champ.maxLength);
      }
    }
    for (const zone of d.querySelectorAll("textarea")) {
      if (!(zone.maxLength > 0 && zone.maxLength <= REGLES.textes.long.max)) etape10.saisie.push(ou + " : " + zone.id + " maxlength " + zone.maxLength);
    }
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
    if (!/\d+ \/ 2000/.test(a.texte("compteur-conditions").replace(/\s/g, " "))) profil.push("compteur des conditions : " + a.texte("compteur-conditions"));
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
      profil.join(" ; ") || "nom vide refusé, pays/devise détectés (CI), nom et initiales propagés, conditions nettoyées (texte brut, 2000 max), ancien code faux refusé, nouveau code dérivé avec un nouveau sel, jamais en clair");

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
      /* Étape 10 (H.4 n° 9) : sauvegarde retouchée à la main pour s'offrir le Pro ou changer d'identité. */
      ["abonnement à la racine", JSON.stringify({ ...valide, abonnement: { formule: "vie", fin: "2099-12-31" } })],
      ["fin d'abonnement", JSON.stringify({ ...valide, fin: "2099-12-31" })],
      ["compteur de devis", JSON.stringify({ ...valide, devisUtilises: 0 })],
      ["formule dans le profil", JSON.stringify({ ...valide, profil: { ...valide.profil, formule: "annuel" } })],
      ["téléphone dans le profil", JSON.stringify({ ...valide, profil: { ...valide.profil, telephone: "+22670000000" } })],
      ["empreinte du code", JSON.stringify({ ...valide, profil: { ...valide.profil, empreinte: "AAAA", sel: "AAAA" } })],
      ["version 2 inventée", JSON.stringify({ ...valide, version: 2 })],
      ["conditions de 2 001 caractères", JSON.stringify({ ...valide, profil: { ...valide.profil, conditions: "x".repeat(2001) } })],
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
      sauvegarde.join(" ; ") || "export JSON (profil seul, ni code ni téléphone ni abonnement) ; import valide confirmé ; " + refusImport.length + " fichiers refusés (formule, abonnement à la racine et dans le profil, fin, devisUtilises, téléphone, empreinte, version inventée, __proto__, JSON invalide, format, pays, SVG, conditions > 2 000, > 2 Mo) ; formule toujours « Gratuit »");

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
    const champAdm = a.$("adm-code");
    if (champAdm.type !== "password" || champAdm.getAttribute("inputmode") !== "numeric" || champAdm.autocomplete !== "off") admin.push("saisie du code non masquée ou sans clavier numérique");
    if (!/\.champ-code-admin[^{]*\{[^}]*font-size:\s*16px/.test(css)) admin.push("code admin pas en 16 px");
    for (const court of ["123456", "abcdefgh12"]) {
      a.$("adm-code").value = court;
      await a.soumettre("form-admin", 150);
      if (!a.texte("err-adm-code")) admin.push("« " + court + " » accepté sans appel");
    }
    if (appels.length !== 0) admin.push("code trop court ou non numérique envoyé");
    a.$("adm-code").value = "2026101688";
    await a.soumettre("form-admin", 250);
    const corpsAdm = appels[0] && appels[0].options && typeof appels[0].options.body === "string" ? JSON.parse(appels[0].options.body) : {};
    const entetesAdm = (appels[0] && appels[0].options && appels[0].options.headers) || {};
    if (appels.length !== 1 || appels[0].url !== "https://api.batiplus.bf/api/admin/connexion" || appels[0].options.credentials !== "omit" || appels[0].options.method !== "POST"
      || corpsAdm.code !== "2026101688" || !/^[a-f0-9]{32}$/.test(corpsAdm.appareil || "") || entetesAdm["X-Appareil"] !== corpsAdm.appareil || entetesAdm.Authorization) admin.push("appel API inattendu : " + JSON.stringify(appels.map((x) => x.url)));
    if (a.texte("msg-admin") !== "Code incorrect." || a.$("adm-code").value !== "") admin.push("réponse 401 : " + a.texte("msg-admin"));
    for (const essai of ["2026101689", "2026101690"]) {
      a.$("adm-code").value = essai;
      await a.soumettre("form-admin", 250);
    }
    if (!/Trop d'essais : réessayez dans 60:00/.test(a.texte("msg-admin"))) admin.push("3e échec sans blocage d'une heure : " + a.texte("msg-admin"));
    a.$("adm-code").value = "2026101691";
    await a.soumettre("form-admin", 250);
    if (appels.length !== 3 || !/Trop d'essais/.test(a.texte("msg-admin"))) admin.push("essai envoyé pendant le blocage (" + appels.length + " appels)");
    if (!a.$("admin-tableau").hidden) admin.push("tableau de bord visible sans jeton");
    if (/admin.{0,20}[:=]\s*["']\d{4,}/i.test(js)) admin.push("code admin dans le script");
    controle("S⑦", "accès admin caché, code vérifié par l'API seulement", admin.length === 0,
      admin.join(" ; ") || "appui de 1 s ignoré, appui de 3 s → écran de code (masqué, clavier numérique, 16 px) ; 6 chiffres et lettres refusés sans appel ; code de 10 chiffres envoyé en POST à /api/admin/connexion avec l'identifiant de l'appareil (credentials omit), 401 → « Code incorrect. », champ vidé ; 3 échecs → blocage 60:00, aucun 4e appel ; tableau de bord caché sans jeton ; aucun code dans l'application");

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
      /* Étape 10 (㊻) : chaque saisie piégée est refusée à la frappe, avec un message, et n'atteint pas le modèle. */
      const pieges5 = [["mo-forfait", "-5000"], ["mo-jours", "Infinity"], ["mo-ouvriers", "abc"], ["mo-qte-prise", "1e400"], ["mo-prix-point", "-2500"], ["mo-jours", "2,25"], ["mo-ouvriers", "51"]];
      for (const [id, valeur] of pieges5) {
        c2.remplir(id, valeur);
        if (c2.$(id).getAttribute("aria-invalid") !== "true" || !c2.texte("err-" + id).startsWith("Saisie refusée")) etape5.nombres.push("« " + valeur + " » dans " + id + " : pas de refus affiché (« " + c2.texte("err-" + id) + " »)");
        /* En quittant le champ, la dernière valeur valide revient. */
        c2.$(id).dispatchEvent(new c2.w.Event("change", { bubbles: true }));
        if (c2.$(id).value === valeur || !/rétablie|vidé/.test(c2.texte("err-" + id))) etape5.nombres.push("« " + valeur + " » dans " + id + " : resté affiché en quittant le champ");
      }
      nombresEcran(c2, "étape 5 après saisies piégées");
      if (nb(c2.texte("total-mo")) !== fcfa(53500)) etape5.nombres.push("total après pièges refusés : « " + c2.texte("total-mo") + " » au lieu de 53 500 FCFA");
      c2.remplir("mo-prix-point", "2500");
      if (c2.$("mo-prix-point").hasAttribute("aria-invalid") || c2.texte("err-mo-prix-point")) etape5.nombres.push("refus resté affiché après une saisie valide");
      c2.remplir("mo-forfait", "20000");
      if (nb(c2.texte("total-mo")) !== fcfa(73500)) etape5.cas.push("forfait non ajouté : « " + c2.texte("total-mo") + " »");
      c2.$("bouton-ajouter-ligne").click();
      c2.remplir("libre-libelle-0", "Saignées");
      c2.remplir("libre-montant-0", "5000");
      if (nb(c2.texte("total-mo")) !== fcfa(78500)) etape5.cas.push("ligne libre non ajoutée : « " + c2.texte("total-mo") + " »");

      inspecterPage(c2, "assistant chantier");
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
        ch.materiel.prise.prix = 2000;
        comparer("prix négatif refusé");
        if (r1.$("mat-prise-prix").value !== "2000" || !r1.texte("err-mat-prise-prix").includes("La valeur précédente est rétablie")) etape6.total.push("prix négatif : valeur précédente non rétablie (« " + r1.$("mat-prise-prix").value + " », « " + r1.texte("err-mat-prise-prix") + " »)");
        ligneMat("prise", "prix", "0");
        comparer("prix à 0");
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
        for (const [valeur, retenu] of [["-5", 0], ["abc", 0], ["1e400", 0], ["Infinity", 0], ["999999999", 999999999], ["1000000001", 999999999]]) {
          saisir("res-remise", valeur);
          ch.totaux.remise = retenu;
          comparer("remise « " + valeur + " »");
        }
        if (montantUI(r1, "tot-general") !== fcfa(0)) etape6.total.push("remise supérieure au sous-total : total « " + montantUI(r1, "tot-general") + " » au lieu de 0");
        saisir("res-remise", "15000");
        ch.totaux.remise = 15000;
        comparer("remise 15 000");
        for (const [valeur, retenu] of [["abc", 20], ["-3", 20], ["99", 20], ["30,5", 20], ["25", 25], ["20", 20]]) {
          saisir("res-taux-tva", valeur);
          ch.totaux.tauxTva = retenu;
          comparer("taux de TVA « " + valeur + " »");
        }
        for (const [valeur, retenu] of [["120", 50], ["abc", 50], ["12,345", 50], ["50", 50]]) {
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
        inspecterPage(r1, "résultat");
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
        if (r3.actif() !== "ecran-resultat" || r3.doc.querySelector("img[src='x']") || r3.$("res-taux-tva").value !== "30" || r3.$("res-acompte").value !== "40" || r3.$("res-tva").checked || r3.$("mat-prise-qte").value !== "100000") etape6.total.push("chantier falsifié mal nettoyé");
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
          for (const [valeur, retenu] of [["-5", 120], ["abc", 120], ["1e400", 120], ["12,5", 120], ["100001", 120], ["100000", 100000], ["37", 37]]) {
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
          for (const [valeur, retenu] of [["20", 20], ["abc", 20], ["99", 20], ["30", 30]]) {
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
          inspecterPage(p7, "fiche devis");
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
          inspecterPage(g, "feuille A4");
          const stockage8 = g.stockage();
          g.w.close();
          etape8.fait = true;

          /* ---------- Étape 13 : photo du tableau électrique jointe au devis ---------- */
          const clePhoto = "bp_v1_photo_tableau_" + d1s.id;
          const photoEssai = "data:image/jpeg;base64," + JPEG_ESSAI;
          const compteId8 = (JSON.parse(stockage8.bp_v1_session || "{}") || {}).compteId;
          const fichePhoto = (o) => JSON.stringify({ compteId: compteId8, donnees: photoEssai, ajouteLe: "2026-10-16T09:00:00Z", ...o });
          const ouvrirDevis1 = async (page) => {
            const lien = page.doc.querySelector("#accueil-devis [data-devis='" + d1s.id + "']");
            if (lien) lien.click();
            await pause(500);
            return page.actif() === "ecran-fiche-devis";
          };
          const ph = ouvrirPage({ ...stockage8, [clePhoto]: fichePhoto(), bp_v1_photo_tableau_dOrphelin: fichePhoto() });
          await pause(1800);
          let blobPhoto = null;
          ph.w.URL.createObjectURL = (blob) => { blobPhoto = blob; return "blob:https://batiplus.local/essai"; };
          ph.w.URL.revokeObjectURL = () => {};
          if (ph.stockage().bp_v1_photo_tableau_dOrphelin) etape13.photo.push("photo d'un devis qui n'existe plus non effacée au démarrage");
          if (!ph.stockage()[clePhoto]) etape13.photo.push("photo d'un devis existant effacée au démarrage");
          if (!await ouvrirDevis1(ph)) etape13.photo.push("devis 0001 non ouvert (" + ph.actif() + ")");
          const apercuPh = ph.$("apercu-photo-tableau");
          if (apercuPh.hidden || apercuPh.getAttribute("src") !== photoEssai || ph.$("bouton-retirer-photo-tableau").hidden || ph.texte("libelle-photo-tableau") !== "Changer la photo" || !ph.$("photo-tableau-vide").hidden) etape13.photo.push("photo enregistrée non affichée dans la fiche devis");
          /* Navigateur : sélecteur de fichier. Un SVG déguisé en PNG est refusé, la photo reste. */
          let clicsFichier = 0;
          ph.$("fichier-photo-tableau").addEventListener("click", (e) => { clicsFichier += 1; e.preventDefault(); });
          ph.$("bouton-photo-tableau").click();
          await pause(50);
          if (clicsFichier !== 1) etape13.photo.push("navigateur : « Changer la photo » n'ouvre pas le sélecteur de fichier");
          const entreeTableau = ph.$("fichier-photo-tableau");
          if (entreeTableau.getAttribute("capture") !== "environment" || entreeTableau.getAttribute("accept") !== "image/jpeg,image/png,image/webp") etape13.photo.push("sélecteur : accept/capture incorrects");
          const svgDeguise = new ph.w.File(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], "tableau.png", { type: "image/png" });
          Object.defineProperty(entreeTableau, "files", { value: [svgDeguise], configurable: true });
          entreeTableau.dispatchEvent(new ph.w.Event("change", { bubbles: true }));
          await pause(300);
          if (!ph.texte("msg-photo-tableau").startsWith("Format refusé") || (JSON.parse(ph.stockage()[clePhoto] || "{}").donnees !== photoEssai)) etape13.photo.push("SVG déguisé en PNG accepté ou photo remplacée (« " + ph.texte("msg-photo-tableau") + " »)");
          const lourd = new ph.w.File([new Uint8Array(5 * 1024 * 1024 + 1)], "tableau.jpg", { type: "image/jpeg" });
          Object.defineProperty(entreeTableau, "files", { value: [lourd], configurable: true });
          entreeTableau.dispatchEvent(new ph.w.Event("change", { bubbles: true }));
          await pause(300);
          if (!ph.texte("msg-photo-tableau").startsWith("Image trop lourde")) etape13.photo.push("image de plus de 5 Mo acceptée");
          /* Feuille A4 et PDF : annexe sur une page à part. */
          ph.$("devis-bouton-imprimer").click();
          await pause(600);
          const annexe = ph.$("feuille-a4").querySelector(".f-annexe img.f-photo-tableau");
          if (!annexe || annexe.getAttribute("src") !== photoEssai || !nb(ph.$("feuille-a4").textContent).includes("Annexe — Photo du tableau électrique")) etape13.photo.push("annexe photo absente de la feuille A4");
          const styleAnnexe = [...ph.doc.styleSheets].flatMap((f) => [...f.cssRules]).find((r) => r.selectorText === ".f-annexe");
          if (!styleAnnexe || styleAnnexe.style.breakBefore !== "page") etape13.photo.push("annexe : saut de page avant absent");
          ph.$("feuille-bouton-pdf").click();
          await pause(500);
          if (!blobPhoto) etape13.photo.push("PDF avec photo non produit");
          else {
            const octets = await new Promise((resoudre) => {
              const lecteur = new ph.w.FileReader();
              lecteur.onload = () => resoudre(new Uint8Array(lecteur.result));
              lecteur.readAsArrayBuffer(blobPhoto);
            });
            const bilan = analyserPdf(octets);
            if (bilan.erreurs.length || bilan.pages !== 2) etape13.photo.push("PDF avec photo : " + bilan.pages + " page(s) " + bilan.erreurs.join(", "));
            if (!bilan.texte.includes("/Im2 Do") || !/\/Width 40 \/Height 30 \/ColorSpace \/DeviceRGB/.test(bilan.texte) || !bilan.texte.includes("(Annexe")) etape13.photo.push("PDF : photo (40 × 30, DCTDecode) ou titre de l'annexe absents");
            etape13.octetsPdf = octets.length;
          }
          inspecterPage(ph, "feuille A4 avec photo");
          const stockage13 = ph.stockage();
          ph.w.close();
          /* Retirer la photo (confirmation), puis photo d'un autre compte jamais affichée. */
          const pr = ouvrirPage(stockage13);
          await pause(1800);
          await ouvrirDevis1(pr);
          pr.$("bouton-retirer-photo-tableau").click();
          await pause(150);
          if (pr.$("modale").hidden || pr.texte("modale-titre") !== "Retirer la photo ?") etape13.photo.push("retrait sans confirmation");
          pr.$("bouton-modale-ok").click();
          await pause(400);
          if (pr.stockage()[clePhoto] || !pr.$("apercu-photo-tableau").hidden || pr.texte("libelle-photo-tableau") !== "Prendre la photo" || pr.texte("msg-photo-tableau") !== "Photo retirée du devis.") etape13.photo.push("photo non retirée après confirmation");
          pr.w.close();
          const pa = ouvrirPage({ ...stockage13, [clePhoto]: fichePhoto({ compteId: "autre-compte" }) });
          await pause(1800);
          await ouvrirDevis1(pa);
          if (!pa.$("apercu-photo-tableau").hidden) etape13.photo.push("photo d'un autre compte affichée");
          pa.$("devis-bouton-imprimer").click();
          await pause(600);
          if (pa.$("feuille-a4").querySelector(".f-annexe")) etape13.photo.push("photo d'un autre compte jointe à la feuille");
          pa.w.close();

          /* Téléphone : appareil photo du système (Camera simulé), jamais de galerie, jamais de sélecteur. */
          const optionsCamera = [];
          let reponseCamera = () => ({ dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" });
          const capCamera = {
            isNativePlatform: () => true,
            getPlatform: () => "android",
            Plugins: {
              App: { addListener: () => Promise.resolve({ remove() {} }), exitApp() {} },
              Camera: { getPhoto: async (o) => { optionsCamera.push(o); return reponseCamera(); } }
            }
          };
          const sansPhoto = Object.fromEntries(Object.entries(stockage13).filter(([cle]) => cle !== clePhoto));
          const pn = ouvrirPage(sansPhoto, capCamera);
          await pause(1800);
          await ouvrirDevis1(pn);
          let clicsNatif = 0;
          pn.$("fichier-photo-tableau").addEventListener("click", (e) => { clicsNatif += 1; e.preventDefault(); });
          pn.$("bouton-photo-tableau").click();
          await pause(300);
          const o1 = optionsCamera[0] || {};
          if (o1.source !== "CAMERA" || o1.resultType !== "dataUrl" || o1.saveToGallery !== false || o1.correctOrientation !== true || o1.allowEditing !== false || o1.width !== 1600) etape13.natif.push("options de l'appareil photo incorrectes (" + JSON.stringify(o1) + ")");
          if (clicsNatif) etape13.natif.push("téléphone : le sélecteur de fichier s'ouvre au lieu de l'appareil photo");
          if (pn.texte("msg-photo-tableau") !== "Photo illisible. Réessayez.") etape13.natif.push("data:image/svg+xml accepté (« " + pn.texte("msg-photo-tableau") + " »)");
          reponseCamera = () => ({ dataUrl: "data:image/png;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64") });
          pn.$("bouton-photo-tableau").click();
          await pause(300);
          if (!pn.texte("msg-photo-tableau").startsWith("Format refusé")) etape13.natif.push("SVG annoncé en PNG par l'appareil photo accepté");
          reponseCamera = () => { throw new Error("User cancelled photos app"); };
          pn.$("bouton-photo-tableau").click();
          await pause(300);
          if (pn.texte("msg-photo-tableau") !== "") etape13.natif.push("annulation de l'électricien affichée comme une erreur");
          reponseCamera = () => { throw new Error("Unable to open camera"); };
          pn.$("bouton-photo-tableau").click();
          await pause(300);
          if (pn.texte("msg-photo-tableau") !== "L'appareil photo n'a pas pu s'ouvrir. Réessayez.") etape13.natif.push("échec de l'appareil photo sans message");
          if (pn.stockage()[clePhoto]) etape13.natif.push("photo refusée malgré tout enregistrée");
          pn.w.close();
          etape13.fait = true;
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
      /* Compte Lifetime (jeton signé) : statistiques détaillées visibles, aucune invitation pendant les manipulations. */
      const jetonVie9 = await jetonAbo({ v: 1, compteId: compte.id, telephone: compte.telephone, formule: "vie", debut: iso(30), fin: null, emisLe: iso(30) });
      const e = ouvrirPage({ ...q.stockage(), [K.devis]: JSON.stringify(fixtures), bp_v1_chantiers: JSON.stringify(chantiers9),
        bp_v1_brouillon_chantier: JSON.stringify(brouillon9), bp_v1_clients: JSON.stringify(clients9), bp_v1_abonnement: JSON.stringify({ [compte.id]: jetonVie9 }) }, null, { html: htmlPro });
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
        if (!prise || prise.fournisseurs.map((f) => f.prix).join(",") !== "0,1200,900" || prise.choisi !== null) etape9.fournisseurs.push("catalogue enregistré : " + JSON.stringify(prise && prise.fournisseurs));
        if (!nb9(details.querySelector("summary").textContent).includes("900")) etape9.fournisseurs.push("le résumé de l'article n'affiche pas le prix retenu (900) : " + nb9(details.querySelector("summary").textContent));
      }
      inspecterPage(e, "listes et Mes prix");
      e.w.close();
      etape9.fait = true;
    }

    /* ---------- Étape 10 : sécurité du front (verrouillage, codes, saisies) ---------- */
    {
      const sessionA = JSON.parse(sessionActive);
      const base10 = { [K.pres]: "1", [K.comptes]: stockageInscrit[K.comptes], [K.session]: sessionActive };
      const sessionDatee = (ms) => JSON.stringify({ ...sessionA, derniereActivite: ms });
      const effacer = Array(6).fill("Backspace");
      const deverrouiller = async (page, code, parClavier) => {
        if (parClavier) for (const c of code) page.$("clavier-verrou").querySelector("[data-touche='" + c + "']").click();
        else page.taper("ver-code", [...effacer, ...code]);
        await page.soumettre("form-verrou", 900);
      };

      /* A. Relance de l'application : la session n'est reprise que si la dernière activité est récente et vraisemblable. */
      const relances = [
        ["activité il y a 16 min", sessionDatee(Date.now() - 16 * 60000), "ecran-verrou"],
        ["activité il y a 5 min", sessionDatee(Date.now() - 5 * 60000), "ecran-accueil"],
        ["session sans date d'activité (ancienne version)", JSON.stringify({ compteId: sessionA.compteId, ouverte: sessionA.ouverte }), "ecran-verrou"],
        ["date d'activité dans le futur (horloge reculée)", sessionDatee(Date.now() + 24 * 3600000), "ecran-verrou"],
        ["date d'activité non numérique", sessionDatee("demain"), "ecran-verrou"]
      ];
      for (const [nom, valeur, attendu] of relances) {
        const f = ouvrirPage({ ...base10, [K.session]: valeur }, null, { activiteFigee: true });
        await pause(1800);
        if (f.actif() !== attendu) etape10.verrou.push("relance, " + nom + " : " + f.actif() + " au lieu de " + attendu);
        f.w.close();
      }

      /* B. En cours d'utilisation : 15 min sans geste → verrou ; le bon code rend l'écran et la saisie en cours. */
      const decalage = { ms: 0 };
      const v = ouvrirPage(base10, null, { decalage });
      await pause(1800);
      v.$("bouton-nouveau-chantier").click();
      await pause(250);
      v.remplir("chantier-nom", "Villa du verrou");
      decalage.ms = 14 * 60000;
      v.doc.body.dispatchEvent(new v.w.Event("pointerdown", { bubbles: true }));
      v.doc.dispatchEvent(new v.w.Event("visibilitychange"));
      await pause(100);
      if (v.actif() !== "ecran-nouveau-chantier") etape10.verrou.push("verrouillé avant 15 min d'inactivité (" + v.actif() + ")");
      decalage.ms = 14 * 60000 + 15 * 60000 + 1000;
      v.doc.dispatchEvent(new v.w.Event("visibilitychange"));
      await pause(250);
      if (v.actif() !== "ecran-verrou") etape10.verrou.push("retour dans l'application après 15 min sans activité : pas de verrou (" + v.actif() + ")");
      if (v.texte("verrou-telephone") !== "+226 70 11 22 33" || (v.$("ecran-verrou").querySelector("[data-nom]") || {}).textContent !== nomPiege) etape10.verrou.push("compte non rappelé sur l'écran verrouillé");
      if (v.doc.querySelector("img[src='x']")) etape10.verrou.push("XSS : nom piégé interprété sur l'écran verrouillé");
      if (!JSON.stringify(JSON.parse(v.stockage()["bp_v1_brouillon_chantier"] || "{}")[compte.id] || {}).includes("Villa du verrou")) etape10.verrou.push("saisie en cours non enregistrée au verrouillage");
      for (const cible of ["accueil", "devis", "profil", "nouveau-chantier"]) {
        const lien = v.doc.querySelector("[data-ecran='" + cible + "']");
        if (lien) lien.click();
        await pause(60);
        if (v.actif() !== "ecran-verrou") { etape10.verrou.push("verrou contourné par un lien vers « " + cible + " »"); break; }
      }
      inspecterPage(v, "écran verrouillé");
      await deverrouiller(v, "999990", true);
      if (!v.texte("msg-verrou").startsWith("Code incorrect. Encore 4 essais")) etape10.verrou.push("mauvais code : « " + v.texte("msg-verrou") + " »");
      if ((JSON.parse(v.stockage()[K.verrou] || "{}").echecs || 0) !== 1) etape10.verrou.push("échec non compté au verrou");
      if (v.doc.querySelectorAll("#ver-code .code-case.pleine, #ver-code .code-case.chiffre").length || !/^0 chiffre/.test(v.$("ver-code").textContent)) etape10.verrou.push("code non effacé après un échec");
      await deverrouiller(v, "258071", false);
      if (v.actif() !== "ecran-nouveau-chantier" || v.$("chantier-nom").value !== "Villa du verrou") etape10.verrou.push("déverrouillage : " + v.actif() + ", saisie « " + v.$("chantier-nom").value + " »");
      if (v.stockage()[K.verrou]) etape10.verrou.push("compteur d'échecs non remis à zéro après le bon code");
      const sessionV = JSON.parse(v.stockage()[K.session] || "{}");
      if (!(sessionV.derniereActivite >= Date.now() + decalage.ms - 10000)) etape10.verrou.push("activité non datée dans la session");
      if (JSON.stringify(v.stockage()).includes("258071") || v.doc.documentElement.outerHTML.includes("258071")) etape10.verrou.push("code en clair après déverrouillage");

      /* ㊻ Saisie refusée sur un prix en FCFA (champ de « Mes prix ») : message sans écho, valeur jamais retenue. */
      v.doc.querySelector("[data-ecran='prix']").click();
      await pause(250);
      const prixAvant = v.$("prix-mo-journee").value;
      const refusPrix = [["12,5", /pas de centimes en FCFA/], ["1000000001", /1[\s\u202f\u00a0]000[\s\u202f\u00a0]000[\s\u202f\u00a0]000/], ["-1", /négatifs/], ["1e9", /chiffres et virgule/], ["<b>9</b>", /chiffres et virgule/]];
      for (const [valeur, attendu] of refusPrix) {
        v.remplir("prix-mo-journee", valeur);
        const message = v.texte("err-prix-mo-journee");
        if (!message.startsWith("Saisie refusée") || !attendu.test(message) || v.$("prix-mo-journee").getAttribute("aria-invalid") !== "true") etape10.saisie.push("prix « " + valeur + " » : « " + message + " »");
        if (message.includes(valeur)) etape10.saisie.push("saisie refusée recopiée dans le message : " + valeur);
        v.$("prix-mo-journee").dispatchEvent(new v.w.Event("change", { bubbles: true }));
        if (v.$("prix-mo-journee").value !== prixAvant) etape10.saisie.push("prix « " + valeur + " » : valeur précédente non rétablie (" + v.$("prix-mo-journee").value + ")");
      }
      v.remplir("prix-mo-journee", "15 000");
      if (v.texte("err-prix-mo-journee") || v.$("prix-mo-journee").hasAttribute("aria-invalid")) etape10.saisie.push("prix valide « 15 000 » refusé");
      etape10.cas.push(refusPrix.length + " prix refusés");

      /* Un geste après 15 min d'inactivité verrouille au lieu de prolonger ; « Changer de compte » ferme la session. */
      decalage.ms += 15 * 60000 + 1000;
      v.doc.body.dispatchEvent(new v.w.Event("pointerdown", { bubbles: true }));
      await pause(250);
      if (v.actif() !== "ecran-verrou") etape10.verrou.push("un geste après 15 min a prolongé la session (" + v.actif() + ")");
      v.$("bouton-verrou-changer-compte").click();
      await pause(400);
      if (v.actif() !== "ecran-connexion" || v.stockage()[K.session]) etape10.verrou.push("« Changer de compte » depuis le verrou : " + v.actif());
      v.w.close();

      /* C. 5 mauvais codes sur l'écran verrouillé → même blocage progressif qu'à la connexion. */
      const b = ouvrirPage({ ...base10, [K.session]: sessionDatee(Date.now() - 20 * 60000) }, null, { activiteFigee: true });
      await pause(1800);
      for (let i = 0; i < 5; i += 1) await deverrouiller(b, "999990", false);
      if (b.$("msg-blocage-verrou").hidden || !b.$("bouton-deverrouiller").disabled || !/\d+:\d\d/.test(b.texte("texte-blocage-verrou"))) etape10.verrou.push("5 échecs au verrou : pas de blocage (" + b.texte("msg-verrou") + ")");
      await deverrouiller(b, "258071", false);
      if (b.actif() !== "ecran-verrou") etape10.verrou.push("bon code accepté pendant le blocage");
      b.w.close();

      /* Bouton retour Android sur l'écran verrouillé : quitte l'application, n'ouvre rien d'autre. */
      let sorties = 0;
      const ecouteurs10 = {};
      const prefs10 = new Map(Object.entries({ ...base10, [K.session]: sessionDatee(Date.now() - 20 * 60000) }));
      const natif10 = {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          App: { addListener: (nom, fn) => { ecouteurs10[nom] = fn; return Promise.resolve({ remove() {} }); }, exitApp: () => { sorties += 1; } },
          Preferences: {
            get: async ({ key }) => ({ value: prefs10.has(key) ? prefs10.get(key) : null }),
            set: async ({ key, value }) => { prefs10.set(key, value); },
            remove: async ({ key }) => { prefs10.delete(key); }
          }
        }
      };
      const r10 = ouvrirPage({}, natif10);
      await pause(1800);
      if (r10.actif() !== "ecran-verrou") etape10.verrou.push("application native, session ancienne : " + r10.actif());
      if (ecouteurs10.backButton) { await ecouteurs10.backButton(); await pause(100); }
      if (sorties !== 1 || r10.actif() !== "ecran-verrou" || !r10.$("modale").hidden) etape10.verrou.push("retour Android sur le verrou : " + sorties + " sortie(s), " + r10.actif());
      r10.w.close();

      /* D. Codes trop simples refusés à la création. */
      const triviaux = ["0000", "1111", "4545", "1212", "121212", "123123", "1234", "123456", "654321", "9876", "7890", "0123", "1990", "2026"];
      const t = ouvrirPage({ [K.pres]: "1" });
      await pause(1800);
      t.remplir("ins-nom", "Test Code");
      t.remplir("ins-ville", "Ouagadougou");
      t.remplir("ins-telephone", "+226 70 99 88 77");
      t.$("ins-conditions").checked = true;
      for (const code of triviaux) {
        t.taper("ins-code", [...effacer, ...code]);
        t.taper("ins-confirmation", [...effacer, ...code]);
        await t.soumettre("panneau-inscription", 150);
        if (!t.texte("err-ins-code").includes("trop simple") || t.actif() !== "ecran-connexion") etape10.codes.push(code + " accepté");
      }
      t.taper("ins-code", [...effacer, ..."2580"]);
      t.taper("ins-confirmation", [...effacer, ..."2580"]);
      await t.soumettre("panneau-inscription", 1200);
      if (t.actif() !== "ecran-accueil") etape10.codes.push("code correct 2580 refusé : " + t.texte("err-ins-code"));
      etape10.cas.push(triviaux.length + " codes triviaux");
      t.w.close();
      etape10.fait = true;
    }

    /* ---------- Étape 11 : abonnement (jeton signé, quota, relances, cadenas, reçu, paiement) ---------- */
    {
      const moteur11 = chargerMoteur();
      const jour = 86400000;
      const t0 = Date.now();
      const isoDe = (ms) => new Date(ms).toISOString();
      const nb11 = (x) => String(x || "").replace(/[\u00a0\u202f]/g, " ");
      const base11 = { [K.pres]: "1", [K.comptes]: stockageInscrit[K.comptes], [K.session]: sessionActive };
      const charge = (extra) => ({ v: 1, compteId: compte.id, telephone: compte.telephone, formule: "mensuel", debut: isoDe(t0 - 6 * jour), fin: isoDe(t0 + 24 * jour), emisLe: isoDe(t0 - 6 * jour), ...extra });
      const aboDe = (jeton) => ({ bp_v1_abonnement: JSON.stringify({ [compte.id]: jeton }) });
      const menu = async (page, ecran, ms) => { const lien = page.doc.querySelector("#tiroir-menu [data-ecran='" + ecran + "']"); if (lien) lien.click(); await pause(ms || 500); return Boolean(lien); };
      const modaleOuverte = (page) => !page.$("modale").hidden;

      /* A. Seul un jeton signé par BâtiPlus, pour CE compte, non expiré, donne le Pro. */
      const jetonValide = await jetonAbo(charge());
      const [corpsValide, signatureValide] = jetonValide.split(".");
      const cas11 = [
        ["jeton signé valide", aboDe(jetonValide), htmlPro, "Pro mensuel"],
        ["formule écrite en clair dans le stockage", { bp_v1_abonnement: JSON.stringify({ formule: "vie", fin: null }) }, htmlPro, "Gratuit"],
        ["formule en clair sous l'identifiant du compte", aboDe("vie"), htmlPro, "Gratuit"],
        ["jeton signé par une autre clé", aboDe(await jetonAbo(charge(), autrePaire.privateKey)), htmlPro, "Gratuit"],
        ["charge modifiée (mensuel → vie), signature d'origine", aboDe(b64url(Buffer.from(JSON.stringify(charge({ formule: "vie", fin: null })), "utf8")) + "." + signatureValide), htmlPro, "Gratuit"],
        ["jeton d'un autre compte", aboDe(await jetonAbo(charge({ compteId: "autre-compte-1234" }))), htmlPro, "Gratuit"],
        ["jeton d'un autre numéro", aboDe(await jetonAbo(charge({ telephone: "+22670000000" }))), htmlPro, "Gratuit"],
        ["jeton expiré", aboDe(await jetonAbo(charge({ fin: isoDe(t0 - 3600000) }))), htmlPro, "Gratuit"],
        ["jeton émis dans le futur (horloge reculée)", aboDe(await jetonAbo(charge({ emisLe: isoDe(t0 + jour), debut: isoDe(t0 + jour), fin: isoDe(t0 + 30 * jour) }))), htmlPro, "Gratuit"],
        ["horloge déjà vue après la date de fin", { ...aboDe(await jetonAbo(charge({ fin: isoDe(t0 + 2 * jour) }))), bp_v1_horloge: String(t0 + 3 * jour) }, htmlPro, "Gratuit"],
        ["champ inconnu ajouté", aboDe(await jetonAbo({ ...charge(), admin: true })), htmlPro, "Gratuit"],
        ["Lifetime avec date de fin", aboDe(await jetonAbo(charge({ formule: "vie" }))), htmlPro, "Gratuit"],
        ["Pro mensuel sans date de fin", aboDe(await jetonAbo(charge({ fin: null }))), htmlPro, "Gratuit"],
        ["formule « gratuit » signée", aboDe(await jetonAbo(charge({ formule: "gratuit" }))), htmlPro, "Gratuit"],
        ["signature tronquée", aboDe(corpsValide + "." + signatureValide.slice(0, 40)), htmlPro, "Gratuit"],
        ["jeton valide mais application livrée sans clé (échec fermé)", aboDe(jetonValide), html, "Gratuit"],
        ["Lifetime signé valide", aboDe(await jetonAbo(charge({ formule: "vie", fin: null }))), htmlPro, "Lifetime"]
      ];
      for (const [nom, extra, source, attendu] of cas11) {
        const pg = ouvrirPage({ ...base11, ...extra }, null, { html: source });
        await pause(900);
        const vu = (pg.doc.querySelector("#bandeau-abonnement [data-formule]") || {}).textContent;
        if (vu !== attendu) etape11.jeton.push(nom + " → « " + vu + " » au lieu de « " + attendu + " »");
        pg.w.close();
      }
      if (!html.includes(metaVide)) etape11.jeton.push("la page livrée porte une clé d'abonnement non prévue");
      if (/PRIVATE KEY|privateKey/.test(html)) etape11.jeton.push("clé privée dans le front");
      etape11.cas.push(cas11.length + " jetons (15 falsifiés refusés)");

      /* B. Compte Pro mensuel : textes, jauge, cartes, aucune relance, aucun cadenas. */
      const finTexte = nb11(moteur11.dateFrancaise(t0 + 24 * jour, true));
      const pro = ouvrirPage({ ...base11, ...aboDe(jetonValide) }, null, { html: htmlPro });
      await pause(2000);
      if (nb11(pro.texte("accueil-quota")) !== "Devis illimités jusqu'au " + finTexte) etape11.quota.push("accueil Pro : « " + pro.texte("accueil-quota") + " »");
      if (!pro.$("bouton-passer-pro").hidden || !pro.$("accueil-rappel").hidden) etape11.relances.push("abonné à 24 jours de la fin : bouton ou rappel affiché");
      if (!pro.$("logo-pastille-pro").hidden || !pro.doc.querySelector("#tiroir-menu [data-ecran='stats'] [data-cadenas-pro]").hidden) etape11.cadenas.push("abonné : cadenas encore affichés");
      await menu(pro, "stats", 600);
      if (!pro.$("stats-verrou-pro").hidden || pro.$("stats-details").hidden) etape11.cadenas.push("abonné : statistiques détaillées masquées");
      await menu(pro, "abonnement", 600);
      const finAttendue = "Votre Pro mensuel se termine le " + finTexte + " — 24 jours restants.";
      if (pro.actif() !== "ecran-abonnement" || nb11(pro.texte("ma-formule-fin")) !== finAttendue) etape11.formules.push("Ma formule (Pro) : « " + pro.texte("ma-formule-fin") + " » au lieu de « " + finAttendue + " »");
      if (pro.$("jauge-formule").getAttribute("aria-valuenow") !== "24" || pro.$("jauge-formule").getAttribute("aria-valuemax") !== "30") etape11.formules.push("jauge Pro : " + pro.$("jauge-formule").getAttribute("aria-valuenow") + "/" + pro.$("jauge-formule").getAttribute("aria-valuemax"));
      const btnPro = (id) => pro.doc.querySelector("[data-choisir-formule='" + id + "']");
      if (!btnPro("mensuel").disabled || btnPro("mensuel").textContent !== "Ma formule actuelle" || btnPro("semaine").disabled) etape11.formules.push("boutons des cartes pour un abonné mensuel");
      if (pro.doc.querySelectorAll("#avantages-pro [data-etat='inclus']").length !== 4 || pro.doc.querySelector("#avantages-pro [data-invitation]")) etape11.cadenas.push("abonné : avantages non marqués « Inclus »");
      pro.w.close();

      /* C. Compte gratuit : 3 devis ce mois → 4e (invitation « il reste 1 »), 5e, 6e BLOQUÉ (étude conservée). */
      const cat11 = Object.fromEntries(Object.entries(moteur11.CATALOGUE_DEFAUT).map(([r, art]) => [r, { ...art }]));
      const studio11 = CHANTIERS_TYPES.find((t) => t.cle === "studio");
      const contenu11 = moteur11.devisDepuisChiffrage(moteur11.chiffrerChantier(studio11.chantier, cat11, "XOF", null));
      const an11 = new Date().getFullYear();
      const ici11 = new Date();
      const ceMois = (n) => isoDe(new Date(ici11.getFullYear(), ici11.getMonth(), 1, 0, n).getTime());
      const moisDernier = isoDe(new Date(ici11.getFullYear(), ici11.getMonth() - 1, 15, 9).getTime());
      const devis11 = (id, n, creeLe) => ({ ...contenu11, id, compteId: compte.id, numero: "BP-" + an11 + "-000" + n, statut: "brouillon", creeLe, modifieLe: creeLe,
        titre: "Studio " + n, client: "Client " + n, clientTelephone: "", lieu: "Ouagadougou", chantierId: null, conditions: "", note: "" });
      const chantier11 = { ...JSON.parse(JSON.stringify(studio11.chantier)), id: "chantier-quota-11", compteId: compte.id, statut: "etudie", etape: 5, etapeMax: 5,
        nom: "Studio Tanghin", lieu: "Ouagadougou", type: "studio", client: { nom: "M. Ouédraogo", telephone: "" }, creeLe: moisDernier, modifieLe: moisDernier };
      const stockQuota = { ...base11, [K.devis]: JSON.stringify([devis11("q1", 1, ceMois(1)), devis11("q2", 2, ceMois(2)), devis11("q3", 3, ceMois(3)), devis11("q0", 4, moisDernier)]),
        bp_v1_chantiers: JSON.stringify([chantier11]) };
      const g = ouvrirPage(stockQuota);
      await pause(2000);
      const nbDevis = (page) => JSON.parse(page.stockage()[K.devis]).length;
      const etude = (page) => JSON.parse(page.stockage().bp_v1_chantiers || "[]").find((c) => c.id === "chantier-quota-11");
      const ouvrirEtude = async (page) => { await menu(page, "chantiers", 400); const b = page.doc.querySelector("#liste-chantiers [data-ouvrir-chantier='chantier-quota-11']"); if (b) b.click(); await pause(700); };
      if (nb11(g.texte("accueil-quota")) !== "3 / 5 devis ce mois" || g.$("accueil-jauge").getAttribute("aria-valuenow") !== "3") etape11.quota.push("accueil gratuit : « " + g.texte("accueil-quota") + " »");
      if (modaleOuverte(g)) etape11.relances.push("invitation le jour de la création du compte : « " + g.texte("modale-titre") + " »");
      if (g.$("bouton-passer-pro").hidden || g.texte("libelle-passer-pro") !== "Passer en Pro") etape11.relances.push("bandeau gratuit : bouton « Passer en Pro » absent");
      if (g.$("logo-pastille-pro").hidden || g.doc.querySelector("#tiroir-menu [data-ecran='stats'] [data-cadenas-pro]").hidden) etape11.cadenas.push("gratuit : cadenas absents (logo, menu Statistiques)");
      await ouvrirEtude(g);
      g.$("bouton-creer-devis").click();
      await pause(1300);
      if (nbDevis(g) !== 5 || !modaleOuverte(g) || g.texte("modale-titre") !== "Il vous reste 1 devis gratuit" || g.texte("libelle-modale-ok") !== "Voir les formules")
        etape11.quota.push("4e devis : " + nbDevis(g) + " devis, invitation « " + (modaleOuverte(g) ? g.texte("modale-titre") : "") + " »");
      g.$("bouton-modale-annuler").click();
      await pause(200);
      await ouvrirEtude(g);
      g.$("bouton-creer-devis").click();
      await pause(1300);
      if (nbDevis(g) !== 6 || modaleOuverte(g) || g.actif() !== "ecran-fiche-devis") etape11.quota.push("5e devis : " + nbDevis(g) + " devis, modale « " + (modaleOuverte(g) ? g.texte("modale-titre") : "") + " », écran " + g.actif());
      await ouvrirEtude(g);
      const avant6 = etude(g).modifieLe;
      g.$("bouton-creer-devis").click();
      await pause(1300);
      const contenuBloque = nb11(g.texte("modale-contenu"));
      if (nbDevis(g) !== 6) etape11.quota.push("6e devis créé malgré le quota");
      if (!modaleOuverte(g) || g.texte("modale-titre") !== "Vos 5 devis gratuits sont utilisés" || !contenuBloque.includes("Votre étude « Studio Tanghin » est conservée") || !contenuBloque.includes("anciens devis restent consultables, imprimables"))
        etape11.quota.push("6e devis : invitation obligatoire absente ou incomplète (« " + g.texte("modale-titre") + " »)");
      if (g.actif() !== "ecran-resultat" || !etude(g) || etude(g).modifieLe === avant6 && avant6 === moisDernier) etape11.quota.push("6e devis : étude non conservée (écran " + g.actif() + ")");
      g.$("bouton-modale-ok").click();
      await pause(600);
      if (g.actif() !== "ecran-abonnement") etape11.quota.push("« Voir les formules » → " + g.actif());
      if (nb11(g.texte("ma-formule-fin")) !== "Votre abonnement gratuit n'a pas de date de fin." || g.$("jauge-formule").getAttribute("aria-valuenow") !== "5" || g.$("jauge-formule").dataset.niveau !== "plein")
        etape11.formules.push("Ma formule (gratuit) : « " + g.texte("ma-formule-fin") + " », jauge " + g.$("jauge-formule").getAttribute("aria-valuenow"));

      /* ㊼ cartes de formules et ㊽ moyens de paiement, sur l'écran du compte gratuit. */
      const cartes = [...g.doc.querySelectorAll("#liste-formules > li")];
      const ordre11 = ["gratuit", "semaine", "mensuel", "annuel", "vie"];
      const tons = ["gris", "jaune", "violet", "vert", "noir"];
      const icones = ["i-cadeau", "i-eclair", "i-trophee", "i-calendrier", "i-infini"];
      const badges = ["POUR DÉMARRER", "SANS ENGAGEMENT", "LE PLUS CHOISI", "2 MOIS OFFERTS", "À VIE"];
      const prix = cartes.map((c) => Number(nb11(c.querySelector(".formule-prix strong").textContent).replace(/\D/g, "")));
      if (cartes.map((c) => c.dataset.formuleCarte).join() !== ordre11.join()) etape11.formules.push("ordre des cartes : " + cartes.map((c) => c.dataset.formuleCarte).join());
      cartes.forEach((c, i) => {
        const use = c.querySelector(".formule-icone svg use");
        if (!c.classList.contains("formule-" + tons[i])) etape11.formules.push(ordre11[i] + " : couleur « " + tons[i] + " » absente");
        if (!use || use.getAttribute("href") !== "#" + icones[i] || !g.$(icones[i])) etape11.formules.push(ordre11[i] + " : icône " + icones[i] + " absente");
        if (c.querySelector(".formule-badge").textContent !== badges[i]) etape11.formules.push(ordre11[i] + " : badge « " + c.querySelector(".formule-badge").textContent + " »");
        if (c.querySelectorAll(".formule-arguments li").length < 3) etape11.formules.push(ordre11[i] + " : arguments absents");
      });
      if (prix.join() !== "0,750,2500,25000,60000") etape11.formules.push("prix : " + prix.join());
      if (cartes.filter((c) => c.classList.contains("formule-vedette")).map((c) => c.dataset.formuleCarte).join() !== "mensuel") etape11.formules.push("carte vedette ≠ Pro mensuel");
      const styleLivre11 = g.doc.querySelector("head style").textContent;
      for (const regle of [".formule-jaune .formule-badge", ".formule-vert .formule-badge", ".formule-vedette { border-color: var(--violet)", ".formule-noir { background: #17131F", ".formule-vedette { transform: scale(1.06)"]) {
        if (!styleLivre11.includes(regle)) etape11.formules.push("style « " + regle + " » absent");
      }
      if (!g.doc.querySelector("[data-choisir-formule='gratuit']").disabled || g.doc.querySelector("[data-choisir-formule='mensuel']").textContent !== "Choisir Pro mensuel") etape11.formules.push("boutons des cartes (gratuit)");
      const logos = [...g.doc.querySelectorAll("#logos-paiement > li")];
      const moyens = [["orange-money", "Orange Money"], ["moov-money", "Moov Money"], ["wave", "Wave"], ["telecel-money", "Telecel Money"], ["visa", "Visa"], ["mastercard", "Mastercard"], ["cinetpay", "CinetPay"]];
      if (logos.length !== moyens.length) etape11.logos.push(logos.length + " moyens affichés");
      logos.forEach((li, i) => {
        const img = li.querySelector("img");
        const [id, nom] = moyens[i] || [];
        const officiel = img && img.getAttribute("src") === "images/paiement/" + id + ".webp" && img.alt === nom;
        const pastille = !img && li.classList.contains("paiement-pastille") && li.dataset.marque === id && li.textContent === nom && styleLivre11.includes('.paiement-pastille[data-marque="' + id + '"]');
        if (!officiel && !pastille) etape11.logos.push(nom + " : ni logo officiel ni pastille de marque");
      });
      if (g.doc.querySelectorAll("#bande-confiance > li svg").length !== 4) etape11.logos.push("bande de confiance incomplète");
      etape11.cas.push(logos.filter((li) => li.querySelector("img")).length + " logos officiels, " + logos.filter((li) => li.classList.contains("paiement-pastille")).length + " pastilles de marque");
      if (g.doc.querySelectorAll("#avantages-pro [data-invitation]").length !== 4) etape11.cadenas.push("gratuit : 4 cadenas « Débloquer » attendus");
      if (g.$("paiements-vide").hidden || g.doc.querySelectorAll("#liste-paiements > li").length) etape11.recu.push("gratuit sans paiement : message « Aucun paiement » absent");
      if (g.doc.querySelectorAll("#ecran-abonnement .faq-question").length !== 3) etape11.formules.push("FAQ : 3 questions attendues");
      inspecterPage(g, "abonnement");

      /* Anciens devis toujours consultables et imprimables ; Dupliquer est bloqué aussi. */
      await menu(g, "devis", 500);
      const ouvrirQ1 = g.doc.querySelector("#liste-devis [data-ouvrir-devis='q1']");
      if (ouvrirQ1) ouvrirQ1.click();
      await pause(700);
      if (g.actif() !== "ecran-fiche-devis") etape11.quota.push("ancien devis non consultable (" + g.actif() + ")");
      else {
        g.$("devis-bouton-imprimer").click();
        await pause(900);
        if (g.actif() !== "ecran-feuille" || g.$("feuille-bouton-imprimer").disabled || !g.texte("feuille-a4").includes("BP-" + an11 + "-0001")) etape11.quota.push("ancien devis non imprimable (" + g.actif() + ")");
        if (g.$("feuille-pastille-pro").hidden) etape11.cadenas.push("gratuit : cadenas « sans filigrane » absent de la feuille");
      }
      await menu(g, "devis", 500);
      const dupliquer = g.doc.querySelector("#liste-devis [data-dupliquer-devis='q1']");
      if (dupliquer) dupliquer.click();
      await pause(900);
      if (nbDevis(g) !== 6 || !modaleOuverte(g) || g.texte("modale-titre") !== "Vos 5 devis gratuits sont utilisés") etape11.quota.push("Dupliquer au-delà du quota : " + nbDevis(g) + " devis");
      g.$("bouton-modale-annuler").click();
      await pause(200);
      /* Fonction Pro sous cadenas → invitation → écran Abonnement. */
      await menu(g, "stats", 600);
      if (g.$("stats-verrou-pro").hidden || !g.$("stats-details").hidden) etape11.cadenas.push("gratuit : statistiques détaillées non verrouillées");
      g.doc.querySelector("#stats-verrou-pro [data-invitation='stats']").click();
      await pause(400);
      if (!modaleOuverte(g) || g.texte("modale-titre") !== "Statistiques détaillées" || g.texte("libelle-modale-ok") !== "Voir les formules") etape11.cadenas.push("cadenas Statistiques : invitation absente");
      g.$("bouton-modale-ok").click();
      await pause(500);
      if (g.actif() !== "ecran-abonnement") etape11.cadenas.push("invitation → " + g.actif());
      const apresQuota = g.stockage();
      g.w.close();

      /* Supprimer des devis ne rend pas de devis gratuit (compteur du mois). */
      const sansDeux = JSON.parse(apresQuota[K.devis]).filter((d) => d.id !== "q1" && d.id !== "q2");
      const h = ouvrirPage({ ...apresQuota, [K.devis]: JSON.stringify(sansDeux) });
      await pause(2000);
      await ouvrirEtude(h);
      h.$("bouton-creer-devis").click();
      await pause(1200);
      if (nbDevis(h) !== sansDeux.length || !modaleOuverte(h)) etape11.quota.push("après suppression de 2 devis : création de nouveau possible");
      h.w.close();
      /* Abonné : aucune limite. */
      const hp = ouvrirPage({ ...apresQuota, ...aboDe(jetonValide) }, null, { html: htmlPro });
      await pause(2000);
      await ouvrirEtude(hp);
      hp.$("bouton-creer-devis").click();
      await pause(1200);
      if (nbDevis(hp) !== 7 || modaleOuverte(hp)) etape11.quota.push("abonné bloqué au-delà de 5 devis");
      hp.w.close();
      etape11.cas.push("4e, 5e, 6e devis, Dupliquer, suppression");

      /* D. Relances : 1re ouverture du jour (une fois), après un envoi (une fois / 10 min), rappel J-3. */
      const comptesAnciens = JSON.stringify(JSON.parse(stockageInscrit[K.comptes]).map((c) => ({ ...c, creeLe: isoDe(t0 - 2 * jour) })));
      const r1 = ouvrirPage({ ...base11, [K.comptes]: comptesAnciens, [K.devis]: JSON.stringify([devis11("q1", 1, ceMois(1))]) });
      await pause(3000);
      if (!modaleOuverte(r1) || r1.texte("libelle-modale-ok") !== "Voir les formules" || r1.texte("libelle-modale-annuler") !== "Plus tard") etape11.relances.push("1re ouverture du jour : invitation absente");
      r1.$("bouton-modale-annuler").click();
      await pause(200);
      const r2 = ouvrirPage(r1.stockage());
      await pause(3000);
      if (modaleOuverte(r2)) etape11.relances.push("invitation du jour répétée à la 2e ouverture");
      /* Après impression d'un devis (« afterprint » sur la feuille). */
      const lireRelance = (page) => JSON.parse(page.stockage().bp_v1_relances || "{}")[compte.id] || {};
      const r3 = ouvrirPage({ ...r1.stockage(), bp_v1_relances: JSON.stringify({ [compte.id]: { ...lireRelance(r1), derniere: 0 } }) });
      r1.w.close();
      r2.w.close();
      await pause(2000);
      await menu(r3, "devis", 500);
      r3.doc.querySelector("#liste-devis [data-ouvrir-devis='q1']").click();
      await pause(700);
      r3.$("devis-bouton-imprimer").click();
      await pause(900);
      r3.w.dispatchEvent(new r3.w.Event("afterprint"));
      await pause(1600);
      if (r3.actif() !== "ecran-feuille" || !modaleOuverte(r3) || r3.texte("modale-titre") !== "Vos devis, à votre image") etape11.relances.push("après impression : invitation absente (" + r3.actif() + ")");
      r3.$("bouton-modale-annuler").click();
      await pause(200);
      r3.w.dispatchEvent(new r3.w.Event("afterprint"));
      await pause(1600);
      if (modaleOuverte(r3)) etape11.relances.push("2e invitation moins de 10 minutes après la 1re");
      r3.w.close();
      /* Abonné : jamais d'invitation, rappel J-3 sur l'accueil et notifications J-3, veille et jour J à 9 h. */
      const r4 = ouvrirPage({ ...base11, [K.comptes]: comptesAnciens, ...aboDe(jetonValide) }, null, { html: htmlPro });
      await pause(3000);
      if (modaleOuverte(r4)) etape11.relances.push("abonné invité : « " + r4.texte("modale-titre") + " »");
      r4.w.close();
      const jetonJ3 = await jetonAbo(charge({ fin: isoDe(t0 + 2.5 * jour) }));
      const r5 = ouvrirPage({ ...base11, ...aboDe(jetonJ3) }, null, { html: htmlPro });
      await pause(2000);
      if (r5.$("accueil-rappel").hidden || !nb11(r5.texte("accueil-rappel")).startsWith("Votre Pro mensuel se termine dans 3 jours") || r5.$("bouton-passer-pro").hidden || r5.texte("libelle-passer-pro") !== "Renouveler")
        etape11.relances.push("rappel J-3 : « " + r5.texte("accueil-rappel") + " », bouton « " + r5.texte("libelle-passer-pro") + " »");
      r5.w.close();
      const finNotif = t0 + 10 * jour;
      const preferences11 = new Map(Object.entries({ ...base11, ...aboDe(await jetonAbo(charge({ fin: isoDe(finNotif) }))) }));
      const notifs = { annulees: [], planifiees: [] };
      const natif11 = {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          App: { addListener: () => Promise.resolve({ remove() {} }), exitApp() {} },
          Preferences: {
            get: async ({ key }) => ({ value: preferences11.has(key) ? preferences11.get(key) : null }),
            set: async ({ key, value }) => { preferences11.set(key, value); },
            remove: async ({ key }) => { preferences11.delete(key); }
          },
          LocalNotifications: {
            checkPermissions: async () => ({ display: "granted" }),
            requestPermissions: async () => ({ display: "granted" }),
            cancel: async ({ notifications }) => { notifs.annulees.push(...notifications.map((n) => n.id)); },
            schedule: async ({ notifications }) => { notifs.planifiees.push(...notifications); }
          }
        }
      };
      const r6 = ouvrirPage({}, natif11, { html: htmlPro });
      await pause(3000);
      const heures = notifs.planifiees.map((n) => n.id + "@" + new Date(n.schedule.at).getHours() + "h-" + Math.round((finNotif - new Date(n.schedule.at).getTime()) / jour) + "j");
      /* Jour J : 9 h, ou 1 h avant la fin si elle tombe plus tôt dans la journée (étape 12). */
      const neufHeuresJ = new Date(finNotif);
      neufHeuresJ.setHours(9, 0, 0, 0);
      const heureJ = neufHeuresJ.getTime() > finNotif - 3600000 ? new Date(finNotif - 3600000).getHours() : 9;
      const heuresAttendues = "3103@9h-3j,3101@9h-1j,3100@" + heureJ + "h-0j";
      if (notifs.planifiees.length !== 3 || heures.join() !== heuresAttendues || !notifs.annulees.includes(3103) || !notifs.annulees.includes(3100)
        || notifs.planifiees.some((n) => !/se termine (dans|aujourd'hui)/.test(n.body)) || !/aujourd'hui/.test((notifs.planifiees[2] || {}).body || ""))
        etape11.relances.push("notifications J-3 / veille / jour J : " + (heures.join(" ") || "aucune") + " (annulées : " + notifs.annulees.join(",") + ")");
      r6.w.close();
      etape11.cas.push("relances : jour, impression, abonné, J-3, notifications");

      /* E. Mes paiements et reçu imprimable (données piégées ignorées). */
      const paiementOk = { reference: "BP-RECU2026A", formule: "mensuel", montant: 2500, payeLe: isoDe(t0 - 6 * jour), statut: "paye", moyen: "orange-money", debut: isoDe(t0 - 6 * jour), fin: isoDe(t0 + 24 * jour) };
      const pieges = [paiementOk, { ...paiementOk, reference: "<img src=x onerror=alert(1)>" }, { ...paiementOk, reference: "BP-AUTRE01", montant: "2500" },
        { ...paiementOk, reference: "BP-AUTRE02", formule: "gratuit" }, { ...paiementOk, reference: "BP-AUTRE03", statut: "offert" }, { ...paiementOk, reference: "BP-AUTRE04", montant: -5 }, null, "texte", [1]];
      let impressions = 0;
      const rc = ouvrirPage({ ...base11, ...aboDe(jetonValide), bp_v1_paiements: JSON.stringify({ [compte.id]: pieges, "autre-compte-1234": [{ ...paiementOk, reference: "BP-PASAMOI1" }] }) }, null,
        { html: htmlPro, preparer(w) { w.print = () => { impressions += 1; }; } });
      await pause(2000);
      await menu(rc, "abonnement", 600);
      const lignesPaiement = [...rc.doc.querySelectorAll("#liste-paiements > li")];
      const textePaiement = nb11(lignesPaiement.map((li) => li.textContent).join(" | "));
      if (lignesPaiement.length !== 1 || !textePaiement.includes("Pro mensuel") || !textePaiement.includes("2 500 FCFA") || !textePaiement.includes("Orange Money") || !textePaiement.includes("Payé") || !rc.$("paiements-vide").hidden)
        etape11.recu.push("Mes paiements : " + lignesPaiement.length + " ligne(s) « " + textePaiement + " »");
      const boutonRecu = rc.doc.querySelector("[data-recu='BP-RECU2026A']");
      if (boutonRecu) boutonRecu.click();
      await pause(300);
      const recu = nb11(rc.texte("recu-a4"));
      if (impressions !== 1 || rc.doc.body.dataset.impression !== "recu") etape11.recu.push("« Reçu » n'imprime pas le reçu (" + impressions + ")");
      for (const attendu of ["Reçu de paiement", "BP-RECU2026A", "2 500 FCFA", nb11(moteur11.montantEnLettres(2500, "XOF")), "Orange Money", "Pro mensuel", compte.nom, "+226 05 60 86 08"]) {
        if (!recu.includes(nb11(attendu))) etape11.recu.push("reçu sans « " + attendu + " »");
      }
      if (rc.doc.querySelector("#recu-a4 img, #recu-a4 script")) etape11.recu.push("nom du compte interprété comme du HTML dans le reçu");
      rc.w.dispatchEvent(new rc.w.Event("afterprint"));
      await pause(100);
      if (rc.doc.body.dataset.impression || rc.$("recu-a4").childElementCount) etape11.recu.push("reçu non nettoyé après impression");
      if (!styleLivre11.includes('body[data-impression="recu"] .recu-a4 { display: grid')) etape11.recu.push("règle d'impression du reçu absente");
      inspecterPage(rc, "mes paiements");
      rc.w.close();
      const pdfRecu = analyserPdf(moteur11.creerPdfRecu(moteur11.modeleRecu({ ...paiementOk, moyen: "Orange Money" }, { nom: "Awa Ouédraogo-Kaboré", entreprise: "BRG Électro+", telephone: "+226 70 11 22 33" })));
      if (pdfRecu.erreurs.length || pdfRecu.pages !== 1 || !pdfRecu.texte.includes(moteur11.chainePdf("Reçu de paiement")) || !pdfRecu.texte.includes("/Title " + moteur11.chainePdf("Reçu BP-RECU2026A"))
        || !pdfRecu.texte.includes(moteur11.chainePdf("Awa Ouédraogo-Kaboré")))
        etape11.recu.push("PDF du reçu (téléphone) : " + pdfRecu.pages + " page(s) " + pdfRecu.erreurs.join(", "));

      /* F. Paiement : le front n'envoie QUE la formule ; seule une adresse https est ouverte. */
      const appels = [];
      const ouvertures = [];
      let reponse = null;
      const pp = ouvrirPage({ ...base11 }, null, { preparer(w) {
        w.fetch = async (url, init) => { appels.push({ url: String(url), init }); if (reponse instanceof Error) throw reponse; return { ok: true, json: async () => reponse }; };
        w.open = (...args) => { ouvertures.push(args); return null; };
      } });
      await pause(2000);
      await menu(pp, "abonnement", 600);
      const choisir = async (id) => { pp.doc.querySelector("[data-choisir-formule='" + id + "']").click(); await pause(150); };
      await choisir("mensuel");
      if (!modaleOuverte(pp) || pp.texte("modale-titre") !== "Pro mensuel" || pp.texte("libelle-modale-ok") !== "Payer maintenant" || !nb11(pp.texte("modale-contenu")).includes("2 500 FCFA"))
        etape11.paiement.push("récapitulatif : « " + pp.texte("modale-titre") + " » / « " + pp.texte("libelle-modale-ok") + " »");
      reponse = { urlPaiement: "https://paiement.exemple.bf/p/123", reference: "BP-ABC123" };
      pp.$("bouton-modale-ok").click();
      await pause(400);
      const initiations = () => appels.filter((a) => a.url.endsWith("/api/paiements/initier"));
      const premier = initiations()[0] || { url: "", init: {} };
      if (!premier.url.endsWith("/api/paiements/initier") || premier.init.method !== "POST" || premier.init.body !== '{"formule":"mensuel"}' || premier.init.credentials !== "omit")
        etape11.paiement.push("requête : " + premier.url + " " + premier.init.method + " " + premier.init.body + " " + premier.init.credentials);
      if (ouvertures.length !== 1 || ouvertures[0][0] !== "https://paiement.exemple.bf/p/123" || ouvertures[0][2] !== "noopener,noreferrer" || !pp.texte("msg-paiement").includes("BP-ABC123"))
        etape11.paiement.push("page de paiement non ouverte (" + JSON.stringify(ouvertures) + ")");
      for (const [nom, valeur] of [["javascript:", { urlPaiement: "javascript:alert(1)", reference: "BP-ABC124" }], ["http://", { urlPaiement: "http://paiement.exemple.bf/p/1", reference: "BP-ABC125" }],
        ["référence invalide", { urlPaiement: "https://paiement.exemple.bf/p/2", reference: "<b>x</b>" }], ["coupure réseau", new Error("réseau")]]) {
        reponse = valeur;
        await choisir("semaine");
        pp.$("bouton-modale-ok").click();
        await pause(300);
        if (ouvertures.length !== 1 || !pp.texte("msg-paiement").includes("n'a pas pu démarrer") || pp.$("bouton-reessayer-paiement").hidden) etape11.paiement.push(nom + " : " + ouvertures.length + " ouverture(s), « " + pp.texte("msg-paiement") + " »");
      }
      reponse = { urlPaiement: "https://paiement.exemple.bf/p/9", reference: "BP-ABC129" };
      pp.$("bouton-reessayer-paiement").click();
      await pause(400);
      if (ouvertures.length !== 2 || (initiations().at(-1) || { init: {} }).init.body !== '{"formule":"semaine"}' || !pp.$("bouton-reessayer-paiement").hidden) etape11.paiement.push("« Réessayer » ne relance pas la formule choisie");
      if (appels.some((a) => /montant|prix|\d{3}/.test(String(a.init.body)))) etape11.paiement.push("un montant part dans la requête");
      pp.w.close();
      etape11.cas.push(initiations().length + " demandes de paiement");
      etape11.fait = true;
    }

    /* ---------- Étape 12 : paiement automatique (suivi, échecs, retour, reprise, renouvellement) ---------- */
    {
      const m12 = chargerMoteur();
      const jour = 86400000;
      const isoDe = (ms) => new Date(ms).toISOString();
      const nb12 = (x) => String(x || "").replace(/[\u00a0\u202f]/g, " ");
      const sessionFraiche = () => { const s = JSON.parse(sessionActive); s.derniereActivite = Date.now(); return JSON.stringify(s); };
      const base12 = { [K.pres]: "1", [K.comptes]: stockageInscrit[K.comptes], [K.session]: sessionActive };
      const jetonApi = "v1." + "a".repeat(24) + "." + "b".repeat(43);
      const avecApi = { bp_v1_jeton_api: JSON.stringify({ [compte.id]: jetonApi }) };
      const aboDe12 = (jeton) => ({ bp_v1_abonnement: JSON.stringify({ [compte.id]: jeton }) });
      const durees = { semaine: 7, mensuel: 30, annuel: 365, vie: null };
      const chargePro = (formule, extra) => {
        const t = Date.now();
        return { v: 1, compteId: compte.id, telephone: compte.telephone, formule, debut: isoDe(t), fin: durees[formule] ? isoDe(t + durees[formule] * jour) : null, emisLe: isoDe(t - 1000), ...extra };
      };
      const statut = (reference, code, formule, extra) => ({
        reference, statut: code, formule, montant: m12.FORMULES[formule].prix, devise: "XOF", moyen: "orange-money",
        payeLe: code === "paye" ? isoDe(Date.now()) : null, abonnement: null, jeton: null, ...extra
      });
      const paye = async (reference, formule, cle) => {
        const charge = chargePro(formule);
        return statut(reference, "paye", formule, { jeton: await jetonAbo(charge, cle), abonnement: { formule, debut: charge.debut, fin: charge.fin } });
      };
      const menu12 = async (page, ecran, ms) => { const lien = page.doc.querySelector("#tiroir-menu [data-ecran='" + ecran + "']"); if (lien) lien.click(); await pause(ms || 600); };
      const payer = async (page, id) => {
        const bouton = page.doc.querySelector("[data-choisir-formule='" + id + "']");
        if (bouton) bouton.click();
        await pause(150);
        page.$("bouton-modale-ok").click();
        await pause(600);
      };
      const issue = (page) => page.$("suivi-paiement").dataset.issue;
      const stocke = (page, cle) => page.w.localStorage.getItem(cle) || "";
      /* Faux accès en ligne : initiation, consultation du statut, interrupteur. */
      function banc12() {
        const b = { appels: [], ouvertures: [], initier: [], statuts: {}, renouvellementOk: true, enLigne: true, impressions: 0 };
        b.preparer = (w) => {
          Object.defineProperty(w.navigator, "onLine", { configurable: true, get: () => b.enLigne });
          w.print = () => { b.impressions += 1; };
          w.open = (...args) => { b.ouvertures.push(args); return null; };
          w.fetch = async (url, init) => {
            const adresse = String(url);
            b.appels.push({ url: adresse, init: init || {} });
            if (adresse.endsWith("/api/paiements/initier")) {
              const r = b.initier[0] || { ok: false, status: 503, corps: { erreur: "paiement_indisponible" } };
              if (r instanceof Error) throw r;
              return { ok: r.ok !== false, status: r.status || 201, json: async () => r.corps };
            }
            const trouve = /\/api\/paiements\/([^/?]+)$/.exec(adresse);
            if (trouve) {
              const s = b.statuts[decodeURIComponent(trouve[1])];
              return s ? { ok: true, status: 200, json: async () => s } : { ok: false, status: 404, json: async () => ({ erreur: "introuvable" }) };
            }
            if (adresse.endsWith("/api/abonnement/renouvellement-auto")) return { ok: b.renouvellementOk, status: b.renouvellementOk ? 200 : 503, json: async () => ({}) };
            return { ok: false, status: 404, json: async () => ({}) };
          };
        };
        b.lectures = (ref) => b.appels.filter((a) => a.url.endsWith("/api/paiements/" + ref));
        b.inits = () => b.appels.filter((a) => a.url.endsWith("/api/paiements/initier"));
        return b;
      }

      /* SP. Parcours complet : page de paiement → « Nous confirmons… » → payé → Pro actif, reçu, accueil. */
      {
        const b = banc12();
        b.initier = [{ corps: { urlPaiement: "https://paiement.exemple.bf/p/1", reference: "BP-SUIVI001" } }];
        b.statuts["BP-SUIVI001"] = statut("BP-SUIVI001", "en_attente", "mensuel");
        const p = ouvrirPage({ ...base12, ...avecApi }, null, { html: htmlPro, preparer: b.preparer });
        await pause(2000);
        await menu12(p, "abonnement");
        await payer(p, "mensuel");
        const init = b.inits()[0] || { init: { headers: {} } };
        if (init.init.headers.Authorization !== "Bearer " + jetonApi || init.init.body !== '{"formule":"mensuel"}' || init.init.credentials !== "omit")
          etape12.suivi.push("initiation : " + JSON.stringify(init.init.headers) + " " + init.init.body);
        if (b.ouvertures.length !== 1 || b.ouvertures[0][0] !== "https://paiement.exemple.bf/p/1") etape12.suivi.push("page de paiement non ouverte");
        if (p.actif() !== "ecran-paiement" || issue(p) !== "attente" || p.texte("titre-suivi") !== "Nous confirmons votre paiement…" || !nb12(p.texte("suivi-reference")).includes("BP-SUIVI001"))
          etape12.suivi.push("écran de suivi : " + p.actif() + " / " + issue(p) + " / « " + p.texte("titre-suivi") + " »");
        if (!stocke(p, "bp_v1_paiement_en_cours").includes("BP-SUIVI001")) etape12.suivi.push("paiement en cours non mémorisé (reprise impossible)");
        if (stocke(p, "bp_v1_abonnement")) etape12.suivi.push("abonnement écrit avant la confirmation");
        await pause(3300);
        const lectures = b.lectures("BP-SUIVI001");
        if (lectures.length < 2 || lectures.some((a) => a.init.method !== "GET" || a.init.credentials !== "omit" || a.init.headers.Authorization !== "Bearer " + jetonApi))
          etape12.suivi.push("consultation toutes les 3 s : " + lectures.length + " lecture(s)");
        if (issue(p) !== "attente" || !p.$("bouton-suivi-recu").hidden) etape12.suivi.push("« en attente » traité comme une issue");
        b.statuts["BP-SUIVI001"] = await paye("BP-SUIVI001", "mensuel");
        await pause(3300);
        if (issue(p) !== "paye" || p.texte("titre-suivi") !== "Paiement confirmé !" || !nb12(p.texte("suivi-texte")).startsWith("Votre Pro mensuel est actif jusqu'au")
          || p.$("bouton-suivi-recu").hidden || !p.$("bouton-suivi-reessayer").hidden || p.$("suivi-particules").children.length !== m12.PAIEMENTS.particules || p.doc.activeElement !== p.$("titre-suivi"))
          etape12.suivi.push("payé : " + issue(p) + " « " + nb12(p.texte("suivi-texte")) + " » " + p.$("suivi-particules").children.length + " particules");
        if (!stocke(p, "bp_v1_abonnement").includes(compte.id) || stocke(p, "bp_v1_paiement_en_cours").includes("BP-SUIVI001") || !stocke(p, "bp_v1_paiements").includes("BP-SUIVI001"))
          etape12.suivi.push("payé : jeton, paiement en cours ou « Mes paiements » non mis à jour");
        const apres = b.lectures("BP-SUIVI001").length;
        await pause(3300);
        if (b.lectures("BP-SUIVI001").length !== apres) etape12.suivi.push("la consultation continue après la confirmation");
        p.$("bouton-suivi-recu").click();
        await pause(300);
        const recu = nb12(p.texte("recu-a4"));
        if (b.impressions !== 1 || !recu.includes("BP-SUIVI001") || !recu.includes("2 500 FCFA") || !recu.includes("Orange Money")) etape12.suivi.push("reçu : " + b.impressions + " impression(s)");
        p.w.dispatchEvent(new p.w.Event("afterprint"));
        await pause(100);
        p.$("bouton-suivi-accueil").click();
        await pause(600);
        if (p.actif() !== "ecran-accueil" || !nb12(p.texte("accueil-quota")).startsWith("Devis illimités")) etape12.suivi.push("accueil après paiement : « " + p.texte("accueil-quota") + " »");
        await menu12(p, "abonnement");
        if (!nb12(p.texte("liste-paiements")).includes("Pro mensuel") || !nb12(p.texte("liste-paiements")).includes("2 500 FCFA")) etape12.suivi.push("« Mes paiements » sans le paiement confirmé");
        inspecterPage(p, "suivi du paiement");
        p.w.close();
        etape12.cas.push("payé après " + lectures.length + " consultations");
      }

      /* SE. Échec, réessayer (même formule), attente trop longue, coupure, jeton falsifié, codes d'erreur. */
      {
        const b = banc12();
        const decalage = { ms: 0 };
        b.initier = [{ corps: { urlPaiement: "https://paiement.exemple.bf/p/2", reference: "BP-ECHEC001" } }];
        b.statuts["BP-ECHEC001"] = statut("BP-ECHEC001", "echoue", "semaine");
        const p = ouvrirPage({ ...base12, ...avecApi }, null, { html: htmlPro, preparer: b.preparer, decalage });
        await pause(2000);
        await menu12(p, "abonnement");
        await payer(p, "semaine");
        await pause(300);
        if (issue(p) !== "echoue" || p.texte("titre-suivi") !== m12.SUIVI_PAIEMENT.echoue.titre || p.$("bouton-suivi-reessayer").hidden || !p.$("bouton-suivi-recu").hidden || stocke(p, "bp_v1_abonnement"))
          etape12.echecs.push("échoué : " + issue(p) + " « " + p.texte("titre-suivi") + " »");
        if (stocke(p, "bp_v1_paiement_en_cours").includes("BP-ECHEC001")) etape12.echecs.push("paiement échoué gardé « en cours »");
        b.initier = [{ corps: { urlPaiement: "https://paiement.exemple.bf/p/3", reference: "BP-ECHEC002" } }];
        b.statuts["BP-ECHEC002"] = statut("BP-ECHEC002", "en_attente", "semaine");
        p.$("bouton-suivi-reessayer").click();
        await pause(600);
        if (b.inits().length !== 2 || b.inits()[1].init.body !== '{"formule":"semaine"}' || issue(p) !== "attente" || !nb12(p.texte("suivi-reference")).includes("BP-ECHEC002"))
          etape12.echecs.push("« Réessayer » : " + b.inits().length + " initiation(s), " + issue(p));
        const anciennes = b.lectures("BP-ECHEC001").length;
        await pause(3300);
        if (b.lectures("BP-ECHEC001").length !== anciennes) etape12.echecs.push("l'ancien suivi continue après un nouveau lancement");
        decalage.ms = m12.PAIEMENTS.suiviDureeMs + 1000;
        await pause(3300);
        if (issue(p) !== "long" || p.$("bouton-suivi-verifier").hidden || !p.$("bouton-suivi-reessayer").hidden || !nb12(p.texte("suivi-texte")).includes("s'activera toute seule"))
          etape12.echecs.push("3 min sans confirmation : " + issue(p));
        const avantArret = b.lectures("BP-ECHEC002").length;
        await pause(3300);
        if (b.lectures("BP-ECHEC002").length !== avantArret) etape12.echecs.push("consultation au-delà de 3 minutes");
        p.$("bouton-suivi-verifier").click();
        await pause(200);
        if (issue(p) !== "attente") etape12.echecs.push("« Vérifier à nouveau » ne relance pas le suivi");
        b.enLigne = false;
        decalage.ms += m12.PAIEMENTS.suiviDureeMs + 1000;
        await pause(3300);
        if (issue(p) !== "hors_ligne" || p.$("bouton-suivi-verifier").hidden) etape12.echecs.push("coupure réseau : " + issue(p));
        b.enLigne = true;
        b.statuts["BP-ECHEC002"] = await paye("BP-ECHEC002", "semaine", autrePaire.privateKey);
        p.$("bouton-suivi-verifier").click();
        await pause(800);
        if (issue(p) !== "invalide" || stocke(p, "bp_v1_abonnement") || stocke(p, "bp_v1_paiements").includes("BP-ECHEC002")) etape12.echecs.push("« payé » avec un jeton falsifié : " + issue(p));
        for (const [code, reessai] of [["annule", true], ["expire", true], ["anomalie", false], ["rembourse", false]]) {
          const ref = "BP-ISSUE" + code.toUpperCase();
          b.initier = [{ corps: { urlPaiement: "https://paiement.exemple.bf/p/" + code, reference: ref } }];
          b.statuts[ref] = statut(ref, code, "mensuel");
          await menu12(p, "abonnement");
          await payer(p, "mensuel");
          await pause(300);
          if (issue(p) !== code || p.texte("titre-suivi") !== m12.SUIVI_PAIEMENT[code].titre || p.$("bouton-suivi-reessayer").hidden === reessai || stocke(p, "bp_v1_abonnement"))
            etape12.echecs.push(code + " : " + issue(p) + " « " + p.texte("titre-suivi") + " »");
        }
        for (const [code, attendu] of [["places_vie_epuisees", "places_vie_epuisees"], ["non_authentifie", "non_authentifie"], ["trop_de_tentatives", "trop_de_tentatives"],
          ["<img src=x onerror=alert(1)>", "defaut"], ["constructor", "defaut"], [null, "defaut"]]) {
          b.initier = [{ ok: false, status: 409, corps: code === null ? "texte" : { erreur: code } }];
          await menu12(p, "abonnement");
          await payer(p, "annuel");
          if (p.texte("msg-paiement") !== m12.MESSAGES_PAIEMENT[attendu] || p.actif() !== "ecran-abonnement" || p.$("bouton-reessayer-paiement").hidden)
            etape12.echecs.push("erreur « " + code + " » : « " + p.texte("msg-paiement") + " »");
        }
        inspecterPage(p, "échecs du paiement");
        p.w.close();
        etape12.cas.push("8 issues et 6 codes d'erreur");
      }

      /* RT. Retour de la page de paiement (#paiement-retour?ref=…), reprise au démarrage, navigateur fermé, retour dans l'application. */
      {
        const b = banc12();
        const p = ouvrirPage({ ...base12, ...avecApi }, null, { html: htmlPro, preparer: b.preparer });
        await pause(2000);
        p.w.location.hash = "#paiement-retour?ref=<img src=x onerror=alert(1)>";
        await pause(300);
        if (p.w.location.hash || p.actif() !== "ecran-accueil" || b.appels.some((a) => /\/api\/paiements\/(?!initier)/.test(a.url))) etape12.retour.push("adresse de retour piégée : " + p.actif() + " " + p.w.location.hash);
        b.statuts["BP-RETOUR01"] = statut("BP-RETOUR01", "en_attente", "annuel");
        p.w.location.hash = "#paiement-retour?ref=BP-RETOUR01";
        await pause(600);
        if (p.w.location.href !== "https://batiplus.local/" || p.actif() !== "ecran-paiement" || issue(p) !== "attente" || b.lectures("BP-RETOUR01").length < 1)
          etape12.retour.push("retour valide : " + p.w.location.href + " " + p.actif() + " " + b.lectures("BP-RETOUR01").length + " lecture(s)");
        b.statuts["BP-RETOUR01"] = await paye("BP-RETOUR01", "annuel");
        await pause(3300);
        if (issue(p) !== "paye" || !nb12(p.texte("suivi-texte")).startsWith("Votre Pro annuel est actif")) etape12.retour.push("retour puis payé : " + issue(p));
        p.w.close();

        const b2 = banc12();
        b2.statuts["BP-REPRISE1"] = await paye("BP-REPRISE1", "mensuel");
        const p2 = ouvrirPage({ ...base12, ...avecApi, bp_v1_paiement_en_cours: JSON.stringify({ [compte.id]: { reference: "BP-REPRISE1", formule: "mensuel", depuis: Date.now() - 600000 } }) },
          null, { html: htmlPro, preparer: b2.preparer });
        await pause(2400);
        if (p2.actif() !== "ecran-accueil" || p2.$("toast").hidden || !nb12(p2.texte("toast")).includes("Paiement confirmé : votre Pro mensuel est actif.")
          || !stocke(p2, "bp_v1_abonnement").includes(compte.id) || stocke(p2, "bp_v1_paiement_en_cours").includes("BP-REPRISE1") || !stocke(p2, "bp_v1_paiements").includes("BP-REPRISE1"))
          etape12.retour.push("reprise au démarrage : " + p2.actif() + " « " + p2.texte("toast") + " »");
        p2.w.close();

        const b3 = banc12();
        b3.statuts["BP-ANCIEN01"] = await paye("BP-ANCIEN01", "mensuel");
        const p3 = ouvrirPage({ ...base12, ...avecApi, bp_v1_paiement_en_cours: JSON.stringify({ [compte.id]: { reference: "BP-ANCIEN01", formule: "mensuel", depuis: Date.now() - 25 * 3600000 } }) },
          null, { html: htmlPro, preparer: b3.preparer });
        await pause(2400);
        if (b3.lectures("BP-ANCIEN01").length || stocke(p3, "bp_v1_paiement_en_cours").includes("BP-ANCIEN01") || stocke(p3, "bp_v1_abonnement")) etape12.retour.push("paiement en cours de plus de 24 h encore suivi");
        p3.w.close();

        const b4 = banc12();
        const ecouteurs = {};
        const prefs = new Map(Object.entries({ ...base12, [K.session]: sessionFraiche(), ...avecApi }));
        const natif12 = {
          isNativePlatform: () => true,
          getPlatform: () => "android",
          Plugins: {
            App: { addListener: (nom, fn) => { ecouteurs["app:" + nom] = fn; return Promise.resolve({ remove() {} }); }, exitApp() {} },
            Browser: { open: async ({ url }) => { b4.ouvertures.push([url]); }, addListener: (nom, fn) => { ecouteurs["browser:" + nom] = fn; return Promise.resolve({ remove() {} }); } },
            Preferences: {
              get: async ({ key }) => ({ value: prefs.has(key) ? prefs.get(key) : null }),
              set: async ({ key, value }) => { prefs.set(key, value); },
              remove: async ({ key }) => { prefs.delete(key); }
            }
          }
        };
        b4.initier = [{ corps: { urlPaiement: "https://paiement.exemple.bf/p/4", reference: "BP-NATIF001" } }];
        b4.statuts["BP-NATIF001"] = statut("BP-NATIF001", "en_attente", "mensuel");
        const p4 = ouvrirPage({}, natif12, { html: htmlPro, preparer: b4.preparer });
        await pause(2000);
        await menu12(p4, "abonnement");
        await payer(p4, "mensuel");
        const lecturesNatif = b4.lectures("BP-NATIF001").length;
        if (b4.ouvertures.length !== 1 || p4.actif() !== "ecran-paiement" || typeof ecouteurs["browser:browserFinished"] !== "function" || typeof ecouteurs["app:resume"] !== "function")
          etape12.retour.push("téléphone : navigateur " + b4.ouvertures.length + ", écran " + p4.actif() + ", écouteurs " + Object.keys(ecouteurs).join(","));
        else {
          ecouteurs["browser:browserFinished"]();
          await pause(400);
          if (b4.lectures("BP-NATIF001").length !== lecturesNatif + 1) etape12.retour.push("navigateur fermé : pas de vérification immédiate");
          b4.statuts["BP-NATIF001"] = await paye("BP-NATIF001", "mensuel");
          ecouteurs["app:resume"]();
          await pause(800);
          if (issue(p4) !== "paye" || !String(prefs.get("bp_v1_abonnement") || "").includes(compte.id) || p4.actif() !== "ecran-paiement") etape12.retour.push("retour dans l'application : " + issue(p4) + " " + p4.actif());
        }
        p4.w.close();
        etape12.cas.push("retour, reprise, 24 h, navigateur fermé");
      }

      /* RN. Renouveler en 1 toucher (accueil et Mon abonnement), rappel du jour J, interrupteur carte. */
      {
        const b = banc12();
        const chargeJ3 = chargePro("mensuel", { debut: isoDe(Date.now() - 27.5 * jour), fin: isoDe(Date.now() + 2.5 * jour) });
        b.initier = [{ corps: { urlPaiement: "https://paiement.exemple.bf/p/5", reference: "BP-RENOUV01" } }];
        b.statuts["BP-RENOUV01"] = statut("BP-RENOUV01", "en_attente", "mensuel");
        const p = ouvrirPage({ ...base12, ...avecApi, ...aboDe12(await jetonAbo(chargeJ3)) }, null, { html: htmlPro, preparer: b.preparer });
        await pause(2000);
        if (p.texte("libelle-passer-pro") !== "Renouveler" || !nb12(p.texte("accueil-rappel")).includes("Renouvelez en 1 toucher")) etape12.renouvellement.push("accueil J-3 : « " + p.texte("libelle-passer-pro") + " »");
        p.$("bouton-passer-pro").click();
        await pause(800);
        if (b.inits().length !== 1 || b.inits()[0].init.body !== '{"formule":"mensuel"}' || p.actif() !== "ecran-paiement" || !p.$("modale").hidden)
          etape12.renouvellement.push("« Renouveler » de l'accueil : " + b.inits().length + " initiation(s), " + p.actif());
        await menu12(p, "abonnement");
        if (p.$("bouton-renouveler").hidden || p.texte("libelle-renouveler") !== "Renouveler mon Pro mensuel") etape12.renouvellement.push("bouton « Renouveler » absent de Mon abonnement");
        p.$("bouton-renouveler").click();
        await pause(800);
        if (b.inits().length !== 2 || p.actif() !== "ecran-paiement") etape12.renouvellement.push("« Renouveler mon Pro mensuel » : " + b.inits().length + " initiation(s)");
        p.$("bouton-avatar").click();
        await pause(600);
        const interrupteur = p.$("renouvellement-auto");
        if (p.$("carte-renouvellement").hidden || interrupteur.checked || interrupteur.getAttribute("role") !== "switch") etape12.renouvellement.push("interrupteur absent ou activé par défaut");
        interrupteur.click();
        await pause(400);
        const reglage = b.appels.filter((a) => a.url.endsWith("/api/abonnement/renouvellement-auto"));
        if (!interrupteur.checked || reglage.length !== 1 || reglage[0].init.body !== '{"actif":true}' || reglage[0].init.headers.Authorization !== "Bearer " + jetonApi
          || !stocke(p, "bp_v1_renouvellement").includes(compte.id) || !p.texte("msg-renouvellement").startsWith("Activé"))
          etape12.renouvellement.push("activation : " + interrupteur.checked + " « " + p.texte("msg-renouvellement") + " »");
        b.renouvellementOk = false;
        interrupteur.click();
        await pause(400);
        if (!interrupteur.checked || !p.texte("msg-renouvellement").includes("n'a pas pu être enregistré") || !stocke(p, "bp_v1_renouvellement").includes(compte.id))
          etape12.renouvellement.push("échec en ligne : l'interrupteur ne revient pas en arrière");
        b.enLigne = false;
        const avantHorsLigne = b.appels.length;
        interrupteur.click();
        await pause(300);
        if (!interrupteur.checked || b.appels.length !== avantHorsLigne) etape12.renouvellement.push("hors ligne : réglage modifié sans confirmation");
        p.w.close();

        const loin = ouvrirPage({ ...base12, ...aboDe12(await jetonAbo(chargePro("mensuel"))) }, null, { html: htmlPro });
        await pause(2000);
        await menu12(loin, "abonnement");
        if (!loin.$("bouton-renouveler").hidden) etape12.renouvellement.push("« Renouveler » proposé loin de la fin");
        loin.w.close();
        const vie = ouvrirPage({ ...base12, ...aboDe12(await jetonAbo(chargePro("vie"))) }, null, { html: htmlPro });
        await pause(2000);
        vie.$("bouton-avatar").click();
        await pause(600);
        if (!vie.$("carte-renouvellement").hidden) etape12.renouvellement.push("interrupteur proposé à un Lifetime");
        vie.w.close();

        const finJ = new Date();
        finJ.setHours(23, 59, 0, 0);
        if (finJ.getTime() - Date.now() > 20 * 60000) {
          const j = ouvrirPage({ ...base12, ...aboDe12(await jetonAbo(chargePro("mensuel", { debut: isoDe(finJ.getTime() - 30 * jour), fin: isoDe(finJ.getTime()) }))) }, null, { html: htmlPro });
          await pause(2000);
          if (!nb12(j.texte("accueil-rappel")).startsWith("Votre Pro mensuel se termine aujourd'hui") || j.texte("libelle-passer-pro") !== "Renouveler") etape12.renouvellement.push("jour J : « " + j.texte("accueil-rappel") + " »");
          j.w.close();
          etape12.cas.push("jour J vérifié");
        }
      }
      etape12.fait = true;
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

    /* ---------- Étape 14 : compte en ligne et synchronisation, contre le VRAI back-end ----------
       Un serveur backend/serveur.js tourne sur une base temporaire ; l'application (jsdom) l'appelle
       à l'adresse https://api.batiplus.bf, réécrite vers 127.0.0.1. Deux « téléphones » partagent le
       même compte : tout passe par l'interface et le stockage, comme sur un vrai appareil. */
    {
      const { demarrer: demarrerApi } = await import("../../backend/serveur.js");
      const { chargerConfig: chargerConfigApi } = await import("../../backend/config.js");
      const { hacherCode: hacherCodeApi, formaterHachageAdmin: formaterAdminApi } = await import("../../backend/codes.js");
      const { generateKeyPairSync: paireEc } = await import("node:crypto");
      const { mkdtempSync: dossierTemp, writeFileSync: ecrireTemp, rmSync: effacerTemp } = await import("node:fs");
      const { tmpdir: dossierSysteme } = await import("node:os");
      const { createServer: serveurLibre } = await import("node:http");
      const dossier14 = dossierTemp(join(dossierSysteme(), "batiplus-sync-"));
      const paire14 = paireEc("ec", { namedCurve: "prime256v1" });
      ecrireTemp(join(dossier14, "cle.pem"), paire14.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
      const spki14 = paire14.publicKey.export({ type: "spki", format: "der" }).toString("base64");
      const html14 = html.replace(metaVide, '<meta name="batiplus-cle-abonnement" content="' + spki14 + '">');
      const port14 = await new Promise((r) => { const s = serveurLibre(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => r(port)); }); });
      const CODE_ADM14 = "73914682055";
      const env14 = {
        NODE_ENV: "developpement", URL_PUBLIQUE: "http://127.0.0.1:" + port14, ORIGINES_AUTORISEES: "https://localhost,capacitor://localhost",
        ABONNEMENT_CLE_PRIVEE_CHEMIN: join(dossier14, "cle.pem"), PAIEMENT_FOURNISSEUR: "simulation", PAIEMENT_MODE: "test",
        BASE_DONNEES: join(dossier14, "sync.sqlite"), SAUVEGARDE_DOSSIER: join(dossier14, "sauvegardes"), ADMIN_CODE_HASH: formaterAdminApi(await hacherCodeApi(CODE_ADM14)),
        JETON_SECRET: "9c4e2a7b1d8f3e6a".repeat(4), WEBHOOK_SECRET: "w3bh00k-" + "b7d1e9c3a5f20468".repeat(2),
        SIMULATION_SECRET: "simulation-" + "e4c8a2f6".repeat(3), SAUVEGARDE_CLE: "2b7e9d4c1a6f3e8d".repeat(4)
      };
      const large = [100000, 60000];
      const api14 = demarrerApi({ ...chargerConfigApi(env14, join(RACINE, "backend")), sauvegardeAuto: false,
        limites: { general: large, connexion: large, creation: large, activation: large, initier: large, admin: large } }, { journalConsole: { error() {}, warn() {}, log() {} } });
      await api14.ecouter(port14, "127.0.0.1");
      const base14 = api14.base;
      const sy = { liaison: [], envoi: [], second: [], suppression: [], horsLigne: [], quota: [], code: [], sortie: [], activation: [], admin: [], effacement: [] };
      const pages14 = [];
      const reseau = { p1: true, p2: true };
      const appels14 = [];
      const preparer14 = (nom) => (w) => {
        Object.defineProperty(w.navigator, "onLine", { configurable: true, get: () => reseau[nom] });
        w.URL.createObjectURL = () => "blob:https://batiplus.local/export";
        w.URL.revokeObjectURL = () => {};
        w.fetch = async (url, init) => {
          const o = init || {};
          const appel = { page: nom, url: String(url), methode: o.method || "GET", entetes: { ...(o.headers || {}) }, corps: o.body, credentials: o.credentials, statut: 0 };
          appels14.push(appel);
          if (!reseau[nom]) throw new Error("Failed to fetch");
          if (!appel.url.startsWith("https://api.batiplus.bf/")) throw new Error("adresse inattendue " + appel.url);
          const r = await fetch(appel.url.replace("https://api.batiplus.bf", "http://127.0.0.1:" + port14),
            { method: appel.methode, headers: { ...appel.entetes, Origin: "https://localhost" }, body: o.body });
          const texte = await r.text();
          appel.statut = r.status;
          appel.reponse = texte.slice(0, 4000);
          return { status: r.status, ok: r.ok, headers: { get: (n) => r.headers.get(n) }, json: async () => w.JSON.parse(texte), text: async () => texte };
        };
      };
      const ouvrir14 = (nom, stockage) => { const pg = ouvrirPage(stockage, null, { html: html14, preparer: preparer14(nom) }); pages14.push(pg); return pg; };
      const lu = (pg, cle) => { try { return JSON.parse(pg.stockage()[cle] || "null"); } catch { return null; } };
      const deCompte = (pg, cle, id) => { const v = lu(pg, cle); return v && typeof v === "object" && !Array.isArray(v) ? v[id] : undefined; };
      const listeDe = (pg, cle, id) => (lu(pg, cle) || []).filter((x) => x && x.compteId === id);
      const electricien = (tel) => base14.prepare("SELECT * FROM electriciens WHERE telephone = ?").get(tel);
      const lignes = (table, eid) => base14.prepare("SELECT * FROM " + table + " WHERE electricien_id = ? ORDER BY uid").all(eid);
      const actions14 = (action) => base14.prepare("SELECT * FROM activites WHERE action = ?").all(action);
      const clic = async (pg, selecteur, ms) => { const el = pg.doc.querySelector(selecteur); if (el) el.click(); await pause(ms || 400); return Boolean(el); };
      const versProfil = (pg) => clic(pg, "#tiroir-menu [data-ecran='profil']", 900);
      const synchroniserUi = async (pg, ms) => { await versProfil(pg); pg.$("bouton-synchroniser").click(); await pause(ms || 1800); };
      const appelDirect = async (methode, chemin, { jeton, appareil, corps } = {}) => {
        const entetes = { Origin: "https://localhost" };
        if (corps !== undefined) entetes["Content-Type"] = "application/json";
        if (jeton) entetes.Authorization = "Bearer " + jeton;
        if (appareil) entetes["X-Appareil"] = appareil;
        const r = await fetch("http://127.0.0.1:" + port14 + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
        let donnees = null;
        try { donnees = await r.json(); } catch { donnees = null; }
        return { statut: r.status, donnees };
      };
      const TEL = "+22676001122";
      const CODE1 = ["4", "8", "2", "9", "1", "5"];
      const CODE2 = ["7", "3", "0", "2", "6", "4"];
      try {
        /* SY1 — inscription HORS LIGNE : tout reste sur le téléphone, aucune requête. */
        reseau.p1 = false;
        const p1 = ouvrir14("p1", { [K.pres]: "1" });
        await pause(2000);
        p1.remplir("ins-nom", "Awa Kaboré");
        p1.remplir("ins-ville", "Bobo-Dioulasso");
        p1.remplir("ins-telephone", "+226 76 00 11 22");
        p1.taper("ins-code", CODE1);
        p1.taper("ins-confirmation", CODE1);
        p1.$("ins-conditions").checked = true;
        await p1.soumettre("panneau-inscription", 1500);
        const compte14 = (lu(p1, K.comptes) || [])[0] || {};
        const id14 = compte14.id || "";
        if (!id14 || p1.actif() !== "ecran-accueil") sy.liaison.push("inscription hors ligne impossible (" + p1.actif() + ")");
        if (appels14.some((a) => a.statut !== 0)) sy.liaison.push("requête partie sans réseau");
        if (electricien(TEL)) sy.liaison.push("compte créé en ligne sans réseau");
        await versProfil(p1);
        if (p1.$("carte-en-ligne").dataset.liaison !== "a_creer" || !p1.texte("texte-liaison").startsWith("Pas encore relié") || !p1.$("bouton-synchroniser").hidden)
          sy.liaison.push("carte Compte en ligne hors ligne : " + p1.$("carte-en-ligne").dataset.liaison + " « " + p1.texte("texte-liaison") + " »");

        /* Données créées avant la liaison (comme un électricien des étapes 1 à 13). */
        const moteur14 = chargerMoteur();
        const typeVilla = CHANTIERS_TYPES.find((t) => t.cle === "villa");
        const cat14 = Object.fromEntries(Object.entries(moteur14.CATALOGUE_DEFAUT).map(([r, art]) => [r, { ...art }]));
        const maintenant14 = new Date().toISOString();
        const an14 = new Date().getFullYear();
        const devisComplet = { ...moteur14.devisDepuisChiffrage(moteur14.chiffrerChantier(typeVilla.chantier, cat14, "XOF", null)), id: "sy-d1", compteId: id14,
          numero: "BP-" + an14 + "-0001", statut: "envoye", creeLe: maintenant14, modifieLe: maintenant14, titre: "Villa R+1 Sync", client: "M. Ouattara Issa",
          clientTelephone: "+22670554433", lieu: "Bobo-Dioulasso", chantierId: "sy-chantier-01", conditions: "", note: "" };
        const ancienDevis = { id: "sy-l1", compteId: id14, titre: "Ancien chantier", client: "Mme Traoré", total: 185000, statut: "paye", creeLe: new Date(Date.now() - 400 * 864e5).toISOString() };
        const chantier14 = { ...JSON.parse(JSON.stringify(typeVilla.chantier)), id: "sy-chantier-01", compteId: id14, statut: "etudie", etape: 5, etapeMax: 5,
          nom: "Villa Sync", lieu: "Bobo-Dioulasso", type: "villa", client: { nom: "M. Ouattara Issa", telephone: "+22670554433" }, creeLe: maintenant14, modifieLe: maintenant14 };
        const client14 = { id: "sy-k1", compteId: id14, nom: "Mme Traoré", telephone: "+22678001122", creeLe: maintenant14, modifieLe: maintenant14 };
        const catalogue14 = { articles: [{ ref: "prise", designation: "Prise 2P+T 16 A", fournisseurs: [{ nom: "Quincaillerie du Faso", prix: 1750 }, { nom: "Électro Bobo", prix: 1600 }], choisi: null }], mainOeuvre: { points: {}, journee: 15000 } };
        const stockageAvant = { ...p1.stockage(), [K.devis]: JSON.stringify([devisComplet, ancienDevis]), bp_v1_chantiers: JSON.stringify([chantier14]),
          bp_v1_clients: JSON.stringify([client14]), bp_v1_catalogue: JSON.stringify({ [id14]: catalogue14 }) };
        delete stockageAvant[K.session];
        p1.w.close();

        /* Connexion AVEC internet : le compte est créé en ligne et tout part. */
        reseau.p1b = true;
        const p1b = ouvrir14("p1b", stockageAvant);
        await pause(2000);
        p1b.remplir("cnx-telephone", "+226 76 00 11 22");
        p1b.taper("cnx-code", CODE1);
        await p1b.soumettre("panneau-connexion", 4500);
        const ligne14 = electricien(TEL);
        const creation = appels14.find((a) => a.page === "p1b" && a.url.endsWith("/api/compte/creer"));
        const corpsCreation = creation && typeof creation.corps === "string" ? JSON.parse(creation.corps) : {};
        const jeton14 = deCompte(p1b, "bp_v1_jeton_api", id14);
        const liaison14 = deCompte(p1b, "bp_v1_sync", id14) || {};
        const appareil1 = p1b.stockage().bp_v1_appareil;
        if (!creation || creation.statut !== 201 || corpsCreation.compteId !== id14 || corpsCreation.code !== CODE1.join("") || !/^[a-f0-9]{32}$/.test(corpsCreation.appareil || "")
          || creation.entetes["X-Appareil"] !== corpsCreation.appareil || creation.credentials !== "omit") sy.liaison.push("création en ligne : " + (creation ? creation.statut + " " + creation.reponse.slice(0, 120) : "aucun appel"));
        if (!ligne14 || ligne14.compte_id !== id14 || ligne14.nom !== "Awa Kaboré" || ligne14.ville !== "Bobo-Dioulasso") sy.liaison.push("ligne en base : " + JSON.stringify(ligne14 && { compte: ligne14.compte_id, nom: ligne14.nom }));
        if (liaison14.etat !== "liee" || typeof jeton14 !== "string" || !/^v1\./.test(jeton14) || appareil1 !== corpsCreation.appareil) sy.liaison.push("liaison locale : " + JSON.stringify(liaison14));
        if (JSON.stringify(p1b.stockage()).includes(CODE1.join(""))) sy.liaison.push("code secret stocké en clair");
        await versProfil(p1b);
        if (p1b.$("carte-en-ligne").dataset.liaison !== "liee" || p1b.$("bouton-synchroniser").hidden || !/Tout est envoyé/.test(p1b.texte("detail-liaison")))
          sy.liaison.push("carte Compte en ligne : « " + p1b.texte("texte-liaison") + " » « " + p1b.texte("detail-liaison") + " »");

        /* SY2 — tout est arrivé en ligne, validé champ par champ. */
        const eid = ligne14 ? ligne14.id : -1;
        const enLigne = (table) => lignes(table, eid).filter((l) => !l.supprime).map((l) => l.uid).join(",");
        if (enLigne("devis") !== "sy-d1,sy-l1") sy.envoi.push("devis en ligne : " + enLigne("devis"));
        if (enLigne("chantiers") !== "sy-chantier-01") sy.envoi.push("chantiers en ligne : " + enLigne("chantiers"));
        if (enLigne("clients") !== "sy-k1") sy.envoi.push("clients en ligne : " + enLigne("clients"));
        const prixEnLigne = base14.prepare("SELECT f.nom, f.prix FROM catalogue c JOIN fournisseurs f ON f.article_id = c.id WHERE c.electricien_id = ? AND c.ref = 'prise' ORDER BY f.rang").all(eid);
        if (prixEnLigne.map((f) => f.nom + "=" + f.prix).join(",") !== "Quincaillerie du Faso=1750,Électro Bobo=1600") sy.envoi.push("Mes prix en ligne : " + JSON.stringify(prixEnLigne));
        const devisEnLigne = lignes("devis", eid).find((l) => l.uid === "sy-d1");
        if (!devisEnLigne || devisEnLigne.client !== "M. Ouattara Issa" || !(devisEnLigne.total > 0) || devisEnLigne.mois !== maintenant14.slice(0, 7)) sy.envoi.push("devis complet : " + JSON.stringify(devisEnLigne && { client: devisEnLigne.client, total: devisEnLigne.total, mois: devisEnLigne.mois }));
        const fileVide = (pg, id) => { const f = deCompte(pg, "bp_v1_file_sync", id); return !f || !Array.isArray(f.ops) || f.ops.length === 0; };
        if (!fileVide(p1b, id14)) sy.envoi.push("file d'attente non vidée : " + JSON.stringify(deCompte(p1b, "bp_v1_file_sync", id14)).slice(0, 160));
        const syncs = appels14.filter((a) => a.page === "p1b" && a.url.endsWith("/api/sync"));
        if (!syncs.length || !syncs.every((a) => /^Bearer v1\./.test(a.entetes.Authorization || "") && a.entetes["X-Appareil"] === appareil1)) sy.envoi.push("synchronisation sans jeton ou sans identifiant d'appareil");
        /* Client ajouté dans l'écran Mes clients : parti tout seul 2 s après l'enregistrement. */
        await clic(p1b, ".raccourci[data-ecran='clients']", 700);
        p1b.remplir("client-nom", "Entreprise Sanou BTP");
        p1b.remplir("client-telephone", "70 66 55 44");
        await p1b.soumettre("form-client", 3800);
        const sanou = listeDe(p1b, "bp_v1_clients", id14).find((c) => c.nom === "Entreprise Sanou BTP");
        const sanouEnLigne = sanou && lignes("clients", eid).find((l) => l.uid === sanou.id);
        if (!sanouEnLigne || sanouEnLigne.telephone !== "+22670665544") sy.envoi.push("client ajouté non envoyé automatiquement");

        /* SY3 — second téléphone vierge : connexion en ligne, compte recréé, données reçues. */
        const p2 = ouvrir14("p2", { [K.pres]: "1" });
        await pause(2000);
        await clic(p2, "#onglet-connexion", 200);
        p2.remplir("cnx-telephone", "+226 76 00 11 22");
        p2.taper("cnx-code", CODE1);
        await p2.soumettre("panneau-connexion", 4500);
        const compte2 = (lu(p2, K.comptes) || [])[0] || {};
        if (p2.actif() !== "ecran-accueil" || compte2.id !== id14 || compte2.nom !== "Awa Kaboré" || compte2.ville !== "Bobo-Dioulasso" || !compte2.empreinte)
          sy.second.push("connexion sur un téléphone vierge : " + p2.actif() + " " + JSON.stringify({ id: compte2.id === id14, nom: compte2.nom }));
        const ids2 = (cle) => listeDe(p2, cle, id14).map((x) => x.id).sort().join(",");
        if (ids2(K.devis) !== "sy-d1,sy-l1" || ids2("bp_v1_chantiers") !== "sy-chantier-01" || ids2("bp_v1_clients") !== [sanou && sanou.id, "sy-k1"].sort().join(","))
          sy.second.push("données reçues : devis " + ids2(K.devis) + " · chantiers " + ids2("bp_v1_chantiers") + " · clients " + ids2("bp_v1_clients"));
        const recu = listeDe(p2, K.devis, id14).find((d) => d.id === "sy-d1");
        if (!recu || !Array.isArray(recu.lignes) || recu.lignes.length !== devisComplet.lignes.length || recu.client !== "M. Ouattara Issa") sy.second.push("devis reçu incomplet");
        const cat2 = deCompte(p2, "bp_v1_catalogue", id14);
        if (!cat2 || !Array.isArray(cat2.articles) || !cat2.articles.some((a) => a.ref === "prise" && a.fournisseurs.length === 2)) sy.second.push("Mes prix non reçus");
        const appareil2 = p2.stockage().bp_v1_appareil;
        if (!appareil2 || appareil2 === appareil1) sy.second.push("même identifiant d'appareil sur deux téléphones");
        await clic(p2, ".raccourci[data-ecran='devis'], [data-ecran='devis']", 900);
        if (!p2.doc.querySelector("#liste-devis [data-element='sy-d1']")) sy.second.push("devis reçu absent de Mes devis");

        /* SY4 — suppression sur un téléphone → disparaît sur l'autre ; file hors ligne envoyée au retour du réseau. */
        await clic(p2, "#tiroir-menu [data-ecran='accueil'], [data-ecran='accueil']", 300);
        await clic(p2, ".raccourci[data-ecran='clients']", 700);
        await clic(p2, "#liste-clients [data-supprimer-client='" + (sanou ? sanou.id : "x") + "']", 100);
        await pause(60);
        p2.$("bouton-modale-ok").click();
        await pause(3800);
        const sanouApres = sanou && lignes("clients", eid).find((l) => l.uid === sanou.id);
        if (!sanouApres || sanouApres.supprime !== 1) sy.suppression.push("suppression non envoyée");
        await synchroniserUi(p1b);
        if (listeDe(p1b, "bp_v1_clients", id14).some((c) => sanou && c.id === sanou.id)) sy.suppression.push("client supprimé encore présent sur l'autre téléphone");
        if (p1b.texte("msg-en-ligne") !== "Copie en ligne à jour.") sy.suppression.push("« Synchroniser maintenant » : « " + p1b.texte("msg-en-ligne") + " »");
        reseau.p1b = false;
        await clic(p1b, "#tiroir-menu [data-ecran='accueil'], [data-ecran='accueil']", 300);
        await clic(p1b, ".raccourci[data-ecran='clients']", 700);
        p1b.remplir("client-nom", "M. Zerbo Ousmane");
        p1b.remplir("client-telephone", "76 12 34 56");
        await p1b.soumettre("form-client", 3000);
        const zerbo = listeDe(p1b, "bp_v1_clients", id14).find((c) => c.nom === "M. Zerbo Ousmane");
        const fileHors = deCompte(p1b, "bp_v1_file_sync", id14);
        if (!zerbo || !fileHors || !fileHors.ops.some((o) => o.type === "client" && o.id === zerbo.id)) sy.horsLigne.push("client ajouté hors ligne absent de la file d'attente");
        await versProfil(p1b);
        p1b.$("bouton-synchroniser").click();
        await pause(300);
        if (!/Pas de connexion internet/.test(p1b.texte("msg-en-ligne")) || !/1 changement en attente d'envoi/.test(p1b.texte("detail-liaison")))
          sy.horsLigne.push("hors ligne : « " + p1b.texte("msg-en-ligne") + " » « " + p1b.texte("detail-liaison") + " »");
        reseau.p1b = true;
        p1b.$("bouton-synchroniser").click();
        await pause(1800);
        if (!zerbo || !lignes("clients", eid).some((l) => l.uid === zerbo.id && !l.supprime) || !fileVide(p1b, id14)) sy.horsLigne.push("file non envoyée au retour du réseau");

        /* SY5 — le compteur du mois est commun ; une formule falsifiée est remplacée par celle du compte en ligne. */
        /* Mêmes données qu'un ancien devis envoyé par l'application, datées d'aujourd'hui. */
        const envoiAncien = appels14.map((a) => { try { return JSON.parse(a.corps).operations.find((o) => o.id === "sy-l1"); } catch { return null; } }).find(Boolean);
        const legacy = (n) => ({ type: "devis", id: "sy-q" + n, action: "ecrire", quand: new Date().toISOString(),
          donnees: { ...(envoiAncien ? envoiAncien.donnees : {}), id: "sy-q" + n, client: "Client " + n, creeLe: new Date().toISOString() } });
        const lot = await appelDirect("POST", "/api/sync", { jeton: deCompte(p1b, "bp_v1_jeton_api", id14), appareil: appareil1, corps: { curseur: 0, abonnement: "", operations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(legacy) } });
        const refuses = lot.donnees && Array.isArray(lot.donnees.resultats) ? lot.donnees.resultats.filter((x) => !x.ok).map((x) => x.id + ":" + x.erreur) : ["réponse " + lot.statut];
        /* 1 devis du mois + 4 = limite Gratuit ; 5 créés hors ligne tolérés (marqués hors limite) ; le suivant est refusé. */
        if (refuses.join(",") !== "sy-q10:limite_atteinte") sy.quota.push("limite Gratuit en ligne : " + refuses.join(","));
        const utilises = lot.donnees && lot.donnees.quota ? lot.donnees.quota.utilises : -1;
        if (utilises !== 10) sy.quota.push("compteur en ligne : " + utilises);
        await synchroniserUi(p2);
        const mois2 = deCompte(p2, "bp_v1_devis_mois", id14);
        if (!mois2 || mois2.nombre !== 10) sy.quota.push("compteur reçu sur l'autre téléphone : " + JSON.stringify(mois2));
        const faux = await jetonAbo({ v: 1, compteId: id14, telephone: TEL, formule: "vie", debut: maintenant14, fin: null, emisLe: maintenant14 });
        const abo1 = { ...(lu(p1b, "bp_v1_abonnement") || {}), [id14]: faux };
        p1b.w.localStorage.setItem("bp_v1_abonnement", JSON.stringify(abo1));
        await synchroniserUi(p1b);
        if (deCompte(p1b, "bp_v1_abonnement", id14) === faux) sy.quota.push("formule falsifiée gardée");
        if (!actions14("abonnement_falsifie").some((a) => a.electricien_id === eid)) sy.quota.push("falsification non journalisée en ligne");
        if (electricien(TEL).formule !== "gratuit") sy.quota.push("formule en ligne modifiée par le téléphone");

        /* SY6 — changement de code : confirmé en ligne ; hors ligne refusé ; l'autre téléphone se reconnecte avec le nouveau code. */
        reseau.p2 = false;
        await versProfil(p2);
        const empreinteAvant = ((lu(p2, K.comptes) || [])[0] || {}).empreinte;
        p2.taper("pro-ancien", CODE1);
        p2.taper("pro-nouveau", CODE2);
        p2.taper("pro-confirmation", CODE2);
        await p2.soumettre("carte-code", 1200);
        if (p2.texte("msg-code") !== "Connexion internet nécessaire : votre compte est relié, ce changement doit être confirmé en ligne." || ((lu(p2, K.comptes) || [])[0] || {}).empreinte !== empreinteAvant)
          sy.code.push("changement hors ligne : « " + p2.texte("msg-code") + " »");
        reseau.p2 = true;
        for (const id of ["pro-ancien", "pro-nouveau", "pro-confirmation"]) p2.taper(id, Array(6).fill("Backspace"));
        p2.taper("pro-ancien", CODE1);
        p2.taper("pro-nouveau", CODE2);
        p2.taper("pro-confirmation", CODE2);
        await p2.soumettre("carte-code", 2500);
        const ancienRefuse = await appelDirect("POST", "/api/compte/connexion", { appareil: "0123456789abcdef0123456789abcdef", corps: { telephone: TEL, code: CODE1.join(""), appareil: "0123456789abcdef0123456789abcdef" } });
        if (((lu(p2, K.comptes) || [])[0] || {}).empreinte === empreinteAvant || ancienRefuse.statut !== 401) sy.code.push("nouveau code non confirmé en ligne (" + ancienRefuse.statut + ") « " + p2.texte("msg-code") + " »");
        await synchroniserUi(p1b, 1500);
        if ((deCompte(p1b, "bp_v1_sync", id14) || {}).etat !== "expiree" || deCompte(p1b, "bp_v1_jeton_api", id14)) sy.code.push("ancien jeton encore accepté après le changement de code");
        p1b.$("bouton-deconnexion-profil").click();
        await pause(1500);
        p1b.remplir("cnx-telephone", "+226 76 00 11 22");
        p1b.taper("cnx-code", CODE2);
        await p1b.soumettre("panneau-connexion", 4000);
        const compte1b = (lu(p1b, K.comptes) || []).find((c) => c.id === id14) || {};
        if (p1b.actif() !== "ecran-accueil" || (deCompte(p1b, "bp_v1_sync", id14) || {}).etat !== "liee" || compte1b.empreinte === compte14.empreinte || !deCompte(p1b, "bp_v1_jeton_api", id14))
          sy.code.push("reconnexion avec le nouveau code : " + p1b.actif() + " " + JSON.stringify(deCompte(p1b, "bp_v1_sync", id14)));
        if (listeDe(p1b, K.devis, id14).length < 2) sy.code.push("données perdues à la reconnexion");

        /* SY7 — déconnexion : la session de CE téléphone est fermée en ligne. */
        const jetonAvantSortie = deCompte(p1b, "bp_v1_jeton_api", id14);
        p1b.$("bouton-deconnexion").click();
        await pause(2500);
        const apres = await appelDirect("POST", "/api/sync", { jeton: jetonAvantSortie, appareil: appareil1, corps: { curseur: 0, abonnement: "", operations: [] } });
        if (p1b.actif() !== "ecran-connexion" || deCompte(p1b, "bp_v1_jeton_api", id14) || apres.statut !== 401) sy.sortie.push("déconnexion : " + p1b.actif() + ", ancien jeton → " + apres.statut);
        const reste2 = await appelDirect("GET", "/api/profil", { jeton: deCompte(p2, "bp_v1_jeton_api", id14), appareil: appareil2 });
        if (reste2.statut !== 200) sy.sortie.push("l'autre téléphone a été déconnecté aussi (" + reste2.statut + ")");

        /* SY8 + SY9 — tableau d'administration (appui long sur le logo), codes d'activation, journal, suspension. */
        await clic(p2, "#tiroir-menu [data-ecran='a-propos']", 200);
        const logo14 = p2.$("logo-apropos");
        logo14.dispatchEvent(new p2.w.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
        await pause(3150);
        p2.$("adm-code").value = CODE_ADM14;
        await p2.soumettre("form-admin", 2500);
        const tuiles = [...p2.doc.querySelectorAll("#admin-chiffres .admin-tuile")].map((li) => li.querySelector("span").textContent + "=" + li.querySelector("strong").textContent);
        if (p2.$("admin-tableau").hidden || !tuiles.includes("Électriciens=1") || !tuiles.includes("Devis ce mois=10") || !tuiles.includes("Devis hors limite ce mois=5") || !tuiles.includes("Formules falsifiées (30 j)=1"))
          sy.admin.push("tableau de bord : " + tuiles.join(" · "));
        const ligneAdm = p2.doc.querySelector("#admin-electriciens .admin-ligne");
        if (!ligneAdm || !ligneAdm.textContent.includes("Awa Kaboré") || !ligneAdm.textContent.includes("Bobo-Dioulasso")) sy.admin.push("liste des électriciens");
        if (![...p2.doc.querySelectorAll("#admin-journal strong")].some((s) => s.textContent === "abonnement_falsifie")) sy.admin.push("journal sans la falsification");
        p2.remplir("adm-recherche", "Ouédraogo");
        await p2.soumettre("form-adm-recherche", 800);
        if (p2.doc.querySelectorAll("#admin-electriciens .admin-ligne").length !== 0 || p2.$("admin-electriciens-vide").hidden) sy.admin.push("recherche sans résultat mal affichée");
        p2.remplir("adm-recherche", "76001122");
        await p2.soumettre("form-adm-recherche", 800);
        if (p2.doc.querySelectorAll("#admin-electriciens .admin-ligne").length !== 1) sy.admin.push("recherche par numéro");
        p2.$("bouton-adm-csv").click();
        await pause(800);
        if (!/^Export téléchargé : batiplus-electriciens-\d{4}-\d{2}-\d{2}\.csv$/.test(p2.texte("msg-tableau-admin"))) sy.admin.push("export CSV : « " + p2.texte("msg-tableau-admin") + " »");
        p2.choisir("adm-codes-formule", "mensuel");
        p2.choisir("adm-codes-nombre", "1");
        p2.remplir("adm-codes-motif", "abc");
        await p2.soumettre("form-adm-codes", 400);
        const codesAvant = base14.prepare("SELECT COUNT(*) AS n FROM codes_activation").get().n;
        if (!p2.texte("err-adm-codes-motif") || codesAvant !== 0) sy.admin.push("code créé sans motif");
        p2.remplir("adm-codes-motif", "Formation électriciens Bobo");
        await p2.soumettre("form-adm-codes", 1200);
        const codesUi = [...p2.doc.querySelectorAll("#admin-codes-generes li")].map((li) => li.textContent);
        if (codesUi.length !== 1 || !/^BP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codesUi[0] || "")) sy.admin.push("codes générés : " + codesUi.join(","));
        const enClair = base14.prepare("SELECT * FROM codes_activation").all().some((c) => JSON.stringify(c).includes(codesUi[0]));
        if (enClair) sy.admin.push("code d'activation stocké en clair en base");
        /* Suspension : confirmation fausse refusée sans appel, puis suspension et réactivation. */
        const nbAppels = () => appels14.filter((a) => a.url.endsWith("/api/admin/suspendre")).length;
        await clic(p2, "#admin-electriciens button[data-action='suspendre']", 200);
        p2.$("adm-motif").value = "Contrôle de la procédure";
        p2.$("adm-confirmation").value = "+22670000000";
        p2.$("bouton-modale-ok").click();
        await pause(400);
        if (nbAppels() !== 0 || p2.texte("msg-tableau-admin") !== "La confirmation ne correspond pas : action annulée.") sy.admin.push("confirmation fausse : « " + p2.texte("msg-tableau-admin") + " »");
        await clic(p2, "#admin-electriciens button[data-action='suspendre']", 200);
        p2.$("adm-motif").value = "Contrôle de la procédure";
        p2.$("adm-confirmation").value = "+226 76 00 11 22";
        p2.$("bouton-modale-ok").click();
        await pause(1200);
        if (electricien(TEL).suspendu !== 1 || !p2.texte("msg-tableau-admin").startsWith("Compte suspendu")) sy.admin.push("suspension : « " + p2.texte("msg-tableau-admin") + " »");
        const suspendu = await appelDirect("GET", "/api/profil", { jeton: deCompte(p2, "bp_v1_jeton_api", id14), appareil: appareil2 });
        if (suspendu.statut !== 401 && suspendu.statut !== 403) sy.admin.push("compte suspendu encore servi (" + suspendu.statut + ")");
        const reactiver = p2.doc.querySelector("#admin-electriciens button[data-action='suspendre']");
        if (!reactiver || reactiver.textContent !== "Réactiver") sy.admin.push("bouton Réactiver absent");
        else {
          reactiver.click();
          await pause(200);
          p2.$("adm-motif").value = "Fin du contrôle";
          p2.$("adm-confirmation").value = TEL;
          p2.$("bouton-modale-ok").click();
          await pause(1200);
        }
        if (electricien(TEL).suspendu !== 0) sy.admin.push("réactivation non enregistrée");
        if (actions14("suspension").length !== 1 || actions14("reactivation").length !== 1 || actions14("admin_codes").length !== 1 || !actions14("admin_connexion").length)
          sy.admin.push("actions d'administration mal journalisées");
        p2.$("bouton-adm-quitter").click();
        await pause(300);
        if (!p2.$("admin-tableau").hidden || p2.doc.querySelectorAll("#admin-codes-generes li").length) sy.admin.push("Quitter laisse le tableau ou les codes affichés");

        /* SY8 — code d'activation saisi par l'électricien (la suspension a fermé sa session : reconnexion). */
        p2.$("bouton-deconnexion").click();
        await pause(2000);
        p2.remplir("cnx-telephone", "+226 76 00 11 22");
        p2.taper("cnx-code", CODE2);
        await p2.soumettre("panneau-connexion", 4000);
        await clic(p2, "#tiroir-menu [data-ecran='abonnement']", 900);
        p2.remplir("abo-code", "BP-2345");
        await p2.soumettre("form-code-activation", 300);
        if (!p2.texte("err-abo-code").startsWith("Format attendu")) sy.activation.push("code mal formé accepté");
        p2.remplir("abo-code", (codesUi[0] || "").toLowerCase().replace(/-/g, " "));
        await p2.soumettre("form-code-activation", 2000);
        const aboRecu = deCompte(p2, "bp_v1_abonnement", id14);
        let charge14 = null;
        try { charge14 = JSON.parse(Buffer.from(String(aboRecu).split(".")[0], "base64url").toString("utf8")); } catch { charge14 = null; }
        if (!/^Code accepté : formule Pro mensuel activée jusqu'au /.test(p2.texte("msg-activation")) || !charge14 || charge14.formule !== "mensuel" || charge14.compteId !== id14 || electricien(TEL).formule !== "mensuel")
          sy.activation.push("activation : « " + p2.texte("msg-activation") + " » " + JSON.stringify(charge14));
        p2.remplir("abo-code", codesUi[0] || "");
        await p2.soumettre("form-code-activation", 1500);
        if (p2.texte("msg-activation") !== "Code d'activation invalide, expiré ou déjà utilisé.") sy.activation.push("code réutilisé : « " + p2.texte("msg-activation") + " »");

        /* SY10 — suppression du compte : code demandé, ligne anonymisée en ligne, téléphone vidé. */
        await versProfil(p2);
        p2.$("bouton-supprimer-compte").click();
        await pause(200);
        p2.$("bouton-modale-ok").click();
        await pause(300);
        p2.$("sup-code").value = "111111";
        p2.$("bouton-modale-ok").click();
        await pause(1500);
        if (p2.texte("msg-en-ligne") !== "Code incorrect." || !electricien(TEL)) sy.effacement.push("mauvais code : « " + p2.texte("msg-en-ligne") + " »");
        p2.$("bouton-supprimer-compte").click();
        await pause(200);
        p2.$("bouton-modale-ok").click();
        await pause(300);
        p2.$("sup-code").value = CODE2.join("");
        p2.$("bouton-modale-ok").click();
        await pause(2000);
        const anonyme = base14.prepare("SELECT * FROM electriciens WHERE id = ?").get(eid);
        if (electricien(TEL) || !anonyme || anonyme.nom !== "Compte supprimé" || lignes("devis", eid).length || lignes("clients", eid).length || lignes("chantiers", eid).length)
          sy.effacement.push("en ligne : " + JSON.stringify(anonyme && { nom: anonyme.nom, devis: lignes("devis", eid).length }));
        const reste = p2.stockage();
        if ((lu(p2, K.comptes) || []).length || listeDe(p2, K.devis, id14).length || JSON.stringify(reste).includes(id14) || p2.actif() !== "ecran-connexion")
          sy.effacement.push("téléphone : " + p2.actif() + " " + Object.keys(reste).filter((c) => reste[c].includes(id14)).join(","));
      } catch (erreur) {
        sy.liaison.push("exception : " + erreur.message);
      } finally {
        for (const pg of pages14) pg.w.close();
        await pause(300);
        await api14.arreter();
        effacerTemp(dossier14, { recursive: true, force: true });
      }
      const ligneSy = (id, libelle, liste, ok) => controle(id, libelle, liste.length === 0, liste.join(" ; ") || ok);
      ligneSy("SY1", "compte relié en ligne à la première connexion avec internet", sy.liaison,
        "inscription hors ligne : aucune requête, « Pas encore relié » ; connexion avec internet → POST /api/compte/creer (même identifiant de compte, identifiant d'appareil 32 hex, credentials omit), jeton gardé par compte, code jamais stocké en clair, carte « Compte relié · Tout est envoyé »");
      ligneSy("SY2", "toutes les données locales partent en ligne", sy.envoi,
        "devis complet + ancien devis, chantier, client, Mes prix (2 fournisseurs) envoyés et validés en ligne ; file d'attente vidée ; client ajouté dans Mes clients envoyé seul 2 s après");
      ligneSy("SY3", "second téléphone : connexion en ligne et données reçues", sy.second,
        "téléphone vierge → compte recréé (profil en ligne, empreinte locale du code), devis/chantiers/clients/Mes prix reçus et revalidés, devis visible dans Mes devis, identifiant d'appareil distinct");
      ligneSy("SY4", "suppressions propagées, file hors ligne envoyée au retour du réseau", [...sy.suppression, ...sy.horsLigne],
        "client supprimé sur un téléphone → marqué supprimé en ligne → retiré de l'autre ; « Copie en ligne à jour. » ; hors ligne : ajout gardé en file (« 1 changement en attente d'envoi »), envoyé dès le retour du réseau");
      ligneSy("SY5", "compteur du mois commun, formule falsifiée remplacée", sy.quota,
        "limite Gratuit appliquée en ligne (5 devis du mois, 5 de plus tolérés hors ligne et signalés, le suivant refusé) ; compteur 10 reçu sur l'autre téléphone ; jeton Lifetime signé par une autre clé → refusé, journalisé, effacé du téléphone ; formule en ligne inchangée");
      ligneSy("SY6", "changement de code confirmé en ligne", sy.code,
        "hors ligne : refusé avec message clair ; en ligne : nouveau code actif, ancien refusé, nouvelle empreinte locale ; anciennes sessions invalidées → l'autre téléphone passe en pause puis se reconnecte avec le nouveau code sans perdre ses données");
      ligneSy("SY7", "déconnexion : session de ce téléphone fermée en ligne", sy.sortie,
        "Se déconnecter → jeton oublié, retour à l'écran de connexion, l'ancien jeton reçoit 401 ; l'autre téléphone reste connecté");
      ligneSy("SY8", "code d'activation offert : formule Pro vérifiée sur l'appareil", sy.activation,
        "format contrôlé sur place ; code saisi en minuscules avec espaces normalisé → POST /api/abonnement/activer-code → jeton signé vérifié avec la clé publique, Pro mensuel actif ; code réutilisé refusé");
      ligneSy("SY9", "tableau d'administration branché sur l'API", sy.admin,
        "appui long 3 s + code → chiffres clés (1 électricien, 10 devis dont 5 hors limite, 1 falsification), liste, recherche, export CSV, journal ; codes : motif obligatoire, code jamais stocké en clair ; suspension : confirmation retapée (fausse → aucun appel), suspension effective, Réactiver ; Quitter efface tout");
      ligneSy("SY10", "suppression du compte en ligne et sur le téléphone", sy.effacement,
        "deux confirmations + code secret ; mauvais code refusé ; bon code → DELETE /api/compte : ligne anonymisée, devis/chantiers/clients effacés en ligne ; téléphone : compte et données effacés, retour à l'écran de connexion");
    }

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
    "@capacitor/filesystem", "@capacitor/local-notifications", "@capacitor/network",
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
    /* Étape 13 : permissions APRÈS fusion des plugins contrôlées par PM (verifier-android.mjs). */
    const { finales } = permissionsFusionnees();
    android = "android/ présent, applicationId correct, " + finales.length + " permissions après fusion (détail : PM)";
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

/* ---------- Étape 10 : sécurité du front (㊸ ㊹ ㊺ ㊻ VR CO SW AN CS) ---------- */

function fichiersTexte(dossier) {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersTexte(chemin);
    return /\.(html|js|mjs|css|json|webmanifest|svg|txt|xml)$/.test(entree.name) ? [chemin] : [];
  });
}

function controlesEtape10() {
  const domOn = etape10.dom.filter((t) => / : attribut on/.test(t));
  const domAutres = etape10.dom.filter((t) => !/ : attribut on/.test(t));

  /* ㊸ Aucune donnée interprétée comme du HTML. */
  const puits = [
    [/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/g, "innerHTML/outerHTML/insertAdjacentHTML/document.write"],
    [/\bsrcdoc\b/g, "srcdoc"], [/\bDOMParser\b/g, "DOMParser"], [/createContextualFragment/g, "createContextualFragment"],
    [/javascript:/gi, "javascript:"], [/\.setAttribute\(\s*["'](href|src)["']\s*,\s*(?!"#"\s*\+)[^"')\s]/g, "setAttribute(href|src, donnée)"]
  ].map(([re, nom]) => [compter(js, re) + compter(corpsSansScript, re), nom]).filter(([n]) => n > 0);
  controle("㊸", "aucune injection HTML (sources et rendu)", puits.length === 0 && domAutres.length === 0 && etape10.pagesVues >= 6,
    puits.map(([n, nom]) => n + " × " + nom).concat(domAutres.slice(0, 4)).join(" ; ")
      || "0 innerHTML, srcdoc, DOMParser, createContextualFragment, javascript: ; " + etape10.pagesVues + " pages rendues avec données piégées inspectées : une seule balise <script>, aucun cadre ni objet, liens https/tel/# seulement, images locales ou data:image webp/jpeg/png");

  /* ㊹ Aucun code exécuté depuis une chaîne ni gestionnaire en attribut. */
  const evalues = [/\beval\s*\(/, /\bFunction\s*\(/, /setTimeout\(\s*["'`]/, /setInterval\(\s*["'`]/, /\.setAttribute\(\s*["']on/i, /\.on(click|load|error|input|change|submit|key\w+|focus\w*|blur|mouse\w+|pointer\w+|touch\w+|message|animation\w+|transition\w+)\s*=\s*["'`]/, /import\(\s*[^"'`]/]
    .filter((re) => re.test(js)).map(String);
  const attributsOn = /\son[a-z]+\s*=/i.test(corpsSansScript);
  controle("㊹", "aucun eval, Function, minuterie en chaîne ni attribut on*", evalues.length === 0 && !attributsOn && domOn.length === 0,
    evalues.concat(attributsOn ? ["attribut on* dans le HTML"] : [], domOn.slice(0, 3)).join(" ; ")
      || "sources sans eval/Function/setTimeout(\"…\")/setAttribute(\"on…\") ; aucun attribut on* dans le HTML livré ni dans le DOM après rendu des noms piégés « <img onerror> »");

  /* ㊺ Aucun secret dans ce qui part sur le téléphone. */
  const motifs = /(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["'])/i;
  const fichiers = fichiersTexte(WWW);
  const fuites = fichiers.filter((f) => motifs.test(readFileSync(f, "utf8"))).map((f) => f.slice(WWW.length + 1));
  const envDansWww = readdirSync(WWW).some((f) => f.startsWith(".env"));
  const ignore = readFileSync(join(RACINE, ".gitignore"), "utf8");
  const envIgnore = /^\.env$/m.test(ignore) && /^\*\.keystore$/m.test(ignore) && /^keystore\.properties$/m.test(ignore);
  const apiHttps = /const API_URL = "https:\/\/[^"]+";/.test(js);
  controle("㊺", "aucun secret dans l'application livrée", fuites.length === 0 && !envDansWww && envIgnore && apiHttps,
    fuites.join(", ") || (envDansWww ? ".env copié dans www/" : !envIgnore ? ".env ou keystore non ignoré par git" : !apiHttps ? "API_URL non https"
      : fichiers.length + " fichiers texte de www/ scannés (clés AWS/Google/GitHub/Slack, JWT, clés privées, mots de passe) : rien ; seule configuration = API_URL https ; .env et keystores ignorés par git"));

  /* ㊻ Saisies : un seul fichier de règles, le même au téléphone et (étape 14) en ligne. */
  const regles = [];
  if (!js.includes(codeGele(REGLES))) regles.push("règles injectées ≠ src/regles-saisie.json");
  let unitaires = 0;
  try {
    const m = chargerMoteur();
    if (JSON.stringify(m.REGLES_SAISIE) !== JSON.stringify(REGLES)) regles.push("REGLES_SAISIE du moteur ≠ fichier");
    if (!Object.isFrozen(m.REGLES_SAISIE.nombres.prix)) regles.push("règles non gelées");
    const cas = [["-5", NaN], ["1,234", NaN], ["Infinity", NaN], ["1e3", NaN], ["0x10", NaN], ["1.5.2", NaN], ["abc", NaN], ["", NaN],
      ["1 500,5", 1500.5], ["12,", 12], [",5", 0.5], ["1\u202f000\u00a0000", 1000000], ["  42  ", 42], ["0", 0]];
    for (const [entree, attendu] of cas) {
      const lu = m.lireNombre(entree);
      unitaires += 1;
      if (!Object.is(lu, attendu)) regles.push("lireNombre(« " + entree + " ») = " + lu);
    }
  } catch (erreur) { regles.push("moteur : " + erreur.message); }
  const utilisees = [...corpsSansScript.matchAll(/data-regle="([^"]*)"/g), ...js.matchAll(/regle\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
  const inconnues = [...new Set(utilisees.filter((nom) => !Object.prototype.hasOwnProperty.call(REGLES.nombres, nom)))];
  if (inconnues.length) regles.push("règles inconnues : " + inconnues.join(", "));
  const champsStatiques = [...corpsSansScript.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
  const sansRegle = champsStatiques.filter((c) => /inputmode="(decimal|numeric)"/.test(c) && !/type="password"/.test(c) && !/data-regle="/.test(c)).map((c) => (c.match(/id="([^"]+)"/) || [])[1]);
  if (sansRegle.length) regles.push("champs numériques sans règle : " + sansRegle.join(", "));
  const sansMax = champsStatiques.filter((c) => /type="(text|tel|search|password)"/.test(c) && !/inputmode="(decimal|numeric)"/.test(c)
    && !(Number((c.match(/maxlength="(\d+)"/) || [])[1]) <= REGLES.textes.court.max)).map((c) => (c.match(/id="([^"]+)"/) || [])[1]);
  if (sansMax.length) regles.push("champs texte sans maxlength borné : " + sansMax.join(", "));
  const zones = [...corpsSansScript.matchAll(/<textarea\b[^>]*>/g)].filter((m) => !(Number((m[0].match(/maxlength="(\d+)"/) || [])[1]) <= REGLES.textes.long.max));
  if (zones.length) regles.push(zones.length + " zone(s) de texte sans maxlength");
  regles.push(...etape10.saisie.slice(0, 6));
  if (!etape10.fait || etape10.champsVus < 40) regles.push("contrôle à l'exécution incomplet (" + etape10.champsVus + " champs vus)");
  controle("㊻", "saisies bornées par un fichier de règles unique", regles.length === 0,
    regles.join(" ; ") || Object.keys(REGLES.nombres).length + " règles numériques (src/regles-saisie.json, gelées, reprises par l'API à l'étape 14) ; "
      + utilisees.length + " champs liés à une règle connue ; " + etape10.champsVus + " champs numériques vus à l'exécution, tous avec règle ; textes ≤ "
      + REGLES.textes.court.max + " car., zones ≤ " + REGLES.textes.long.max + " ; lireNombre : " + unitaires + " cas (négatif, 1e3, Infinity, 3 décimales refusés) ; "
      + etape10.cas.join(", ") + " avec message « Saisie refusée : … » sans écho et valeur précédente rétablie");

  /* VR Verrouillage automatique. */
  controle("VR", "verrouillage après 15 min d'inactivité, retour au même écran", etape10.fait && etape10.verrou.length === 0,
    etape10.verrou.join(" ; ") || (etape10.fait
      ? "relance : session > 15 min, sans date, datée dans le futur ou illisible → verrou ; < 15 min → accueil ; en cours : 14 min → rien, 15 min + retour dans l'app → verrou ; liens vers accueil/devis/profil inopérants, retour Android = quitter ; saisie en cours enregistrée ; mauvais code compté (4 essais restants), bon code → même écran, saisie intacte ; 5 échecs → blocage (bon code refusé pendant le blocage) ; « Changer de compte » ferme la session"
      : "contrôle non exécuté"));

  /* CO Codes secrets trop simples. */
  const triviaux = /if \(\/\^\(\\d\{1,3\}\)\\1\+\$\/\.test\(code\)\) return true;/.test(js);
  controle("CO", "codes secrets trop simples refusés", etape10.fait && etape10.codes.length === 0 && triviaux,
    etape10.codes.join(" ; ") || (triviaux ? "0000, 1111, 4545, 1212, 121212, 123123, 1234, 123456, 654321, 9876, 7890, 0123, 1990, 2026 refusés ; 2580 accepté ; empreinte PBKDF2-SHA-256 " + "150 000 itérations, sel de 16 octets" : "règle des motifs répétés absente"));

  /* SW Pas de service worker (rien d'API mis en cache). */
  const sw = /serviceWorker/.test(js) || readdirSync(WWW).some((f) => /(^sw|worker)\.js$/i.test(f));
  controle("SW", "aucun service worker, donc aucune réponse d'API en cache", !sw,
    sw ? "service worker présent : exclure /api/ du cache" : "ni serviceWorker.register ni sw.js : l'application est embarquée dans l'APK, aucune réponse d'API n'est mise en cache");

  /* AN Réglages Android. */
  const manifeste = readFileSync(join(RACINE, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  const extraction = readFileSync(join(RACINE, "android", "app", "src", "main", "res", "xml", "regles_extraction.xml"), "utf8");
  const config = JSON.parse(readFileSync(join(RACINE, "capacitor.config.json"), "utf8"));
  const android = [];
  if (!/android:allowBackup="false"/.test(manifeste) || !/android:fullBackupContent="false"/.test(manifeste)) android.push("sauvegarde Android active");
  if (!/android:dataExtractionRules="@xml\/regles_extraction"/.test(manifeste)) android.push("dataExtractionRules absent");
  for (const bloc of ["cloud-backup", "device-transfer"]) {
    const contenu = (extraction.match(new RegExp("<" + bloc + ">([\\s\\S]*?)</" + bloc + ">")) || [])[1] || "";
    for (const domaine of ["root", "file", "database", "sharedpref", "external"]) if (!contenu.includes('domain="' + domaine + '" path="."')) android.push(bloc + " : " + domaine + " non exclu");
  }
  if (!/android:usesCleartextTraffic="false"/.test(manifeste)) android.push("trafic en clair autorisé");
  if (config.android?.webContentsDebuggingEnabled !== false || config.android?.allowMixedContent !== false || config.server?.cleartext) android.push("capacitor.config.json permissif");
  if (/android:exported="true"[^>]*FileProvider|FileProvider[^>]*android:exported="true"/.test(manifeste)) android.push("FileProvider exporté");
  controle("AN", "Android : aucune sauvegarde système, aucun trafic en clair, débogage coupé", android.length === 0,
    android.join(" ; ") || "allowBackup/fullBackupContent false, cloud-backup et device-transfer excluent tout, usesCleartextTraffic false, WebView non débogable, contenu mixte refusé, FileProvider non exporté");

  /* CS CSP durcie et garde anti-encadrement. */
  const cspMeta = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
  const directives = ["default-src 'self'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "media-src 'none'", "upgrade-insecure-requests"];
  const manquantes = directives.filter((d) => !cspMeta.includes(d));
  const connect = ((cspMeta.match(/connect-src ([^;]+)/) || [])[1] || "").trim().split(/\s+/);
  const connectOk = connect[0] === "'self'" && connect.slice(1).every((s) => /^https:\/\/[a-z0-9.-]+$/.test(s));
  const garde = /function pageEncadree\(/.test(js) && /window\.top !== window\.self|window\.self !== window\.top/.test(js);
  controle("CS", "CSP durcie, connexions https seulement, garde anti-encadrement", manquantes.length === 0 && connectOk && garde && !/frame-ancestors/.test(cspMeta),
    manquantes.length ? "manquant : " + manquantes.join(", ") : !connectOk ? "connect-src : " + connect.join(" ") : !garde ? "garde anti-encadrement absente"
      : directives.join(", ") + " ; connect-src " + connect.join(" ") + " ; dans un cadre, l'application ne s'affiche pas (frame-ancestors ira dans les en-têtes HTTP à l'étape 14)");
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

/* ---------- Étape 11 : abonnement ---------- */
function controlesEtape11() {
  const absent = etape11.fait ? [] : ["parcours jsdom de l'étape 11 non exécuté"];
  const formules = [...absent, ...etape11.formules];
  controle("㊼", "les 5 formules ont une couleur, une icône, un badge", formules.length === 0,
    formules.join(" ; ") || "Gratuit gris (cadeau, POUR DÉMARRER), Pass semaine jaune (éclair, SANS ENGAGEMENT), Pro mensuel violet (trophée, LE PLUS CHOISI, 6 % plus haute), Pro annuel vert (calendrier, 2 MOIS OFFERTS), Lifetime noir et jaune (infini, À VIE) ; prix croissants 0 → 60 000 FCFA ; Ma formule : « Votre abonnement gratuit n'a pas de date de fin. » / « Votre Pro mensuel se termine le … — 24 jours restants. » + jauge ; FAQ 3 questions");
  const logos = [...absent, ...etape11.logos];
  controle("㊽", "les logos de paiement sont présents", logos.length === 0,
    logos.join(" ; ") || "7 moyens (Orange Money, Moov Money, Wave, Telecel Money, Visa, Mastercard, CinetPay) : logo officiel s'il est fourni dans www/images/paiement/, sinon pastille à la couleur de la marque ; " + (etape11.cas.find((c) => /logos officiels/.test(c)) || "") + " ; bande de confiance (4 engagements)");

  /* ㊾ Toutes les tailles de texte de l'abonnement (écran, cadenas, invitations, reçu imprimé) ≥ 13 px. */
  const debut = css.indexOf("7j. Abonnement");
  const section = debut < 0 ? "" : css.slice(debut, css.indexOf("/* ---------- 9.", debut));
  const impression = css.slice(css.indexOf('body[data-impression="recu"] { background'), css.indexOf("11. Respect"));
  const petites = [...(section + impression).matchAll(/font-size:\s*([\d.]+)(px|pt)/g)]
    .filter((m) => (m[2] === "px" ? Number(m[1]) : Number(m[1]) * 4 / 3) < 13).map((m) => m[0]);
  controle("㊾", "le texte contient 13 px minimum", debut > 0 && impression.length > 0 && petites.length === 0,
    petites.length ? "tailles trop petites : " + petites.join(", ") : "toutes les tailles de l'écran Abonnement, des cadenas, des invitations et du reçu imprimé ≥ 13 px (10 pt) ; mesure réelle à 360 et 1440 px dans verifier-navigateur.mjs (AV)");
  const quota = [...absent, ...etape11.quota];
  controle("㊿", "le blocage au 6e devis fonctionne et conserve le brouillon", quota.length === 0,
    quota.join(" ; ") || "gratuit : accueil « 3 / 5 devis ce mois » + jauge ; 4e devis → « Il vous reste 1 devis gratuit » ; 5e créé ; 6e → création BLOQUÉE, invitation obligatoire, étude « Studio Tanghin » enregistrée, l'écran Résultat reste ouvert ; Dupliquer bloqué aussi ; anciens devis consultables et imprimables ; supprimer des devis ne rend pas de devis gratuit ; abonné sans limite");
  const jeton = [...absent, ...etape11.jeton];
  controle("AB", "le Pro n'est donné que par un jeton signé valide", jeton.length === 0,
    jeton.join(" ; ") || "ECDSA P-256 vérifié sur l'appareil avec la clé PUBLIQUE de la balise meta (vide dans la page livrée : échec fermé) ; refusés : formule en clair, autre clé, charge modifiée, autre compte, autre numéro, expiré, émis dans le futur, horloge reculée sous la dernière date vue, champ inconnu, Lifetime daté, mensuel sans fin, signature tronquée ; aucune clé privée dans le front");
  const relances = [...absent, ...etape11.relances];
  controle("RL", "relances sans harceler", relances.length === 0,
    relances.join(" ; ") || "bandeau permanent (gratuit) ; invitation à la 1re ouverture du jour (jamais le jour de la création du compte, une seule fois) ; après impression ou envoi (au plus une toutes les 10 min) ; abonné : aucune invitation, rappel J-3 / veille / jour J sur l'accueil (« Renouveler » en 1 toucher) et notifications locales à 9 h (ids 3103, 3101, 3100)");
  const cadenas = [...absent, ...etape11.cadenas];
  controle("PV", "fonctions Pro sous cadenas → invitation", cadenas.length === 0,
    cadenas.join(" ; ") || "gratuit : cadenas sur Statistiques (menu + carte), logo, feuille sans filigrane, 4 « Débloquer » ; un toucher ouvre l'invitation → « Voir les formules » → Abonnement ; abonné : aucun cadenas, avantages « Inclus », statistiques détaillées visibles");
  const recu = [...absent, ...etape11.recu];
  controle("RC", "Mes paiements et reçu imprimable", recu.length === 0,
    recu.join(" ; ") || "paiements relus champ par champ (références piégées, montants texte ou négatifs, formule gratuite, statut inconnu, autre compte ignorés) ; « Reçu » remplit la feuille A4 du reçu (texte seulement) puis imprime, nettoyée après impression ; sur téléphone : PDF du reçu (1 page, structure vérifiée) partagé");
  const paiement = [...absent, ...etape11.paiement];
  controle("PI", "paiement : la formule seule, une adresse https seule", paiement.length === 0,
    paiement.join(" ; ") || "3 touchers (Choisir → Payer maintenant → page de paiement) ; corps envoyé = {\"formule\":\"…\"} sans montant, sans cookie ; seule une adresse https:// avec une référence BP-… est ouverte (noopener) ; javascript:, http://, référence piégée et coupure réseau → message clair + « Réessayer » qui relance la même formule");
}

/* ---------- Étape 12 : paiement automatique ---------- */
async function controlesEtape12() {
  const absent = etape12.fait ? [] : ["parcours jsdom de l'étape 12 non exécuté"];
  const suivi = [...absent, ...etape12.suivi];
  controle("SP", "paiement suivi jusqu'à l'activation, sans action de l'électricien", suivi.length === 0,
    suivi.join(" ; ") || "page de paiement ouverte → écran « Nous confirmons votre paiement… » (référence affichée) ; GET /api/paiements/:ref toutes les 3 s avec le jeton de session ; « en attente » n'active rien ; payé → jeton signé vérifié sur l'appareil puis enregistré, coche géante + 18 particules, « Votre Pro mensuel est actif jusqu'au … », focus sur le titre, ajout à « Mes paiements », reçu imprimable, consultation arrêtée, accueil « Devis illimités »");
  const echecs = [...absent, ...etape12.echecs];
  controle("SE", "échecs, attente trop longue, coupure : message clair, rien d'activé", echecs.length === 0,
    echecs.join(" ; ") || "échoué / annulé / expiré → « Réessayer » (même formule, nouvelle page, ancien suivi arrêté) ; anomalie / remboursé → pas de « Réessayer » ; 3 min sans confirmation → « s'activera toute seule », arrêt des consultations ; coupure → « Connexion perdue » + « Vérifier à nouveau » ; « payé » avec un jeton signé par une autre clé → rien d'activé ; codes d'erreur traduits (places Lifetime épuisées, session expirée, trop de tentatives), code inconnu ou piégé → message par défaut, jamais le texte reçu");
  const retour = [...absent, ...etape12.retour];
  controle("RT", "retour de la page de paiement et reprise après fermeture", retour.length === 0,
    retour.join(" ; ") || "#paiement-retour?ref=BP-… : format vérifié, effacé de l'adresse, suivi relancé (adresse piégée ignorée) ; démarrage avec un paiement en cours de moins de 24 h → vérification discrète, toast « Paiement confirmé : votre Pro mensuel est actif. » ; au-delà de 24 h → oublié ; téléphone : navigateur fermé (browserFinished) et retour dans l'application (resume) → vérification immédiate");
  const renouvellement = [...absent, ...etape12.renouvellement];
  controle("RN", "renouveler en 1 toucher, rappel du jour J, interrupteur carte", renouvellement.length === 0,
    renouvellement.join(" ; ") || "J-3 : « Renouveler » de l'accueil et « Renouveler mon Pro mensuel » de Mon abonnement lancent le paiement de la même formule sans étape de plus ; loin de la fin → pas de bouton ; jour J → « se termine aujourd'hui » ; interrupteur désactivé par défaut, enregistré en ligne d'abord, revient en arrière en cas d'échec ou hors ligne, caché pour Lifetime");
  const m12 = chargerMoteur();
  const { FORMULES: enLigne } = await import(new URL("../../backend/formules.js", import.meta.url).href);
  const ecarts = Object.keys(m12.FORMULES).filter((id) => id !== "gratuit")
    .filter((id) => !enLigne[id] || enLigne[id].prix !== m12.FORMULES[id].prix || enLigne[id].nom !== m12.FORMULES[id].nom || enLigne[id].jours !== m12.FORMULES[id].dureeJours)
    .concat(Object.keys(enLigne).filter((id) => !m12.FORMULES[id]));
  const livre = readFileSync(join(RACINE, "www", "index.html"), "utf8");
  const secrets = (livre.match(/sk_(live|test)_|whsec_|PAYDUNYA|LIGDICASH_|CINETPAY_|FEDAPAY_|api_password|MASTER-KEY|PRIVATE[_-]KEY|BEGIN (EC )?PRIVATE/gi) || []);
  controle("PX", "prix identiques dans l'application et en ligne, aucune clé d'agrégateur dans l'application", ecarts.length === 0 && secrets.length === 0,
    ecarts.length || secrets.length ? "écarts : " + ecarts.join(",") + " ; secrets : " + secrets.join(",")
      : "Pass semaine 750 / 7 j, Pro mensuel 2 500 / 30 j, Pro annuel 25 000 / 365 j, Lifetime 60 000 : identiques dans src/donnees.js et backend/formules.js (le montant facturé est lu en ligne) ; www/index.html ne contient aucune clé d'agrégateur ni clé privée");
}

/* ---------- Étape 13 : Android, Play Store, confidentialité ---------- */
function controlesEtape13() {
  const m = chargerMoteur();
  const absent = etape13.fait ? [] : ["parcours jsdom de l'étape 13 non exécuté"];
  const photo = [...absent, ...etape13.photo, ...etape13.natif];
  const octets = Uint8Array.from(Buffer.from(JPEG_ESSAI, "base64"));
  const dims = m.dimensionsJpeg(octets);
  if (!dims || dims.largeur !== 40 || dims.hauteur !== 30 || dims.composantes !== 3) photo.push("dimensionsJpeg : " + JSON.stringify(dims));
  if (m.dimensionsJpeg(octets.slice(0, 20)) !== null || m.dimensionsJpeg(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])) !== null) photo.push("JPEG tronqué ou PNG lu comme un JPEG");
  const emetteur = { nom: "Awa Sawadogo", entreprise: "", telephone: "+226 70 11 22 33", ville: "Ouagadougou", pays: "Burkina Faso" };
  const catalogue = Object.fromEntries(Object.entries(m.CATALOGUE_DEFAUT).map(([r, a]) => [r, { ...a }]));
  const devis = { ...m.devisDepuisChiffrage(m.chiffrerChantier(CHANTIERS_TYPES[0].chantier, catalogue, "XOF", null)), numero: "BP-2026-0007", titre: "Studio", client: "Client", lieu: "Ouaga", creeLe: "2026-10-16T10:00:00Z", conditions: "", note: "" };
  const photoPdf = { octets, ...dims };
  for (const formule of ["gratuit", "annuel"]) {
    const mod = m.modeleFeuille(devis, "XOF", formule, emetteur, "");
    const sans = analyserPdf(m.creerPdfDevis(mod, null, null));
    const avec = analyserPdf(m.creerPdfDevis(mod, { octets, largeur: 40, hauteur: 30 }, photoPdf));
    if (avec.erreurs.length || avec.pages !== sans.pages + 1 || !avec.texte.includes("/Im2 Do") || !avec.texte.includes("(Page " + avec.pages + " / " + avec.pages + ")")) photo.push(formule + " : annexe photo → " + avec.pages + " page(s) pour " + sans.pages + " " + avec.erreurs.join(","));
    if (formule === "annuel" && (!avec.texte.includes("/Im1 Do") || !/\/XObject << \/Im1 6 0 R \/Im2 7 0 R >>/.test(avec.texte))) photo.push("logo et photo ensemble : ressources /Im1 /Im2 incorrectes");
    const cmjn = analyserPdf(m.creerPdfDevis(mod, null, { ...photoPdf, composantes: 4 }));
    if (cmjn.texte.includes("/Im2") || cmjn.pages !== sans.pages) photo.push("JPEG CMJN (4 composantes) intégré");
  }
  controle("PT", "photo du tableau électrique jointe au devis (appareil photo, sans permission)", photo.length === 0,
    photo.join(" ; ") || "fiche devis : photo enregistrée affichée, « Changer la photo », « Retirer la photo » avec confirmation ; navigateur : sélecteur image/jpeg,png,webp + capture=environment, SVG déguisé et fichier > 5 Mo refusés ; téléphone : Camera.getPhoto (source CAMERA, saveToGallery false, correctOrientation, 1600 px), SVG/data:svg refusés, annulation silencieuse, échec expliqué ; feuille A4 : annexe sur une page à part ; PDF : page d'annexe /Im2 (40 × 30 DCTDecode), « Page n / n », logo + photo = /Im1 /Im2, CMJN refusé ; photo d'un autre compte jamais affichée ; photos orphelines effacées au démarrage (PDF " + (etape13.octetsPdf || 0) + " octets)");

  /* Confidentialité : document complet, page publiable, résumé dans l'application. */
  const confid = [];
  const politique = existsSync(join(RACINE, "CONFIDENTIALITE.md")) ? readFileSync(join(RACINE, "CONFIDENTIALITE.md"), "utf8") : "";
  for (const attendu of ["BRG Électro+", "+226 05 60 86 08", "+226 68 52 42 90", "com.brgelectro.batiplus", "Données collectées", "Appareil photo", "Notifications", "Paiement", "Durée de conservation", "Suppression", "Vos droits", "Sécurité", "Enfants", "Modifications"]) {
    if (!politique.includes(attendu)) confid.push("CONFIDENTIALITE.md : « " + attendu + " » absent");
  }
  const pagePublique = join(RACINE, "store", "confidentialite.html");
  const html13 = existsSync(pagePublique) ? readFileSync(pagePublique, "utf8") : "";
  if (!html13.includes("+226 05 60 86 08") || /<script|\son[a-z]+=|https?:\/\/(?!wa\.me)/i.test(html13.replace(/<meta http-equiv[^>]*>/, ""))) confid.push("store/confidentialite.html absent, incomplet, avec script ou ressource externe");
  const modele = (html.match(/<template id="modele-conditions">([\s\S]*?)<\/template>/) || [])[1] || "";
  for (const attendu of ["Appareil photo", "Paiement", "jamais vendues", "Suppression", "+226 05 60 86 08"]) if (!modele.includes(attendu)) confid.push("résumé dans l'application : « " + attendu + " » absent");
  const fiche = existsSync(join(RACINE, "store", "fiche-play-store.md")) ? readFileSync(join(RACINE, "store", "fiche-play-store.md"), "utf8") : "";
  if (!/Sécurité des données/.test(fiche) || !/Nom/.test(fiche) || !/Numéro de téléphone/.test(fiche) || !/Photos/.test(fiche)) confid.push("fiche : formulaire « Sécurité des données » incomplet");
  controle("PC", "politique de confidentialité complète, publiable et résumée dans l'application", confid.length === 0,
    confid.join(" ; ") || "CONFIDENTIALITE.md (éditeur, données, appareil photo, notifications, paiement, conservation, suppression, droits, sécurité, enfants, modifications) ; store/confidentialite.html prête à publier (aucun script, aucune ressource externe) ; « Lire les conditions » résume la politique dans l'application ; formulaire « Sécurité des données » rempli dans store/fiche-play-store.md");

  /* Fiche Play Store : textes dans les limites, images aux bonnes dimensions. */
  const store = [];
  const section = (titre) => ((fiche.split("\n## ").find((b) => b.startsWith(titre)) || "").match(/```text\n([\s\S]*?)\n```/) || [])[1] || "";
  const titre = section("Titre");
  const courte = section("Description courte");
  const longue = section("Description longue");
  if (titre !== "BâtiPlus Électricien : devis") store.push("titre « " + titre + " »");
  if (!courte || [...courte].length > 80) store.push("description courte : " + [...courte].length + " caractères (80 max)");
  if (!longue || [...longue].length > 4000 || [...longue].length < 1500) store.push("description longue : " + [...longue].length + " caractères (4 000 max)");
  if (/meilleur|n°\s*1|gratuit à vie|#1|top/i.test(titre + courte)) store.push("titre ou description courte avec une mention interdite par Google Play");
  if (!/Catégorie[^\n]*Entreprise|Catégorie[^\n]*Business/i.test(fiche)) store.push("catégorie Entreprise (Business) absente");
  if (metiers.test(fiche)) store.push("autre métier cité dans la fiche");
  if (/mobile money|orange money|moov|wave|agrégateur|carte bancaire|fedapay|cinetpay|ligdicash|paydunya|stripe/i.test(titre + courte + longue)) store.push("la description oriente vers un paiement hors Google Play");
  const dimsPng = (chemin) => {
    if (!existsSync(chemin)) return null;
    const o = readFileSync(chemin);
    return o.slice(1, 4).toString() === "PNG" ? { l: o.readUInt32BE(16), h: o.readUInt32BE(20), couleur: o[25], octets: o.length } : null;
  };
  const icone = dimsPng(join(RACINE, "store", "icone-512.png"));
  if (!icone || icone.l !== 512 || icone.h !== 512 || icone.octets > 1024 * 1024) store.push("icône 512 × 512 (≤ 1 Mo) absente");
  const banniere = dimsPng(join(RACINE, "store", "banniere-1024x500.png"));
  if (!banniere || banniere.l !== 1024 || banniere.h !== 500) store.push("bannière 1024 × 500 absente");
  else if (banniere.couleur !== 2) store.push("bannière avec transparence (PNG 24 bits attendu)");
  if (icone && icone.couleur !== 6) store.push("icône : PNG 32 bits attendu");
  const dossierCaptures = join(RACINE, "store", "captures");
  const captures = existsSync(dossierCaptures) ? readdirSync(dossierCaptures).filter((f) => f.endsWith(".png")).sort() : [];
  const mauvaises = captures.filter((f) => { const d = dimsPng(join(dossierCaptures, f)); return !d || d.l !== 1080 || d.h !== 1920; });
  if (captures.length < 2 || captures.length > 8 || mauvaises.length) store.push(captures.length + " capture(s), " + mauvaises.length + " hors 1080 × 1920");
  controle("FS", "fiche Play Store : textes et images conformes", store.length === 0,
    store.join(" ; ") || "titre « " + titre + " » (" + [...titre].length + "/30), description courte " + [...courte].length + "/80, longue " + [...longue].length + "/4 000, catégorie Entreprise, aucun paiement hors Google Play cité ; icône 512 × 512 (" + Math.round(icone.octets / 1024) + " Ko), bannière 1024 × 500 sans transparence, " + captures.length + " captures 1080 × 1920 (store/captures)");

  /* Documentation : Android en 12 étapes, iPhone honnête. */
  const docs = [];
  const android = existsSync(join(RACINE, "ANDROID.md")) ? readFileSync(join(RACINE, "ANDROID.md"), "utf8") : "";
  const etapes = [...android.matchAll(/^## Étape (\d+)\b/gm)].map((x) => Number(x[1]));
  if (etapes.length !== 12 || etapes.some((n, i) => n !== i + 1)) docs.push("ANDROID.md : " + etapes.length + " étapes numérotées (12 attendues)");
  for (const attendu of ["keytool -genkey", "bundleRelease", "assembleDebug", "adb install", "mode avion", "verifier:android", "Play App Signing", "versionCode"]) if (!android.includes(attendu)) docs.push("ANDROID.md : « " + attendu + " » absent");
  const ios = existsSync(join(RACINE, "IOS.md")) ? readFileSync(join(RACINE, "IOS.md"), "utf8") : "";
  for (const attendu of ["Mac", "Xcode", "99", "4.2", "Safari", "Sur l'écran d'accueil"]) if (!ios.includes(attendu)) docs.push("IOS.md : « " + attendu + " » absent");
  controle("DC", "ANDROID.md (12 étapes) et IOS.md complets", docs.length === 0,
    docs.join(" ; ") || "ANDROID.md : 12 étapes (outils, construction, keystore keytool + 2 sauvegardes, APK de test adb install, mode avion, verifier:android, bundleRelease, Play App Signing, fiche, test interne, publication, mises à jour versionCode) ; IOS.md : Mac + Xcode, 99 $/an, règle 4.2 d'Apple, recommandation PWA par Safari « Sur l'écran d'accueil »");
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
controlesEtape10();
controlesEtape11();
await controlesEtape12();
controlesIdentite();
controlesEtape13();
for (const r of verifierAndroid()) controle(r.numero, r.libelle, r.ok, r.detail);

const ordre = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑨b", "⑩", "⑪", "⑫", "⑮", "⑰", "⑳", "㉑", "㉔", "㉕", "IC", "PA", "㉖", "㉗", "㉘", "㉙", "㉚", "㉛", "㉜", "㉝", "㉞", "㉟", "㊲", "㊳", "㊴", "㊵", "㊶", "㊷", "CL", "ST", "D", "A", "N3", "P", "S①", "S②", "S③", "S④", "S⑤", "S⑥", "S⑦", "S⑪", "S+", "㊸", "㊹", "㊺", "㊻", "VR", "CO", "SW", "AN", "CS", "㊼", "㊽", "㊾", "㊿", "AB", "RL", "PV", "RC", "PI", "SP", "SE", "RT", "RN", "PX", "PT", "PM", "MF", "GS", "PC", "FS", "DC", "SY1", "SY2", "SY3", "SY4", "SY5", "SY6", "SY7", "SY8", "SY9", "SY10"];
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
