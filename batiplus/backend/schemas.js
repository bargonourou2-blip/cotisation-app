/* ==========================================================================
   BâtiPlus — backend : validation des entrées, écrite à la main (C.6)
   Chaque corps JSON passe par un schéma : types, longueurs, bornes, listes autorisées.
   Les champs INCONNUS sont REJETÉS (jamais ignorés), un champ obligatoire absent aussi.
   Nombres : NaN, Infinity, négatifs et plus de 2 décimales refusés (B.6).
   Les bornes viennent de regles-donnees.json, extrait des sources de l'application par
   src/scripts/regles-api.mjs : l'application et l'API appliquent EXACTEMENT les mêmes règles.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REGLES = Object.freeze(JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "regles-donnees.json"), "utf8")));

export class ErreurSchema extends Error {
  constructor(chemin, raison) {
    super((chemin || "corps") + " : " + raison);
    this.chemin = chemin || "corps";
  }
}

const CONTROLE = /[\u0000-\u001F\u007F]/;
const CONTROLE_PARAGRAPHE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const DONNEES_IMAGE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;
const possede = (objet, cle) => Object.prototype.hasOwnProperty.call(objet, cle);

function objetSimple(valeur) {
  return Boolean(valeur) && typeof valeur === "object" && !Array.isArray(valeur) && Object.getPrototypeOf(valeur) === Object.prototype;
}

/* ---------- Briques ---------- */

export const S = Object.freeze({
  texte({ min = 0, max, motif = null, paragraphe = false }) {
    return (v, chemin) => {
      if (typeof v !== "string") throw new ErreurSchema(chemin, "texte attendu");
      if (v.length < min || v.length > max) throw new ErreurSchema(chemin, "longueur hors bornes");
      if ((paragraphe ? CONTROLE_PARAGRAPHE : CONTROLE).test(v)) throw new ErreurSchema(chemin, "caractère interdit");
      if (motif && !motif.test(v)) throw new ErreurSchema(chemin, "format invalide");
      return v;
    };
  },
  nombre({ min, max, decimales = 2 }) {
    const facteur = Math.pow(10, decimales);
    return (v, chemin) => {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new ErreurSchema(chemin, "nombre attendu");
      if (v < min || v > max) throw new ErreurSchema(chemin, "hors bornes");
      if (Math.abs(v * facteur - Math.round(v * facteur)) > 1e-6) throw new ErreurSchema(chemin, "trop de décimales");
      return v;
    };
  },
  entier(min, max) {
    return (v, chemin) => {
      if (!Number.isInteger(v) || v < min || v > max) throw new ErreurSchema(chemin, "entier hors bornes");
      return v;
    };
  },
  booleen() {
    return (v, chemin) => {
      if (typeof v !== "boolean") throw new ErreurSchema(chemin, "booléen attendu");
      return v;
    };
  },
  parmi(liste) {
    return (v, chemin) => {
      if (typeof v !== "string" || !liste.includes(v)) throw new ErreurSchema(chemin, "valeur non autorisée");
      return v;
    };
  },
  egal(valeur) {
    return (v, chemin) => {
      if (v !== valeur) throw new ErreurSchema(chemin, "valeur non autorisée");
      return v;
    };
  },
  ouNul(sous) {
    return (v, chemin) => (v === null ? null : sous(v, chemin));
  },
  date() {
    return (v, chemin) => {
      if (typeof v !== "string" || v.length > 40 || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(v) || Number.isNaN(Date.parse(v))) throw new ErreurSchema(chemin, "date ISO attendue");
      return v;
    };
  },
  image() {
    return (v, chemin) => {
      if (v === "") return v;
      if (typeof v !== "string" || v.length > REGLES.imageDonneesMax || !DONNEES_IMAGE.test(v)) throw new ErreurSchema(chemin, "image refusée");
      return v;
    };
  },
  liste(element, max) {
    return (v, chemin) => {
      if (!Array.isArray(v)) throw new ErreurSchema(chemin, "liste attendue");
      if (v.length > max) throw new ErreurSchema(chemin, "liste trop longue");
      return v.map((x, i) => element(x, chemin + "[" + i + "]"));
    };
  },
  /* Objet aux clés libres mais contrôlées (liste autorisée ou motif). */
  dictionnaire(cles, valeur, max = 200) {
    return (v, chemin) => {
      if (!objetSimple(v)) throw new ErreurSchema(chemin, "objet attendu");
      const noms = Object.keys(v);
      if (noms.length > max) throw new ErreurSchema(chemin, "trop de clés");
      const sortie = {};
      for (const nom of noms) {
        const permise = Array.isArray(cles) ? cles.includes(nom) : cles.test(nom);
        if (!permise) throw new ErreurSchema(chemin, "clé non autorisée");
        sortie[nom] = valeur(v[nom], chemin + "." + nom);
      }
      return sortie;
    };
  },
  /* Objet STRICT : champs obligatoires + facultatifs ; tout autre champ → refus. */
  objet(obligatoires, facultatifs = {}) {
    return (v, chemin) => {
      if (!objetSimple(v)) throw new ErreurSchema(chemin, "objet attendu");
      for (const nom of Object.keys(v)) {
        if (!possede(obligatoires, nom) && !possede(facultatifs, nom)) throw new ErreurSchema(chemin, "champ inconnu « " + nom.slice(0, 30) + " »");
      }
      const sortie = {};
      for (const [nom, regle] of Object.entries(obligatoires)) {
        if (!possede(v, nom)) throw new ErreurSchema(chemin, "champ « " + nom + " » manquant");
        sortie[nom] = regle(v[nom], (chemin ? chemin + "." : "") + nom);
      }
      for (const [nom, regle] of Object.entries(facultatifs)) {
        if (possede(v, nom)) sortie[nom] = regle(v[nom], (chemin ? chemin + "." : "") + nom);
      }
      return sortie;
    };
  }
});

export function valider(schema, valeur) {
  return schema(valeur, "");
}

/* ---------- Valeurs partagées ---------- */

const R = REGLES;
const N = R.saisie.nombres;
const court = (min = 0) => S.texte({ min, max: R.bornes.texteMax });
const prix = S.nombre({ min: 0, max: N.prix.max, decimales: 2 });
const quantite = S.entier(0, N.quantite.max);
const motifId = /^[A-Za-z0-9_-]{1,40}$/;
const motifIdChantier = /^[A-Za-z0-9-]{8,64}$/;
export const MOTIF_COMPTE = /^[A-Za-z0-9-]{8,64}$/;
export const MOTIF_APPAREIL = /^[a-f0-9]{32}$/;
export const MOTIF_TELEPHONE = new RegExp("^\\+\\d{" + R.saisie.telephone.chiffresMin + "," + R.saisie.telephone.chiffresMax + "}$");
const telephone = S.texte({ min: 1, max: 16, motif: MOTIF_TELEPHONE });
const telephoneOuVide = S.texte({ max: 16, motif: /^(\+\d{6,15})?$/ });
const code = S.texte({ min: R.code.longueurMin, max: R.code.longueurMax, motif: /^\d+$/ });
const appareil = S.texte({ min: 32, max: 32, motif: MOTIF_APPAREIL });
const nomAppareil = S.texte({ max: 60 });
const pays = S.parmi(Object.keys(R.pays));
const devise = S.parmi(Object.keys(R.devises));
const conditions = S.texte({ max: R.bornes.conditionsMax, paragraphe: true });

/* ---------- Comptes ---------- */

export const SCHEMA_CREER = S.objet({
  compteId: S.texte({ min: 8, max: 64, motif: MOTIF_COMPTE }), telephone, code, nom: court(1), entreprise: court(), ville: court(1), pays, devise, appareil
}, { nomAppareil });

export const SCHEMA_CONNEXION = S.objet({ telephone, code, appareil }, { nomAppareil });
export const SCHEMA_CHANGER_CODE = S.objet({ ancien: code, nouveau: code });
export const SCHEMA_SUPPRIMER_COMPTE = S.objet({ code, confirmation: S.egal("SUPPRIMER") });
export const SCHEMA_VIDE = S.objet({});

/* Profil : la synchronisation n'envoie jamais le téléphone ; PUT /api/profil peut le changer. */
const champsProfil = { nom: court(1), entreprise: court(), ville: court(1), pays, devise, conditions, photo: S.image(), logo: S.image() };
export const SCHEMA_PROFIL_SYNC = S.objet(champsProfil);
export const SCHEMA_PROFIL_PUT = S.objet(champsProfil, { telephone });

/* ---------- Données métier (mêmes formes que devisValide, chantierValide, clientManuelValide, catalogueValide) ---------- */

const totaux = S.objet({
  remiseType: S.parmi(["pourcent", "montant"]), remise: S.nombre({ min: 0, max: N.prix.max, decimales: 2 }),
  tva: S.booleen(), tauxTva: S.nombre({ min: 0, max: R.tvaMax, decimales: 2 }), acompte: S.nombre({ min: 0, max: 100, decimales: 2 })
});
const ligneLibre = S.objet({ libelle: S.texte({ max: 120 }), montant: prix });
const journees = (tarifNul) => S.objet({
  ouvriers: S.entier(0, N.ouvriers.max), jours: S.nombre({ min: 0, max: N.jours.max, decimales: 1 }), tarif: tarifNul ? S.ouNul(prix) : prix
});

const ligneDevis = S.objet({
  id: S.texte({ max: 5, motif: /^(l\d{1,4})?$/ }),
  ref: S.ouNul(S.texte({ min: 1, max: 40, motif: /^(?:[a-z0-9.-]{1,40}|perso-[a-f0-9]{8})$/ })),
  designation: S.texte({ max: R.catalogue.designationMax }), unite: S.parmi(R.unites), categorie: S.parmi(R.categories),
  quantite: S.entier(0, R.devis.quantiteMax), prix, fournisseur: S.texte({ max: R.catalogue.fournisseurMax }), supprimee: S.booleen()
});
const mainOeuvreDevis = S.objet({
  points: S.dictionnaire(R.pointsMainOeuvre, S.objet({ quantite: S.entier(0, N.quantite.max), prix })),
  auto: S.dictionnaire(R.pointsMainOeuvre, S.entier(0, N.quantite.max)),
  forfait: prix,
  journees: journees(false),
  libres: S.liste(ligneLibre, R.chantier.lignesLibresMax)
});
const baseDevis = {
  id: S.texte({ min: 1, max: 40, motif: motifId }), compteId: S.texte({ min: 8, max: 64, motif: MOTIF_COMPTE }),
  statut: S.parmi(R.statutsDevis), creeLe: S.date(), modifieLe: S.date(),
  titre: S.texte({ max: R.devis.titreMax }), client: court(), total: S.nombre({ min: 0, max: 1e17, decimales: 6 })
};
const devisComplet = S.objet({
  ...baseDevis, complet: S.egal(true), numero: S.texte({ min: 12, max: 14, motif: /^BP-\d{4}-\d{4,6}$/ }),
  chantierId: S.ouNul(S.texte({ min: 1, max: 40, motif: motifId })), clientTelephone: S.texte({ max: 16, motif: /^\+?\d{0,15}$/ }),
  lieu: court(), lignes: S.liste(ligneDevis, R.devis.lignesMax), mainOeuvre: mainOeuvreDevis, totaux,
  conditions, note: S.texte({ max: R.devis.noteMax, paragraphe: true })
});
const devisAncien = S.objet({ ...baseDevis, complet: S.egal(false), numero: S.egal("") });
export function validerDevis(v, chemin = "devis") {
  if (!objetSimple(v)) throw new ErreurSchema(chemin, "objet attendu");
  return v.complet === true ? devisComplet(v, chemin) : devisAncien(v, chemin);
}

const piece = S.objet({
  id: S.texte({ min: 1, max: 40, motif: /^[a-z0-9-]{1,40}$/i }), type: S.parmi(R.typesPieces),
  surface: S.nombre({ min: N.surface.min, max: N.surface.max, decimales: 2 }),
  prises: S.ouNul(S.entier(0, N.prises.max)), points: S.ouNul(S.entier(0, N.points.max))
});
export const SCHEMA_CHANTIER = S.objet({
  id: S.texte({ min: 8, max: 64, motif: motifIdChantier }), compteId: S.texte({ min: 8, max: 64, motif: MOTIF_COMPTE }),
  creeLe: S.date(), modifieLe: S.date(), statut: S.parmi(["brouillon", "etudie"]),
  etape: S.entier(1, R.etapesChantier), etapeMax: S.entier(1, R.etapesChantier),
  client: S.objet({ nom: court(), telephone: telephoneOuVide }), nom: court(), lieu: court(),
  type: S.parmi(R.typesChantier), alimentation: S.parmi(R.alimentations),
  pieces: S.liste(piece, N.pieces.max),
  appareils: S.dictionnaire(R.appareils, S.entier(1, N.appareils.max)),
  options: S.objet({
    distance: S.nombre({ min: 0, max: N.distance.max, decimales: 1 }), hauteur: S.nombre({ min: N.hauteur.min, max: N.hauteur.max, decimales: 2 }),
    parafoudre: S.booleen(), terreNeuve: S.booleen(), tableauARemplacer: S.booleen()
  }),
  mainOeuvre: S.objet({
    points: S.dictionnaire(R.pointsMainOeuvre, S.objet({ quantite: S.ouNul(S.entier(0, N.quantite.max)), prix: S.ouNul(prix) })),
    forfait: prix, journees: journees(true), libres: S.liste(ligneLibre, R.chantier.lignesLibresMax)
  }),
  materiel: S.dictionnaire(/^[a-z0-9.-]{1,40}$/, S.objet({ quantite: S.ouNul(S.entier(0, N.quantite.max)), prix: S.ouNul(prix) }), 80),
  totaux
});

export const SCHEMA_CLIENT = S.objet({
  id: S.texte({ min: 1, max: 40, motif: motifId }), compteId: S.texte({ min: 8, max: 64, motif: MOTIF_COMPTE }),
  nom: court(1), telephone: telephoneOuVide, creeLe: S.date(), modifieLe: S.date()
});

/* Catalogue : la borne du nombre d'articles dépend de la formule (300 gratuit, 3 000 Pro) :
   elle est appliquée par le service, en base, pas par le schéma. */
const article = S.objet({
  ref: S.texte({ min: 1, max: 40, motif: /^(?:[a-z0-9.-]{1,40}|perso-[a-f0-9]{8})$/ }),
  designation: S.texte({ min: 1, max: R.catalogue.designationMax }), unite: S.parmi(R.unites), categorie: S.parmi(R.categories),
  fournisseurs: S.liste(S.objet({ nom: S.texte({ max: R.catalogue.fournisseurMax }), prix }), R.catalogue.fournisseursMax),
  choisi: S.ouNul(S.entier(0, R.catalogue.fournisseursMax - 1))
});
export const ARTICLES_PRO_MAX = 3000;
export const SCHEMA_CATALOGUE = S.objet({
  articles: S.liste(article, ARTICLES_PRO_MAX),
  mainOeuvre: S.objet({ points: S.dictionnaire(R.pointsMainOeuvre, prix), journee: S.ouNul(prix) })
});
export function validerCatalogue(v, chemin = "catalogue") {
  const propre = SCHEMA_CATALOGUE(v, chemin);
  const refs = new Set();
  propre.articles.forEach((a, i) => {
    if (refs.has(a.ref)) throw new ErreurSchema(chemin + ".articles[" + i + "]", "article en double");
    if (!a.fournisseurs.length) throw new ErreurSchema(chemin + ".articles[" + i + "]", "au moins un fournisseur");
    if (a.choisi !== null && a.choisi >= a.fournisseurs.length) throw new ErreurSchema(chemin + ".articles[" + i + "]", "fournisseur choisi absent");
    if (a.ref.startsWith("perso-") === false && !R.articlesDefaut.includes(a.ref)) throw new ErreurSchema(chemin + ".articles[" + i + "]", "article inconnu");
    refs.add(a.ref);
  });
  return propre;
}

/* ---------- Synchronisation ---------- */

export const TYPES_SYNC = Object.freeze(["devis", "chantier", "client", "catalogue", "profil"]);
export const OPERATIONS_MAX = 60;
const operation = S.objet({
  type: S.parmi(TYPES_SYNC), id: S.texte({ min: 1, max: 64, motif: /^[A-Za-z0-9_-]{1,64}$/ }),
  action: S.parmi(["ecrire", "supprimer"]), quand: S.date()
}, { donnees: (v) => v });
export const SCHEMA_SYNC = S.objet({
  curseur: S.entier(0, Number.MAX_SAFE_INTEGER), abonnement: S.texte({ max: 2000, motif: /^([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)?$/ }),
  operations: S.liste(operation, OPERATIONS_MAX)
});

export const SCHEMA_ACTIVER_CODE = S.objet({ code: S.texte({ min: 17, max: 17, motif: /^BP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/ }) });
export const SCHEMA_RENOUVELLEMENT = S.objet({ actif: S.booleen() });

/* ---------- Administration ---------- */

const motif = S.texte({ min: 5, max: 300 });
export const SCHEMA_ADMIN_CONNEXION = S.objet({ code: S.texte({ min: 6, max: 64 }), appareil });
export const SCHEMA_ADMIN_CODES = S.objet({
  formule: S.parmi(["semaine", "mensuel", "annuel", "vie"]), nombre: S.entier(1, 50), validiteJours: S.entier(1, 365), motif
});
export const SCHEMA_ADMIN_SUSPENDRE = S.objet({ electricienId: S.entier(1, Number.MAX_SAFE_INTEGER), suspendu: S.booleen(), motif, confirmation: telephone });
export const SCHEMA_ADMIN_JOURS = S.objet({ electricienId: S.entier(1, Number.MAX_SAFE_INTEGER), jours: S.entier(-365, 365), motif, confirmation: telephone });
export const SCHEMA_ADMIN_REMBOURSER = S.objet({ motif, confirmation: S.texte({ min: 9, max: 23, motif: /^BP-[A-Z0-9]{6,20}$/ }) });
