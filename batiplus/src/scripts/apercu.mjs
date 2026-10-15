#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — serveur d'aperçu (développement uniquement)
   Sert le dossier www/ tel qu'il sera embarqué dans l'application.
   Usage : npm run apercu        (port 8080, ou PORT=xxxx npm run apercu)
   ========================================================================== */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const WWW = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "www");
const PORT = Number(process.env.PORT) || 8080;
const HOTE = process.env.HOTE || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

const ENTETES_SECURITE = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "geolocation=(), microphone=(), payment=()",
  "Cache-Control": "no-store"
};

function cheminSur(url) {
  const brut = decodeURIComponent(new URL(url, "http://local").pathname);
  const relatif = normalize(brut === "/" ? "/index.html" : brut).replace(/^([/\\])+/, "");
  const complet = join(WWW, relatif);
  return complet === WWW || complet.startsWith(WWW + sep) ? complet : null;
}

createServer((requete, reponse) => {
  if (requete.method !== "GET" && requete.method !== "HEAD") {
    reponse.writeHead(405, ENTETES_SECURITE).end();
    return;
  }
  let chemin = null;
  try { chemin = cheminSur(requete.url); } catch { chemin = null; }
  let infos = null;
  try { infos = chemin && statSync(chemin); } catch { infos = null; }
  if (!infos || !infos.isFile()) {
    reponse.writeHead(404, { ...ENTETES_SECURITE, "Content-Type": "text/plain; charset=utf-8" }).end("Introuvable");
    return;
  }
  reponse.writeHead(200, {
    ...ENTETES_SECURITE,
    "Content-Type": TYPES[extname(chemin).toLowerCase()] || "application/octet-stream",
    "Content-Length": infos.size
  });
  if (requete.method === "HEAD") reponse.end();
  else createReadStream(chemin).pipe(reponse);
}).listen(PORT, HOTE, () => {
  console.log("Aperçu BâtiPlus : http://" + HOTE + ":" + PORT);
});
