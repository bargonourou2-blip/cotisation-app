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
| 5 | Assistant Nouveau chantier (5 étapes) et moteur de calcul NF C 15-100 | à venir |
| 6 | Résultat de l'étude : circuits, schéma du tableau, conformité | à venir |
| 7 | Le devis : catalogue lié, lignes modifiables, main-d'œuvre 4 modes | à venir |
| 8 | Feuille A4 imprimable, PDF natif, partage WhatsApp | à venir |
| 9 | Clients, chantiers, historique des devis, statistiques | à venir |
| 10 | Sécurité du front (XSS, CSP, chiffrement, verrouillage) | à venir |
| 11 | Abonnement : 5 formules, limite de 5 devis, relances | à venir |
| 12 | Paiement automatique : adaptateurs d'agrégateur, webhook, idempotence | à venir |
| 13 | Build Android, signature, Play Store, IOS.md | à venir |
| 14 | Back-end Node.js complet, synchronisation, déploiement | à venir |

---

## Prérequis

| Outil | Version |
|---|---|
| Node.js | 22 LTS minimum |
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
```

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
│   └── scripts/             assembler, vérifier (jsdom + Chromium), aperçu, logos, photos
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
- `webContentsDebuggingEnabled` reste à `false` dans la version publiée.
- Le fichier `.env` et les keystores (`*.keystore`, `*.jks`) ne sont **jamais** versionnés.
  Sauvegardez le keystore ailleurs : sans lui, plus aucune mise à jour possible sur le Play Store.
