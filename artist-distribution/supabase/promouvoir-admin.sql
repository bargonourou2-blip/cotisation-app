-- =====================================================================
--  DONNER LES DROITS D'ADMINISTRATEUR À UN COMPTE
-- =====================================================================
--  1. Créez d'abord votre compte normalement sur le site (/inscription).
--  2. Remplacez l'adresse ci-dessous par la vôtre.
--  3. Exécutez ce fichier dans Supabase → SQL Editor.
--
--  ⚠️ C'est la SEULE façon de devenir administrateur : le rôle ne peut
--     pas être choisi depuis le formulaire d'inscription.
-- =====================================================================

update public.profiles
set role = 'admin'
where lower(email) = lower('remplacez-moi@exemple.com');

-- Vérification : doit renvoyer une ligne avec role = 'admin'
select id, email, nom_artiste, role
from public.profiles
where role = 'admin';
