# Politique de confidentialité de BâtiPlus

Dernière mise à jour : 16 octobre 2026 — version 1.0

BâtiPlus est une application d'étude et de devis d'installations électriques destinée aux électriciens. Cette politique explique, simplement et complètement, quelles informations l'application utilise, pourquoi, où elles sont conservées, pendant combien de temps, qui peut y accéder et comment les faire supprimer.

## 1. Éditeur et contact

- **Éditeur** : BRG Électro+, entreprise d'électricité, Burkina Faso — conceptrice et éditrice de BâtiPlus.
- **Application** : BâtiPlus, identifiant Google Play `com.brgelectro.batiplus`.
- **Contact pour toute question sur vos données** : +226 05 60 86 08 (appel ou WhatsApp) · +226 68 52 42 90.

## 2. Données collectées

### Ce que vous saisissez pour votre compte

- votre nom et, si vous le souhaitez, le nom de votre entreprise ;
- votre numéro de téléphone (il sert d'identifiant de connexion) ;
- votre ville, votre pays et votre devise ;
- votre photo de profil et le logo de votre entreprise, seulement si vous les ajoutez ;
- votre code secret : il n'est **jamais** conservé tel quel. Seule une empreinte chiffrée (PBKDF2-SHA-256, 150 000 itérations, sel aléatoire) est enregistrée ; personne, pas même BRG Électro+, ne peut retrouver votre code à partir de cette empreinte.

### Ce que vous créez dans l'application

- vos chantiers (pièces, surfaces, appareils, options) et leurs études ;
- vos devis (lignes de matériel, prix, main-d'œuvre, conditions, notes, statut) ;
- les coordonnées de vos clients que vous saisissez : nom, téléphone, lieu du chantier ;
- vos prix habituels et vos fournisseurs (« Mes prix ») ;
- les photos de tableau électrique que vous joignez à un devis.

### Abonnement et paiement

- la formule choisie, ses dates de début et de fin, la référence et le résultat de chaque paiement, le moyen utilisé (par exemple Orange Money ou carte) et le montant ;
- un jeton d'abonnement signé par BâtiPlus, qui prouve votre formule sans jamais contenir de donnée de paiement.

### Ce que BâtiPlus ne collecte pas

- aucune localisation GPS, aucun contact du téléphone, aucun fichier en dehors de ceux que vous choisissez ;
- aucun identifiant publicitaire, aucun outil de mesure d'audience, aucun traceur, aucune publicité ;
- aucun code Mobile Money, aucun numéro de carte bancaire : ils sont saisis uniquement sur la page sécurisée de l'agrégateur de paiement.

## 3. Pourquoi ces données sont utilisées

| Donnée | Utilisation |
|---|---|
| Nom, entreprise, téléphone, ville, pays | Créer et protéger votre compte ; les afficher en en-tête de vos devis |
| Code secret (empreinte) | Vérifier que c'est bien vous qui ouvrez l'application |
| Chantiers, devis, clients, prix | Faire l'étude NF C 15-100, chiffrer et produire vos devis |
| Photo du tableau électrique | La joindre en annexe de la feuille A4 et du PDF du devis |
| Formule, paiements | Activer, prolonger et prouver votre abonnement ; établir vos reçus |
| Notifications | Vous rappeler la fin de votre abonnement (3 jours avant, la veille, le jour même) |

Vos données ne sont **jamais vendues**, jamais louées, jamais utilisées pour de la publicité ni pour établir un profil commercial.

## 4. Où les données sont stockées

- **Sur votre téléphone** : toutes vos données sont enregistrées dans l'espace privé de l'application, inaccessible aux autres applications.
- **Pas de sauvegarde Android automatique** : l'application interdit la copie de ses données dans les sauvegardes Google et lors du transfert vers un nouveau téléphone, pour éviter toute fuite.
- **Votre copie de sauvegarde** : depuis « Mon profil → Sauvegarde », vous pouvez exporter vos données dans un fichier que vous gardez où vous voulez. Les photos de tableau n'y figurent pas (fichier léger).
- **Paiement** : lors d'un achat, la référence du paiement, la formule, votre identifiant de compte et votre numéro de téléphone sont transmis, de façon chiffrée (HTTPS), au service en ligne de BâtiPlus et à l'agrégateur de paiement choisi, uniquement pour réaliser et confirmer le paiement.
- **Synchronisation** : lorsque la synchronisation de compte sera proposée dans une mise à jour, vos données seront copiées de façon chiffrée sur le service en ligne de BâtiPlus pour les retrouver sur un autre téléphone. Cette politique sera mise à jour avant toute mise en service, et vous en serez informé dans l'application.

Toutes les communications de l'application passent par HTTPS ; aucune connexion non chiffrée n'est autorisée.

## 5. Appareil photo

L'appareil photo ne s'ouvre que lorsque vous touchez « Prendre la photo » dans un devis. BâtiPlus utilise l'application Appareil photo de votre téléphone : il ne demande pas la permission d'accéder à la caméra et ne prend jamais de photo à votre insu. La photo n'est pas enregistrée dans votre galerie ; elle est redessinée, réduite (1 280 pixels au plus) et conservée uniquement dans le devis concerné. Vous pouvez la retirer à tout moment (« Retirer la photo »).

## 6. Notifications

Sur Android 13 et plus récent, l'application vous demande l'autorisation d'afficher des notifications. Elles servent uniquement aux rappels de fin d'abonnement. Vous pouvez refuser ou les désactiver à tout moment dans les réglages du téléphone : l'application continue de fonctionner normalement.

## 7. Paiement

Le paiement est réalisé sur la page sécurisée d'un agrégateur de paiement agréé (par exemple CinetPay, FedaPay, LigdiCash, PayDunya ou Stripe pour les cartes). BâtiPlus ne voit et ne conserve jamais votre code Mobile Money, votre code PIN ni votre numéro de carte. L'agrégateur traite ces informations selon sa propre politique de confidentialité. BâtiPlus reçoit seulement la référence, le montant, la formule et le résultat (payé, échoué, annulé).

## 8. Qui a accès aux données

- **Vous**, sur votre téléphone, après saisie de votre code secret.
- **Vos clients**, uniquement pour les devis que vous choisissez de leur envoyer (WhatsApp, partage du PDF, impression).
- **BRG Électro+**, uniquement pour les informations d'abonnement et de paiement nécessaires au service et au support, et seulement lorsque vous le contactez.
- **L'agrégateur de paiement**, pour les seules informations du paiement en cours.

Aucune autre entreprise n'a accès à vos données. Elles ne sont communiquées à une autorité que si la loi l'exige.

## 9. Durée de conservation

- **Sur le téléphone** : tant que vous gardez l'application et que vous ne supprimez pas les éléments concernés. Supprimer un devis supprime aussi sa photo de tableau. Désinstaller l'application efface toutes les données de ce téléphone.
- **Session** : l'application se verrouille après 15 minutes d'inactivité ; votre code secret est alors redemandé.
- **Paiements et abonnement** (service en ligne) : la durée de l'abonnement, puis 5 ans pour les obligations comptables (preuve des paiements, reçus).
- **Demandes au support** : effacées dans les 12 mois suivant leur traitement.

## 10. Suppression de vos données

- **Sur le téléphone** : supprimez un devis, un chantier ou un client depuis l'application ; ou désinstallez BâtiPlus pour tout effacer.
- **Suppression du compte et des données détenues en ligne** : envoyez « Suppression de mon compte BâtiPlus » par WhatsApp au +226 05 60 86 08 depuis le numéro de votre compte. Nous confirmons la suppression sous 30 jours au plus. Seules les preuves de paiement que la loi impose de garder sont conservées, pour la durée légale, puis supprimées.

## 11. Vos droits

Vous pouvez à tout moment demander à accéder à vos données, à les corriger, à les exporter (« Mon profil → Sauvegarde → Exporter »), à limiter leur utilisation ou à les faire supprimer, et retirer votre accord aux notifications. Pour toute demande : +226 05 60 86 08 (WhatsApp) ou +226 68 52 42 90. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir l'autorité de protection des données personnelles de votre pays (au Burkina Faso : la Commission de l'Informatique et des Libertés, CIL).

## 12. Sécurité

- code secret jamais conservé en clair (empreinte PBKDF2) ; blocage temporaire après plusieurs codes faux ;
- verrouillage automatique après 15 minutes d'inactivité ;
- données dans l'espace privé de l'application, exclues des sauvegardes Android ;
- communications uniquement en HTTPS, certificats du système seulement ;
- abonnement prouvé par une signature numérique vérifiée sur le téléphone : il ne peut pas être modifié à la main ;
- aucune clé secrète dans l'application ; paiements confirmés uniquement par le service en ligne de BâtiPlus.

Aucun système n'est invulnérable : protégez votre téléphone par un verrouillage d'écran et ne communiquez jamais votre code secret.

## 13. Enfants

BâtiPlus est un outil professionnel destiné aux électriciens adultes. Il ne s'adresse pas aux enfants de moins de 16 ans et ne collecte pas sciemment leurs données.

## 14. Modifications de cette politique

Cette politique peut évoluer, notamment lors de l'arrivée de la synchronisation de compte. La date de mise à jour figure en haut de la page. En cas de changement important, vous en serez informé dans l'application avant qu'il ne s'applique.

---

BâtiPlus est une application conçue et développée par BRG Électro+ — +226 05 60 86 08 · +226 68 52 42 90.
