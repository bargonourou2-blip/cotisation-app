# BâtiPlus

**L'assistant d'étude et de devis pour électriciens.**
BâtiPlus est une application conçue et développée par **BRG Électro+**
(+226 05 60 86 08 · +226 68 52 42 90).

- Application Android native, emballée avec **Capacitor 7**, publiée sur le Google Play Store.
- Identifiant : `com.brgelectro.batiplus` · Nom affiché : **BâtiPlus** · Version : **1.0.0** (versionCode 1).
- Un seul métier : **électricien**.
- Le même code (`www/`) servira ensuite au site web, avec les mêmes fonctions.

© 2026 BRG Électro+ — Tous droits réservés.

---

## Les 14 étapes du projet

| Étape | Contenu | État |
|---|---|---|
| 1 | Fondations : structure, charte, coquille Capacitor qui démarre | ✔ livrée |
| 2 | Écrans d'entrée : démarrage, présentation, connexion/inscription | ✔ livrée |
| 3 | Accueil, profil, à propos, réglages, thème, navigation complète | ✔ livrée |
| 4 | Identités visuelles : logos réels, icônes, photos | ✔ livrée |
| 5 | Assistant Nouveau chantier (5 étapes) et moteur de calcul NF C 15-100 | ✔ livrée |
| 6 | Résultat de l'étude : circuits, schéma du tableau, conformité | ✔ livrée |
| 7 | Le devis : catalogue lié, lignes modifiables, main-d'œuvre 4 modes | ✔ livrée |
| 8 | Feuille A4 imprimable, PDF natif, partage WhatsApp | ✔ livrée |
| 9 | Clients, chantiers, historique des devis, statistiques | ✔ livrée |
| 10 | Sécurité du front (XSS, CSP, chiffrement, verrouillage) | ✔ livrée |
| 11 | Abonnement : 5 formules, limite de 5 devis, relances | ✔ livrée |
| 12 | Paiement automatique : adaptateurs d'agrégateur, webhook, idempotence | ✔ livrée |
| 13 | Build Android, signature, Play Store, IOS.md | ✔ |
| 14 | Back-end Node.js complet, synchronisation, déploiement | à venir |

---

## Prérequis

| Outil | Version |
|---|---|
| Node.js | 22 LTS minimum (22.13+ pour le backend : SQLite intégré) |
| Capacitor | 7.x |
| Java JDK | 21 |
| Android Studio + SDK | API 35 (compilation et cible) |
| Python 3 + `pillow`, `numpy` | uniquement pour regénérer les logos |

## Lancer le projet

```bash
cd batiplus
npm install                 # dépendances Capacitor
npm run construire          # assemble www/index.html puis lance les contrôles
npm run apercu              # aperçu dans le navigateur : http://localhost:8080
npm run tester:backend      # contrôles du backend de paiement (aussi lancés par « construire »)
```

Backend de paiement : voir [`backend/INSTALLATION.md`](backend/INSTALLATION.md) et
[`PAIEMENTS.md`](PAIEMENTS.md).

Sur Android (Android Studio installé) :

```bash
npm run android             # construire + npx cap sync android + ouvrir Android Studio
```

Puis, dans Android Studio : **Run ▶** sur un téléphone branché ou un émulateur.

---

## Comment le code est organisé

`www/index.html` est **produit automatiquement**. **On ne le modifie jamais à la main.**
On modifie les sources, puis on réassemble :

| Source | Rôle |
|---|---|
| `src/gabarit.html` | squelette du document (métas, CSP, manifeste) |
| `src/charte.css` | TOUT le style → l'unique `<style>` du `<head>` |
| `src/corps.html` | la structure : toile, halos, tiroir, écrans, onglets, modale |
| `src/donnees.js` | constantes et données (aucune fonction, aucun secret) |
| `src/moteur.js` | les fonctions, puis l'initialisation |
| `src/regles-saisie.json` | les bornes de toutes les saisies, injectées dans `donnees.js` (et reprises par l'API à l'étape 14) |

`npm run assembler` (`src/scripts/assembler.mjs`) :
- place le CSS dans une seule balise `<style>`, le JS dans une seule balise `<script>` en fin de `<body>` ;
- refuse d'assembler si une source contient une balise `<script>`, un commentaire HTML dans le JS,
  un attribut `style=` ou un gestionnaire `onclick=` ;
- calcule les empreintes SHA-256 du style et du script et les inscrit dans la
  **Content-Security-Policy** : ni `'unsafe-inline'`, ni `'unsafe-eval'`.

`npm run verifier` (`src/scripts/verifier.mjs`) rapporte les contrôles bloquants de l'étape
et les contrôles de sécurité du front. Il **échoue** (code 1) au moindre ✘.
Le contrôle de la console exécute la page dans jsdom : `npm i --no-save jsdom` (outil de
vérification, jamais embarqué dans l'application). Il joue aussi les parcours réels de
l'étape 2 (inscription, connexion, blocage après 5 échecs, reprise de session, détection du pays)
et de l'étape 3 (migration du stockage, compteurs de l'accueil, recherche, profil, changement du
code, export/import de sauvegarde, accès admin, formule identique partout, ordre du bouton retour
Android avec un Capacitor simulé).

`npm run verifier:navigateur` (`src/scripts/verifier-navigateur.mjs`) ouvre la page dans un vrai
Chromium : débordements et textes coupés de 360×640 à 1440×900 (chaque mot est mesuré, un montant
de 125 000 000 doit tenir sur une ligne), contenu jamais sous le menu latéral (1440 et 1025 px),
traitement réel des images (WebP ≤ 300 Ko, faux PNG / SVG / > 5 Mo refusés), écran de démarrage,
mouvement réduit, taille des champs et des touches, erreurs console et CSP.

```bash
npm i --no-save puppeteer-core
CHROME_PATH=/chemin/vers/chrome CAPTURES=/tmp/captures npm run verifier:navigateur
```

### Code secret et comptes (étape 2)

- Le code (4 à 6 chiffres) n'est **jamais** stocké : seule une empreinte PBKDF2-SHA256
  (150 000 itérations, sel aléatoire de 16 octets) est conservée. Les codes trop simples
  (1234, 0000, 1212…) sont refusés.
- Après 5 échecs, la connexion est bloquée 30 s, puis 1 min, 5 min et 15 min.
  Ce compteur est local tant que l'API (étape 14) n'existe pas.
- Le pays et la devise sont déduits de l'indicatif (226 avant 22) ; le numéro est enregistré
  au format international `+22605608608` et affiché `+226 05 60 86 08`.

### Accueil, profil, navigation (étape 3)

- Stockage versionné : clés `bp_v1_*`. Les anciennes clés `bp.*` sont reprises une seule fois
  au démarrage, puis supprimées (une clé v1 existante n'est jamais écrasée).
- L'abonnement n'est **jamais** lu dans le stockage local : la formule vient d'une seule
  fonction, `libelleFormule()`, qui alimente le menu, l'accueil et le profil (« Gratuit »
  jusqu'à l'étape 11).
- Photo et logo : JPEG, PNG ou WebP uniquement (type vérifié sur les octets), 5 Mo maximum,
  redessinés sur un canvas puis compressés en WebP (photo 320×320, logo 600×300 au plus, 300 Ko).
  Le SVG est refusé.
- Sauvegarde : l'export ne contient que le profil (ni téléphone, ni code, ni abonnement).
  L'import est validé champ par champ (clé inconnue, `__proto__`, format, pays, devise, image
  → refus), limité à 2 Mo, et demande confirmation.
- Accès admin : appui long de 3 s sur le logo de « À propos ». Le code est vérifié par l'API
  uniquement (`API_URL` + `/api/admin/session`) ; l'application n'en contient aucun.
- `API_URL` est lue dans `.env` par l'assembleur et injectée dans le script : c'est la seule
  configuration connue du front.
- Bouton retour Android : modale → recherche → tiroir → écran précédent → accueil → quitter,
  avec confirmation si un travail n'est pas enregistré.

### Identités visuelles (étape 4)

- **Logos** (`www/images/logo/`, `www/images/brg/`) : détourés (coins transparents vérifiés),
  jamais remplacés par du texte stylisé sauf si l'image ne charge pas.
- **Icônes de l'interface** : un fichier SVG par icône dans `www/icons/` (une seule couleur
  `currentColor`, trait de 2 px, 24×24). L'assembleur en fait le sprite `<symbol id="i-nom">` et
  **refuse** toute icône hors charte ou contenant autre chose que des formes géométriques.
  Pour ajouter une icône : déposer `www/icons/nom.svg` avec le même en-tête, puis `npm run construire`.
- **Icônes Android et écran de démarrage** : `npm run icones` prépare `assets/` puis lance
  `@capacitor/assets` (mdpi → xxxhdpi, icône adaptative, splash logo blanc sur #4E0A80, mode nuit).
  `sharp` est forcé en 0.33 (`overrides`) car l'ancienne version téléchargeait ses binaires hors npm.
- **Photos** : WebP de moins de 150 000 octets, 1 200 px maximum, `loading="lazy"` en bas d'écran,
  voile en dégradé violet. Si une photo manque, `images/equipe/electricien-repli.svg` la remplace.
- **Logos de paiement** : déposer les fichiers **officiels** dans `www/images/paiement/`
  (`orange-money.webp`, `moov-money.webp`, `wave.webp`, `telecel-money.webp`, `visa.webp`,
  `mastercard.webp`, `cinetpay.webp`). L'assembleur détecte ceux qui sont présents. Un logo absent
  s'affiche en pastille unie à la couleur de la marque, nom écrit en texte — jamais de logo inventé.
  Ils n'apparaissent que dans la section Paiement (étapes 11-12).

Les logos sont générés depuis les originaux du client (`sources-logos/`) par
`python3 src/scripts/preparer_logos.py` (détourage sans liseré, WebP, icônes 192/512/maskable,
version blanche, calque de l'éclair, logo BRG Électro+).
Les photos de la présentation sont produites depuis `sources-photos/` par
`python3 src/scripts/preparer_photos.py` (WebP de moins de 150 Ko ; fond retiré sur la photo du fondateur).

### Nouveau chantier et moteur NF C 15-100 (étape 5)

- **Assistant en 5 étapes** : Client → Pièces → Appareils → Options → Main-d'œuvre. Barre de
  progression cliquable (retour libre, avance seulement si l'étape est valide), boutons
  Précédent / Suivant toujours visibles au-dessus des onglets.
- **Brouillon automatique** (`bp_v1_brouillon_chantier`, un par compte) : écrit à chaque changement
  d'étape, 600 ms après chaque saisie et dès que l'application passe en arrière-plan
  (« Brouillon enregistré à HH:MM »). À la réouverture, on reprend à la même étape. Tout brouillon
  relu passe par `chantierValide()` (champ par champ, bornes, pièces invalides écartées) puis est
  réécrit propre.
- **Enregistrement** : « Enregistrer le chantier » range le chantier (statut « étudié ») dans
  `bp_v1_chantiers`, efface le brouillon et ouvre l'écran Résultat avec une confirmation.
- **Moteur** : fonctions pures dans `src/moteur.js`, entre `/* ==== MOTEUR NF C 15-100 ==== */` et
  `/* ==== FIN DU MOTEUR ==== */` (aucun accès au DOM ni au stockage). Les règles chiffrées
  (prises par pièce, 8 points par circuit, sections, calibres, différentiels, réserve du coffret,
  prix de départ de la main-d'œuvre) sont dans `src/donnees.js`.
- **Validation** : `npm run valider:moteur` exécute le moteur seul dans une VM Node, compare les
  3 chantiers types (studio, villa, boutique) à leurs valeurs de référence, lance 1 000 chantiers
  aléatoires piégés et régénère `docs/validation-moteur-nfc15100.md`. Cette validation fait
  partie de `npm run construire`. Toute modification d'une règle qui change un chiffre doit mettre
  à jour `ATTENDUS` dans `src/scripts/chantiers-types.mjs`.
- **Bornes** : surface de 0,5 à 2 000 m² par pièce, 60 pièces, 50 prises et 50 points par pièce,
  20 appareils de chaque type, distance 0 à 500 m, hauteur 2 à 6 m, montants ≤ 100 000 000.

### Résultat de l'étude (étape 6)

- **Écran `resultat`** : en-tête (chantier, client, lieu, surface), mention obligatoire « Étude
  indicative. L'électricien vérifie et reste responsable de l'exécution conforme. », rappel du total
  général et 6 onglets ARIA (clic, flèches, Début, Fin ; 3 × 2 sur téléphone, 6 en ligne dès 900 px) :
  1. **Circuits** : n°, pièces, section, calibre, points, différentiel, longueur ; liste des différentiels.
  2. **Tableau** : schéma SVG construit élément par élément (`createElementNS`, jamais de balisage en
     texte), rangées de 13 modules, accolade sous chaque différentiel et ses disjoncteurs, légende
     et détail rangée par rangée en texte.
  3. **Matériel** : quantités du moteur × prix du catalogue, chaque quantité et chaque prix modifiable
     pour ce chantier (champ vidé = retour au calcul) ; prix à 0 → étiquette jaune « Prix à compléter ».
  4. **Main-d'œuvre** : au point, forfait, journées, lignes libres ; total en gros caractères jaunes.
  5. **Conformité** : chaque point « Conforme » ou « À vérifier », expliqué en français simple.
  6. **Total** : matériel, main-d'œuvre, remise (% ou montant), TVA activable (désactivée par défaut,
     18 % modifiable), TOTAL GÉNÉRAL, acompte (40 % par défaut) et reste à payer ; boutons « Créer le
     devis » et « Ouvrir le dernier devis » (étape 7).
- **Recalcul** : chaque frappe met à jour le chantier en mémoire, relance `chiffrerChantier()` et
  réécrit seulement les valeurs calculées (le champ en cours de saisie ne bouge pas). Enregistrement
  automatique 600 ms après la dernière saisie, en quittant l'écran, en arrière-plan et à la
  déconnexion (« Modifications enregistrées à HH:MM »).
- **Moteur** : `disposerTableau()` (un groupe différentiel + disjoncteurs n'est jamais coupé entre deux
  rangées, les places libres sont comblées), `verifierConformite()`, `calculerTotal()` et
  `chiffrerChantier()` sont des fonctions pures, arrondies aux décimales de la devise (0 en FCFA).
- **Prix** : `lireCatalogue()` est le seul accès aux prix du matériel : catalogue de départ indicatif
  en FCFA (`CATALOGUE_DEFAUT`, `src/donnees.js`), remplacé référence par référence par les prix de
  l'électricien (`bp_v1_catalogue`, écran « Mes prix » à l'étape 7). Autre devise : prix à 0, à compléter.
- **Accès** : bloc « Dernières études » sur l'accueil (3 dernières) ; « Modifier le chantier » renvoie
  l'étude dans l'assistant, qui la réenregistre sur le même chantier.

### Devis et Mes prix (étape 7)

- **Écran `prix` (« Mes prix »)** : catalogue propre à chaque compte (`bp_v1_catalogue`, clé = compte),
  articles regroupés par catégorie, recherche par article ou fournisseur. Chaque article garde
  jusqu'à 5 fournisseurs ; le moins cher est retenu, sauf si l'électricien coche « Toujours celui-ci ».
  Ajout d'articles personnels (`perso-xxxxxxxx`), suppression avec confirmation, prix de main-d'œuvre
  habituels (8 types de points + tarif d'une journée). « Réinitialiser » revient au catalogue de
  départ sans toucher aux devis déjà faits. Enregistrement automatique 600 ms après la saisie.
- **Écran `fiche-devis`** : créé depuis le Résultat (« Créer le devis »), numéroté `BP-AAAA-NNNN` par
  compte et par année (`bp_v1_numeros_devis`, jamais réutilisé). Les prix sont **figés** dans le devis :
  modifier Mes prix ne change jamais un devis existant.
  - **Matériel** : désignation, quantité (≤ 999 999) et prix modifiables, suppression avec bloc
    « Lignes supprimées » restaurables, ajout d'un article du catalogue.
  - **Prix à compléter** : encadré jaune quand le prix vaut 0 ou n'existe pas dans Mes prix, avec
    « Enregistrer dans Mes prix ». Un prix modifié qui diffère de Mes prix affiche ↻ : la mise à jour du
    catalogue demande toujours une confirmation (le catalogue ne change jamais sans décision).
  - **Main-d'œuvre, 4 modes** : au point, forfait, journées (ouvriers × jours × tarif), lignes libres ;
    boutons rapides « Prix habituels », − 10 %, + 10 %, + 20 % ; case « Enregistrer comme prix
    habituels » (décochée par défaut). Les mêmes boutons existent à l'étape 5 de l'assistant.
  - **Total** : remise (% ou montant), TVA activable (taux ≤ 30 %), acompte (40 % par défaut), reste
    à payer ; statut Brouillon / Envoyé / Accepté / Refusé / Payé ; client, lieu, conditions et note.
- **Moteur** (fonctions pures) : `devisDepuisChiffrage()`, `calculerDevis()`, `ajusterMainOeuvre()`,
  `prixMainOeuvreHabituel()`, `tarifJourneeHabituel()` ; le jsdom compare la fiche à `calculerDevis()`
  après chaque modification (㉟).
- **Stockage** : `bp_v1_devis`, chaque devis validé champ par champ à la lecture ; les devis des étapes
  précédentes (sans lignes) restent listés mais ne s'ouvrent pas. Limite de devis par formule : étape 11.

### Feuille A4, PDF et WhatsApp (étape 8)

- **Écran `feuille`** (« Imprimer ou PDF » depuis la fiche devis) : aperçu fidèle de la feuille A4
  (210 mm, mise à l'échelle à l'écran), construite uniquement avec `textContent`. Contenu : en-tête
  (logo de l'électricien pour un abonné, sinon initiales), bloc client et chantier, tableaux Matériel et
  Main-d'œuvre (Désignation, Unité, Qté, Prix unitaire, Montant ; en-tête violet répété, lignes
  alternées, deux sous-totaux), totaux, TOTAL GÉNÉRAL en bloc violet, montant **en lettres**
  (« Arrêté le présent devis à la somme de … »), note, conditions, deux signatures, mention de
  responsabilité. Les montants et les mots composés ne sont jamais coupés.
- **Pied de page** : « Devis réalisé avec BâtiPlus — application conçue par BRG Électro+ · … » en
  filigrane (opacité 0,22) pour la formule gratuite, **absent** pour un abonné. Une seule fonction pure
  décide : `formulePayante()`.
- **Impression** : `@page { size: A4; margin: 12mm }`, `print-color-adjust: exact`,
  `thead { display: table-header-group }` ; seule la feuille sort (`body[data-ecran-actif="feuille"]`).
- **PDF** : produit dans l'application par `creerPdfDevis()` (PDF 1.4, Helvetica WinAnsi, aucune
  bibliothèque externe). Mise en page en deux passes : si le devis dépasse une page, une version plus
  serrée est essayée et la plus courte est gardée. Nom : `Devis_BP-AAAA-NNNN_Client.pdf` (accents et
  signes retirés).
  - Android : `Filesystem` écrit dans `Documents/BatiPlus/` (repli sur le cache si refusé, ce qui
    arrive sur Android ≤ 10 puisque aucune permission de stockage n'est demandée), puis « Partager »
    ouvre le partage natif (`Share`).
  - Navigateur : téléchargement ; partage de fichier si le navigateur le permet.
  - Échec : message clair, puis l'impression s'ouvre (« Enregistrer au format PDF »).
- **WhatsApp** : `https://wa.me/<chiffres>?text=<encodeURIComponent(message)>`, lien avec
  `rel="noopener noreferrer"`. Message : client, numéro et objet du devis, résumé (circuits, prises,
  points lumineux), total, acompte, nom et téléphone de l'électricien, « Devis réalisé avec BâtiPlus ».
  Le téléphone du client (fiche devis) est validé ; sans numéro valide, WhatsApp demande le contact.
- **Contrôles** : ㊲ (pages, xref du PDF, montants géants, montant en lettres, parcours réel jusqu'au
  PDF téléchargé), ㊳ (pied et logo selon les 5 formules), ㊴ (encodage du lien, numéros piégés,
  message complet) dans `npm run verifier` ; A4 dans `npm run verifier:navigateur` (impression
  Chromium réelle : studio sur 1 page, seule la feuille imprimée).

### Mes devis, Mes chantiers, Mes clients, Statistiques (étape 9)

- **Fonctions pures** (section `LISTES ET STATISTIQUES` de `moteur.js`, testées hors navigateur) :
  `filtrerDevis` (recherche sans accents ni majuscules, tous les mots, sur numéro/titre/client/lieu/statut ;
  filtre par statut ; tri date ↑↓ ou montant ↑↓, égalité → plus récent), `carnetClients`, `filtrerClients`,
  `statistiquesDetaillees`. L'accueil, le profil et l'écran Statistiques utilisent **la même** fonction.
- **Mes devis** : recherche, puces de statut avec compteurs, tri. Par devis : Ouvrir, Dupliquer
  (nouveau numéro, brouillon), Imprimer (feuille A4), Envoyer (lien WhatsApp calculé au toucher),
  Supprimer. Un devis d'avant l'étape 7 reste listé (historique, statistiques) mais ne s'ouvre pas.
- **Mes chantiers** : brouillon en cours en premier (Reprendre, Effacer), puis les études (Ouvrir,
  Dupliquer « (copie) », Supprimer ; les devis déjà faits sont conservés).
- **Mes clients** (`bp_v1_clients`) : carnet construit depuis les devis et les chantiers (un client par
  nom, comparé sans accents ni casse ; nom du devis le plus récent), plus ajout à la main. Nombre de
  devis, total, Appeler (`tel:+…`), WhatsApp (`wa.me`, `rel="noopener noreferrer"`), Ses devis, Modifier
  le téléphone (prioritaire sur celui des documents). Seul un client ajouté à la main et sans document
  peut être supprimé.
- **Suppression** : toujours une confirmation, puis un bandeau « Annuler » de 5 s (barre de décompte,
  statique si mouvement réduit) qui remet l'élément **à sa place exacte** dans le stockage. Un numéro
  de devis supprimé n'est jamais réutilisé. « Réinitialiser » dans Mes prix demande **deux**
  confirmations.
- **Statistiques** : chiffre devisé, taux d'acceptation (payé compté comme accepté), montant accepté,
  histogramme SVG du mois (jour par jour) avec comparaison au mois précédent **à date égale**, montant
  par client (8 premiers, puis « N autres clients »), répartition par statut.
- **Contrôles** : ㊵ (confirmation + annulation sur devis, chantier, brouillon, client), ㊶ (recherche,
  filtre, tri), ㊷ (badge « Le moins cher »), CL, ST dans `npm run verifier` ; LI dans
  `npm run verifier:navigateur` (4 écrans, 360 et 1440 px, clair et sombre).

### Sécurité du front (étape 10)

- **Règles de saisie uniques** : `src/regles-saisie.json` (13 règles numériques, longueurs des textes,
  téléphone, fichiers). L'assembleur l'injecte gelé dans `REGLES_SAISIE` ; `BORNES*`, `IMAGES` et
  `SAUVEGARDE` en sont dérivées. L'API de l'étape 14 lira **ce même fichier** : mêmes bornes au
  téléphone et en ligne.
- **Chaque champ numérique** porte `data-regle="…"`. Une saisie hors règle (négatif, `1e3`, trop de
  décimales, centimes en FCFA, hors bornes, lettres) est refusée tout de suite : le champ passe en
  `aria-invalid`, le message « Saisie refusée : … » explique la règle **sans recopier la saisie**, et
  en quittant le champ la dernière valeur valide revient. `lireNombre` n'accepte que chiffres,
  espaces et une virgule.
- **Verrouillage automatique** : après **15 min** sans geste, au retour dans l'application ou au premier
  geste, l'écran « Verrouillé » demande le code secret (clavier intégré, même blocage progressif
  qu'à la connexion : 5 essais puis 30 s, 1 min, 5 min, 15 min). Le travail en cours est enregistré
  avant de verrouiller ; le bon code ramène **au même écran**. Une session dont la date d'activité
  est absente, illisible ou dans le futur s'ouvre verrouillée. Le bouton retour Android ferme
  l'application depuis le verrou.
- **Codes trop simples refusés** : motifs répétés (0000, 4545, 121212, 123123), suites (1234, 9876,
  7890) et années 1940–2039 à 4 chiffres. Empreinte PBKDF2-SHA-256, 150 000 itérations, sel de 16 octets.
- **Android** : `allowBackup="false"`, `fullBackupContent="false"`, `dataExtractionRules`
  (`res/xml/regles_extraction.xml` exclut tout du cloud et du transfert d'appareil),
  `usesCleartextTraffic="false"`, WebView non débogable.
- **CSP** : `default-src 'self'`, empreintes SHA-256 pour l'unique script et l'unique style,
  `connect-src 'self'` + l'API en https, `frame-src`/`object-src`/`media-src 'none'`, `base-uri` et
  `form-action 'none'`, `upgrade-insecure-requests`. `frame-ancestors` est ignoré dans une balise
  meta : il sera posé dans les en-têtes HTTP du site à l'étape 14. En attendant, **dans le cadre
  d'une autre page l'application ne s'affiche pas** et propose « Ouvrir BâtiPlus » (nouvel onglet).
  ⚠ C'est aussi le cas dans un aperçu intégré : ouvrez l'aperçu dans son propre onglet.
- **Contrôles** : ㊸ ㊹ ㊺ ㊻ VR CO SW AN CS dans `npm run verifier` (sources + pages rendues avec
  données piégées), VE (écran verrouillé) et CA (anti-encadrement) dans `npm run verifier:navigateur`.

### Abonnement : 5 formules, limite de 5 devis, relances (étape 11)

- **5 formules** (`FORMULES` dans `src/donnees.js`), du moins cher au plus cher : Gratuit (gris), Pass
  semaine 750 FCFA (jaune, « SANS ENGAGEMENT »), Pro mensuel 2 500 FCFA (violet, « LE PLUS CHOISI »,
  carte 6 % plus haute), Pro annuel 25 000 FCFA (vert, « 2 MOIS OFFERTS »), Lifetime 60 000 FCFA (noir
  et jaune, « À VIE »). Les prix affichés sont indicatifs : le montant est fixé en ligne au paiement.
- **Le Pro n'est donné que par un jeton signé** : `charge.signature` en base64url, signature
  ECDSA P-256 / SHA-256 de `bp-abonnement-v1.` + charge. L'application le vérifie avec la **clé
  publique** de la balise `<meta name="batiplus-cle-abonnement">`, remplie par l'assembleur depuis
  `.env` (`ABONNEMENT_CLE_PUBLIQUE`). Sans clé, aucun jeton ne passe : tout compte reste en Gratuit
  (échec fermé). Refusés : formule en clair, autre clé, charge modifiée, autre compte ou numéro,
  jeton expiré, émis dans le futur, champ inconnu. L'horloge ne recule pas : la date la plus tardive
  déjà vue sur le téléphone (`bp_v1_horloge`) sert de plancher.
- **Clés** : `node src/scripts/cles-abonnement.mjs generer` crée `.cles/abonnement-privee.pem`
  (ignorée par Git, jamais dans `www/`) et affiche la ligne `ABONNEMENT_CLE_PUBLIQUE=…` à mettre dans
  `.env`. `… signer <compteId> <téléphone> <formule> [jours]` produit un jeton d'essai (le back-end de
  l'étape 14 signera de la même façon).
- **Limite Gratuit** : 5 devis **créés** par mois (compteur du mois + devis du mois : supprimer un devis
  ne rend pas de devis gratuit). 4e devis → « Il vous reste 1 devis gratuit » ; 6e → **création
  bloquée** (depuis l'étude comme par « Dupliquer »), invitation obligatoire, étude enregistrée, anciens
  devis toujours consultables, imprimables et partageables.
- **Relances sans harceler** : bandeau permanent sur l'accueil (quota + jauge) ; invitation à la 1re
  ouverture du jour (jamais le jour de la création du compte), après une impression, un PDF, un partage
  ou un envoi WhatsApp (au plus une toutes les 10 min) ; les cadenas des fonctions Pro (statistiques
  détaillées, logo, sans filigrane) ouvrent l'invitation. Abonné : aucune invitation, seulement le
  rappel J-3 / J-1 sur l'accueil (« Renouveler ») et en notification locale à 9 h.
- **Écran Abonnement** : Ma formule (date de fin + jauge), 5 cartes, moyens de paiement (logo officiel
  s'il est déposé dans `www/images/paiement/<id>.webp`, sinon pastille à la couleur de la marque),
  bande de confiance, « Ce que débloque le Pro », Mes paiements avec reçu, FAQ en accordéon.
- **Paiement (préparé pour l'étape 12)** : « Choisir » → récapitulatif → « Payer maintenant ». Le
  front envoie `POST /api/paiements/initier` avec **seulement** `{"formule":"…"}` (sans montant, sans
  cookie, délai 15 s) et n'ouvre qu'une adresse `https://` accompagnée d'une référence `BP-…`. Sinon :
  message clair et « Réessayer ». `enregistrerJetonAbonnement()` dépose un jeton reçu après paiement,
  seulement s'il se vérifie.
- **Reçu** : dans le navigateur, une feuille A4 dédiée est imprimée seule ; sur téléphone (la vue web
  Android n'imprime pas), un PDF du reçu est créé puis partagé.
- **Contrôles** : ㊼ ㊽ ㊾ ㊿ AB RL PV RC PI dans `npm run verifier` (clé d'essai générée à chaque
  vérification, jamais livrée), AV (écran Abonnement 360/768/1440 px, clair et sombre, textes ≥ 13 px,
  carte vedette 6 % plus haute, reçu imprimé sur 1 page) dans `npm run verifier:navigateur`.

### Paiement automatique (étape 12)

Détail complet : [`PAIEMENTS.md`](PAIEMENTS.md) ; installation : [`backend/INSTALLATION.md`](backend/INSTALLATION.md).

- **Backend sans dépendance** (`backend/`, Node 22.13+, SQLite `node:sqlite` en WAL) : `serveur.js`
  (routes, en-têtes de sécurité, CORS limité, corps ≤ 1 Mo, limites de débit), `config.js` (refus de
  démarrer si un secret ou une clé manque), `base.js` (tables `electriciens`, `paiements`,
  `abonnements`, journal d'audit en écriture seule, statut final non modifiable), `jetons.js`
  (session HMAC, jeton d'abonnement ECDSA), `formules.js` (**seule source des prix**),
  `paiements/service.js` (initiation, confirmation, rattrapage, renouvellements).
- **6 adaptateurs au même contrat** (`paiements/`) : LigdiCash, CinetPay, FedaPay, PayDunya, Stripe,
  simulation. Agrégateur principal + secours dans `backend/.env` ; les clés n'existent que là.
- **Webhook** : URL secrète par agrégateur, signature vérifiée en temps constant, **statut
  re-consulté** chez l'agrégateur, montant ET devise comparés au prix (écart → « anomalie », rien
  d'activé, alerte admin), transaction SQL, réponse 200 rapide. 10 notifications = 1 activation.
  Tâche planifiée toutes les 5 min : rattrapage après 3 min, « expiré » après 24 h.
- **Application** : après « Payer maintenant », écran **« Nous confirmons votre paiement… »**
  (`#ecran-paiement`), consultation toutes les 3 s pendant 3 min ; payé → jeton signé vérifié, coche
  géante + 18 particules (aucune si mouvements réduits), filigrane retiré, paiement ajouté à « Mes
  paiements », reçu ; échec / annulé / expiré → « Réessayer » ; plus de 3 min ou coupure → « Vérifier
  à nouveau ». Retour `#paiement-retour?ref=…` vérifié puis effacé de l'adresse ; reprise discrète au
  démarrage, au retour dans l'application et à la fermeture du navigateur (paiement en cours < 24 h).
  Les erreurs de l'API sont traduites par code (`MESSAGES_PAIEMENT`), jamais affichées telles quelles.
- **Renouvellement** : « Renouveler » en 1 toucher (accueil et Mon abonnement), rappels J-3, veille et
  jour J (bandeau + notifications locales 3103 / 3101 / 3100) ; interrupteur « Renouveler
  automatiquement par carte » dans le profil (désactivé par défaut, enregistré en ligne d'abord,
  revient en arrière en cas d'échec). Renouvellement anticipé = jours additionnés ; passage supérieur
  immédiat au prorata.
- **Contrôles** : SP SE RT RN PX dans `npm run verifier` ; PS (écran de suivi 360/390/1440 px, clair
  et sombre, animations et mouvements réduits) dans `npm run verifier:navigateur` ; S1–S5, P1–P13,
  AD dans `npm run tester:backend` (base temporaire, vrai serveur, faux agrégateurs HTTP).

## Étape 13 — Android et Play Store

Guide complet, pas à pas : **[ANDROID.md](ANDROID.md)** (12 étapes, de Node 22 à la mise à jour).
iPhone : **[IOS.md](IOS.md)** (pourquoi la PWA d'abord).

- **Permissions** : `INTERNET`, `POST_NOTIFICATIONS`, `ACCESS_NETWORK_STATE`, rien d'autre. Celles que
  les plugins ajoutent (démarrage, réveil, vibration, stockage, alarmes exactes) sont retirées à la
  fusion (`tools:node="remove"`). `CAMERA` n'est **pas** déclarée : la photo du tableau passe par
  l'application Appareil photo du téléphone (intent `IMAGE_CAPTURE`), qui ne demande aucune
  autorisation. Le retour tactile passe par un petit plugin local (`RetourTactile`) sans `VIBRATE`.
- **Manifeste** : seule l'activité principale est exportée, HTTPS obligatoire
  (`securite_reseau.xml`), aucune sauvegarde (`allowBackup="false"` + règles d'extraction).
- **Gradle** : `com.brgelectro.batiplus`, versionCode 1, versionName 1.0.0, minSdk 23, target 35 ;
  version publiée réduite (R8 + ressources) et signée par `android/keystore.properties` (ignoré par
  Git) ou les variables `BATIPLUS_*` ; sans clé, `bundleRelease` s'arrête. Version de test :
  `com.brgelectro.batiplus.test`.
- **Photo du tableau électrique** (facultative, toutes formules) : dans la fiche devis, redessinée
  en JPEG ≤ 1280 px et ≤ 300 Ko, annexée sur une page à part de la feuille A4 et du PDF.
- **Fiche Play Store** (`store/`) : `fiche-play-store.md` (titre, descriptions, sécurité des
  données, déclarations), `icone-512.png`, `banniere-1024x500.png`, `captures/` (6 × 1080 × 1920,
  refaites par `npm run play-store`), `confidentialite.html` (générée depuis
  [CONFIDENTIALITE.md](CONFIDENTIALITE.md) par `npm run confidentialite`, à publier à une adresse
  publique).
- ⚠️ **Paiement et règles Google Play** : voir l'avertissement de ANDROID.md, étape 7, avant la
  mise en production.
- **Contrôles** : PT PC FS DC dans `npm run verifier`, PM MF GS dans `npm run verifier:android`
  (aussi lancés par `npm run verifier`), HL (hors connexion) et PH (photo, annexe, PDF) dans
  `npm run verifier:navigateur`.

## Structure

```
batiplus/
├── android/                 généré par Capacitor (ne pas modifier à la main)
├── www/                     LE CŒUR : ce que l'application affiche
│   ├── index.html           assemblé depuis src/
│   ├── manifest.webmanifest
│   ├── images/logo/         logos détourés + icônes
│   ├── images/brg/          logo BRG Électro+
│   ├── images/equipe/       photos d'électriciens + illustration SVG de repli
│   ├── images/paiement/     logos officiels des moyens de paiement (à fournir)
│   ├── icons/               icônes SVG de l'interface (sources du sprite)
│   └── assets/polices/      Inter et Montserrat en local (licence OFL)
├── src/                     sources de www/index.html
│   └── scripts/             assembler, vérifier (jsdom + Chromium), moteur, aperçu, logos, photos
├── backend/                 API de paiement (Node 22.13+, zéro dépendance)
│   ├── serveur.js           routes, sécurité HTTP, tâche planifiée
│   ├── formules.js          prix officiels (seule source)
│   ├── paiements/           contrat commun + 6 adaptateurs + service
│   ├── tests/               contrôles du backend
│   ├── .env.exemple         variables du serveur (aucune vraie clé)
│   └── INSTALLATION.md
├── store/                   fiche Play Store : textes, icône, bannière, captures, confidentialité
├── ANDROID.md               du code au Play Store, en 12 étapes
├── IOS.md                   iPhone : contraintes et recommandation
├── CONFIDENTIALITE.md       politique de confidentialité (source de store/confidentialite.html)
├── PAIEMENTS.md             fonctionnement du paiement automatique
├── docs/                    validation du moteur NF C 15-100 (générée)
├── sources-logos/           fichiers originaux fournis par le client
├── sources-photos/          photos d'origine de la présentation
├── assets/                  sources des icônes et du splash Android (@capacitor/assets)
├── capacitor.config.json
├── package.json
├── .env.exemple             variables de configuration (aucune vraie clé)
└── .gitignore
```

## Règles de sécurité permanentes

- Aucune donnée saisie n'entre dans la page par `innerHTML`.
- Aucun secret dans le front. Le front ne connaît que l'adresse publique de l'API.
- Les clés d'agrégateur et la clé privée des abonnements n'existent que sur le serveur (`backend/.env`,
  `.cles/`). Un abonnement ne s'active que par un paiement confirmé en ligne (re-consultation de
  l'agrégateur), jamais par une notification seule, un retour de page ou une saisie.
- `webContentsDebuggingEnabled` reste à `false` dans la version publiée.
- Toute nouvelle saisie numérique reçoit une règle dans `src/regles-saisie.json` et un `data-regle`.
- Aucune sauvegarde Android des données : la durabilité passe par l'export du profil et la
  synchronisation (étape 14).
- Le fichier `.env` et les keystores (`*.keystore`, `*.jks`) ne sont **jamais** versionnés.
  Sauvegardez le keystore ailleurs : sans lui, plus aucune mise à jour possible sur le Play Store.
