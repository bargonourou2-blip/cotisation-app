#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — page publique de la politique de confidentialité (étape 13)
   CONFIDENTIALITE.md → store/confidentialite.html : une page autonome, prête à publier
   à une adresse publique (Google Play exige un lien). Aucun script, aucune ressource
   externe, aucune police distante ; tout le texte est échappé.
   Markdown pris en charge : # / ## / ###, paragraphes, listes « - », tableaux simples,
   **gras**, `code`, ligne « --- ».
   Usage : npm run confidentialite
   ========================================================================== */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = join(RACINE, "CONFIDENTIALITE.md");
const CIBLE = join(RACINE, "store", "confidentialite.html");

const echapper = (texte) => texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enLigne = (texte) => echapper(texte)
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/`([^`]+)`/g, "<code>$1</code>");

export function versHtml(markdown) {
  const lignes = markdown.replace(/\r/g, "").split("\n");
  const sortie = [];
  let titre = "Politique de confidentialité";
  let paragraphe = [];
  let liste = null;
  let tableau = null;
  const fermer = () => {
    if (paragraphe.length) sortie.push("<p>" + enLigne(paragraphe.join(" ")) + "</p>");
    paragraphe = [];
    if (liste) sortie.push("<ul>\n" + liste.map((e) => "  <li>" + enLigne(e) + "</li>").join("\n") + "\n</ul>");
    liste = null;
    if (tableau) {
      const [entete, , ...corps] = tableau;
      const cellules = (ligne) => ligne.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      sortie.push("<table>\n  <thead><tr>" + cellules(entete).map((c) => "<th scope=\"col\">" + enLigne(c) + "</th>").join("") + "</tr></thead>\n  <tbody>\n"
        + corps.map((l) => "    <tr>" + cellules(l).map((c) => "<td>" + enLigne(c) + "</td>").join("") + "</tr>").join("\n") + "\n  </tbody>\n</table>");
    }
    tableau = null;
  };
  for (const ligne of lignes) {
    const t = ligne.trim();
    if (!t) { fermer(); continue; }
    const entete = t.match(/^(#{1,3}) (.+)$/);
    if (entete) {
      fermer();
      const niveau = entete[1].length;
      if (niveau === 1) titre = entete[2];
      sortie.push("<h" + niveau + ">" + enLigne(entete[2]) + "</h" + niveau + ">");
      continue;
    }
    if (t === "---") { fermer(); sortie.push("<hr>"); continue; }
    if (t.startsWith("|")) { if (!tableau) { fermer(); tableau = []; } tableau.push(t); continue; }
    if (t.startsWith("- ")) { if (!liste) { fermer(); liste = []; } liste.push(t.slice(2)); continue; }
    if (liste) { liste[liste.length - 1] += " " + t; continue; }
    paragraphe.push(t);
  }
  fermer();
  return { titre, corps: sortie.join("\n") };
}

export function genererPage() {
  const { titre, corps } = versHtml(readFileSync(SOURCE, "utf8"));
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${echapper(titre)} — BRG Électro+</title>
<style>
  :root { color-scheme: light dark; --violet: #6A0DAD; --fond: #F4F2F9; --carte: #FFFFFF; --texte: #17131F; --texte-2: #5F5870; --ligne: #E8E4F0; }
  @media (prefers-color-scheme: dark) { :root { --violet: #D2B0F7; --fond: #08070C; --carte: #16121E; --texte: #F6F4FA; --texte-2: #B9B2C9; --ligne: #2A2336; } }
  body { margin: 0; background: var(--fond); color: var(--texte); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 20px 56px; background: var(--carte); }
  h1 { color: var(--violet); font-size: 1.8rem; line-height: 1.25; margin: 0 0 8px; }
  h2 { color: var(--violet); font-size: 1.3rem; margin: 2rem 0 0.6rem; }
  h3 { font-size: 1.05rem; margin: 1.4rem 0 0.4rem; }
  p, li { color: var(--texte); }
  ul { padding-left: 1.3rem; }
  table { width: 100%; border-collapse: collapse; margin: 0.8rem 0; font-size: 0.95rem; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--ligne); }
  th { color: var(--violet); }
  code { font-size: 0.92em; }
  hr { border: 0; border-top: 1px solid var(--ligne); margin: 2rem 0 1rem; }
  @media (max-width: 520px) { table, thead, tbody, tr, th, td { display: block; } thead { display: none; } td:first-child { font-weight: 700; border-bottom: 0; padding-bottom: 0; } }
</style>
</head>
<body>
<main>
${corps}
</main>
</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(dirname(CIBLE), { recursive: true });
  writeFileSync(CIBLE, genererPage());
  console.log("✔ store/confidentialite.html générée depuis CONFIDENTIALITE.md");
}
