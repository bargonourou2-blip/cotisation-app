# BâtiPlus sur Android — le guide pas à pas

De l'ordinateur au Google Play Store, en 12 étapes. Chaque étape dit **quoi faire**, **comment vérifier** et **ce qui peut mal tourner**.

| | |
|---|---|
| Identifiant | `com.brgelectro.batiplus` |
| Nom affiché | BâtiPlus |
| Version | 1.0.0 — versionCode 1 |
| Android | 6.0 et plus (minSdk 23) — cible Android 15 (targetSdk 35, exigé par Google Play depuis le 31 août 2025) |
| Permissions | INTERNET, POST_NOTIFICATIONS, ACCESS_NETWORK_STATE — rien d'autre |

> Toutes les commandes se lancent dans le dossier `batiplus/` du dépôt, sauf mention contraire.

---

## Étape 1 — Installer Node 22 et les outils Android

1. **Node.js 22.13 ou plus récent** : <https://nodejs.org> (version LTS). Vérifier : `node -v` → `v22.…`.
2. **Android Studio** (version Ladybug 2024.2.1 ou plus récente) : <https://developer.android.com/studio>. Il installe le SDK Android et un **JDK 21** (exigé par Capacitor 7).
3. Dans Android Studio → *SDK Manager*, cocher **Android 15 (API 35)** et **Android SDK Platform-Tools** (fournit `adb`).
4. Ajouter `platform-tools` au PATH pour utiliser `adb` dans un terminal :
   - Windows : `%LOCALAPPDATA%\Android\Sdk\platform-tools`
   - macOS : `~/Library/Android/sdk/platform-tools`

Vérifier : `adb version` répond, `java -version` affiche 21 (ou utiliser le JDK d'Android Studio : *Settings → Build → Gradle → Gradle JDK*).

## Étape 2 — Capacitor

Le projet Capacitor est **déjà initialisé** (`capacitor.config.json`) et la plateforme Android **déjà ajoutée** (`android/`). Il suffit de :

```bash
npm install                  # dépendances (Capacitor 7 et ses plugins)
npm run construire           # assemble www/index.html et lance tous les contrôles (doivent tous être ✔)
npx cap sync android         # copie www/ dans le projet Android et met à jour les plugins
```

Pour mémoire, les commandes d'origine (ne PAS relancer, elles écraseraient la configuration) :
`npx cap init "BâtiPlus" com.brgelectro.batiplus --web-dir=www` puis `npx cap add android`.

Raccourcis : `npm run sync` (= construire + sync), `npm run android` (= sync + ouverture dans Android Studio).

Vérifier : `npm run verifier:android` → 3 contrôles ✔ (permissions après fusion, manifeste, Gradle).

## Étape 3 — Build de test (APK)

```bash
npm run sync
cd android
./gradlew assembleDebug          # Windows : gradlew.bat assembleDebug
```

Résultat : `android/app/build/outputs/apk/debug/app-debug.apk`.

La version de test s'appelle `com.brgelectro.batiplus.test` (suffixe `.test`, version `1.0.0-test`) : elle s'installe **à côté** de la version Play Store sans la remplacer. Elle n'a besoin d'aucune clé de signature.

Dans Android Studio, le même résultat s'obtient par *Build → Build App Bundle(s) / APK(s) → Build APK(s)*.

## Étape 4 — Vérifier sur un vrai téléphone

1. Sur le téléphone : *Paramètres → À propos → appuyer 7 fois sur « Numéro de build »*, puis *Options pour les développeurs → Débogage USB*.
2. Brancher le câble, accepter l'empreinte de l'ordinateur, puis :

```bash
adb devices                                         # le téléphone apparaît « device »
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

3. Contrôles à cocher (étape 13 du cahier des charges) :

| Contrôle | Comment | Attendu |
|---|---|---|
| ⑧ l'APK s'installe | `adb install` ci-dessus | « Success », icône BâtiPlus dans le lanceur |
| ⑨ l'app s'ouvre sans connexion | activer le **mode avion**, fermer l'app (balayer), la rouvrir | écran de démarrage, puis accueil ; études, devis, PDF et feuille A4 fonctionnent |
| ⑩ aucune permission superflue | *Paramètres → Applications → BâtiPlus → Autorisations* | seulement « Notifications » ; rien pour l'appareil photo, les fichiers, la position, les contacts |
| photo du tableau | dans un devis, « Prendre la photo » | l'appareil photo du téléphone s'ouvre **sans demande d'autorisation**, la photo apparaît dans le devis et en annexe du PDF |
| rappels | Android 13+ : accepter les notifications à la demande | rappel J-3, veille et jour J de la fin d'abonnement |
| retour Android | bouton/geste retour sur chaque écran | ferme la fenêtre ouverte, revient en arrière, puis quitte depuis l'accueil |

Liste des permissions vue par Android, depuis l'ordinateur :

```bash
adb shell dumpsys package com.brgelectro.batiplus.test | grep "permission"
```

Doivent apparaître seulement : `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` (plus la permission interne `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` ajoutée automatiquement par AndroidX, qui n'est pas demandée à l'utilisateur).

## Étape 5 — Créer le keystore (la clé de signature)

> ⚠️ **VITAL.** Sans cette clé (et son mot de passe), vous ne pourrez **plus jamais** mettre à jour BâtiPlus sur le Play Store sans passer par une procédure de réinitialisation auprès de Google. Créez-la **une seule fois**.

1. Créer un dossier **hors du dépôt Git**, par exemple `C:\cles-batiplus\` (Windows) ou `~/cles-batiplus/` (macOS / Linux), puis dans ce dossier :

```bash
keytool -genkey -v -keystore batiplus.keystore -alias batiplus \
  -keyalg RSA -keysize 2048 -validity 10000
```

   `keytool` est fourni avec le JDK (dans Android Studio : `jbr/bin/keytool`). Il demande un mot de passe (16 caractères ou plus, généré par un gestionnaire de mots de passe), puis nom, organisation (BRG Électro+), ville, pays (BF).

2. Copier `android/keystore.properties.exemple` en **`android/keystore.properties`** et le remplir :

```properties
storeFile=C:/cles-batiplus/batiplus.keystore
storePassword=le-mot-de-passe
keyAlias=batiplus
keyPassword=le-mot-de-passe
```

   Ce fichier est **ignoré par Git** (`.gitignore`), comme tous les `*.keystore` et `*.jks`. Le contrôle GS de `npm run construire` échoue si l'un d'eux est un jour versionné. Sur un serveur d'intégration, utiliser plutôt les variables `BATIPLUS_KEYSTORE`, `BATIPLUS_KEYSTORE_MOT_DE_PASSE`, `BATIPLUS_CLE_ALIAS`, `BATIPLUS_CLE_MOT_DE_PASSE`.

3. **Sauvegarder sur deux supports différents**, le jour même :
   - une clé USB rangée en lieu sûr (pas dans la sacoche de chantier) ;
   - un espace en ligne chiffré (Google Drive / OneDrive dans une archive protégée par mot de passe, ou le coffre du gestionnaire de mots de passe).
4. **Noter le mot de passe dans un coffre-fort de mots de passe** (Bitwarden, 1Password, KeePass…) avec l'alias `batiplus` et l'empreinte de la clé :

```bash
keytool -list -v -keystore batiplus.keystore -alias batiplus   # copier la ligne « SHA256: »
```

5. Remplir le registre ci-dessous (dans le coffre-fort, **pas** dans le dépôt) :

| Élément | Valeur |
|---|---|
| Fichier | batiplus.keystore |
| Alias | batiplus |
| Empreinte SHA-256 | (copier depuis `keytool -list`) |
| Créé le | (date) |
| Copie 1 | (support et lieu) |
| Copie 2 | (support et lieu) |
| Mot de passe | dans le coffre-fort (nom de l'entrée) |

Avec **Play App Signing** (obligatoire pour les nouvelles applications), cette clé devient la **clé d'importation** : Google conserve la clé de signature finale. Si la clé d'importation est perdue, le propriétaire du compte peut demander sa réinitialisation dans la Play Console (plusieurs jours d'attente) — d'où l'importance des deux copies.

## Étape 6 — Build .aab (version publiée)

```bash
npm run sync
cd android
./gradlew bundleRelease          # Windows : gradlew.bat bundleRelease
```

Résultat : `android/app/build/outputs/bundle/release/app-release.aab` (signé avec votre clé, code réduit par R8 : `minifyEnabled true`, `shrinkResources true`).

- Sans `keystore.properties`, la construction **s'arrête** avec un message clair : aucune version publiée non signée n'est possible.
- Garder le fichier `android/app/build/outputs/mapping/release/mapping.txt` de chaque version : il permet de lire les rapports de plantage dans la Play Console (on peut aussi l'y téléverser).
- **Tester la version réduite avant de la publier** : `./gradlew assembleRelease` puis `adb install -r app/build/outputs/apk/release/app-release.apk`, et refaire les contrôles de l'étape 4 (la réduction du code ne doit rien casser : photo, PDF, partage, notifications).

## Étape 7 — Compte Google Play Console (25 $ une fois)

1. <https://play.google.com/console> → créer un compte développeur : **25 $ US, payés une seule fois** (carte bancaire).
2. Choisir le type de compte :
   - **Organisation** (recommandé pour BRG Électro+) : demande un numéro D-U-N-S de l'entreprise (gratuit, quelques jours) ; pas de test fermé obligatoire avant la production ;
   - **Personnel** : vérification d'identité (pièce d'identité) ; Google impose alors un **test fermé avec au moins 12 testeurs pendant 14 jours** avant de pouvoir publier en production.
3. Vérifier le téléphone et l'adresse e-mail de contact, accepter les conditions.
4. *Créer une application* : nom « BâtiPlus Électricien : devis », langue Français, **Application**, **Gratuite**.

> ⚠️ **Règle de paiement de Google Play — à trancher AVANT d'envoyer la version en production.**
> Les formules de BâtiPlus débloquent des fonctions de l'application (devis illimités, logo) : pour Google, ce sont des **contenus numériques**. Sa règle « Paiements » impose alors le **système de facturation Google Play** pour tout achat fait dans l'application. Les paiements externes (agrégateur, lien vers un site) ne sont ouverts qu'aux États-Unis, au Royaume-Uni et dans l'Espace économique européen depuis le 30 juin 2026 ; Google annonce leur ouverture aux **autres pays, dont le Burkina Faso, le 30 septembre 2027**. D'ici là, la page de paiement par agrégateur (étape 12) dans la version Play Store **expose à un refus ou à un retrait**.
> Trois voies possibles (décision de BRG Électro+) :
> 1. **Ajouter Google Play Billing** à la version Play Store (abonnements configurés dans la Play Console ; commission Google) et garder l'agrégateur pour la version web (PWA) ;
> 2. publier d'abord la version Play Store **sans achat dans l'application** (formule gratuite seulement, aucun lien ni mention d'un paiement ailleurs — Google interdit aussi d'orienter vers un paiement externe), les abonnés activant leur compte par la synchronisation de l'étape 14 après un achat fait sur le site ;
> 3. attendre le 30 septembre 2027 et s'inscrire au programme de paiements externes de Google pour le Burkina Faso (frais de service Google sur les achats liés).
> Vérifier la règle à jour au moment de publier : <https://support.google.com/googleplay/android-developer/answer/9858738>.

## Étape 8 — Remplir la fiche

Tous les textes et images sont prêts dans `store/` :

| Champ de la Play Console | Source |
|---|---|
| Nom, description courte, description longue | `store/fiche-play-store.md` |
| Icône 512 × 512 | `store/icone-512.png` |
| Image de présentation 1024 × 500 | `store/banniere-1024x500.png` |
| Captures d'écran téléphone (2 à 8) | `store/captures/*.png` (1080 × 1920) |
| Catégorie | Entreprise (Business) |
| Coordonnées | téléphone +226 05 60 86 08, adresse e-mail de BRG Électro+ |
| Politique de confidentialité | **adresse publique** de `store/confidentialite.html` |

**Publier la politique de confidentialité** (Google exige un lien public, accessible sans connexion) :
- solution immédiate et gratuite : un dépôt GitHub **public** ne contenant que `confidentialite.html` (renommé `index.html`), avec GitHub Pages activé → `https://<compte>.github.io/batiplus-confidentialite/` ;
- ou le futur site de BâtiPlus (phase « SITE WEB ») : `https://<domaine>/confidentialite.html`.
La page est autonome (aucun script, aucune ressource externe). Après chaque modification de `CONFIDENTIALITE.md`, régénérer avec `npm run confidentialite` (aussi fait par `npm run construire`) et republier.

Refaire les images après un changement visible de l'interface : `npm run play-store` (voir l'en-tête du script pour les outils de navigateur).

## Étape 9 — Déclarer la sécurité des données

*Contenu de l'application* (menu de gauche, « Règles et programmes ») → remplir **toutes** les déclarations avec les réponses de `store/fiche-play-store.md`, section « Sécurité des données » :

- collecte : nom, téléphone, adresse (ville), historique des achats, photos, contenu généré (chantiers, devis, clients) ;
- partage avec des tiers : aucun ; chiffrement en transit : oui ; suppression sur demande : oui ;
- annonces : non ; public cible : 18 ans et plus ; accès : création d'un compte gratuit dans l'application ;
- questionnaire de classification du contenu (IARC) : application utilitaire, aucun contenu sensible.

Les déclarations doivent correspondre à `CONFIDENTIALITE.md` : un écart est un motif de refus.

## Étape 10 — Test interne

1. *Tests → Tests internes → Créer une release*.
2. À la première release, accepter **Play App Signing** (Google génère et garde la clé de signature finale ; votre keystore devient la clé d'importation).
3. Téléverser `app-release.aab`, nommer la release « 1.0.0 (1) », notes de version en français.
4. Ajouter les testeurs (jusqu'à 100 adresses Gmail), partager le lien d'inscription.
5. Installer depuis le Play Store sur 2 ou 3 téléphones différents (dont un Android ancien et un Android 13+) et refaire les contrôles de l'étape 4.
6. Lire le **rapport pré-lancement** (*Tests → Rapport pré-lancement*) : plantages, problèmes d'accessibilité, alertes de sécurité. Tout corriger avant la production.

Compte personnel : passer ensuite par *Tests fermés* avec au moins 12 testeurs inscrits pendant 14 jours d'affilée (exigence Google, voir étape 7).

## Étape 11 — Production

1. *Production → Créer une release* → reprendre l'.aab déjà testé (*Ajouter depuis la bibliothèque*).
2. Pays : Burkina Faso et les pays d'Afrique de l'Ouest et centrale visés (ou tous les pays).
3. **Déploiement progressif** conseillé : 20 %, puis 50 %, puis 100 % après quelques jours sans plantage (*Statistiques → Android vitals*).
4. Envoyer pour examen : de quelques heures à 7 jours pour une première application. En cas de refus, Google indique la règle concernée : corriger, augmenter le versionCode, renvoyer.

## Étape 12 — Mise à jour

À chaque nouvelle version :

1. Dans `android/app/build.gradle` : **versionCode + 1** (2, 3, 4… — un entier, jamais réutilisé) et `versionName` lisible (« 1.0.1 », « 1.1.0 »…) ; mettre **la même valeur** dans `package.json` → `version` (le contrôle GS refuse un écart entre les deux).
2. `npm run construire` → tous les contrôles ✔ ; `npm run verifier:android` → ✔.
3. `npm run sync`, puis `cd android && ./gradlew bundleRelease` avec **le même keystore**.
4. Tester l'APK réduit sur un téléphone (étape 6), puis *Tests internes* → *Production*.
5. Si les données collectées changent (par exemple la synchronisation de l'étape 14) : mettre à jour `CONFIDENTIALITE.md`, republier la page, mettre à jour la section « Sécurité des données » **avant** de publier la version.

---

### En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| `SDK location not found` | SDK Android non trouvé | ouvrir `android/` une fois dans Android Studio (crée `android/local.properties`, ignoré par Git) |
| `Unsupported class file major version` / JDK | mauvais JDK | utiliser le JDK 21 d'Android Studio |
| « clé de signature introuvable » | `keystore.properties` absent | étape 5 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | une version signée autrement est installée | `adb uninstall com.brgelectro.batiplus` (efface les données de ce téléphone) |
| Écran blanc au démarrage | `www/` non copié | `npm run sync` |
| L'appareil photo ne s'ouvre pas | aucune application Appareil photo | installer/activer l'appareil photo du téléphone ; le devis reste utilisable sans photo |
