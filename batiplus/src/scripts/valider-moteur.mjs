#!/usr/bin/env node
/* ==========================================================================
   BâtiPlus — validation du moteur NF C 15-100
   Calcule les 3 chantiers types, vérifie les règles et les valeurs de référence,
   lance 1 000 chantiers aléatoires (graine fixe) et écrit
   docs/validation-moteur-nfc15100.md.
   Usage : npm run valider:moteur
   ========================================================================== */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTENDUS, CHANTIERS_TYPES, aleatoire, chantierAleatoire, chargerMoteur, invariants, invariantsChiffrage, moteurLivre, nombresInvalides, resumer
} from "./chantiers-types.mjs";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SORTIE = join(RACINE, "docs", "validation-moteur-nfc15100.md");
const moteur = chargerMoteur();
/* Le catalogue de départ au format de lireCatalogue() : { ref: { prix } }. */
const catalogueDepart = Object.fromEntries(Object.entries(moteur.CATALOGUE_DEFAUT).map(([ref, prix]) => [ref, { prix }]));
const nf = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/\u202F|\u00A0/g, " ");
const sec = (s) => String(s).replace(".", ",");
const lignes = [];
let echecs = 0;

lignes.push("# Validation du moteur NF C 15-100", "");
lignes.push("Document généré par `npm run valider:moteur` (src/scripts/valider-moteur.mjs). Ne pas modifier à la main.", "");
lignes.push("Le moteur est la section de `src/moteur.js` comprise entre les marqueurs « MOTEUR NF C 15-100 » et « FIN DU MOTEUR ». "
  + "Il est exécuté ici dans une VM Node **sans DOM ni stockage**, avec `src/donnees.js` seulement, "
  + "puis on vérifie que cette même section est livrée à l'identique dans `www/index.html`.", "");
const livre = moteurLivre();
if (!livre) echecs += 1;
lignes.push("- Moteur livré à l'identique dans www/index.html : " + (livre ? "**oui**" : "**NON**"), "");

lignes.push("## Règles appliquées", "");
lignes.push("| Élément | Règle |", "|---|---|");
lignes.push("| Séjour | 1 prise par 4 m², 5 minimum, 7 minimum au-delà de 28 m² ; 1 point lumineux par 20 m² |");
lignes.push("| Chambre | 3 prises, 1 point lumineux par 20 m² |");
lignes.push("| Cuisine | 6 prises (dont 4 sur plan de travail) sur circuit 2,5 mm² / 20 A ; 1 point par 15 m² |");
lignes.push("| Salle d'eau, véranda, extérieur | 1 prise étanche IP44 (salle d'eau, véranda, extérieur) |");
lignes.push("| WC | aucune prise, 1 point lumineux |");
lignes.push("| Couloir | 1 prise, 1 point par 10 m², commande en va-et-vient |");
lignes.push("| Magasin / bureau | 1 prise par 8 m² (2 min.) / par 4 m² (3 min.) ; 1 point par 8 m² / 10 m² |");
lignes.push("| Circuit éclairage | 8 points max, 1,5 mm², 10 A |");
lignes.push("| Circuit prises | 8 prises max, 1,5 mm², 16 A |");
lignes.push("| Appareils | 1 circuit par appareil : 2,5 mm² / 20 A ; cuisinière 6 mm² / 32 A |");
lignes.push("| Différentiels 30 mA | 8 circuits max chacun, 2 minimum ; type A pour cuisinière et lave-linge, AC sinon ; 63 A si circuit 32 A ou 2 appareils, 40 A sinon |");
lignes.push("| Coffret | 1 module par disjoncteur, 2 par différentiel ou parafoudre (4 en triphasé) ; +20 % de réserve ; rangées de 13 |");
lignes.push("| Câble d'un circuit | (4 × √surface de chaque pièce desservie + hauteur × points + √surface totale) × 1,12, arrondi au mètre supérieur |");
lignes.push("| Alimentation | distance × 1,12 en 3G10 (monophasé) ou 5G10 (triphasé) |", "");

for (const type of CHANTIERS_TYPES) {
  const etude = moteur.etudierChantier(type.chantier, "XOF");
  const etude2 = moteur.etudierChantier(JSON.parse(JSON.stringify(type.chantier)), "XOF");
  const resume = resumer(etude);
  const reproductible = JSON.stringify(etude) === JSON.stringify(etude2);
  const conforme = JSON.stringify(resume) === JSON.stringify(ATTENDUS[type.cle]);
  const chiffrage = moteur.chiffrerChantier(type.chantier, catalogueDepart, "XOF");
  const ecarts = [...invariants(moteur, etude), ...invariantsChiffrage(chiffrage)];
  const invalides = nombresInvalides(chiffrage);
  const ok = reproductible && conforme && !ecarts.length && !invalides.length;
  if (!ok) echecs += 1;

  lignes.push("## " + type.titre, "");
  lignes.push("**Saisie** : " + etude.pieces.map((p) => p.nom + " " + sec(p.surface) + " m²").join(", ")
    + (Object.keys(etude.appareils).length ? " · appareils : " + Object.entries(etude.appareils).map(([id, n]) => n + " × " + moteur.APPAREILS[id].libelle).join(", ") : " · aucun appareil")
    + " · distance compteur–tableau " + sec(etude.options.distance) + " m"
    + (etude.options.parafoudre ? " · parafoudre" : "") + (etude.options.terreNeuve ? " · terre neuve" : ""), "");
  lignes.push("| Pièce | Surface | Prises | Points lumineux |", "|---|---:|---:|---:|");
  etude.pieces.forEach((p) => lignes.push("| " + p.nom + " | " + sec(p.surface) + " m² | " + p.prises + " | " + p.points + " |"));
  lignes.push("| **Total** | **" + sec(etude.surfaceTotale) + " m²** | **" + etude.totaux.prises + "** (dont " + etude.totaux.prisesEtanches + " étanches) | **" + etude.totaux.points + "** |", "");
  lignes.push("| N° | Circuit | Pièces | Section | Disjoncteur | Câble |", "|---:|---|---|---:|---:|---:|");
  etude.circuits.forEach((c) => lignes.push("| " + c.numero + " | " + c.nom + " | " + (c.pieces.join(", ") || "—") + " | " + sec(c.section) + " mm² | " + c.calibre + " A | " + c.longueur + " m |"));
  lignes.push("");
  lignes.push("| Différentiel 30 mA | Circuits protégés |", "|---|---|");
  etude.differentiels.forEach((d) => lignes.push("| " + d.nom + " — " + d.calibre + " A type " + d.type + " | " + d.circuits.join(", ") + " |"));
  lignes.push("");
  lignes.push("- Coffret : " + etude.coffret.rangees + " rangée(s) de 13 = " + etude.coffret.capacite + " modules pour " + etude.coffret.modules + " utilisés (" + etude.coffret.modulesReserves + " avec la réserve de 20 %)");
  lignes.push("- Câbles : " + Object.keys(etude.cables).map(Number).sort((a, b) => a - b).map((s) => "3G" + sec(s) + " = " + etude.cables[s] + " m").join(" ; ")
    + (etude.cableAlimentation ? " ; alimentation 3G10 = " + etude.cableAlimentation + " m" : ""));
  lignes.push("- Main-d'œuvre au point (prix de départ FCFA) : " + etude.mainOeuvre.lignes.filter((l) => l.quantite).map((l) => l.quantite + " × " + l.libelle.toLowerCase() + " à " + nf(l.prix)).join(", ")
    + " = **" + nf(etude.mainOeuvre.total) + " FCFA**", "");
  lignes.push("Matériel : " + etude.materiel.map((m) => m.quantite + " " + m.unite + " " + m.designation).join(" · "), "");
  lignes.push("- Schéma du tableau : " + etude.tableau.map((r) => "rangée " + r.numero + " = " + r.modules.filter((m) => m.type !== "libre").map((m) => (m.type === "differentiel" ? "[ID" + m.numero + "]" : m.type === "parafoudre" ? "[PF]" : m.numero)).join(" ") + " + " + (13 - r.occupe) + " libres").join(" ; "));
  const t = chiffrage.total;
  lignes.push("- Chiffrage indicatif (catalogue de départ FCFA, sans remise ni TVA) : matériel " + nf(chiffrage.totalMateriel) + " + main-d'œuvre " + nf(t.mainOeuvre) + " = **" + nf(t.totalGeneral) + " FCFA**, acompte 40 % = " + nf(t.acompte));
  lignes.push("- Conformité : " + chiffrage.conformite.filter((p) => p.etat === "conforme").length + " points conformes, " + chiffrage.conformite.filter((p) => p.etat !== "conforme").length + " à vérifier (" + chiffrage.conformite.filter((p) => p.etat !== "conforme").map((p) => p.titre.toLowerCase()).join(", ") + ")", "");
  lignes.push("Contrôle : reproductible " + (reproductible ? "✔" : "✘") + " · valeurs de référence " + (conforme ? "✔" : "✘")
    + " · règles " + (ecarts.length ? "✘ " + ecarts.join(" ; ") : "✔") + " · nombres valides " + (invalides.length ? "✘ " + invalides.slice(0, 3).join(" ; ") : "✔"), "");
  if (!conforme) lignes.push("```", "obtenu  : " + JSON.stringify(resume), "attendu : " + JSON.stringify(ATTENDUS[type.cle]), "```", "");
}

function cataloguePiege(alea) {
  const pieges = [NaN, -5, 1e308, "abc", "12,5", null, {}, 2500];
  return Object.fromEntries(Object.keys(moteur.CATALOGUE_DEFAUT).map((ref) => [ref, alea() < 0.5 ? { prix: pieges[Math.floor(alea() * pieges.length)] } : null]));
}

/* 1 000 chantiers aléatoires, graine fixe : aucune exception, aucun NaN/Infinity/négatif, règles tenues. */
const alea = aleatoire(20261015);
let exceptions = 0;
let invalidesFuzz = 0;
let ecartsFuzz = 0;
const premiers = [];
for (let i = 0; i < 1000; i += 1) {
  const chantier = chantierAleatoire(moteur, alea);
  try {
    const devise = i % 2 ? "XOF" : "EUR";
    const catalogue = i % 3 === 0 ? catalogueDepart : (i % 3 === 1 ? {} : cataloguePiege(alea));
    const chiffrage = moteur.chiffrerChantier(chantier, catalogue, devise);
    const etude = chiffrage.etude;
    const inv = nombresInvalides(chiffrage);
    const ec = [...invariants(moteur, etude), ...invariantsChiffrage(chiffrage)];
    if (inv.length) { invalidesFuzz += 1; if (premiers.length < 3) premiers.push("#" + i + " " + inv[0]); }
    if (ec.length) { ecartsFuzz += 1; if (premiers.length < 3) premiers.push("#" + i + " " + ec[0]); }
    if (etude.surfaceTotale > 60 * 2000 || etude.pieces.some((p) => p.surface < 0.5 || p.surface > 2000)) { ecartsFuzz += 1; if (premiers.length < 3) premiers.push("#" + i + " surface hors bornes"); }
  } catch (erreur) {
    exceptions += 1;
    if (premiers.length < 3) premiers.push("#" + i + " exception " + erreur.message);
  }
}
const fuzzOk = !exceptions && !invalidesFuzz && !ecartsFuzz;
if (!fuzzOk) echecs += 1;
lignes.push("## Robustesse : 1 000 chantiers aléatoires", "");
lignes.push("Graine fixe 20261015, jusqu'à 70 pièces, 20 % de valeurs piégées (NaN, Infinity, négatifs, 1e308, textes, objets, types inconnus, `__proto__`). Chaque chantier est chiffré en entier (matériel, main-d'œuvre, remise, TVA, acompte), en FCFA et en euro, avec le catalogue de départ, un catalogue vide ou un catalogue piégé ; le schéma du tableau et la liste de conformité sont contrôlés aussi.", "");
lignes.push("| Mesure | Résultat |", "|---|---:|");
lignes.push("| Exceptions | " + exceptions + " |", "| Résultats avec NaN, Infinity ou négatif | " + invalidesFuzz + " |", "| Règles non tenues | " + ecartsFuzz + " |", "");
if (premiers.length) lignes.push("Premiers écarts : " + premiers.join(" ; "), "");
lignes.push("Bornes : surface 0,5 à 2 000 m² par pièce (refus à la saisie, ramenée dans les bornes par le moteur), 60 pièces, 50 prises et 50 points par pièce, 20 appareils de chaque type, distance 0 à 500 m, hauteur 2 à 6 m.", "");
lignes.push("> Étude indicative établie selon les règles usuelles de la NF C 15-100. L'électricien reste responsable de la conformité de l'installation.", "");

mkdirSync(dirname(SORTIE), { recursive: true });
writeFileSync(SORTIE, lignes.join("\n"));
console.log((echecs ? "✘ " + echecs + " échec(s)" : "✔ 3 chantiers types conformes, 1 000 chantiers aléatoires sans NaN, Infinity ni négatif") + " → docs/validation-moteur-nfc15100.md");
process.exit(echecs ? 1 : 0);
