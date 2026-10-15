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
| 2 | Écrans d'entrée : démarrage, présentation, connexion/inscription | à venir |
| 3 | Accueil, profil, à propos, réglages, thème, navigation complète | à venir |
| 4 | Identités visuelles : logos réels, icônes, photos | à venir |
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
vérification, jamais embarqué dans l'application).

Les logos sont générés depuis les originaux du client (`sources-logos/`) par
`python3 src/scripts/preparer_logos.py` (détourage sans liseré, WebP, icônes 192/512/maskable).

## Structure

```
batiplus/
├── android/                 généré par Capacitor (ne pas modifier à la main)
├── www/                     LE CŒUR : ce que l'application affiche
│   ├── index.html           assemblé depuis src/
│   ├── manifest.webmanifest
│   ├── images/logo/         logos détourés + icônes
│   └── assets/polices/      Inter et Montserrat en local (licence OFL)
├── src/                     sources de www/index.html
│   └── scripts/             assembler, vérifier, aperçu, préparer les logos
├── sources-logos/           fichiers originaux fournis par le client
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
