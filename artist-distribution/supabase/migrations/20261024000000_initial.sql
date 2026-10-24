-- =====================================================================
--  ARTIST DISTRIBUTION — Schéma initial de la base de données
-- =====================================================================
--  À exécuter dans Supabase : Dashboard → SQL Editor → New query.
--  Ce fichier est idempotent (il peut être relancé sans casser la base).
--
--  Principe important :
--   - Un compte (profiles) est TOTALEMENT séparé d'une demande de
--     distribution (releases). On peut s'inscrire et s'abonner sans
--     avoir de morceau prêt.
--   - Les changements sensibles (activation d'un abonnement, statut
--     d'une sortie) passent par des fonctions SQL protégées côté serveur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILS
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  nom_complet text not null check (char_length(nom_complet) between 2 and 120),
  nom_artiste text not null check (char_length(nom_artiste) between 2 and 120),
  telephone text not null check (char_length(telephone) between 6 and 30),
  pays text not null check (char_length(pays) between 2 and 80),
  type_compte text not null default 'artiste_independant'
    check (type_compte in ('artiste_independant', 'representant')),
  -- Formule choisie sur le site public au moment de l'inscription (facultatif).
  formule_souhaitee text,
  role text not null default 'artiste' check (role in ('artiste', 'admin')),
  conditions_acceptees_le timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil public minimal de chaque utilisateur. Le rôle ne peut jamais être choisi par l''utilisateur.';

-- ---------------------------------------------------------------------
-- 2. FORMULES D'ABONNEMENT
-- ---------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  nom text not null check (char_length(nom) between 2 and 60),
  description text not null default '',
  prix_fcfa integer not null check (prix_fcfa >= 0),
  duree_jours integer not null check (duree_jours between 1 and 3660),
  avantages text[] not null default '{}',
  badge text,
  mis_en_avant boolean not null default false,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscription_plans is
  'Formules modifiables depuis l''espace administrateur. Aucune formule n''est supprimée : on la désactive.';

-- ---------------------------------------------------------------------
-- 3. ABONNEMENTS
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid references public.subscription_plans (id) on delete set null,
  -- Copie des informations de la formule au moment de la souscription :
  -- si l'administrateur change un tarif plus tard, l'historique reste juste.
  plan_code text not null,
  plan_nom text not null,
  prix_fcfa integer not null check (prix_fcfa >= 0),
  duree_jours integer not null check (duree_jours > 0),
  statut text not null default 'en_attente_paiement'
    check (statut in ('en_attente_paiement', 'actif', 'expire', 'annule')),
  debut timestamptz,
  fin timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dates_coherentes check (fin is null or debut is not null)
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_statut_idx on public.subscriptions (statut);

-- ---------------------------------------------------------------------
-- 4. PAIEMENTS
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  montant_fcfa integer not null check (montant_fcfa > 0),
  devise text not null default 'XOF',
  moyen text not null check (moyen in ('mobile_money', 'virement', 'especes', 'autre')),
  prestataire text not null default 'manuel',
  reference_paiement text,
  telephone_payeur text,
  note_client text,
  statut text not null default 'a_verifier'
    check (statut in ('en_attente', 'a_verifier', 'confirme', 'rejete')),
  note_admin text,
  confirme_par uuid references auth.users (id) on delete set null,
  confirme_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_subscription_id_idx on public.payments (subscription_id);
create unique index if not exists payments_une_seule_declaration_en_cours_idx
  on public.payments (subscription_id)
  where statut in ('en_attente', 'a_verifier');

-- ---------------------------------------------------------------------
-- 5. DEMANDES DE DISTRIBUTION (sorties musicales)
-- ---------------------------------------------------------------------
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  titre text not null default '' check (char_length(titre) <= 160),
  type_sortie text not null default 'single'
    check (type_sortie in ('single', 'ep', 'album')),
  artiste_principal text not null default '' check (char_length(artiste_principal) <= 160),
  artistes_invites text check (char_length(artistes_invites) <= 500),
  genre text check (char_length(genre) <= 80),
  langue text check (char_length(langue) <= 80),
  date_sortie_souhaitee date,
  infos_production text check (char_length(infos_production) <= 3000),
  auteurs_compositeurs text check (char_length(auteurs_compositeurs) <= 3000),
  credits text check (char_length(credits) <= 5000),
  liste_titres text check (char_length(liste_titres) <= 3000),
  pochette_path text,
  audio_path text,
  statut text not null default 'brouillon'
    check (statut in (
      'brouillon',
      'en_attente_verification',
      'informations_a_corriger',
      'validee',
      'en_preparation',
      'envoyee_plateformes',
      'publiee',
      'refusee'
    )),
  motif_action text check (char_length(motif_action) <= 2000),
  soumis_le timestamptz,
  publiee_le timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists releases_user_id_idx on public.releases (user_id);
create index if not exists releases_statut_idx on public.releases (statut);

-- ---------------------------------------------------------------------
-- 6. HISTORIQUE DES DEMANDES (ce que voit l'artiste dans la frise)
-- ---------------------------------------------------------------------
create table if not exists public.release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  statut text not null,
  commentaire text check (char_length(commentaire) <= 2000),
  auteur_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists release_events_release_id_idx on public.release_events (release_id);

-- ---------------------------------------------------------------------
-- 7. JOURNAL DES ACTIONS ADMINISTRATEUR (traçabilité)
-- ---------------------------------------------------------------------
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  action text not null,
  cible text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =====================================================================
--  FONCTIONS UTILITAIRES
-- =====================================================================

-- Mise à jour automatique de `updated_at`
create or replace function public.maj_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Vrai si l'utilisateur connecté est administrateur.
-- SECURITY DEFINER : la fonction lit la table profiles sans être bloquée
-- par les règles RLS, ce qui évite une récursion infinie.
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.est_admin() from public;
grant execute on function public.est_admin() to anon, authenticated;

-- Création automatique du profil à l'inscription.
-- ⚠️ Le rôle est TOUJOURS 'artiste' : impossible de s'auto-promouvoir
--    administrateur en modifiant les données du formulaire.
create or replace function public.gerer_nouvel_utilisateur()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (
    id, email, nom_complet, nom_artiste, telephone, pays, type_compte, formule_souhaitee, role
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nom_complet'), ''), 'Artiste'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nom_artiste'), ''), 'Artiste'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'telephone'), ''), 'Non renseigné'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'pays'), ''), 'Non renseigné'),
    case
      when new.raw_user_meta_data ->> 'type_compte' = 'representant' then 'representant'
      else 'artiste_independant'
    end,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'formule_souhaitee', '')), ''),
    'artiste'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.gerer_nouvel_utilisateur();

-- Garde-fou : un artiste ne peut pas changer le statut d'une sortie
-- vers autre chose que « en attente de vérification », ni modifier une
-- demande déjà traitée.
create or replace function public.proteger_sortie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- `auth.uid()` est NULL lorsque la requête vient du tableau de bord SQL
  -- (connexion privilégiée), et non d'un utilisateur de l'application.
  if public.est_admin() or auth.uid() is null then
    return new;
  end if;

  if new.user_id <> old.user_id then
    raise exception 'Le propriétaire de la demande ne peut pas être modifié.';
  end if;

  if old.statut not in ('brouillon', 'informations_a_corriger') then
    raise exception 'Cette demande ne peut plus être modifiée depuis votre espace.';
  end if;

  if new.statut <> old.statut then
    if not (
      (old.statut = 'brouillon' and new.statut = 'en_attente_verification')
      or (old.statut = 'informations_a_corriger' and new.statut = 'en_attente_verification')
    ) then
      raise exception 'Changement de statut non autorisé.';
    end if;
    new.soumis_le := now();
  else
    new.soumis_le := old.soumis_le;
  end if;

  -- L'artiste ne peut pas écrire les champs réservés à l'administration.
  new.motif_action := old.motif_action;
  new.publiee_le := old.publiee_le;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists proteger_sortie_avant_maj on public.releases;
create trigger proteger_sortie_avant_maj
  before update on public.releases
  for each row execute function public.proteger_sortie();

-- Journalise automatiquement chaque changement de statut dans l'historique
-- consultable par l'artiste.
create or replace function public.journaliser_sortie()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.statut is distinct from old.statut then
    insert into public.release_events (release_id, statut, commentaire, auteur_id)
    values (
      new.id,
      new.statut,
      case when public.est_admin() then new.motif_action else null end,
      case when public.est_admin() then auth.uid() else null end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists journaliser_sortie_apres_maj on public.releases;
create trigger journaliser_sortie_apres_maj
  after update on public.releases
  for each row execute function public.journaliser_sortie();

-- =====================================================================
--  TRIGGERS updated_at
-- =====================================================================
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.maj_updated_at();

drop trigger if exists plans_updated_at on public.subscription_plans;
create trigger plans_updated_at before update on public.subscription_plans
  for each row execute function public.maj_updated_at();

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.maj_updated_at();

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.maj_updated_at();

drop trigger if exists releases_updated_at on public.releases;
create trigger releases_updated_at before update on public.releases
  for each row execute function public.maj_updated_at();

-- =====================================================================
--  DROITS (GRANTS) — le RLS reste la barrière principale
-- =====================================================================
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Un artiste ne peut modifier QUE ces colonnes (jamais son rôle ni son e-mail).
grant update (nom_complet, nom_artiste, telephone, pays, type_compte)
  on public.profiles to authenticated;

revoke all on public.subscription_plans from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

revoke all on public.releases from anon, authenticated;
grant select, insert, update, delete on public.releases to authenticated;

revoke all on public.release_events from anon, authenticated;
grant select on public.release_events to authenticated;

revoke all on public.admin_actions from anon, authenticated;
grant select on public.admin_actions to authenticated;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.releases enable row level security;
alter table public.release_events enable row level security;
alter table public.admin_actions enable row level security;

-- --- profiles ---
drop policy if exists "profil: lecture du sien" on public.profiles;
create policy "profil: lecture du sien" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.est_admin());

drop policy if exists "profil: mise a jour du sien" on public.profiles;
create policy "profil: mise a jour du sien" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'artiste');

drop policy if exists "profil: admin met a jour" on public.profiles;
create policy "profil: admin met a jour" on public.profiles
  for update to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- --- subscription_plans ---
drop policy if exists "formules: lecture publique" on public.subscription_plans;
create policy "formules: lecture publique" on public.subscription_plans
  for select to anon, authenticated
  using (actif = true);

drop policy if exists "formules: admin lit tout" on public.subscription_plans;
create policy "formules: admin lit tout" on public.subscription_plans
  for select to authenticated
  using (public.est_admin());

drop policy if exists "formules: admin gere" on public.subscription_plans;
create policy "formules: admin gere" on public.subscription_plans
  for all to authenticated
  using (public.est_admin())
  with check (public.est_admin());

-- --- subscriptions ---
drop policy if exists "abonnements: lecture du sien" on public.subscriptions;
create policy "abonnements: lecture du sien" on public.subscriptions
  for select to authenticated
  using (auth.uid() = user_id or public.est_admin());

-- Aucune politique d'écriture : la création et l'activation passent
-- exclusivement par les fonctions SQL ci-dessous (contrôlées côté serveur).

-- --- payments ---
drop policy if exists "paiements: lecture des siens" on public.payments;
create policy "paiements: lecture des siens" on public.payments
  for select to authenticated
  using (auth.uid() = user_id or public.est_admin());

-- --- releases ---
drop policy if exists "sorties: lecture des siennes" on public.releases;
create policy "sorties: lecture des siennes" on public.releases
  for select to authenticated
  using (auth.uid() = user_id or public.est_admin());

drop policy if exists "sorties: creation brouillon" on public.releases;
create policy "sorties: creation brouillon" on public.releases
  for insert to authenticated
  with check (auth.uid() = user_id and statut = 'brouillon');

drop policy if exists "sorties: modification des siennes" on public.releases;
create policy "sorties: modification des siennes" on public.releases
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sorties: suppression brouillon" on public.releases;
create policy "sorties: suppression brouillon" on public.releases
  for delete to authenticated
  using (auth.uid() = user_id and statut = 'brouillon');

-- --- release_events ---
drop policy if exists "historique: lecture des siens" on public.release_events;
create policy "historique: lecture des siens" on public.release_events
  for select to authenticated
  using (
    public.est_admin()
    or exists (
      select 1 from public.releases r
      where r.id = release_events.release_id and r.user_id = auth.uid()
    )
  );

-- --- admin_actions ---
drop policy if exists "journal: lecture admin" on public.admin_actions;
create policy "journal: lecture admin" on public.admin_actions
  for select to authenticated
  using (public.est_admin());

-- =====================================================================
--  FONCTIONS MÉTIER (appelées par les Server Actions)
-- =====================================================================

-- 1) Souscrire à une formule.
--    Le prix et la durée sont relus depuis la base : un utilisateur
--    ne peut pas envoyer un faux tarif.
create or replace function public.creer_abonnement(p_plan_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Vous devez être connecté.';
  end if;

  select * into v_plan
  from public.subscription_plans
  where code = p_plan_code and actif = true;

  if not found then
    raise exception 'Cette formule n''est pas disponible.';
  end if;

  if exists (
    select 1 from public.subscriptions
    where user_id = v_user and statut = 'actif' and (fin is null or fin > now())
  ) then
    raise exception 'Vous avez déjà un abonnement actif.';
  end if;

  -- Une ancienne souscription non payée est annulée pour éviter les doublons,
  -- et ses éventuelles déclarations de paiement sont rejetées.
  update public.payments
  set statut = 'rejete',
      note_admin = 'Souscription remplacée par une nouvelle formule.'
  where statut in ('en_attente', 'a_verifier')
    and subscription_id in (
      select id from public.subscriptions
      where user_id = v_user and statut = 'en_attente_paiement'
    );

  update public.subscriptions
  set statut = 'annule'
  where user_id = v_user and statut = 'en_attente_paiement';

  insert into public.subscriptions (
    user_id, plan_id, plan_code, plan_nom, prix_fcfa, duree_jours, statut
  ) values (
    v_user, v_plan.id, v_plan.code, v_plan.nom, v_plan.prix_fcfa, v_plan.duree_jours,
    'en_attente_paiement'
  )
  returning id into v_id;

  insert into public.admin_actions (admin_id, action, cible, details)
  values (null, 'abonnement.demande', v_id::text,
          jsonb_build_object('formule', v_plan.code, 'montant', v_plan.prix_fcfa));

  return v_id;
end;
$$;

revoke all on function public.creer_abonnement(text) from public;
grant execute on function public.creer_abonnement(text) to authenticated;

-- 2) Déclarer un paiement manuel (Mobile Money, virement, espèces).
--    ⚠️ Ne valide JAMAIS l'abonnement : il reste en attente de vérification.
create or replace function public.declarer_paiement_manuel(
  p_subscription_id uuid,
  p_moyen text,
  p_reference text,
  p_telephone text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_abo public.subscriptions%rowtype;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Vous devez être connecté.';
  end if;

  if p_moyen not in ('mobile_money', 'virement', 'especes', 'autre') then
    raise exception 'Moyen de paiement invalide.';
  end if;

  if p_reference is null or char_length(btrim(p_reference)) < 3 then
    raise exception 'La référence du paiement est obligatoire (au moins 3 caractères).';
  end if;

  select * into v_abo
  from public.subscriptions
  where id = p_subscription_id and user_id = v_user;

  if not found then
    raise exception 'Abonnement introuvable.';
  end if;

  if v_abo.statut <> 'en_attente_paiement' then
    raise exception 'Cet abonnement n''attend plus de paiement.';
  end if;

  if exists (
    select 1 from public.payments
    where subscription_id = v_abo.id and statut in ('en_attente', 'a_verifier')
  ) then
    raise exception 'Un paiement est déjà en cours de vérification pour cet abonnement.';
  end if;

  insert into public.payments (
    user_id, subscription_id, montant_fcfa, moyen, prestataire,
    reference_paiement, telephone_payeur, note_client, statut
  ) values (
    v_user, v_abo.id, v_abo.prix_fcfa, p_moyen, 'manuel',
    left(btrim(p_reference), 120), left(nullif(btrim(coalesce(p_telephone, '')), ''), 30),
    left(nullif(btrim(coalesce(p_note, '')), ''), 1000), 'a_verifier'
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.declarer_paiement_manuel(uuid, text, text, text, text) from public;
grant execute on function public.declarer_paiement_manuel(uuid, text, text, text, text) to authenticated;

-- 3) Confirmer un paiement (ADMIN UNIQUEMENT).
--    C'est le SEUL endroit qui active un abonnement.
create or replace function public.admin_confirmer_paiement(
  p_payment_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paiement public.payments%rowtype;
  v_abo public.subscriptions%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;

  select * into v_paiement from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;
  if v_paiement.statut not in ('en_attente', 'a_verifier') then
    raise exception 'Ce paiement a déjà été traité.';
  end if;

  select * into v_abo from public.subscriptions where id = v_paiement.subscription_id for update;
  if not found then
    raise exception 'Abonnement introuvable.';
  end if;

  if v_abo.statut <> 'en_attente_paiement' then
    raise exception 'Cet abonnement n''attend plus de paiement.';
  end if;

  update public.payments
  set statut = 'confirme',
      confirme_par = auth.uid(),
      confirme_le = now(),
      note_admin = coalesce(nullif(btrim(p_note), ''), note_admin)
  where id = p_payment_id;

  -- Tout autre paiement encore en attente sur cet abonnement est rejeté.
  update public.payments
  set statut = 'rejete',
      note_admin = 'Remplacé par le paiement confirmé.'
  where subscription_id = v_abo.id
    and id <> p_payment_id
    and statut in ('en_attente', 'a_verifier');

  update public.subscriptions
  set statut = 'actif',
      debut = now(),
      fin = now() + make_interval(days => v_abo.duree_jours)
  where id = v_abo.id;

  insert into public.admin_actions (admin_id, action, cible, details)
  values (auth.uid(), 'paiement.confirme', p_payment_id::text,
          jsonb_build_object('abonnement', v_abo.id, 'montant', v_paiement.montant_fcfa));
end;
$$;

revoke all on function public.admin_confirmer_paiement(uuid, text) from public;
grant execute on function public.admin_confirmer_paiement(uuid, text) to authenticated;

-- 4) Rejeter un paiement (ADMIN UNIQUEMENT).
create or replace function public.admin_rejeter_paiement(
  p_payment_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paiement public.payments%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;

  if p_note is null or char_length(btrim(p_note)) < 3 then
    raise exception 'Merci d''indiquer le motif du rejet.';
  end if;

  select * into v_paiement from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;
  if v_paiement.statut not in ('en_attente', 'a_verifier') then
    raise exception 'Ce paiement a déjà été traité.';
  end if;

  update public.payments
  set statut = 'rejete', note_admin = left(btrim(p_note), 1000)
  where id = p_payment_id;

  insert into public.admin_actions (admin_id, action, cible, details)
  values (auth.uid(), 'paiement.rejete', p_payment_id::text, jsonb_build_object('motif', p_note));
end;
$$;

revoke all on function public.admin_rejeter_paiement(uuid, text) from public;
grant execute on function public.admin_rejeter_paiement(uuid, text) to authenticated;

-- 5) Annuler un abonnement (ADMIN UNIQUEMENT).
create or replace function public.admin_annuler_abonnement(
  p_subscription_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;

  update public.subscriptions
  set statut = 'annule'
  where id = p_subscription_id and statut in ('en_attente_paiement', 'actif', 'expire');

  if not found then
    raise exception 'Abonnement introuvable ou déjà annulé.';
  end if;

  -- Aucun paiement ne doit rester « à vérifier » sur un abonnement annulé.
  update public.payments
  set statut = 'rejete',
      note_admin = 'Abonnement annulé par l’administration.'
  where subscription_id = p_subscription_id
    and statut in ('en_attente', 'a_verifier');

  insert into public.admin_actions (admin_id, action, cible, details)
  values (auth.uid(), 'abonnement.annule', p_subscription_id::text,
          jsonb_build_object('note', p_note));
end;
$$;

revoke all on function public.admin_annuler_abonnement(uuid, text) from public;
grant execute on function public.admin_annuler_abonnement(uuid, text) to authenticated;

-- 6) Mettre à jour le statut d'une demande de distribution (ADMIN UNIQUEMENT).
create or replace function public.admin_statut_sortie(
  p_release_id uuid,
  p_statut text,
  p_commentaire text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_statuts text[] := array[
    'brouillon', 'en_attente_verification', 'informations_a_corriger', 'validee',
    'en_preparation', 'envoyee_plateformes', 'publiee', 'refusee'
  ];
begin
  if not public.est_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;

  if p_statut is null or not (p_statut = any (v_statuts)) then
    raise exception 'Statut inconnu.';
  end if;

  if p_statut = 'informations_a_corriger'
     and (p_commentaire is null or char_length(btrim(p_commentaire)) < 3) then
    raise exception 'Précisez les corrections demandées à l''artiste.';
  end if;

  update public.releases
  set statut = p_statut,
      motif_action = nullif(btrim(coalesce(p_commentaire, '')), ''),
      publiee_le = case when p_statut = 'publiee' then coalesce(publiee_le, now()) else publiee_le end
  where id = p_release_id;

  if not found then
    raise exception 'Demande introuvable.';
  end if;

  insert into public.admin_actions (admin_id, action, cible, details)
  values (auth.uid(), 'sortie.statut', p_release_id::text,
          jsonb_build_object('statut', p_statut, 'commentaire', p_commentaire));
end;
$$;

revoke all on function public.admin_statut_sortie(uuid, text, text) from public;
grant execute on function public.admin_statut_sortie(uuid, text, text) to authenticated;

-- 7) Expirer automatiquement les abonnements arrivés à échéance.
--    Fonction idempotente, appelée à l'ouverture de l'espace artiste.
create or replace function public.expirer_abonnements()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.subscriptions
  set statut = 'expire'
  where statut = 'actif' and fin is not null and fin < now();
$$;

revoke all on function public.expirer_abonnements() from public;
grant execute on function public.expirer_abonnements() to authenticated;

-- =====================================================================
--  STOCKAGE DES FICHIERS (pochettes et audio)
-- =====================================================================
--  Les fichiers sont PRIVÉS : seul le propriétaire (et l'administrateur)
--  peut les lire, via des URL signées générées côté serveur.
--  Chaque fichier est rangé dans un dossier portant l'identifiant de
--  l'utilisateur : <user_id>/<release_id>/fichier.ext
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pochettes', 'pochettes', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('audios', 'audios', false, 209715200,
   array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aiff',
         'audio/flac', 'audio/mp4', 'audio/x-m4a', 'audio/ogg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Politiques du bucket "pochettes"
drop policy if exists "pochettes: depot par son proprietaire" on storage.objects;
create policy "pochettes: depot par son proprietaire" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pochettes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pochettes: lecture par son proprietaire ou admin" on storage.objects;
create policy "pochettes: lecture par son proprietaire ou admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pochettes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin())
  );

drop policy if exists "pochettes: mise a jour par son proprietaire" on storage.objects;
create policy "pochettes: mise a jour par son proprietaire" on storage.objects
  for update to authenticated
  using (bucket_id = 'pochettes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pochettes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pochettes: suppression par son proprietaire" on storage.objects;
create policy "pochettes: suppression par son proprietaire" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pochettes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Politiques du bucket "audios"
drop policy if exists "audios: depot par son proprietaire" on storage.objects;
create policy "audios: depot par son proprietaire" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'audios'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "audios: lecture par son proprietaire ou admin" on storage.objects;
create policy "audios: lecture par son proprietaire ou admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audios'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.est_admin())
  );

drop policy if exists "audios: mise a jour par son proprietaire" on storage.objects;
create policy "audios: mise a jour par son proprietaire" on storage.objects
  for update to authenticated
  using (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "audios: suppression par son proprietaire" on storage.objects;
create policy "audios: suppression par son proprietaire" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audios' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
--  FIN
-- =====================================================================

