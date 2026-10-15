# Validation du moteur NF C 15-100

Document généré par `npm run valider:moteur` (src/scripts/valider-moteur.mjs). Ne pas modifier à la main.

Le moteur est la section de `src/moteur.js` comprise entre les marqueurs « MOTEUR NF C 15-100 » et « FIN DU MOTEUR ». Il est exécuté ici dans une VM Node **sans DOM ni stockage**, avec `src/donnees.js` seulement, puis on vérifie que cette même section est livrée à l'identique dans `www/index.html`.

- Moteur livré à l'identique dans www/index.html : **oui**

## Règles appliquées

| Élément | Règle |
|---|---|
| Séjour | 1 prise par 4 m², 5 minimum, 7 minimum au-delà de 28 m² ; 1 point lumineux par 20 m² |
| Chambre | 3 prises, 1 point lumineux par 20 m² |
| Cuisine | 6 prises (dont 4 sur plan de travail) sur circuit 2,5 mm² / 20 A ; 1 point par 15 m² |
| Salle d'eau, véranda, extérieur | 1 prise étanche IP44 (salle d'eau, véranda, extérieur) |
| WC | aucune prise, 1 point lumineux |
| Couloir | 1 prise, 1 point par 10 m², commande en va-et-vient |
| Magasin / bureau | 1 prise par 8 m² (2 min.) / par 4 m² (3 min.) ; 1 point par 8 m² / 10 m² |
| Circuit éclairage | 8 points max, 1,5 mm², 10 A |
| Circuit prises | 8 prises max, 1,5 mm², 16 A |
| Appareils | 1 circuit par appareil : 2,5 mm² / 20 A ; cuisinière 6 mm² / 32 A |
| Différentiels 30 mA | 8 circuits max chacun, 2 minimum ; type A pour cuisinière et lave-linge, AC sinon ; 63 A si circuit 32 A ou 2 appareils, 40 A sinon |
| Coffret | 1 module par disjoncteur, 2 par différentiel ou parafoudre (4 en triphasé) ; +20 % de réserve ; rangées de 13 |
| Câble d'un circuit | (4 × √surface de chaque pièce desservie + hauteur × points + √surface totale) × 1,12, arrondi au mètre supérieur |
| Alimentation | distance × 1,12 en 3G10 (monophasé) ou 5G10 (triphasé) |

## Studio 25 m² — séjour, salle d'eau, WC

**Saisie** : Séjour 18 m², Salle d'eau 4 m², WC 3 m² · aucun appareil · distance compteur–tableau 0 m

| Pièce | Surface | Prises | Points lumineux |
|---|---:|---:|---:|
| Séjour | 18 m² | 5 | 1 |
| Salle d'eau | 4 m² | 1 | 1 |
| WC | 3 m² | 0 | 1 |
| **Total** | **25 m²** | **6** (dont 1 étanches) | **3** |

| N° | Circuit | Pièces | Section | Disjoncteur | Câble |
|---:|---|---|---:|---:|---:|
| 1 | Éclairage | Séjour, Salle d'eau, WC | 1,5 mm² | 10 A | 51 m |
| 2 | Prises | Séjour, Salle d'eau | 1,5 mm² | 16 A | 53 m |

| Différentiel 30 mA | Circuits protégés |
|---|---|
| Différentiel 1 — 40 A type AC | Éclairage |
| Différentiel 2 — 40 A type AC | Prises |

- Coffret : 1 rangée(s) de 13 = 13 modules pour 6 utilisés (8 avec la réserve de 20 %)
- Câbles : 3G1,5 = 104 m
- Main-d'œuvre au point (prix de départ FCFA) : 6 × prise de courant à 2 500, 3 × interrupteur à 2 000, 3 × point lumineux à 2 500, 1 × pose de tableau à 25 000 = **53 500 FCFA**

Matériel : 1 u Coffret 1 rangée de 13 modules · 1 u Peigne d'alimentation 13 modules · 1 u Bornier de terre et de neutre · 1 u Disjoncteur divisionnaire 1P+N 10 A · 1 u Disjoncteur divisionnaire 1P+N 16 A · 2 u Interrupteur différentiel 2P 40 A 30 mA type AC · 104 m Câble 3G1,5 mm² · 104 m Gaine ICTA 20 · 5 u Prise 2P+T 16 A · 1 u Prise 2P+T 16 A étanche IP44 · 3 u Interrupteur simple allumage · 3 u Point lumineux (DCL et douille) · 12 u Boîte d'encastrement · 3 u Boîte de dérivation

- Schéma du tableau : rangée 1 = [ID1] 1 [ID2] 2 + 7 libres
- Chiffrage indicatif (catalogue de départ FCFA, sans remise ni TVA) : matériel 144 200 + main-d'œuvre 53 500 = **197 700 FCFA**, acompte 40 % = 79 080
- Conformité : 8 points conformes, 4 à vérifier (prise de terre, salle d'eau, parafoudre, câble d'alimentation)

Contrôle : reproductible ✔ · valeurs de référence ✔ · règles ✔ · nombres valides ✔

## Villa 3 chambres 120 m²

**Saisie** : Séjour 36 m², Cuisine 12 m², Chambre 1 14 m², Chambre 2 12 m², Chambre 3 12 m², Salle d'eau 1 6 m², Salle d'eau 2 5 m², WC 2 m², Couloir 9 m², Véranda 12 m² · appareils : 2 × Climatiseur, 1 × Chauffe-eau, 1 × Cuisinière / plaque, 1 × Lave-linge · distance compteur–tableau 15 m · parafoudre · terre neuve

| Pièce | Surface | Prises | Points lumineux |
|---|---:|---:|---:|
| Séjour | 36 m² | 9 | 2 |
| Cuisine | 12 m² | 6 | 1 |
| Chambre 1 | 14 m² | 3 | 1 |
| Chambre 2 | 12 m² | 3 | 1 |
| Chambre 3 | 12 m² | 3 | 1 |
| Salle d'eau 1 | 6 m² | 1 | 1 |
| Salle d'eau 2 | 5 m² | 1 | 1 |
| WC | 2 m² | 0 | 1 |
| Couloir | 9 m² | 1 | 1 |
| Véranda | 12 m² | 1 | 1 |
| **Total** | **120 m²** | **28** (dont 3 étanches) | **11** |

| N° | Circuit | Pièces | Section | Disjoncteur | Câble |
|---:|---|---|---:|---:|---:|
| 1 | Éclairage 1 | Séjour, Cuisine, Chambre 1, Chambre 2, Chambre 3, Salle d'eau 1, Salle d'eau 2 | 1,5 mm² | 10 A | 149 m |
| 2 | Éclairage 2 | WC, Couloir, Véranda | 1,5 mm² | 10 A | 57 m |
| 3 | Prises 1 | Séjour | 1,5 mm² | 16 A | 63 m |
| 4 | Prises 2 | Séjour, Chambre 1, Chambre 2, Chambre 3 | 1,5 mm² | 16 A | 88 m |
| 5 | Prises 3 | Chambre 3, Salle d'eau 1, Salle d'eau 2, Couloir, Véranda | 1,5 mm² | 16 A | 94 m |
| 6 | Prises cuisine | Cuisine | 2,5 mm² | 20 A | 47 m |
| 7 | Climatiseur 1 | — | 2,5 mm² | 20 A | 16 m |
| 8 | Climatiseur 2 | — | 2,5 mm² | 20 A | 16 m |
| 9 | Chauffe-eau | — | 2,5 mm² | 20 A | 16 m |
| 10 | Cuisinière / plaque | — | 6 mm² | 32 A | 16 m |
| 11 | Lave-linge | — | 2,5 mm² | 20 A | 16 m |

| Différentiel 30 mA | Circuits protégés |
|---|---|
| Différentiel 1 — 63 A type AC | Éclairage 1, Prises 1, Prises 3, Climatiseur 1, Chauffe-eau |
| Différentiel 2 — 40 A type AC | Éclairage 2, Prises 2, Prises cuisine, Climatiseur 2 |
| Différentiel 3 — 63 A type A | Cuisinière / plaque, Lave-linge |

- Coffret : 2 rangée(s) de 13 = 26 modules pour 19 utilisés (23 avec la réserve de 20 %)
- Câbles : 3G1,5 = 451 m ; 3G2,5 = 111 m ; 3G6 = 16 m ; alimentation 3G10 = 17 m
- Main-d'œuvre au point (prix de départ FCFA) : 28 × prise de courant à 2 500, 9 × interrupteur à 2 000, 1 × va-et-vient (2 commandes) à 3 000, 11 × point lumineux à 2 500, 5 × circuit dédié à 7 500, 1 × pose de tableau à 25 000, 1 × prise de terre à 20 000 = **201 000 FCFA**

Matériel : 1 u Coffret 2 rangées de 13 modules · 2 u Peigne d'alimentation 13 modules · 2 u Bornier de terre et de neutre · 2 u Disjoncteur divisionnaire 1P+N 10 A · 3 u Disjoncteur divisionnaire 1P+N 16 A · 5 u Disjoncteur divisionnaire 1P+N 20 A · 1 u Disjoncteur divisionnaire 1P+N 32 A · 1 u Interrupteur différentiel 2P 40 A 30 mA type AC · 1 u Interrupteur différentiel 2P 63 A 30 mA type A · 1 u Interrupteur différentiel 2P 63 A 30 mA type AC · 1 u Parafoudre 2P avec protection intégrée · 451 m Câble 3G1,5 mm² · 111 m Câble 3G2,5 mm² · 16 m Câble 3G6 mm² · 562 m Gaine ICTA 20 · 16 m Gaine ICTA 25 · 17 m Câble d'alimentation 3G10 mm² · 25 u Prise 2P+T 16 A · 3 u Prise 2P+T 16 A étanche IP44 · 9 u Interrupteur simple allumage · 2 u Interrupteur va-et-vient · 11 u Point lumineux (DCL et douille) · 50 u Boîte d'encastrement · 10 u Boîte de dérivation · 1 u Piquet de terre 1,5 m · 5 m Câble de terre vert-jaune 16 mm² · 1 u Barrette de mesure de terre · 1 u Regard de visite

- Schéma du tableau : rangée 1 = [PF] [ID1] 1 3 5 7 9 + 4 libres ; rangée 2 = [ID2] 2 4 6 8 [ID3] 10 11 + 3 libres
- Chiffrage indicatif (catalogue de départ FCFA, sans remise ni TVA) : matériel 699 100 + main-d'œuvre 201 000 = **900 100 FCFA**, acompte 40 % = 360 040
- Conformité : 13 points conformes, 1 à vérifier (salle d'eau)

Contrôle : reproductible ✔ · valeurs de référence ✔ · règles ✔ · nombres valides ✔

## Boutique 40 m² avec climatiseur

**Saisie** : Magasin 32 m², Bureau 6 m², WC 2 m² · appareils : 1 × Climatiseur · distance compteur–tableau 8 m

| Pièce | Surface | Prises | Points lumineux |
|---|---:|---:|---:|
| Magasin | 32 m² | 4 | 4 |
| Bureau | 6 m² | 3 | 1 |
| WC | 2 m² | 0 | 1 |
| **Total** | **40 m²** | **7** (dont 0 étanches) | **6** |

| N° | Circuit | Pièces | Section | Disjoncteur | Câble |
|---:|---|---|---:|---:|---:|
| 1 | Éclairage | Magasin, Bureau, WC | 1,5 mm² | 10 A | 69 m |
| 2 | Prises | Magasin, Bureau | 1,5 mm² | 16 A | 66 m |
| 3 | Climatiseur | — | 2,5 mm² | 20 A | 11 m |

| Différentiel 30 mA | Circuits protégés |
|---|---|
| Différentiel 1 — 40 A type AC | Éclairage, Climatiseur |
| Différentiel 2 — 40 A type AC | Prises |

- Coffret : 1 rangée(s) de 13 = 13 modules pour 7 utilisés (9 avec la réserve de 20 %)
- Câbles : 3G1,5 = 135 m ; 3G2,5 = 11 m ; alimentation 3G10 = 9 m
- Main-d'œuvre au point (prix de départ FCFA) : 7 × prise de courant à 2 500, 3 × interrupteur à 2 000, 6 × point lumineux à 2 500, 1 × circuit dédié à 7 500, 1 × pose de tableau à 25 000 = **71 000 FCFA**

Matériel : 1 u Coffret 1 rangée de 13 modules · 1 u Peigne d'alimentation 13 modules · 1 u Bornier de terre et de neutre · 1 u Disjoncteur divisionnaire 1P+N 10 A · 1 u Disjoncteur divisionnaire 1P+N 16 A · 1 u Disjoncteur divisionnaire 1P+N 20 A · 2 u Interrupteur différentiel 2P 40 A 30 mA type AC · 135 m Câble 3G1,5 mm² · 11 m Câble 3G2,5 mm² · 146 m Gaine ICTA 20 · 9 m Câble d'alimentation 3G10 mm² · 7 u Prise 2P+T 16 A · 3 u Interrupteur simple allumage · 6 u Point lumineux (DCL et douille) · 16 u Boîte d'encastrement · 3 u Boîte de dérivation

- Schéma du tableau : rangée 1 = [ID1] 1 3 [ID2] 2 + 6 libres
- Chiffrage indicatif (catalogue de départ FCFA, sans remise ni TVA) : matériel 198 800 + main-d'œuvre 71 000 = **269 800 FCFA**, acompte 40 % = 107 920
- Conformité : 10 points conformes, 2 à vérifier (prise de terre, parafoudre)

Contrôle : reproductible ✔ · valeurs de référence ✔ · règles ✔ · nombres valides ✔

## Robustesse : 1 000 chantiers aléatoires

Graine fixe 20261015, jusqu'à 70 pièces, 20 % de valeurs piégées (NaN, Infinity, négatifs, 1e308, textes, objets, types inconnus, `__proto__`). Chaque chantier est chiffré en entier (matériel, main-d'œuvre, remise, TVA, acompte), en FCFA et en euro, avec le catalogue de départ, un catalogue vide ou un catalogue piégé, et des prix habituels de main-d'œuvre piégés ; le schéma du tableau et la liste de conformité sont contrôlés aussi. Chaque chiffrage est ensuite transformé en devis (étape 7) : le total du devis doit être identique au centime, « + 10 % » et « − 10 % » doivent aller dans le bon sens, et un devis piégé (lignes, main-d'œuvre, remise, TVA, acompte) ne doit produire ni exception, ni NaN, ni négatif.

| Mesure | Résultat |
|---|---:|
| Exceptions | 0 |
| Résultats avec NaN, Infinity ou négatif | 0 |
| Règles non tenues | 0 |

Bornes : surface 0,5 à 2 000 m² par pièce (refus à la saisie, ramenée dans les bornes par le moteur), 60 pièces, 50 prises et 50 points par pièce, 20 appareils de chaque type, distance 0 à 500 m, hauteur 2 à 6 m.

> Étude indicative établie selon les règles usuelles de la NF C 15-100. L'électricien reste responsable de la conformité de l'installation.
