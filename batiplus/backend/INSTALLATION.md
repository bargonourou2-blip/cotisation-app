# BâtiPlus — Installer le backend de paiement

Aucune dépendance npm : Node.js **22.13 ou plus récent** (SQLite intégré `node:sqlite`, `fetch`,
`crypto`). Le backend tourne derrière un proxy HTTPS (Caddy ou Nginx).

## 1. Clés de signature des abonnements

Depuis le dossier `batiplus/` :

```bash
node src/scripts/cles-abonnement.mjs generer
```

- `.cles/abonnement-privee.pem` → reste **sur le serveur uniquement** (ignorée par Git).
- La ligne `ABONNEMENT_CLE_PUBLIQUE=…` affichée → dans le `.env` de **l'application**
  (`batiplus/.env`), puis `npm run construire` : la clé publique est inscrite dans `www/index.html`.

## 2. Fichier `backend/.env`

```bash
cd batiplus/backend
cp .env.exemple .env
openssl rand -hex 32     # → JETON_SECRET
openssl rand -hex 32     # → WEBHOOK_SECRET (valeur différente)
chmod 600 .env
```

Renseigner ensuite `URL_PUBLIQUE` (https), `ORIGINES_AUTORISEES`, `PAIEMENT_FOURNISSEUR`,
`PAIEMENT_SECOURS` et les clés de **ces** agrégateurs (espace marchand de chacun).

**Le backend refuse de démarrer** (« BâtiPlus — démarrage refusé. » + la liste des problèmes) si un
secret manque ou est trop court, si une clé d'agrégateur actif manque, si `URL_PUBLIQUE` n'est pas
en https, si `ORIGINES_AUTORISEES` contient « * », ou si la production est réglée sur la simulation
ou le mode test.

## 3. Essai en local (simulation)

```env
NODE_ENV=developpement
URL_PUBLIQUE=http://localhost:8080
ORIGINES_AUTORISEES=http://localhost:8081
PAIEMENT_FOURNISSEUR=simulation
PAIEMENT_SECOURS=
PAIEMENT_MODE=test
SIMULATION_SECRET=une-valeur-de-test-assez-longue
```

```bash
npm run demarrer         # depuis batiplus/backend
npm run tester           # 19 contrôles (base temporaire, faux agrégateurs HTTP)
```

## 4. Production

1. `NODE_ENV=production`, `PAIEMENT_MODE=production`, vraies clés.
2. Service systemd (redémarrage automatique) :

   ```ini
   [Service]
   WorkingDirectory=/opt/batiplus/backend
   ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning serveur.js
   Restart=always
   User=batiplus
   ```

3. Proxy HTTPS vers `127.0.0.1:8080` (garder `CONFIANCE_PROXY=1`).
4. Chez l'agrégateur, **rien à recopier** : l'URL de notification est envoyée à chaque paiement
   (`URL_PUBLIQUE/api/paiements/notification/<fournisseur>/<secret>`). Pour FedaPay et Stripe,
   copier le secret de webhook de leur tableau de bord dans `FEDAPAY_WEBHOOK_SECRET` /
   `STRIPE_WEBHOOK_SECRET`.
5. Sauvegarder chaque nuit le dossier de la base (`BASE_DONNEES`, fichiers `.sqlite`, `-wal`,
   `-shm`) hors du serveur.

## 5. Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/sante` | état du service |
| GET | `/api/formules` | prix officiels (source : `formules.js`) |
| POST | `/api/paiements/initier` | `{formule}` → `{reference, urlPaiement}` (jeton de session) |
| GET | `/api/paiements/:reference` | statut + jeton d'abonnement signé si payé (jeton de session, compte propriétaire seulement) |
| POST | `/api/paiements/notification/:fournisseur/:secret` | webhook de l'agrégateur |
| POST | `/api/abonnement/renouvellement-auto` | `{actif: true/false}` (carte bancaire) |
| GET | `/paiement/retour?ref=` | redirection vers `URL_SITE/#paiement-retour?ref=…` |

Limites : 120 requêtes/min par adresse, 10 initiations/min par compte, 60 notifications/min.
Erreurs : `{"erreur": "code"}` uniquement, jamais de détail interne.
