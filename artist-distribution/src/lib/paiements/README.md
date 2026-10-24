# Brancher un prestataire de paiement

## État actuel

**Aucun paiement en ligne n'est configuré.** C'est volontaire :

- le site affiche clairement « paiement en ligne indisponible » ;
- l'artiste peut déclarer un paiement manuel (Mobile Money, virement, espèces) ;
- un **administrateur** vérifie la réception réelle de l'argent puis confirme le
  paiement depuis `/admin/paiements` ;
- l'abonnement n'est activé qu'à ce moment-là, par une fonction SQL protégée
  (`admin_confirmer_paiement`). Aucun paiement n'est jamais simulé.

## Choisir un prestataire adapté au Burkina Faso

Avant de coder, vérifiez **directement auprès du prestataire** :

1. qu'il accepte les entreprises basées au Burkina Faso ;
2. qu'il couvre Orange Money et Moov Money (les deux opérateurs principaux) ;
3. ses conditions (frais, délai de reversement, seuil minimum) ;
4. qu'il fournit une API de paiement **et** des notifications signées (webhooks).

Pistes couramment citées pour la zone UEMOA : CinetPay, PayDunya, FlexPay,
PayAll, ou une intégration directe Orange Money / Moov Money. **Aucune de ces
solutions n'est branchée ici** — la disponibilité et les conditions doivent être
vérifiées par vos soins.

## Intégration technique (à faire plus tard)

1. Créez `src/lib/paiements/cinetpay.ts` (par exemple) qui implémente
   l'interface `PrestatairePaiement` de `prestataire.ts`.
2. Ajoutez les clés **secrètes** dans Vercel → *Settings → Environment
   Variables* (par exemple `CINETPAY_API_KEY`, `CINETPAY_SITE_ID`,
   `CINETPAY_SECRET_KEY`) et dans votre `.env.local`. Ne les préfixez **jamais**
   par `NEXT_PUBLIC_`.
3. Retournez votre prestataire dans `getPrestatairePaiement()`.
4. Activez l'option dans `src/config/site.ts` (`paiement.enLigne.actif = true`).
5. Créez une route serveur `src/app/api/paiements/webhook/route.ts` qui :
   - vérifie la signature / l'authenticité de la notification ;
   - recherche le paiement par sa référence ;
   - appelle une fonction SQL `security definer` réservée au serveur pour
     passer le paiement à `confirme` et activer l'abonnement.
6. **Ne vous fiez jamais** au retour du navigateur (`?statut=succes`) : seule la
   notification signée du prestataire prouve le paiement.

## Règles à ne jamais enfreindre

- Aucune clé secrète dans le code du navigateur.
- Aucun abonnement activé sans confirmation fiable du prestataire ou validation
  explicite d'un administrateur.
- Un paiement confirmé doit être traçable (identifiant de transaction,
  horodatage, administrateur ayant validé). C'est déjà le cas dans la table
  `payments`.
