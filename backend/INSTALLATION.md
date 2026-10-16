# BâtiPlus — Installer l'API (comptes, synchronisation, paiement, administration)

**Zéro dépendance npm.** Node.js **22.13 ou plus récent** : uniquement `node:http`, `node:crypto`,
`node:fs`, `node:sqlite` (SQLite intégré, WAL, `foreign_keys = ON`). Pas d'Express, pas d'ORM.
L'API tourne derrière un proxy HTTPS (Caddy ou Nginx) et redémarre seule avec PM2.

## 1. Clés de signature des abonnements

Depuis la racine du projet BâtiPlus :

```bash
node src/scripts/cles-abonnement.mjs generer
```

- `.cles/abonnement-privee.pem` → reste **sur le serveur uniquement** (ignorée par Git, droits 600).
- La ligne `ABONNEMENT_CLE_PUBLIQUE=…` affichée → dans le `.env` de **l'application**
  (`.env` à la racine du projet), puis `npm run construire` : la clé publique est inscrite dans `www/index.html`.
- Adresse de l'API vue par l'application : `API_URL=https://api.votredomaine.com` dans ce même
  `.env` à la racine du projet (https, sans chemin ; par défaut `https://api.batiplus.bf`). Elle est aussi
  ajoutée à la CSP (`connect-src`).

## 2. Fichier `backend/.env`

```bash
cd backend
cp .env.exemple .env
chmod 600 .env
openssl rand -hex 32     # → JETON_SECRET
openssl rand -hex 32     # → WEBHOOK_SECRET   (valeur différente)
openssl rand -hex 32     # → SAUVEGARDE_CLE   (valeur différente, à garder AUSSI hors du serveur)
node outils/hacher-code-admin.mjs     # → ligne ADMIN_CODE_HASH=scrypt$16384$8$1$…
```

**Code administrateur.** L'outil demande le code (8 à 64 chiffres, 12 conseillés) en saisie
masquée et n'affiche que son **hachage scrypt**. Coller la ligne affichée **telle quelle dans
`backend/.env`** avec un éditeur de texte :

- la valeur contient des `$` : **ne jamais la passer par `export`** ni par une ligne de commande
  (le shell remplacerait `$16384`, `$8`… et le code ne marcherait plus) ; le fichier `.env` est lu
  tel quel par l'API, sans aucune substitution ;
- le code en clair n'est écrit nulle part : ni dans `.env`, ni dans l'application, ni dans les
  journaux. Pour le changer : relancer l'outil, remplacer la ligne, redémarrer l'API.

Renseigner ensuite `URL_PUBLIQUE` (https), `ORIGINES_AUTORISEES` (`https://localhost` =
application Android, `capacitor://localhost` = iOS, plus le site), `PAIEMENT_FOURNISSEUR`,
`PAIEMENT_SECOURS` et les clés de **ces** agrégateurs (voir `../PAIEMENTS.md`). Facultatif :
`ADMIN_IPS` (adresses autorisées pour `/api/admin`).

**L'API refuse de démarrer** (« BâtiPlus — démarrage refusé. » + la liste des problèmes) si un
secret manque, est trop court, répétitif, d'exemple ou identique à un autre, si `ADMIN_CODE_HASH`
n'est pas un hachage scrypt valide, si une clé d'agrégateur actif manque, si `URL_PUBLIQUE` n'est
pas en https, si `ORIGINES_AUTORISEES` contient « * », ou si la production est réglée sur la
simulation ou le mode test.

## 3. Essai en local

```env
NODE_ENV=developpement
URL_PUBLIQUE=http://localhost:8080
ORIGINES_AUTORISEES=https://localhost,http://localhost:8081
PAIEMENT_FOURNISSEUR=simulation
PAIEMENT_SECOURS=
PAIEMENT_MODE=test
SIMULATION_SECRET=une-valeur-de-test-assez-longue-et-variee
```

```bash
npm run demarrer         # depuis le dossier backend/
npm run tester           # 19 contrôles paiement + 20 contrôles comptes/synchronisation/admin
```

Depuis la racine du projet, `npm run construire` lance aussi un parcours complet **application ↔ API**
(contrôles SY1 à SY10 : deux téléphones, coupure réseau, administration, suppression de compte).

## 4. Production

1. `NODE_ENV=production`, `PAIEMENT_MODE=production`, vraies clés, `CONFIANCE_PROXY=1`.
2. Redémarrage automatique avec **PM2** (les secrets restent dans `.env`, rien dans ce fichier) :

   ```bash
   npm install -g pm2
   cd /opt/batiplus/backend
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup              # suivre la commande affichée : relance au démarrage de la machine
   pm2 logs batiplus-api    # journaux (aucun code, jeton ni clé n'y est écrit)
   ```

3. Proxy HTTPS vers `127.0.0.1:8080` (exemple Caddy : `api.votredomaine.com { reverse_proxy 127.0.0.1:8080 }`).
   L'API pose elle-même HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
   `Referrer-Policy: no-referrer` et une CSP stricte.
4. Chez l'agrégateur, **rien à recopier** : l'URL de notification est envoyée à chaque paiement
   (`URL_PUBLIQUE/api/paiements/notification/<fournisseur>/<secret>`). Pour FedaPay et Stripe,
   copier le secret de webhook de leur tableau de bord dans `FEDAPAY_WEBHOOK_SECRET` /
   `STRIPE_WEBHOOK_SECRET`.
5. **Sauvegarde quotidienne chiffrée** (automatique) : une copie cohérente de la base, chiffrée en
   AES-256-GCM avec `SAUVEGARDE_CLE`, est écrite chaque jour dans `SAUVEGARDE_DOSSIER` (30 dernières
   gardés). La copier aussi hors du serveur. Restauration :

   ```bash
   npm run dechiffrer-sauvegarde -- sauvegardes/batiplus-AAAAMMJJ-HHMMSS.sqlite.chiffre restauree.sqlite
   ```

   Sans `SAUVEGARDE_CLE`, les sauvegardes sont illisibles : conservez-la dans un coffre.

## 5. Sécurité appliquée par l'API

- Codes secrets des électriciens et code administrateur : **scrypt** (N=16384, r=8, p=1, sel 16 o,
  clé 64 o), comparaison `crypto.timingSafeEqual`.
- Jetons de session HMAC-SHA256 valables 30 jours, renouvelés à l'usage, liés à l'appareil et à
  une **version de session** en base : changer le code, « déconnecter tous les téléphones » ou une
  suspension invalident tous les anciens jetons.
- **Deux appareils par compte** au plus : le troisième déconnecte le plus ancien.
- Chaque route protégée vérifie : jeton valide → compte non suspendu → ressource appartenant à ce
  compte (sinon 404). Requêtes SQL **toujours préparées** (paramètres `?`).
- Corps limité à 1 Mo, JSON uniquement, schémas stricts (bornes reprises de
  `src/regles-saisie.json` via `regles-donnees.json`).
- Limites : 120 appels/min par adresse ; 5 connexions / 15 min par adresse **et** par numéro ;
  3 créations de compte / heure ; 5 codes d'activation / heure ; 10 essais admin / heure, blocage
  d'une heure après 3 codes faux.
- Erreurs génériques (`{"erreur": "code", "message": "…"}`), jamais de détail interne ; « Numéro
  ou code incorrect » sans dire lequel.
- Hachages, sels et jetons ne sortent **jamais** de l'API, sauvegarde admin comprise.
- Journal d'audit (`activites`) : connexions, échecs, appareils, suppressions, falsifications de
  formule, actions d'administration avec leur motif.

## 6. Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/sante` | état du service |
| GET | `/api/formules` | prix officiels (source : `formules.js`) |
| POST | `/api/compte/creer` | création (identifiant du compte de l'application, numéro, code, profil, appareil) → `{jeton, compte, abonnement, quota}` |
| POST | `/api/compte/connexion` | `{telephone, code, appareil}` → même réponse |
| POST | `/api/compte/code` | changement de code `{ancien, nouveau}` → nouveau jeton (les autres sont invalidés) |
| POST | `/api/compte/deconnexion` | ferme la session de CET appareil |
| POST | `/api/compte/deconnecter-tout` | ferme toutes les sessions |
| GET | `/api/compte/appareils` | appareils reliés (2 au plus) |
| DELETE | `/api/compte` (ou POST `/api/compte/supprimer`) | `{code, confirmation: "SUPPRIMER"}` : données effacées, ligne anonymisée |
| GET / PUT | `/api/profil` | profil, formule signée, compteur du mois |
| GET / POST | `/api/devis` | liste / création (limite Gratuit appliquée ici) |
| GET / PUT / DELETE | `/api/devis/:id` | un devis du compte |
| GET | `/api/chantiers`, `/api/clients` | listes du compte |
| GET / PUT | `/api/catalogue` | Mes prix (articles et fournisseurs) |
| POST | `/api/sync` | file d'attente hors ligne : `{curseur, abonnement, operations ≤ 60}` → résultats + changements reçus |
| POST | `/api/abonnement/activer-code` | code d'activation `BP-XXXX-XXXX-XXXX` |
| POST | `/api/abonnement/renouvellement-auto` | `{actif}` (carte bancaire) |
| POST | `/api/paiements/initier` | `{formule}` → `{reference, urlPaiement}` |
| GET | `/api/paiements/:reference` | statut + jeton d'abonnement signé si payé |
| POST | `/api/paiements/notification/:fournisseur/:secret` | webhook de l'agrégateur |
| GET | `/paiement/retour?ref=` | redirection vers `URL_SITE/#paiement-retour?ref=…` |
| POST | `/api/admin/connexion` | `{code, appareil}` → jeton admin 2 h lié à l'appareil |
| GET | `/api/admin/stats` | anomalies de paiement, chiffres clés, formules, pays, revenus |
| GET | `/api/admin/electriciens` | liste paginée, recherche `?q=`, export `?format=csv` |
| GET | `/api/admin/journal` | journal d'audit paginé |
| POST | `/api/admin/codes` | codes d'activation (1 à 50, motif obligatoire, stockés hachés) |
| POST | `/api/admin/suspendre` | `{electricienId, suspendu, motif, confirmation: numéro}` |
| POST | `/api/admin/offrir-jours` | `{electricienId, jours ±365, motif, confirmation: numéro}` |
| POST | `/api/admin/paiements/:ref/reverifier` | relit le statut chez l'agrégateur |
| POST | `/api/admin/paiements/:ref/rembourser` | `{motif, confirmation: référence}` |
| GET | `/api/admin/sauvegarde` | export JSON sans aucun hachage, sel ni jeton |
