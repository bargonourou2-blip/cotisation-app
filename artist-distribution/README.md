# ARTIST DISTRIBUTION

Plateforme web de distribution musicale pour les artistes d’Afrique de l’Ouest :
inscription, abonnement, puis — **plus tard, quand l’artiste est prêt** — soumission et
suivi des sorties musicales.

> **Principe fondamental de la plateforme**
> Un artiste peut créer son compte et choisir une formule **sans avoir de morceau prêt**.
> Aucun titre, fichier audio, pochette ou crédit musical n’est demandé à l’inscription.
> La demande de distribution est une étape **totalement séparée**, réalisée depuis
> l’espace personnel.

---

## 1. État réel du projet

### Ce qui fonctionne dès que Supabase est configuré

| Domaine | État |
|---|---|
| Site public (accueil, avantages, fonctionnement, formules, FAQ, pages légales) | ✅ |
| Inscription, connexion, déconnexion, session sécurisée par cookies | ✅ |
| Confirmation d’e-mail et réinitialisation du mot de passe | ✅ (si les e-mails Supabase sont configurés) |
| Tableau de bord artiste (profil, abonnement, sorties) | ✅ |
| Choix d’une formule + souscription en attente | ✅ |
| Déclaration d’un paiement manuel (Mobile Money, virement, espèces) | ✅ |
| Vérification du paiement et activation de l’abonnement par l’administrateur | ✅ |
| Création de brouillons de sorties, upload pochette + audio, soumission | ✅ |
| Suivi des statuts et historique des demandes | ✅ |
| Espace administrateur (artistes, abonnements, paiements, demandes, formules) | ✅ |
| Séparation stricte des données par utilisateur (RLS Supabase) | ✅ |
| Responsive mobile-first, interface en français | ✅ |

### Ce qui nécessite une configuration ou une intervention manuelle

| Élément | À faire |
|---|---|
| Projet Supabase, schéma SQL, clés d’API | Créer le projet et exécuter les scripts (section 4) |
| Compte administrateur | Créer un compte normal puis exécuter `supabase/promouvoir-admin.sql` |
| Envoi des e-mails (confirmation, mot de passe) | Configurer SMTP dans Supabase (section 7) |
| Paiement en ligne | **Aucun prestataire n’est branché** (section 9) |
| Coordonnées, tarifs, logo, mentions légales | Modifier `src/config/site.ts` et `/admin/formules` |
| Limite de taille des fichiers audio | Vérifier la limite globale du projet Supabase (section 8) |
| Relecture des conditions et de la politique de confidentialité | Faire valider avant lancement public |

### Ce qui n’est pas encore implémenté

- **Paiement en ligne automatique** : architecture prête, mais aucun prestataire activé.
- **Notifications e-mail sur changement de statut** : l’artiste voit le statut dans son espace, mais ne reçoit pas d’e-mail automatique.
- **Gestion de plusieurs fichiers audio par album** : une demande contient un fichier audio (master) et une liste de titres saisie en texte.
- **Tests automatisés** : une checklist de tests manuels est fournie (section 14).
- **Génération de contrats / factures PDF**.
- **Pagination** : les listes administrateur affichent jusqu’à 300 éléments.

> Aucune fonctionnalité ci-dessus n’est simulée. Le site indique clairement quand un
> service n’est pas configuré et il est impossible de créer un compte sans Supabase.

---

## 2. Choix techniques et justification

**Next.js 15 (App Router) + TypeScript + Tailwind CSS + Supabase.**

- **Next.js** permet d’avoir le site public et l’application privée dans le même projet, avec
  un rendu serveur rapide (important sur les connexions mobiles), des Server Actions pour les
  formulaires et un déploiement direct sur Vercel.
- **Supabase** fournit l’authentification (mots de passe hachés, e-mails, sessions), une base
  PostgreSQL et un stockage privé de fichiers — le tout avec des règles de sécurité **RLS**
  exécutées par la base elle-même, et non par l’interface.
- **Tailwind CSS** permet une interface légère, cohérente et responsive, sans bibliothèque de
  composants lourde.
- Aucune clé `service_role` n’est utilisée : les opérations sensibles passent par des fonctions
  SQL `security definer` qui vérifient l’identité et le rôle de l’utilisateur.

Une autre architecture (par exemple une API séparée Express + front React) serait possible,
mais elle multiplierait les serveurs et les surfaces d’erreur pour un projet de cette taille.
Le choix Next.js + Supabase est le plus adapté à Vercel et le plus simple à maintenir.

---

## 3. Arborescence du projet

```text
artist-distribution/
├── .env.example                  # Modèle des variables d’environnement (sans secrets)
├── .gitignore
├── next.config.mjs               # En-têtes de sécurité, configuration Next.js
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts            # Couleurs, polices, animations
├── tsconfig.json
├── public/
│   └── logo.svg                  # Logo/favicon (remplaçable)
├── supabase/
│   ├── migrations/
│   │   └── 20261024000000_initial.sql   # Tables, RLS, fonctions, stockage
│   ├── seed.sql                  # Formules de démarrage (tarifs provisoires)
│   └── promouvoir-admin.sql      # Donner les droits d’administrateur
└── src/
    ├── config/
    │   └── site.ts               # ⭐ Nom, logo, contacts, formules, paiement
    ├── types/database.ts         # Types TypeScript de la base
    ├── middleware.ts             # Session, protection des routes, CSP
    ├── actions/                  # Server Actions (logique serveur)
    │   ├── auth.ts
    │   ├── compte.ts
    │   ├── abonnement.ts
    │   ├── sorties.ts
    │   └── admin.ts
    ├── app/
    │   ├── layout.tsx            # Racine HTML, polices, métadonnées
    │   ├── globals.css
    │   ├── (site)/               # Pages publiques avec en-tête et pied de page
    │   │   ├── page.tsx          # Accueil
    │   │   ├── conditions-utilisation/
    │   │   ├── politique-confidentialite/
    │   │   └── configuration/    # Aide si Supabase n’est pas encore branché
    │   ├── (auth)/               # Connexion, inscription, mot de passe
    │   ├── espace/               # Espace artiste protégé
    │   │   ├── page.tsx          # Tableau de bord
    │   │   ├── abonnement/
    │   │   ├── sorties/          # Liste, détail, modification, nouvelle demande
    │   │   └── profil/
    │   ├── admin/                # Espace administrateur protégé
    │   ├── auth/callback/        # Retour des liens e-mail Supabase
    │   ├── error.tsx / not-found.tsx
    │   ├── robots.ts / sitemap.ts / manifest.ts
    ├── components/
    │   ├── ui/                   # Boutons, champs, badges, alertes…
    │   ├── marketing/            # En-tête, pied de page, sections d’accueil
    │   ├── auth/                 # Formulaires d’authentification
    │   ├── espace/               # Composants de l’espace artiste
    │   └── admin/                # Composants d’administration
    └── lib/
        ├── supabase/             # Clients navigateur et serveur
        ├── auth.ts               # Vérification de session et de rôle
        ├── validation.ts         # Schémas Zod (validation serveur)
        ├── statuts.ts            # Libellés et couleurs des statuts
        ├── plans.ts              # Formules publiques
        ├── storage.ts            # Liens temporaires des fichiers
        ├── televersement.ts      # Upload direct vers Supabase Storage
        ├── paiements/            # Architecture modulaire de paiement
        └── format.ts, url.ts, erreurs-auth.ts…
```

> ℹ️ Ce dossier se trouve à l’intérieur d’un dépôt plus ancien (`cotisation-app`).
> **Tous les fichiers de l’autre projet à la racine du dépôt n’ont aucun rapport avec cette
> application.** Travaillez toujours dans `artist-distribution/`.

---

## 4. Installation locale (pas à pas)

### Pré-requis

- Node.js **22** ou plus récent
- Un compte gratuit sur [supabase.com](https://supabase.com)
- Un éditeur de code (VS Code recommandé)

### Étape 1 — Ouvrir le bon dossier

```bash
cd artist-distribution
npm install
```

### Étape 2 — Créer le projet Supabase

1. Créez un projet (nom libre, région la plus proche, par exemple Europe).
2. Notez le mot de passe de la base (il ne sert pas dans le code, mais gardez-le).
3. Attendez la fin de la préparation du projet.

### Étape 3 — Créer les tables

1. Dans Supabase : **SQL Editor → New query**.
2. Copiez tout le contenu de `supabase/migrations/20261024000000_initial.sql`.
3. Cliquez sur **Run**. Le script crée :
   - les tables `profiles`, `subscription_plans`, `subscriptions`, `payments`, `releases`,
     `release_events`, `admin_actions` ;
   - les règles **RLS** (chaque artiste ne voit que ses données) ;
   - les fonctions SQL protégées (souscription, paiement, administration) ;
   - les deux buckets de stockage privés `pochettes` et `audios`.
4. Créez une **deuxième requête** avec le contenu de `supabase/seed.sql` et exécutez-la.
   Cela ajoute les trois formules provisoires.

✅ Vérifiez dans **Table Editor** que les tables et les formules apparaissent.

### Étape 4 — Récupérer les clés

Dans Supabase : **Project Settings → API**.

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- clé `anon` / `publishable` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

⚠️ Ne copiez **jamais** la clé `service_role` dans ce projet : elle ne doit pas exister côté
navigateur et n’est pas nécessaire.

### Étape 5 — Créer le fichier `.env.local`

```bash
cp .env.example .env.local
```

Modifiez ensuite `.env.local` :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Étape 6 — Lancer l’application

```bash
npm run dev
```

Ouvrez <http://localhost:3000>.

- Si Supabase n’est pas configuré, le site reste visible et un message explique que les
  comptes sont désactivés.
- Une fois configuré, testez une inscription complète.

### Étape 7 — Devenir administrateur

1. Créez votre compte normalement sur `/inscription` et confirmez votre e-mail.
2. Ouvrez `supabase/promouvoir-admin.sql`, remplacez l’adresse e-mail par la vôtre.
3. Exécutez ce script dans **SQL Editor**.
4. Reconnectez-vous : le lien **Administration** apparaît dans votre espace.

---

## 5. Configuration de l’authentification Supabase

Dans **Authentication → URL Configuration** :

- **Site URL** : `https://votre-domaine.com` en production (`http://localhost:3000` en local)
- **Redirect URLs** : ajoutez
  - `http://localhost:3000/auth/callback`
  - `https://votre-domaine.com/auth/callback`

Sans ces adresses, les liens de confirmation et de réinitialisation renvoient vers une page
d’erreur.

Dans **Authentication → Providers → Email** :

- Laissez **Confirm email** activé (recommandé en production).
- Longueur minimale du mot de passe : **8** (l’application impose déjà 8 caractères avec
  lettre et chiffre).

Dans **Authentication → Templates** : vérifiez les modèles « Confirm signup » et
« Reset password ». Le modèle par défaut fonctionne avec `/auth/callback`.

> ⚠️ Le lien de confirmation doit être ouvert **dans le même navigateur** que celui utilisé
> pour l’inscription (mécanisme PKCE). Si l’artiste ouvre l’e-mail sur un autre téléphone,
> il peut être invité à se reconnecter.

---

## 6. Compte administrateur et rôles

- Le rôle est **toujours** `artiste` à la création : il ne peut pas être choisi dans le
  formulaire, ni modifié via l’API par l’utilisateur (colonnes protégées en SQL).
- Seul un script SQL permet de promouvoir un administrateur.
- Les contrôles sont doubles :
  1. `exigerAdmin()` côté serveur dans chaque page et action ;
  2. `public.est_admin()` dans les politiques RLS et les fonctions SQL.
- Même si quelqu’un force l’affichage d’un bouton, la base refusera l’opération.

---

## 7. E-mails (confirmation, mot de passe)

Supabase envoie les e-mails via son service intégré, **limité en volume** et destiné aux
tests. Pour un lancement réel :

1. Créez un compte chez un fournisseur SMTP (Resend, Brevo, Postmark, Mailgun…).
2. Dans Supabase : **Project Settings → Auth → SMTP Settings**, renseignez serveur, port,
   utilisateur, mot de passe et expéditeur.
3. Testez l’inscription et la réinitialisation.

Les e-mails partent du domaine du prestataire ou de votre domaine vérifié. Configurez SPF et
DKIM chez votre fournisseur DNS pour éviter les spams.

---

## 8. Stockage des fichiers

Le script SQL crée deux buckets **privés** :

| Bucket | Contenu | Taille max | Formats |
|---|---|---|---|
| `pochettes` | Images de couverture | 10 Mo | JPG, PNG, WebP |
| `audios` | Fichiers audio | 200 Mo | MP3, WAV, FLAC, M4A, AIFF, OGG |

Chaque fichier est rangé dans `user_id/release_id/fichier.ext`. Les règles de stockage
interdisent à un artiste de lire ou d’écrire dans le dossier d’un autre.

**Important :** Supabase applique aussi une limite globale d’upload par projet (souvent 50 Mo
sur les offres gratuites). Si un fichier audio plus lourd échoue, augmentez cette limite dans
**Storage → Settings** (selon votre offre) ou demandez un fichier plus léger.

Les liens de lecture sont temporaires (30 minutes) et générés côté serveur.

---

## 9. Paiement

### Situation actuelle

- **Aucun prestataire en ligne n’est configuré** : le site l’affiche clairement.
- Le mode **paiement manuel** est actif : l’artiste déclare une transaction (référence,
  numéro, note), puis un administrateur vérifie et confirme.
- L’abonnement n’est **jamais** activé par le navigateur, ni sur simple déclaration.
  L’activation passe par la fonction SQL `admin_confirmer_paiement`, réservée aux
  administrateurs.

### Choisir un prestataire adapté au Burkina Faso

Avant tout développement, vérifiez **directement** auprès du prestataire :

- l’acceptation des entreprises basées au Burkina Faso ;
- la couverture Orange Money et Moov Money ;
- les frais, délais de reversement et seuils ;
- l’existence d’une API et de notifications signées (webhooks).

Des pistes sont parfois citées pour la zone UEMOA (CinetPay, PayDunya, FlexPay, PayAll,
intégration directe Orange/Moov). **Aucune n’est branchée ni garantie dans ce projet.**

Le mode d’emploi technique est dans [`src/lib/paiements/README.md`](src/lib/paiements/README.md).

### Ce qu’il faudra faire pour activer un prestataire

1. Créer un adaptateur dans `src/lib/paiements/`.
2. Ajouter les clés **secrètes** dans les variables d’environnement du serveur.
3. Retourner l’adaptateur dans `getPrestatairePaiement()`.
4. Créer une route webhook qui vérifie la signature puis appelle une fonction SQL
   d’activation.
5. Activer `paiement.enLigne.actif` dans `src/config/site.ts`.

---

## 10. Déploiement sur Vercel

### Étape 1 — Mettre le code sur GitHub

Le projet est déjà dans un dépôt Git. Assurez-vous que le dossier `artist-distribution` est
bien poussé sur votre dépôt.

### Étape 2 — Importer sur Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importez le dépôt.
2. **Root Directory** : sélectionnez `artist-distribution` (indispensable, à cause de
   l’autre projet présent dans le dépôt).
3. Framework détecté : **Next.js**.
4. Build command : `npm run build`, Output : `.next` (valeurs par défaut).

### Étape 3 — Variables d’environnement

Ajoutez dans **Settings → Environment Variables** (Production *et* Preview) :

```env
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-cle-anon
NEXT_PUBLIC_SITE_URL=https://votre-domaine.vercel.app
```

Puis **Deploy**.

### Étape 4 — Finaliser côté Supabase

1. **Authentication → URL Configuration** :
   - Site URL = votre domaine Vercel (ou domaine personnalisé)
   - Redirect URLs += `https://votre-domaine/auth/callback`
2. Testez une inscription, la réception de l’e-mail et la connexion.
3. Pour un domaine personnalisé : Vercel → **Domains**, puis mettez à jour
   `NEXT_PUBLIC_SITE_URL` et les URL Supabase.

### Étape 5 — Après le déploiement

- Créez votre compte, puis promouvez-le administrateur via SQL.
- Configurez SMTP.
- Remplacez les tarifs provisoires et les coordonnées.
- Testez depuis un téléphone Android réel.

> Vercel et Supabase ont des offres gratuites suffisantes pour tester. Vérifiez leurs
> conditions avant une mise en production réelle (quotas, sauvegardes, disponibilité).

---

## 11. Personnalisation (nom, logo, coordonnées, tarifs)

### Nom, logo, contacts, réseaux sociaux

Tout est centralisé dans **`src/config/site.ts`** :

```ts
export const site = {
  nom: 'ARTIST DISTRIBUTION',
  slogan: 'Votre musique mérite d’aller plus loin.',
  logo: { image: '', monogramme: 'AD' }, // mettez '/logo.svg' pour utiliser une image
  contact: {
    email: 'contact@artistdistribution.example', // ← À REMPLACER
    whatsapp: '', // ← Renseignez '+226 ...' pour afficher le bouton WhatsApp
    telephone: '',
    adresse: 'Ouagadougou, Burkina Faso',
  },
  legal: {
    raisonSociale: 'ARTIST DISTRIBUTION',
    documentProvisoire: true, // passez à false après relecture des pages légales
    // ...
  },
  tarifsProvisoires: true, // passez à false quand les tarifs sont validés
};
```

- **Logo** : remplacez `public/logo.svg` ou placez votre image dans `public/` puis
  renseignez `logo.image`.
- **Couleurs** : `tailwind.config.ts` (palettes `marine`, `azur`, `sable`).
- **Pages légales** : complétez les textes dans
  `src/app/(site)/conditions-utilisation/page.tsx` et
  `src/app/(site)/politique-confidentialite/page.tsx`.

### Formules et tarifs

Deux possibilités :

1. **Depuis l’espace administrateur → Formules** (recommandé). La base fait foi pour le
   site public et l’espace artiste : création, modification, activation/désactivation.
2. **Valeurs de secours** dans `src/config/site.ts` (`formulesParDefaut`), utilisées quand
   Supabase n’est pas configuré, et comme modèle dans `supabase/seed.sql`.

⚠️ Les montants livrés sont **provisoires** (5 000 / 13 500 / 48 000 FCFA). Ils sont
affichés avec une mention honnête tant que `tarifsProvisoires` reste à `true`. Adaptez-les à
votre modèle économique et à votre marché avant le lancement.

Le **code technique** d’une formule ne doit plus changer après les premières souscriptions
(l’historique s’appuie sur une copie du nom et du prix).

---

## 12. Sécurité

Mesures appliquées :

- Mots de passe gérés par Supabase (hachés, jamais stockés en clair par l’application).
- Aucune clé secrète dans le navigateur : uniquement la clé publique `anon`.
- Validation **serveur** de tous les formulaires avec Zod, en plus de la validation navigateur.
- Règles **RLS** : un artiste ne peut lire et modifier que ses propres données.
- Colonnes de profil protégées en SQL : rôle et e-mail non modifiables par l’utilisateur.
- Fonctions SQL `security definer` pour l’activation d’abonnement et les actions sensibles,
  avec vérification `est_admin()`.
- Prix des formules relu en base : impossible de payer un montant falsifié.
- Protection des routes privées par le middleware + vérification serveur du rôle.
- Fichiers privés, chemins liés à l’identifiant de l’utilisateur, liens signés temporaires.
- En-têtes de sécurité : CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS.
- Journal `admin_actions` pour tracer les validations et changements de statut.
- Redirections limitées aux chemins internes (pas de redirection ouverte).
- Messages d’erreur neutres pour la réinitialisation de mot de passe.

Points à surveiller / durcissements possibles :

- La CSP autorise les scripts inline (`'unsafe-inline'`), nécessaire au fonctionnement de
  Next.js sans nonce. Aucun script tiers n’est chargé. Pour aller plus loin, mettre en place
  une CSP à nonce.
- Supabase limite déjà les tentatives de connexion ; pour un renforcement supplémentaire,
  ajoutez un rate limiting applicatif (par exemple Upstash).
- Sauvegardez régulièrement la base (Supabase → Backups selon l’offre).

---

## 13. Base de données et RLS (vue d’ensemble)

```text
auth.users (Supabase)
    │ 1–1 (trigger)
    ▼
profiles ──────────────┐
    │ 1–N              │
    ▼                  │
subscriptions ── 1–N ── payments
    │
    │ (aucun lien direct : les sorties sont indépendantes)
    ▼
releases ── 1–N ── release_events
```

- `profiles` : identité minimale, rôle (`artiste` / `admin`).
- `subscription_plans` : formules modifiables (prix, durée, avantages, ordre, actif).
- `subscriptions` : abonnement avec **copie** du nom, du prix et de la durée.
- `payments` : déclaration de paiement, statut, vérificateur, notes.
- `releases` : demande de distribution, indépendante du profil, avec statut.
- `release_events` : historique des changements de statut (frise visible par l’artiste).
- `admin_actions` : journal d’audit des actions sensibles.

Statuts d’abonnement : `en_attente_paiement`, `actif`, `expire`, `annule`.
Statuts de paiement : `en_attente`, `a_verifier`, `confirme`, `rejete`.
Statuts de sortie : `brouillon`, `en_attente_verification`, `informations_a_corriger`,
`validee`, `en_preparation`, `envoyee_plateformes`, `publiee`, `refusee`.

Exemple de politique RLS (déjà en place) :

```sql
create policy "sorties: lecture des siennes"
  on public.releases for select to authenticated
  using (auth.uid() = user_id or public.est_admin());
```

Fonctions principales :

- `creer_abonnement(plan_code)`
- `declarer_paiement_manuel(...)`
- `admin_confirmer_paiement(payment_id, note)` → **seul point d’activation**
- `admin_rejeter_paiement(payment_id, note)`
- `admin_annuler_abonnement(subscription_id, note)`
- `admin_statut_sortie(release_id, statut, commentaire)`
- `expirer_abonnements()`

---

## 14. Tester l’application (checklist manuelle)

### Parcours artiste

1. **Inscription** : nom complet, nom d’artiste, e-mail réel, téléphone, pays, type de compte,
   mot de passe, conditions. Vérifiez qu’aucune question musicale n’apparaît.
2. **E-mail** : recevez le lien, ouvrez-le, connectez-vous.
3. **Tableau de bord** : nom d’artiste affiché, abonnement « Aucune formule », message
   rassurant sur l’absence de sortie.
4. **Abonnement** : choisissez une formule. L’abonnement passe en « En attente de paiement ».
5. **Paiement** : déclarez une référence fictive (test) → statut « À vérifier ».
6. **Administration** : connectez-vous avec le compte admin, vérifiez le paiement, confirmez.
   L’abonnement doit devenir « Actif ».
7. **Sorties** : créez une demande, enregistrez un brouillon, rechargez la page, vérifiez que
   le brouillon est conservé.
8. **Fichiers** : ajoutez une pochette JPG et un MP3 courts, soumettez.
9. **Admin** : changez le statut en « Informations à corriger » avec un message ; l’artiste
   doit voir le message et pouvoir corriger. Puis « Validée », « En préparation », « Envoyée
   aux plateformes », « Publiée ».
10. **Isolation** : avec un second compte artiste, vérifiez qu’il ne voit ni les sorties ni les
    paiements du premier (tentez aussi `/admin` : redirection).
11. **Déconnexion** : le retour arrière ne doit pas redonner accès à l’espace.
12. **Mot de passe oublié** : recevez le lien, définissez un nouveau mot de passe, connectez-vous.
13. **Mobile** : testez sur un Android réel (menu, nav basse, formulaires, upload).

### Vérifications techniques

```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm run build       # build de production
```

> Il n’y a pas de suite de tests automatisés dans cette version. La checklist ci-dessus doit
> être refaite après chaque modification importante.

---

## 15. Étapes manuelles avant un lancement réel

- [ ] Créer le projet Supabase et exécuter les deux scripts SQL.
- [ ] Renseigner `.env.local` et les variables Vercel.
- [ ] Configurer les URL de redirection Supabase.
- [ ] Configurer un SMTP fiable et tester les e-mails.
- [ ] Créer le compte administrateur puis le promouvoir en SQL.
- [ ] Remplacer les coordonnées, le logo et les réseaux sociaux.
- [ ] Valider les tarifs et les avantages des formules (base + configuration).
- [ ] Compléter les mentions légales (IFU/RCCM) et faire relire les pages légales.
- [ ] Passer `legal.documentProvisoire` et `tarifsProvisoires` à `false`.
- [ ] Vérifier la limite de taille des fichiers dans Supabase Storage.
- [ ] Tester depuis un téléphone Android et une connexion mobile lente.
- [ ] Décider du moyen de paiement (manuel ou prestataire en ligne).
- [ ] Mettre en place une sauvegarde de la base et une surveillance des erreurs.
- [ ] Faire tester le parcours par une personne extérieure.

---

## 16. Dépannage

| Symptôme | Cause probable / solution |
|---|---|
| « Supabase n’est pas configuré » | Variables absentes ou mal nommées. Redémarrez `npm run dev` après modification de `.env.local`. |
| Le site s’affiche mais les boutons de compte renvoient vers `/configuration` | Normal tant que Supabase n’est pas branché. |
| Connexion impossible après le déploiement | URL de redirection absente dans Supabase, ou `NEXT_PUBLIC_SITE_URL` incorrecte. |
| Aucun e-mail reçu | SMTP non configuré, quotas atteints, ou message en spam. |
| « new row violates row-level security policy » | Vous tentez une opération non autorisée (autre utilisateur, rôle insuffisant) ou le script SQL n’a pas été exécuté. |
| `function ... does not exist` | La migration SQL n’a pas été exécutée en entier. Relancez le script (il est idempotent). |
| Upload refusé | Format non accepté, fichier trop volumineux, ou limite globale Supabase trop basse. |
| Le bouton « Confirmer » admin échoue | Vérifiez que le compte connecté a bien `role = 'admin'` dans `profiles`. |
| Police ou styles absents | `npm install` incomplet ; relancez l’installation et le serveur. |
| Build Vercel échoue | **Root Directory** doit être `artist-distribution` ; vérifiez aussi les variables d’environnement. |

Commandes utiles :

```bash
npm run dev        # développement
npm run build      # build de production
npm run start      # serveur de production local
npm run lint       # ESLint
npm run typecheck  # vérification TypeScript
```

---

## 17. Licence et contact

Projet privé, non licencié pour redistribution publique (`UNLICENSED`).

Contacts à personnaliser dans `src/config/site.ts` — les valeurs livrées
(`contact@artistdistribution.example`) sont des **exemples à remplacer**.
