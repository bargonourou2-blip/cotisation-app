# BâtiPlus — Paiement automatique (étape 12)

**Principe : aucun paiement manuel, aucune preuve sur WhatsApp, aucune validation humaine.**
L'électricien choisit sa formule, il paie, l'abonnement s'active tout seul, même la nuit, même si
personne n'est connecté chez BRG Électro+.

---

## 1. Le parcours vu par l'électricien (3 touchers)

1. **Choisir** une formule (écran Mon abonnement).
2. **Récapitulatif** (prix, avantages, logos des moyens de paiement) → **« Payer maintenant »**.
   L'application envoie `POST /api/paiements/initier` avec **seulement** `{"formule":"mensuel"}`.
   Le montant est lu en ligne dans `backend/formules.js` : **le front n'envoie jamais de montant.**
3. **Page de l'agrégateur** ouverte dans le navigateur sécurisé (plugin Capacitor `Browser`).
   L'application affiche aussitôt l'écran **« Nous confirmons votre paiement… »** et consulte
   `GET /api/paiements/:reference` **toutes les 3 s pendant 3 min**.

| Issue | Ce que voit l'électricien |
|---|---|
| payé | coche géante + particules jaunes et violettes, « Votre Pro mensuel est actif jusqu'au … », filigrane retiré **immédiatement**, « Voir mon reçu » |
| échoué / annulé / expiré | message clair + **« Réessayer »** (même formule, nouvelle page) ; le brouillon du devis n'est jamais touché |
| anomalie | « Paiement en vérification » : formule **non** activée, BRG Électro+ vérifie (alerte admin) |
| remboursé | « Paiement remboursé » |
| plus de 3 min | « La confirmation prend plus de temps que prévu… votre formule s'activera toute seule » + « Vérifier à nouveau » |
| coupure internet | « Connexion perdue » + « Vérifier à nouveau » |

**Reprise automatique** : la référence du paiement en cours est gardée sur le téléphone
(`bp_v1_paiement_en_cours`, 24 h). Au retour dans l'application (navigateur fermé, application
remise au premier plan, redémarrage), une vérification discrète est faite : si le paiement a été
confirmé entre-temps, la formule s'active et un message « Paiement confirmé : votre … est actif »
s'affiche.

**Retour de la page de paiement** : l'agrégateur renvoie vers `URL_PUBLIQUE/paiement/retour?ref=…`,
qui redirige vers `URL_SITE/#paiement-retour?ref=BP-…`. L'application vérifie le format de la
référence, l'efface de l'adresse et reprend le suivi. **Ce retour n'active rien** : seul le statut
confirmé en ligne compte.

## 2. Ce qui active réellement l'abonnement

Le Pro n'est donné **que** par un **jeton signé** (ECDSA P-256) renvoyé par
`GET /api/paiements/:reference` quand le statut est « payé ». L'application le vérifie avec la
**clé publique** (balise meta `batiplus-cle-abonnement`) avant de l'enregistrer. Un « payé » avec un
jeton absent, falsifié ou signé par une autre clé → « Vérification impossible », rien d'activé.

## 3. La confirmation côté backend (le cœur)

Webhook `POST /api/paiements/notification/:fournisseur/:secret` :

1. **URL secrète** par agrégateur (`HMAC(WEBHOOK_SECRET, fournisseur)`, 32 caractères hexadécimaux),
   puis **signature de l'agrégateur** vérifiée **en temps constant** quand il en fournit une
   (FedaPay `x-fedapay-signature`, Stripe `Stripe-Signature`, CinetPay `notify_token`,
   PayDunya `hash`). LigdiCash ne signe pas : l'URL secrète + la re-consultation suffisent.
2. **Re-consultation** du statut chez l'agrégateur : la notification seule n'est **jamais** crue.
3. **Montant ET devise** comparés au prix de la formule. Écart → statut **« anomalie »**,
   abonnement **non** activé, alerte en tête de l'administration.
4. **Transaction SQL** : paiement → « payé », abonnement prolongé, ligne du journal d'audit.
5. Réponse **200** rapide.

- **Idempotence** : 10 notifications identiques (même simultanées) = **1** activation.
- **Statut final non modifiable** (déclencheurs SQLite).
- **Tâche planifiée intégrée** (sans cron) toutes les 5 min : re-consulte les paiements en attente
  depuis plus de 3 min ; après 24 h sans réponse → « expiré ». Un webhook perdu la nuit n'empêche
  jamais l'activation.
- **Agrégateur de secours** : si le principal est en panne à l'initiation, bascule sur
  `PAIEMENT_SECOURS`.
- **Aucun numéro de carte ni code Mobile Money** ne transite par le backend BâtiPlus : la saisie se
  fait sur la page de l'agrégateur.

## 4. Renouvellement

- **Mobile Money** (pas de prélèvement possible) : renouvellement **en 1 toucher** (« Renouveler » de
  l'accueil, « Renouveler mon … » de Mon abonnement) + rappels **dans l'application** à **J-3**, la
  **veille** et le **jour J** (bandeau d'accueil + notification locale à 9 h ; le jour J, au plus tard
  1 h avant la fin).
- **Carte bancaire** (Stripe) : prélèvement automatique **seulement si l'électricien l'active** dans
  son profil (interrupteur, désactivé par défaut, enregistré en ligne d'abord). Lancé à J-1, pour le
  Pro mensuel et le Pro annuel uniquement.
- **Renouvellement anticipé** : les jours restants sont **additionnés**.
- **Passage supérieur** : immédiat, au prorata des jours restants.
- **Lifetime** : 200 places, contrôlées en base au moment de l'initiation.

## 5. Architecture interchangeable

`backend/paiements/` : `interface.js` (contrat commun) + `ligdicash.js`, `cinetpay.js`, `fedapay.js`,
`paydunya.js`, `stripe.js`, `simulation.js`. Chaque adaptateur expose exactement :

| Méthode | Rôle |
|---|---|
| `creerPaiement({reference, montant, devise, formule, telephone, nom, email})` | → `{urlPaiement, idFournisseur}` |
| `verifierNotification(requete)` | → `true` / `false` (signature) |
| `lireNotification(requete)` | → `{reference, statut, montant, devise, moyen, idFournisseur}` |
| `consulterStatut(idFournisseur)` | statut réel chez l'agrégateur |
| `rembourser(idFournisseur)` | Stripe et simulation (les autres : remboursement depuis leur espace marchand) |

Changer d'agrégateur = changer `PAIEMENT_FOURNISSEUR` dans `backend/.env`. Rien à modifier dans
l'application.

## 6. Mode test

`PAIEMENT_FOURNISSEUR=simulation` (interdit en production) ouvre une page de paiement factice
`/simulation/payer/SIM-…` avec six boutons : succès, échec, annulation, notification en double,
montant faux (1 FCFA), notification perdue (rattrapée par la tâche planifiée). L'agrégateur en panne
est simulé dans les tests.

```bash
cd batiplus
npm run tester:backend      # 19 contrôles : S1–S5, P1–P13, AD
npm run construire          # assemble l'application + 75 contrôles jsdom + les 19 du backend
```

## 7. Ce qui reste pour l'étape 14

La route de **connexion en ligne** qui délivre le jeton de session (`bp_v1_jeton_api`) arrive avec
le backend complet (comptes et synchronisation). D'ici là, `POST /api/paiements/initier` répond
`non_authentifie` et l'application affiche « Votre session en ligne a expiré : reconnectez-vous… ».
Les contrôles utilisent un jeton d'essai.
