# BâtiPlus — Tester sur votre téléphone Android (avec Antigravity)

Ce dossier `BatiPlus/` est l'application complète et **indépendante** : ouvrez-le tel quel dans
Antigravity (*File → Open Folder → BatiPlus*). Toutes les commandes ci-dessous se tapent dans le
terminal d'Antigravity (*Terminal → New Terminal*), **depuis le dossier BatiPlus**.

## 1. À installer une seule fois sur l'ordinateur

1. **Node.js 22** — https://nodejs.org (version LTS 22).
2. **Android Studio** — https://developer.android.com/studio
   Puis dans Android Studio → *More Actions → SDK Manager* : cocher **Android 15 (API 35)** et,
   onglet *SDK Tools*, **Android SDK Platform-Tools**. Cliquer *Apply*.
3. **Windows** : variables d'environnement (*Paramètres → Système → Informations système →
   Paramètres avancés → Variables d'environnement*) :
   - `ANDROID_HOME` = `C:\Users\VOTRE_NOM\AppData\Local\Android\Sdk`
   - `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr`
   - ajouter à `Path` : `%ANDROID_HOME%\platform-tools`

   Fermer puis rouvrir Antigravity. Vérifier : `node -v` (v22…), `adb version`, `java -version` (21).

## 2. Préparer le téléphone

1. *Paramètres → À propos du téléphone* → appuyer **7 fois** sur « Numéro de build ».
2. *Paramètres → Options pour les développeurs* → activer **Débogage USB**.
3. Brancher le câble USB, accepter « Autoriser le débogage USB » sur le téléphone.

## 3. Installer l'application sur le téléphone

```bash
npm install
npm run assembler
npx cap sync android
adb devices
```

`adb devices` doit afficher votre téléphone avec le mot `device` (si `unauthorized` : accepter sur
le téléphone).

**Windows (PowerShell) :**

```powershell
cd android
.\gradlew.bat installDebug
adb shell monkey -p com.brgelectro.batiplus.test -c android.intent.category.LAUNCHER 1
cd ..
```

**Mac / Linux :**

```bash
cd android
./gradlew installDebug
adb shell monkey -p com.brgelectro.batiplus.test -c android.intent.category.LAUNCHER 1
cd ..
```

La première fois, Gradle télécharge ses outils : 5 à 10 minutes. L'icône **BâtiPlus** apparaît
ensuite sur le téléphone (version de test `com.brgelectro.batiplus.test`, aucune clé de signature
nécessaire).

Autre possibilité : `npx cap open android` ouvre le projet dans Android Studio → bouton ▶ (Run)
avec votre téléphone sélectionné.

## 4. Après chaque modification

```bash
npm run assembler
npx cap sync android
cd android
.\gradlew.bat installDebug      # Mac / Linux : ./gradlew installDebug
cd ..
```

Les sources à modifier sont dans `src/` (`charte.css`, `corps.html`, `donnees.js`, `moteur.js`) ;
`www/index.html` est **regénéré** par `npm run assembler` (ne pas le modifier à la main).

## 5. Ce que vous pouvez tester

- Fonctionne entièrement sur le téléphone : inscription, nouveau chantier, étude NF C 15-100,
  devis, feuille A4 / PDF, partage WhatsApp, photo du tableau, clients, statistiques, mode sombre,
  hors connexion.
- Pas encore actif pendant ce test : la copie en ligne, le paiement et l'administration (l'API
  n'est pas encore installée sur un serveur — voir `backend/INSTALLATION.md`). Le Profil affiche
  « Pas encore relié » : c'est normal, vos données restent sur le téléphone. Sans clé d'abonnement,
  le compte reste en formule Gratuit (5 devis par mois).

## 6. Problèmes fréquents

| Message | Solution |
|---|---|
| `SDK location not found` | créer le fichier `android/local.properties` contenant : `sdk.dir=C\:\\Users\\VOTRE_NOM\\AppData\\Local\\Android\\Sdk` |
| `adb` n'est pas reconnu | ajouter `platform-tools` au `Path`, rouvrir Antigravity |
| erreur de version de Java | `JAVA_HOME` doit pointer vers le dossier `jbr` d'Android Studio |
| `Permission denied: ./gradlew` (Mac / Linux) | `chmod +x android/gradlew` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | `adb uninstall com.brgelectro.batiplus.test` puis recommencer (efface les données de test) |
| le téléphone n'apparaît pas | changer de câble (certains ne font que la charge), réactiver le débogage USB |

Guide complet jusqu'au Play Store : `ANDROID.md`.
