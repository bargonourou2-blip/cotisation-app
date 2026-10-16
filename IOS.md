# BâtiPlus sur iPhone — les vérités

Ce document dit, sans détour, ce que coûte une version iPhone (App Store) de BâtiPlus et ce que nous recommandons.

## 1. Pas de build iOS sans un Mac et Xcode

- Une application iPhone ne se construit **que sur un Mac** (macOS récent) avec **Xcode**, l'outil gratuit d'Apple. Il n'existe aucune solution officielle depuis Windows ou Linux.
- Capacitor sait produire le projet iOS (`npx cap add ios`), mais la compilation, la signature et l'envoi à Apple passent obligatoirement par Xcode sur un Mac.
- Les services de « Mac dans le cloud » existent (location à l'heure ou au mois), mais restent un coût et une complexité de plus.

## 2. Compte Apple Developer : 99 $ PAR AN

- Le programme Apple Developer coûte **99 $ US par an**, **chaque année** : si l'abonnement n'est pas renouvelé, l'application disparaît de l'App Store.
- À comparer avec Google Play : **25 $ une seule fois**, à vie.
- Un compte au nom de l'entreprise demande en plus un numéro D-U-N-S.

## 3. Apple refuse les « copies de site web »

- La règle **4.2 (fonctionnalité minimale)** des directives d'examen de l'App Store refuse les applications qui ne sont qu'un site web emballé dans une application.
- Pour espérer être accepté, il faudrait ajouter de **vraies fonctions natives** qui justifient une application : appareil photo intégré au devis, notifications, partage natif du PDF, widgets, Siri, etc. — et les mettre en avant lors de l'examen.
- Même ainsi, l'acceptation n'est jamais garantie : chaque mise à jour repasse l'examen.
- Comme sur Google Play, Apple impose son propre système d'achat intégré pour les abonnements qui débloquent des fonctions de l'application (règle 3.1.1), hors exceptions régionales : le paiement par agrégateur de l'étape 12 ne serait pas accepté tel quel.

## 4. Notre recommandation : ne pas viser l'App Store au lancement

Les utilisateurs d'iPhone peuvent installer **gratuitement** BâtiPlus comme application web (PWA), sans App Store, sans compte Apple Developer et sans examen :

1. ouvrir l'adresse de BâtiPlus dans **Safari** (pas Chrome : sur iPhone, l'installation passe par Safari) ;
2. toucher le bouton **Partager** (le carré avec une flèche vers le haut) ;
3. choisir **« Sur l'écran d'accueil »**, puis **Ajouter**.

L'icône BâtiPlus apparaît alors sur l'écran d'accueil et l'application s'ouvre en plein écran, comme une application installée. Ces trois gestes sont déjà expliqués dans l'application (« À propos → Installer BâtiPlus »).

Limites honnêtes de la PWA sur iPhone :
- les notifications de rappel ne fonctionnent que sur iOS 16.4 et plus récent, une fois l'application ajoutée à l'écran d'accueil ;
- la photo du tableau passe par le sélecteur de Safari (« Prendre une photo » ou « Photothèque ») ;
- Safari peut effacer les données d'un site non ouvert pendant plusieurs semaines : il faut garder une sauvegarde (« Mon profil → Sauvegarde → Exporter »), en attendant la synchronisation du compte (étape 14).

## 5. Quand reconsidérer l'App Store

- quand le nombre d'utilisateurs d'iPhone payants couvre largement 99 $ par an et le temps de maintenance ;
- quand la synchronisation (étape 14) et des fonctions natives propres à l'iPhone justifient une vraie application ;
- avec un Mac disponible et une personne responsable des mises à jour et des examens d'Apple.

---

BâtiPlus est une application conçue et développée par BRG Électro+ — +226 05 60 86 08 · +226 68 52 42 90.
