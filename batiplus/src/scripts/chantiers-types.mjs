/* ==========================================================================
   BâtiPlus — chantiers types et chargement du moteur NF C 15-100 hors de la page
   Le moteur (section entre « ==== MOTEUR NF C 15-100 ==== » et « ==== FIN DU MOTEUR ==== »
   dans src/moteur.js) est exécuté dans une VM Node isolée, avec src/donnees.js seulement :
   aucun DOM, aucun stockage. On vérifie aussi qu'il est livré tel quel dans www/index.html.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEBUT = "/* ==== MOTEUR NF C 15-100 ==== */";
const FIN = "/* ==== FIN DU MOTEUR ==== */";

export function sectionMoteur() {
  const source = readFileSync(join(RACINE, "src", "moteur.js"), "utf8");
  const debut = source.indexOf(DEBUT);
  const fin = source.indexOf(FIN);
  if (debut < 0 || fin < debut || source.indexOf(DEBUT, debut + 1) >= 0) throw new Error("marqueurs du moteur absents ou en double");
  return source.slice(debut, fin + FIN.length);
}

/* Charge le moteur. Le contexte ne contient ni window, ni document, ni localStorage :
   la moindre lecture du DOM lèverait une erreur. */
export function sectionDocument() {
  const source = readFileSync(join(RACINE, "src", "moteur.js"), "utf8");
  const debut = source.indexOf("/* ==== DOCUMENT DEVIS ==== */");
  const fin = source.indexOf("/* ==== FIN DU DOCUMENT ==== */");
  if (debut < 0 || fin < debut) throw new Error("section DOCUMENT DEVIS introuvable dans src/moteur.js");
  return source.slice(debut, fin);
}

export function sectionListes() {
  const source = readFileSync(join(RACINE, "src", "moteur.js"), "utf8");
  const debut = source.indexOf("/* ==== LISTES ET STATISTIQUES ==== */");
  const fin = source.indexOf("/* ==== FIN DES LISTES ==== */");
  if (debut < 0 || fin < debut) throw new Error("section LISTES ET STATISTIQUES introuvable dans src/moteur.js");
  return source.slice(debut, fin);
}

export function chargerMoteur() {
  const donnees = readFileSync(join(RACINE, "src", "donnees.js"), "utf8");
  const section = sectionMoteur() + "\n" + sectionDocument() + "\n" + sectionListes();
  const contexte = vm.createContext({});
  vm.runInContext(donnees + "\n" + section + "\nglobalThis.__moteur = { etudierChantier, chiffrerChantier, calculerTotal, calculerDevis, devisDepuisChiffrage, ajusterMainOeuvre, calculerMainOeuvre, verifierConformite, propositionPiece, normaliserPieces, surfaceValide, BORNES_CHANTIER, TYPES_PIECES, APPAREILS, REGLES_CIRCUITS, MAIN_OEUVRE_POINTS, CATALOGUE_DEFAUT, TVA_MAX, montantEnLettres, nombreEnLettres, modeleFeuille, chainePdf, messageWhatsApp, lienWhatsApp, nomFichierDevis, creerPdfDevis, resumeDevis, formulePayante, couperPdf, largeurPdf, FORMULES, PIED_DEVIS, OPACITE_FILIGRANE, cleTexte, correspondRecherche, filtrerDevis, comptesParStatut, carnetClients, filtrerClients, statistiquesDetaillees, TRIS_DEVIS, STATUTS_DEVIS };", contexte, { filename: "moteur-nfc15100.js" });
  return contexte.__moteur;
}

export function moteurLivre() {
  const html = readFileSync(join(RACINE, "www", "index.html"), "utf8");
  return html.includes(sectionMoteur());
}

const piece = (type, surface) => ({ type, surface, prises: null, points: null });

/* Les 3 chantiers types du cahier des charges. */
export const CHANTIERS_TYPES = Object.freeze([
  {
    cle: "studio",
    titre: "Studio 25 m² — séjour, salle d'eau, WC",
    chantier: {
      alimentation: "mono",
      pieces: [piece("sejour", 18), piece("salle-eau", 4), piece("wc", 3)],
      appareils: {},
      options: { distance: 0, hauteur: 2.8, parafoudre: false, terreNeuve: false, tableauARemplacer: false }
    }
  },
  {
    cle: "villa",
    titre: "Villa 3 chambres 120 m²",
    chantier: {
      alimentation: "mono",
      pieces: [
        piece("sejour", 36), piece("cuisine", 12), piece("chambre", 14), piece("chambre", 12), piece("chambre", 12),
        piece("salle-eau", 6), piece("salle-eau", 5), piece("wc", 2), piece("couloir", 9), piece("veranda", 12)
      ],
      appareils: { "chauffe-eau": 1, cuisiniere: 1, "lave-linge": 1, climatiseur: 2 },
      options: { distance: 15, hauteur: 2.8, parafoudre: true, terreNeuve: true, tableauARemplacer: false }
    }
  },
  {
    cle: "boutique",
    titre: "Boutique 40 m² avec climatiseur",
    chantier: {
      alimentation: "mono",
      pieces: [piece("magasin", 32), piece("bureau", 6), piece("wc", 2)],
      appareils: { climatiseur: 1 },
      options: { distance: 8, hauteur: 2.8, parafoudre: false, terreNeuve: false, tableauARemplacer: false }
    }
  }
]);

/* Résumé comparé aux valeurs de référence (golden) : toute modification du moteur qui change
   un chiffre doit être volontaire et mettre à jour ces valeurs. */
export function resumer(etude) {
  return {
    surface: etude.surfaceTotale,
    prises: etude.totaux.prises,
    prisesEtanches: etude.totaux.prisesEtanches,
    points: etude.totaux.points,
    circuits: etude.circuits.map((c) => c.nom + " " + c.section + "/" + c.calibre + "A " + c.points + "pt " + c.longueur + "m"),
    differentiels: etude.differentiels.map((d) => d.calibre + "A " + d.type + " [" + d.circuits.join(", ") + "]"),
    coffret: etude.coffret.rangees + "x" + etude.coffret.capacite + " (" + etude.coffret.modules + " modules)",
    cables: Object.keys(etude.cables).map(Number).sort((a, b) => a - b).map((s) => s + ":" + etude.cables[s]).join(" "),
    alimentation: etude.cableAlimentation,
    mainOeuvre: etude.mainOeuvre.total
  };
}

export const ATTENDUS = Object.freeze({
  studio: {
    surface: 25, prises: 6, prisesEtanches: 1, points: 3,
    circuits: ["Éclairage 1.5/10A 3pt 51m", "Prises 1.5/16A 6pt 53m"],
    differentiels: ["40A AC [Éclairage]", "40A AC [Prises]"],
    coffret: "1x13 (6 modules)", cables: "1.5:104", alimentation: 0, mainOeuvre: 53500
  },
  villa: {
    surface: 120, prises: 28, prisesEtanches: 3, points: 11,
    circuits: [
      "Éclairage 1 1.5/10A 8pt 149m", "Éclairage 2 1.5/10A 3pt 57m",
      "Prises 1 1.5/16A 8pt 63m", "Prises 2 1.5/16A 8pt 88m", "Prises 3 1.5/16A 6pt 94m",
      "Prises cuisine 2.5/20A 6pt 47m",
      "Climatiseur 1 2.5/20A 1pt 16m", "Climatiseur 2 2.5/20A 1pt 16m", "Chauffe-eau 2.5/20A 1pt 16m",
      "Cuisinière / plaque 6/32A 1pt 16m", "Lave-linge 2.5/20A 1pt 16m"
    ],
    differentiels: [
      "63A AC [Éclairage 1, Prises 1, Prises 3, Climatiseur 1, Chauffe-eau]",
      "40A AC [Éclairage 2, Prises 2, Prises cuisine, Climatiseur 2]",
      "63A A [Cuisinière / plaque, Lave-linge]"
    ],
    coffret: "2x26 (19 modules)", cables: "1.5:451 2.5:111 6:16", alimentation: 17, mainOeuvre: 201000
  },
  boutique: {
    surface: 40, prises: 7, prisesEtanches: 0, points: 6,
    circuits: ["Éclairage 1.5/10A 6pt 69m", "Prises 1.5/16A 7pt 66m", "Climatiseur 2.5/20A 1pt 11m"],
    differentiels: ["40A AC [Éclairage, Climatiseur]", "40A AC [Prises]"],
    coffret: "1x13 (7 modules)", cables: "1.5:135 2.5:11", alimentation: 9, mainOeuvre: 71000
  }
});

/* Règles qui doivent tenir pour TOUT chantier (pas seulement les 3 types). Retourne la liste des écarts. */
export function invariants(moteur, etude) {
  const ecarts = [];
  const R = moteur.REGLES_CIRCUITS;
  const max = { eclairage: R.eclairage.max, prises: R.prises.max, cuisine: R.prisesCuisine.max, dedie: 1 };
  const coherence = { 1.5: [10, 16], 2.5: [20], 6: [32] };
  const somme = (genre) => etude.circuits.filter((c) => c.genre === genre).reduce((s, c) => s + c.points, 0);
  etude.circuits.forEach((c) => {
    if (c.points > max[c.genre]) ecarts.push(c.nom + " : " + c.points + " points > " + max[c.genre]);
    if (!(coherence[c.section] || []).includes(c.calibre)) ecarts.push(c.nom + " : " + c.section + " mm² avec " + c.calibre + " A");
    if (c.longueur < etude.options.hauteur) ecarts.push(c.nom + " : longueur " + c.longueur + " m < hauteur");
  });
  if (somme("eclairage") !== etude.totaux.points) ecarts.push("points lumineux non tous raccordés");
  if (somme("prises") + somme("cuisine") !== etude.totaux.prises) ecarts.push("prises non toutes raccordées");
  const protegees = etude.differentiels.flatMap((d) => d.circuits);
  if (protegees.length !== etude.circuits.length || new Set(protegees).size !== etude.circuits.length) ecarts.push("un circuit sans différentiel ou protégé deux fois");
  etude.differentiels.forEach((d) => {
    if (d.circuits.length > R.differentiel.circuitsMax) ecarts.push(d.nom + " : " + d.circuits.length + " circuits > 8");
    if (d.circuits.length === 0) ecarts.push(d.nom + " vide");
  });
  if (etude.circuits.length >= 2 && etude.differentiels.length < 2) ecarts.push("moins de 2 différentiels");
  etude.circuits.filter((c) => c.typeA).forEach((c) => {
    const d = etude.differentiels.find((x) => x.circuits.includes(c.nom));
    if (!d || d.type !== "A") ecarts.push(c.nom + " hors différentiel de type A");
  });
  if (etude.coffret.capacite < etude.coffret.modules * (1 + R.reserveModules) - 1e-9) ecarts.push("coffret sans 20 % de réserve");
  const totalCables = Object.values(etude.cables).reduce((s, v) => s + v, 0);
  if (totalCables !== etude.cableTotal) ecarts.push("total des câbles incohérent");
  const mo = etude.mainOeuvre;
  /* Comparaison au centime : les devises à 2 décimales additionnent des nombres à virgule. */
  const recalcul = mo.lignes.reduce((s, l) => s + l.quantite * l.prix, 0) + mo.forfait + mo.journees.total + mo.libres.reduce((s, l) => s + l.montant, 0);
  if (!egalAuCentime(recalcul, mo.total)) ecarts.push("total main-d'œuvre incohérent");
  /* Tableau : rangées de 13 modules pleines (libres compris), sans chevauchement, chaque circuit
     placé une fois, chaque différentiel dans la même rangée que ses disjoncteurs. */
  if (etude.tableau.length !== etude.coffret.rangees) ecarts.push("nombre de rangées du schéma incohérent");
  const places = [];
  etude.tableau.forEach((rangee) => {
    let position = 0;
    rangee.modules.forEach((m) => {
      if (m.position !== position) ecarts.push("rangée " + rangee.numero + " : module mal placé");
      position += m.largeur;
      if (m.type === "disjoncteur") {
        places.push(m.numero);
        if (!rangee.modules.some((d) => d.type === "differentiel" && d.numero === m.differentiel)) ecarts.push("circuit " + m.numero + " séparé de son différentiel");
      }
    });
    if (position !== R.modulesParRangee) ecarts.push("rangée " + rangee.numero + " : " + position + " modules au lieu de " + R.modulesParRangee);
  });
  if (places.length !== etude.circuits.length || new Set(places).size !== places.length) ecarts.push("circuits absents ou en double dans le tableau");
  return ecarts;
}

/* Parcourt tout le résultat : aucun NaN, Infinity ni nombre négatif. */
export function egalAuCentime(a, b) {
  return Math.round(a * 100) === Math.round(b * 100);
}

/* Chiffrage : chaque montant = quantité × prix, totaux cohérents, remise et acompte jamais au-delà du total. */
export function invariantsChiffrage(chiffrage) {
  const ecarts = [];
  const t = chiffrage.total;
  chiffrage.materiel.forEach((l) => {
    if (!egalAuCentime(l.quantite * l.prix, l.montant)) ecarts.push(l.ref + " : montant incohérent");
    if (l.aCompleter !== (l.prix === 0)) ecarts.push(l.ref + " : alerte « Prix à compléter » incohérente");
  });
  if (!egalAuCentime(chiffrage.materiel.reduce((s, l) => s + l.montant, 0), chiffrage.totalMateriel)) ecarts.push("total matériel incohérent");
  if (!egalAuCentime(t.materiel + t.mainOeuvre, t.sousTotal)) ecarts.push("sous-total incohérent");
  if (t.remise > t.sousTotal || !egalAuCentime(t.sousTotal - t.remise, t.base)) ecarts.push("remise incohérente");
  if (!t.tvaActive && t.tva !== 0) ecarts.push("TVA comptée alors qu'elle est désactivée");
  if (t.tauxTva > 30 || t.tauxAcompte > 100 || t.valeurRemise < 0) ecarts.push("taux hors bornes");
  if (!egalAuCentime(t.base + t.tva, t.totalGeneral)) ecarts.push("total général incohérent");
  if (t.acompte > t.totalGeneral || !egalAuCentime(t.acompte + t.reste, t.totalGeneral)) ecarts.push("acompte incohérent");
  if (!chiffrage.conformite.every((p) => (p.etat === "conforme" || p.etat === "verifier") && p.titre && p.explication)) ecarts.push("point de conformité incomplet");
  return ecarts;
}

export function nombresInvalides(valeur, chemin = "etude", trouves = []) {
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur) || valeur < 0) trouves.push(chemin + " = " + valeur);
  } else if (typeof valeur === "string") {
    if (/NaN|Infinity|undefined/.test(valeur)) trouves.push(chemin + " contient « " + valeur + " »");
  } else if (Array.isArray(valeur)) {
    valeur.forEach((v, i) => nombresInvalides(v, chemin + "[" + i + "]", trouves));
  } else if (valeur && typeof valeur === "object") {
    Object.keys(valeur).forEach((k) => nombresInvalides(valeur[k], chemin + "." + k, trouves));
  }
  return trouves;
}

/* Générateur pseudo-aléatoire à graine (mulberry32) : le fuzz est reproductible. */
export function aleatoire(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VALEURS_PIEGES = [NaN, Infinity, -Infinity, -1, -0.0001, 0, 1e308, -1e308, "abc", "", " ", "12,5", "1e9", "-3", null, undefined, true, {}, [], [1], "Infinity", "NaN", 0.1, 2000.0001, 1e-9];

/* Chantier aléatoire, avec une part de valeurs piégées et de types inconnus. */
export function chantierAleatoire(moteur, alea) {
  const pioche = (liste) => liste[Math.floor(alea() * liste.length)];
  const nombre = (min, max) => (alea() < 0.2 ? pioche(VALEURS_PIEGES) : min + alea() * (max - min));
  const types = [...Object.keys(moteur.TYPES_PIECES), "<img src=x>", "__proto__", "inconnu"];
  const pieces = Array.from({ length: Math.floor(alea() * 70) }, () => ({
    type: pioche(types), surface: nombre(0, 2500),
    prises: alea() < 0.5 ? null : nombre(0, 60), points: alea() < 0.5 ? null : nombre(0, 60)
  }));
  const appareils = {};
  Object.keys(moteur.APPAREILS).forEach((id) => { if (alea() < 0.4) appareils[id] = nombre(0, 25); });
  if (alea() < 0.1) appareils.__proto__ = { pirate: 1 };
  const points = {};
  Object.keys(moteur.MAIN_OEUVRE_POINTS).forEach((id) => {
    if (alea() < 0.3) points[id] = { quantite: nombre(0, 12000), prix: nombre(0, 2e8) };
  });
  return {
    alimentation: pioche(["mono", "tri", "x", null]),
    pieces: alea() < 0.05 ? pioche(VALEURS_PIEGES) : pieces,
    appareils: alea() < 0.05 ? pioche(VALEURS_PIEGES) : appareils,
    options: {
      distance: nombre(0, 600), hauteur: nombre(0, 8),
      parafoudre: alea() < 0.5, terreNeuve: pioche([true, false, "oui", 1]), tableauARemplacer: alea() < 0.5
    },
    mainOeuvre: alea() < 0.05 ? pioche(VALEURS_PIEGES) : {
      points,
      forfait: nombre(0, 2e8),
      journees: { ouvriers: nombre(0, 60), jours: nombre(0, 400), tarif: nombre(0, 2e8) },
      libres: Array.from({ length: Math.floor(alea() * 25) }, () => ({ libelle: pioche(["Saignées", 42, null, "<b>x</b>"]), montant: nombre(0, 2e8) }))
    },
    materiel: alea() < 0.05 ? pioche(VALEURS_PIEGES) : Object.fromEntries(
      ["cable-1.5", "prise", "coffret-2r", "disjoncteur-16", "__proto__", "inconnu"].filter(() => alea() < 0.4)
        .map((ref) => [ref, { quantite: alea() < 0.5 ? null : nombre(0, 12000), prix: alea() < 0.5 ? null : nombre(0, 2e8) }])
    ),
    totaux: alea() < 0.05 ? pioche(VALEURS_PIEGES) : {
      remiseType: pioche(["pourcent", "montant", "x", null]), remise: nombre(0, 2e8),
      tva: pioche([true, false, "oui", 1]), tauxTva: nombre(0, 40), acompte: nombre(0, 120)
    }
  };
}
