#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — vérificateur du projet Android (étape 13)
   Contrôle statique, sans Android Studio ni SDK : il relit ce que Gradle fusionnera.
     PM  permissions FUSIONNÉES (application + plugins − retirées) = exactement
         INTERNET, POST_NOTIFICATIONS, ACCESS_NETWORK_STATE ;
     MF  manifeste : seul le lanceur est ouvert aux autres applications, HTTPS obligatoire,
         aucune sauvegarde Android, débogage du WebView coupé, partage de fichiers limité ;
     GS  Gradle : identifiant, versions, SDK, réduction du code, signature hors dépôt.
   Utilisable seul (npm run verifier:android) ou importé par verifier.mjs (npm run construire).
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ANDROID = join(RACINE, "android");
const APP = join(ANDROID, "app");

export const PERMISSIONS_AUTORISEES = Object.freeze([
  "android.permission.INTERNET",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.ACCESS_NETWORK_STATE"
]);

const lire = (chemin) => (existsSync(chemin) ? readFileSync(chemin, "utf8") : "");
const sansCommentaires = (xml) => xml.replace(/<!--[\s\S]*?-->/g, "");
const attribut = (balise, nom) => (balise.match(new RegExp("\\s" + nom.replace(":", "\\:") + "=\"([^\"]*)\"")) || [])[1];

/* Plugins inclus par Capacitor (android/capacitor.settings.gradle) → manifestes à fusionner. */
function manifestesPlugins() {
  const reglages = lire(join(ANDROID, "capacitor.settings.gradle"));
  const liste = [];
  for (const [, nom, dossier] of reglages.matchAll(/project\(':([^']+)'\)\.projectDir = new File\('([^']+)'\)/g)) {
    const chemin = resolve(ANDROID, dossier, "src", "main", "AndroidManifest.xml");
    liste.push({ nom, chemin, xml: sansCommentaires(lire(chemin)), present: existsSync(chemin) });
  }
  return liste;
}

/* Permissions après fusion : tools:node="remove" dans le manifeste de l'application gagne toujours. */
export function permissionsFusionnees() {
  const app = sansCommentaires(lire(join(APP, "src", "main", "AndroidManifest.xml")));
  const retirees = new Set();
  const declarees = new Map();
  for (const [balise] of app.matchAll(/<uses-permission(?:-sdk-23)?\s[^>]*>/g)) {
    const nom = attribut(balise, "android:name");
    if (attribut(balise, "tools:node") === "remove") retirees.add(nom);
    else declarees.set(nom, "application");
  }
  const plugins = manifestesPlugins();
  for (const p of plugins) {
    for (const [balise] of p.xml.matchAll(/<uses-permission(?:-sdk-23)?\s[^>]*>/g)) {
      const nom = attribut(balise, "android:name");
      if (!declarees.has(nom)) declarees.set(nom, p.nom);
    }
  }
  const finales = [...declarees.keys()].filter((nom) => !retirees.has(nom)).sort();
  return { finales, retirees: [...retirees].sort(), declarees, plugins };
}

function controlePermissions() {
  const problemes = [];
  const { finales, retirees, declarees, plugins } = permissionsFusionnees();
  const absents = plugins.filter((p) => !p.present).map((p) => p.nom);
  if (!plugins.length) problemes.push("android/capacitor.settings.gradle illisible (npx cap sync android)");
  if (absents.length) problemes.push("manifestes de plugins introuvables (npm install) : " + absents.join(", "));
  const enTrop = finales.filter((nom) => !PERMISSIONS_AUTORISEES.includes(nom));
  const manquantes = PERMISSIONS_AUTORISEES.filter((nom) => !finales.includes(nom));
  if (enTrop.length) problemes.push("permission(s) superflue(s) : " + enTrop.map((n) => n.replace("android.permission.", "") + " (" + declarees.get(n) + ")").join(", "));
  if (manquantes.length) problemes.push("permission(s) manquante(s) : " + manquantes.join(", "));
  const app = sansCommentaires(lire(join(APP, "src", "main", "AndroidManifest.xml")));
  if (/android\.permission\.CAMERA"(?![^>]*tools:node="remove")/.test(app)) problemes.push("CAMERA déclarée : l'appareil photo passe par l'intent système, sans permission");
  if (/<uses-feature[^>]*android\.hardware\.camera"(?![^>]*required="false")/.test(app)) problemes.push("appareil photo exigé (uses-feature required) : l'application serait cachée aux téléphones sans caméra");
  return {
    numero: "PM", libelle: "permissions Android : uniquement celles qui servent (après fusion des plugins)", ok: problemes.length === 0,
    detail: problemes.join(" ; ") || "permissions finales : " + finales.map((n) => n.replace("android.permission.", "")).join(", ")
      + " ; retirées à la fusion : " + retirees.map((n) => n.replace("android.permission.", "")).join(", ")
      + " ; CAMERA non déclarée (intent IMAGE_CAPTURE, aucune autorisation demandée) ; " + plugins.length + " manifestes de plugins relus"
  };
}

function controleManifeste() {
  const problemes = [];
  const app = sansCommentaires(lire(join(APP, "src", "main", "AndroidManifest.xml")));
  const application = (app.match(/<application\s[^>]*>/) || [""])[0];
  const exige = (nom, valeur, texte) => { if (attribut(application, nom) !== valeur) problemes.push(texte); };
  exige("android:allowBackup", "false", "allowBackup ≠ false");
  exige("android:usesCleartextTraffic", "false", "usesCleartextTraffic ≠ false");
  exige("android:networkSecurityConfig", "@xml/securite_reseau", "networkSecurityConfig absent");
  exige("android:dataExtractionRules", "@xml/regles_extraction", "dataExtractionRules absent");
  if (/android:debuggable="true"/.test(app)) problemes.push("android:debuggable=\"true\"");
  const reseau = lire(join(APP, "src", "main", "res", "xml", "securite_reseau.xml"));
  if (!/<base-config cleartextTrafficPermitted="false">/.test(reseau) || /<certificates src="user"/.test(reseau) || /<domain-config/.test(reseau)) problemes.push("securite_reseau.xml : HTTPS non imposé partout ou certificats utilisateur acceptés");
  const extraction = lire(join(APP, "src", "main", "res", "xml", "regles_extraction.xml"));
  if (!/<cloud-backup>/.test(extraction) || !/<device-transfer>/.test(extraction)) problemes.push("regles_extraction.xml incomplet");
  /* Composants : seul MainActivity (lanceur) est exporté ; tout composant à intent-filter dit explicitement exported. */
  const ouverts = [];
  const sources = [{ nom: "application", xml: app }, ...manifestesPlugins().map((p) => ({ nom: p.nom, xml: p.xml }))];
  const retires = new Set([...app.matchAll(/<(?:activity|receiver|service|provider)\s[^>]*tools:node="remove"[^>]*>/g)].map((m) => attribut(m[0], "android:name")));
  const exportesApp = new Map([...app.matchAll(/<(?:activity|receiver|service|provider)\s[^>]*>/g)].map((m) => [attribut(m[0], "android:name"), attribut(m[0], "android:exported")]));
  for (const { nom, xml } of sources) {
    for (const [bloc, type, ouverture] of xml.matchAll(/<(activity|receiver|service|provider)(\s[^>]*?)(?:\/>|>[\s\S]*?<\/\1>)/g)) {
      const nomComposant = attribut(ouverture, "android:name");
      if (retires.has(nomComposant)) continue;
      const exporte = exportesApp.get(nomComposant) || attribut(ouverture, "android:exported");
      const filtre = /<intent-filter/.test(bloc);
      if (filtre && exporte === undefined) problemes.push(type + " " + nomComposant + " (" + nom + ") : intent-filter sans android:exported");
      if (exporte === "true") ouverts.push(nomComposant);
    }
  }
  if (ouverts.length !== 1 || ouverts[0] !== ".MainActivity") problemes.push("composants ouverts aux autres applications : " + (ouverts.join(", ") || "aucun"));
  if (!/android\.intent\.category\.LAUNCHER/.test(app)) problemes.push("lanceur absent");
  const fournisseur = (app.match(/<provider\s[^>]*>/) || [""])[0];
  if (attribut(fournisseur, "android:exported") !== "false" || attribut(fournisseur, "android:grantUriPermissions") !== "true") problemes.push("FileProvider exporté ou sans grantUriPermissions");
  const chemins = lire(join(APP, "src", "main", "res", "xml", "file_paths.xml"));
  if (/<root-path/.test(chemins) || /<external-path[^>]*path="\.?\/?"/.test(chemins)) problemes.push("file_paths.xml partage toute la mémoire du téléphone");
  if (!/path="Documents\/BatiPlus\/"/.test(chemins) || !/<external-files-path[^>]*path="Pictures\/"/.test(chemins)) problemes.push("file_paths.xml : Documents/BatiPlus ou Pictures (appareil photo) absent");
  const cfg = JSON.parse(lire(join(RACINE, "capacitor.config.json")) || "{}");
  if (cfg.android?.webContentsDebuggingEnabled !== false) problemes.push("webContentsDebuggingEnabled ≠ false");
  if (cfg.android?.allowMixedContent !== false) problemes.push("allowMixedContent ≠ false");
  if (cfg.server && (cfg.server.url || cfg.server.cleartext)) problemes.push("capacitor.config : server.url / cleartext (rechargement à chaud) laissé");
  const activite = lire(join(APP, "src", "main", "java", "com", "brgelectro", "batiplus", "MainActivity.java"));
  const tactile = lire(join(APP, "src", "main", "java", "com", "brgelectro", "batiplus", "RetourTactilePlugin.java"));
  if (!/registerPlugin\(RetourTactilePlugin\.class\);\s*super\.onCreate/.test(activite) || !/@CapacitorPlugin\(name = "RetourTactile"\)/.test(tactile) || !/performHapticFeedback/.test(tactile)) problemes.push("plugin RetourTactile absent ou non enregistré avant super.onCreate");
  if (/@capacitor\/haptics/.test(lire(join(RACINE, "package.json"))) || /plugin\("Haptics"\)/.test(lire(join(RACINE, "src", "moteur.js")))) problemes.push("plugin Haptics encore utilisé (exige VIBRATE)");
  const nomApp = (lire(join(APP, "src", "main", "res", "values", "strings.xml")).match(/<string name="app_name">([^<]*)<\/string>/) || [])[1];
  if (nomApp !== "BâtiPlus") problemes.push("nom affiché ≠ BâtiPlus (" + nomApp + ")");
  return {
    numero: "MF", libelle: "manifeste Android : lanceur seul exporté, HTTPS, aucune sauvegarde, débogage coupé", ok: problemes.length === 0,
    detail: problemes.join(" ; ") || "MainActivity seule exportée (récepteurs des rappels exported=false, restauration au démarrage retirée) ; usesCleartextTraffic=false + securite_reseau.xml (certificats système seulement) ; allowBackup=false + règles d'extraction (cloud et transfert) ; webContentsDebuggingEnabled=false, allowMixedContent=false ; FileProvider privé limité à Documents/BatiPlus, Pictures de l'application et cache ; retour tactile par le plugin local RetourTactile (sans VIBRATE)"
  };
}

function suivi(chemin) {
  try {
    return execFileSync("git", ["ls-files", "--", chemin], { cwd: RACINE, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function ignore(chemin) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", chemin], { cwd: RACINE, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function controleGradle() {
  const problemes = [];
  const gradle = lire(join(APP, "build.gradle"));
  const variables = lire(join(ANDROID, "variables.gradle"));
  const exiger = (regex, texte, source) => { if (!regex.test(source || gradle)) problemes.push(texte); };
  exiger(/applicationId "com\.brgelectro\.batiplus"/, "applicationId");
  exiger(/namespace "com\.brgelectro\.batiplus"/, "namespace");
  const versionPaquet = JSON.parse(lire(join(RACINE, "package.json")) || "{}").version || "";
  const versionCode = Number((gradle.match(/versionCode (\d+)\b/) || [])[1] || 0);
  const versionName = (gradle.match(/versionName "([^"]+)"/) || [])[1] || "";
  if (!(versionCode >= 1)) problemes.push("versionCode absent");
  if (!versionName || versionName !== versionPaquet) problemes.push("versionName « " + versionName + " » ≠ version de package.json « " + versionPaquet + " »");
  exiger(/minSdkVersion = 23\b/, "minSdk ≠ 23", variables);
  exiger(/targetSdkVersion = 35\b/, "targetSdk ≠ 35", variables);
  exiger(/compileSdkVersion = 35\b/, "compileSdk ≠ 35", variables);
  const release = (gradle.match(/release \{[^{}]*minifyEnabled[\s\S]*?\n {8}\}/) || [""])[0];
  if (!/minifyEnabled true/.test(release) || !/shrinkResources true/.test(release) || !/proguard-android-optimize\.txt/.test(release)) problemes.push("release : minifyEnabled/shrinkResources true et règles optimisées attendus");
  if (!/signingConfigs \{\s*release \{/.test(gradle) || !/signingConfig signingConfigs\.release/.test(gradle)) problemes.push("signingConfigs.release absent");
  if (/(storePassword|keyPassword)\s+["'][^"']+["']/.test(gradle)) problemes.push("mot de passe de keystore écrit dans build.gradle");
  if (!/keystore\.properties/.test(gradle) || !/BATIPLUS_KEYSTORE/.test(gradle)) problemes.push("lecture keystore.properties / variables d'environnement absente");
  if (!/throw new GradleException/.test(gradle)) problemes.push("version publiée possible sans signature");
  const pkg = JSON.parse(lire(join(RACINE, "package.json")) || "{}");
  if (pkg.version !== "1.0.0") problemes.push("package.json version ≠ 1.0.0");
  const proguard = lire(join(APP, "proguard-rules.pro"));
  if (!/@android\.webkit\.JavascriptInterface/.test(proguard) || !/RetourTactilePlugin/.test(proguard)) problemes.push("proguard-rules.pro : pont JavaScript ou plugin local non protégés");
  /* Clé de signature : jamais dans le dépôt, modèle sans mot de passe. */
  const suivis = suivi(".").split("\n").filter((f) => /\.(keystore|jks|p12)$|(^|\/)keystore\.properties$/.test(f));
  if (suivis.length) problemes.push("fichier de signature versionné : " + suivis.join(", "));
  for (const chemin of ["android/keystore.properties", "android/app/batiplus.keystore", "batiplus.jks"]) if (!ignore(chemin)) problemes.push(chemin + " non ignoré par Git");
  const exemple = lire(join(ANDROID, "keystore.properties.exemple"));
  if (!exemple || /(storePassword|keyPassword)=\S/.test(exemple) || ignore("android/keystore.properties.exemple")) problemes.push("keystore.properties.exemple absent, ignoré ou contenant un mot de passe");
  const doc = lire(join(RACINE, "ANDROID.md"));
  if (!/keytool -genkey /.test(doc) || !/sauvegard/i.test(doc)) problemes.push("ANDROID.md : création et sauvegarde du keystore non documentées");
  return {
    numero: "GS", libelle: "Gradle : identifiant, versions, SDK, code réduit, signature hors dépôt", ok: problemes.length === 0,
    detail: problemes.join(" ; ") || "com.brgelectro.batiplus, versionCode " + versionCode + ", versionName " + versionName + " (= package.json), minSdk 23, target/compile 35 ; release : minifyEnabled + shrinkResources (règles optimisées, pont JavaScript protégé) ; signingConfigs.release lu dans android/keystore.properties ou BATIPLUS_KEYSTORE… ; bundleRelease refusé sans clé ; aucun keystore ni mot de passe dans le dépôt (git ls-files, check-ignore) ; modèle keystore.properties.exemple vide ; procédure keytool -genkey + sauvegarde dans ANDROID.md"
  };
}

export function verifierAndroid() {
  return [controlePermissions(), controleManifeste(), controleGradle()];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultats = verifierAndroid();
  for (const r of resultats) console.log((r.ok ? "✔" : "✘") + " " + r.numero.padEnd(3) + " " + r.libelle + "  — " + r.detail);
  const echecs = resultats.filter((r) => !r.ok).length;
  console.log(echecs ? "\n✘ " + echecs + " contrôle(s) Android en échec." : "\n✔ " + resultats.length + " contrôles Android réussis.");
  process.exit(echecs ? 1 : 0);
}
