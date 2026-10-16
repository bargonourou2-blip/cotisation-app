# Fiche Google Play — BâtiPlus

Textes prêts à copier dans la Play Console (Présence sur le Store → Fiche principale).
Les longueurs sont vérifiées par `npm run construire` (contrôle FS) : titre ≤ 30 caractères,
description courte ≤ 80, description longue ≤ 4 000.

| Champ | Valeur |
|---|---|
| Nom de l'application | BâtiPlus Électricien : devis |
| Identifiant | `com.brgelectro.batiplus` |
| Version | 1.0.0 (versionCode 1) |
| Catégorie | Application → Entreprise (Business) |
| Tags | Productivité, Outils professionnels |
| Langue par défaut | Français (France) – fr-FR |
| Adresse e-mail de contact | adresse de BRG Électro+ à saisir dans la Play Console (obligatoire) |
| Téléphone | +226 05 60 86 08 |
| Politique de confidentialité | adresse publique de `store/confidentialite.html` (voir ANDROID.md, étape 8) |
| Prix | Téléchargement gratuit (mode de paiement des formules : voir l'avertissement de ANDROID.md, étape 7) |
| Contient des annonces | Non |

## Titre

```text
BâtiPlus Électricien : devis
```

## Description courte

```text
Étude et devis d'électricité selon la NF C 15-100, à vos prix. Hors ligne.
```

## Description longue

```text
BâtiPlus est l'assistant des électriciens pour étudier un chantier et remettre un devis propre en quelques minutes, directement sur le téléphone, même sans connexion.

LE PROBLÈME
Un devis d'électricité, c'est souvent une soirée perdue : compter les prises pièce par pièce, choisir les sections de câble et les calibres des disjoncteurs, additionner le matériel à la main, recopier le tout au propre… Et le jour du chantier, on découvre l'article oublié ou le circuit mal calculé, qui mange la marge.

LA SOLUTION
Vous décrivez le chantier, BâtiPlus calcule, le devis est prêt.
1. Indiquez le client, le type de bâtiment et les pièces avec leur surface.
2. Ajoutez les appareils : chauffe-eau, climatiseurs, cuisinière, lave-linge…
3. BâtiPlus propose les circuits, les sections et les protections selon la norme NF C 15-100, dessine le tableau électrique et liste tout le matériel.
4. Vous ajustez quantités et prix, puis vous envoyez le devis au client.

LES FONCTIONS
• Étude guidée en 5 étapes : client, pièces, appareils, options, main-d'œuvre.
• Calcul NF C 15-100 : nombre de prises et de points lumineux par pièce, circuits spécialisés, sections de câble, disjoncteurs, différentiels 30 mA, parafoudre et mise à la terre.
• Schéma clair du tableau électrique, rangée par rangée.
• Contrôle de conformité : ce qui manque ou mérite votre attention est signalé.
• Liste du matériel avec VOS prix et vos fournisseurs habituels (« Mes prix »).
• Main-d'œuvre au choix : par point, au forfait, à la journée ou par lignes libres.
• Remise, TVA, acompte et reste à payer calculés automatiquement, montant écrit en toutes lettres.
• Devis A4 professionnel avec votre nom, votre entreprise et votre logo.
• Photo du tableau électrique existant jointe en annexe du devis.
• Envoi en PDF ou par WhatsApp en un toucher.
• Suivi des devis : brouillon, envoyé, accepté, refusé, payé.
• Carnet de clients, historique, recherche et statistiques du mois.
• Fonctionne hors connexion : vos études et devis restent sur votre téléphone.
• Mode sombre, gros boutons, textes lisibles en plein soleil.
• Rappel avant la fin de votre abonnement.

LES FORMULES
• Gratuit : 5 devis par mois, pour découvrir l'application.
• Pass semaine, Pro mensuel, Pro annuel ou Lifetime : devis illimités, votre logo sur les devis, sans mention BâtiPlus en bas de page.

VOS DONNÉES
Vos chantiers, vos clients et vos devis restent sur votre téléphone. Votre code secret n'est jamais conservé en clair. Aucune publicité, aucun traceur, aucune donnée vendue.

IMPORTANT
BâtiPlus est une aide au calcul. La conformité finale de l'installation reste sous la responsabilité de l'électricien qui la réalise.

LE CONCEPTEUR
BâtiPlus est conçu et développé par BRG Électro+, entreprise d'électricité au Burkina Faso. Nous avons créé l'outil dont nous avions besoin sur nos propres chantiers : rapide, fiable et pensé pour le terrain.
Support et abonnements : +226 05 60 86 08 · +226 68 52 42 90 (appel ou WhatsApp).
```

> La description ne cite volontairement aucun moyen de paiement extérieur à Google Play : tant que la règle « Paiements » de Google s'applique au Burkina Faso (voir ANDROID.md, étape 7), une fiche qui oriente vers un autre paiement peut être refusée.

## Images

| Élément | Fichier | Dimensions | Règle Google Play |
|---|---|---|---|
| Icône | `store/icone-512.png` | 512 × 512, PNG 32 bits | ≤ 1 Mo, carré plein (Google arrondit les coins) |
| Bannière (image de présentation) | `store/banniere-1024x500.png` | 1024 × 500 | JPEG ou PNG 24 bits sans transparence |
| Captures téléphone | `store/captures/01-…png` à `06-…png` | 1080 × 1920 | 2 à 8 captures, format 9:16 |

Les images sont produites par `npm run play-store` (vrai navigateur, données d'exemple, polices et logos locaux). Les relancer après un changement visible de l'interface.

## Sécurité des données

Réponses à reporter dans la Play Console (Contenu de l'application → Sécurité des données).
Principe retenu : on déclare tout ce qui peut quitter le téléphone, y compris au moment du paiement et, dès sa mise en service, de la synchronisation — déclarer plus est sans risque, déclarer moins fait retirer l'application.

### Questions générales

| Question | Réponse |
|---|---|
| L'application collecte-t-elle ou partage-t-elle des données utilisateur des types requis ? | Oui |
| Toutes les données collectées sont-elles chiffrées en transit ? | Oui (HTTPS obligatoire, aucune connexion en clair) |
| Proposez-vous un moyen de demander la suppression des données ? | Oui — WhatsApp +226 05 60 86 08 (voir CONFIDENTIALITE.md, section 10) |
| Données partagées avec des tiers | Aucune. Les agrégateurs de paiement agissent pour le compte de BRG Électro+ (prestataires de service : pas un « partage » au sens de Google) |

### Types de données collectées

| Catégorie Google | Type | Collectée | Partagée | Facultative | Finalités |
|---|---|---|---|---|---|
| Informations personnelles | Nom | Oui | Non | Non (obligatoire) | Fonctionnement de l'application, gestion du compte |
| Informations personnelles | Numéro de téléphone | Oui | Non | Non (obligatoire) | Gestion du compte, fonctionnement de l'application (identifiant, paiement) |
| Informations personnelles | Adresse (ville et pays) | Oui | Non | Non (obligatoire) | Fonctionnement de l'application (en-tête des devis, devise) |
| Informations financières | Historique des achats (formule, montant, référence) | Oui | Non | Oui (seulement en cas d'achat) | Fonctionnement de l'application (abonnement, reçus) |
| Photos et vidéos | Photos (photo de profil, logo, photo du tableau électrique) | Oui | Non | Oui | Fonctionnement de l'application (devis) |
| Activité dans les applications | Autre contenu généré par l'utilisateur (chantiers, devis, clients, prix) | Oui | Non | Non | Fonctionnement de l'application |

Ne PAS cocher : localisation, contacts, identifiants de l'appareil, données de santé, messages, audio, fichiers, historique de navigation, diagnostics, données publicitaires — BâtiPlus n'en collecte aucune.

### Autres déclarations de la Play Console

| Rubrique | Réponse |
|---|---|
| Annonces | Non, l'application ne contient pas d'annonces |
| Accès à l'application | Toutes les fonctions sont accessibles après création d'un compte gratuit dans l'application (aucun identifiant à fournir à Google ; indiquer « Créer un compte avec n'importe quel numéro ») |
| Public cible | 18 ans et plus |
| Application d'actualités | Non |
| Applications financières | Non (paiement d'un abonnement à l'application uniquement) |
| Applications gouvernementales | Non |
| Classification du contenu | Questionnaire IARC : catégorie « Utilitaire, productivité… », aucune violence, aucun contenu sensible → Tout public |
| Permissions sensibles | Aucune (INTERNET, POST_NOTIFICATIONS, ACCESS_NETWORK_STATE seulement) |
