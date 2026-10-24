-- =====================================================================
--  FORMULES DE DÉMARRAGE (valeurs provisoires)
-- =====================================================================
--  À exécuter UNE FOIS après le schéma initial, ou à ignorer si vous
--  préférez créer vos formules depuis /admin/formules.
--  Les tarifs sont provisoires : modifiez-les librement.
--
--  ⚠️ Ne modifiez pas `code` une fois des abonnements créés : ce code
--     sert de référence historique.
-- =====================================================================

insert into public.subscription_plans
  (code, nom, description, prix_fcfa, duree_jours, avantages, badge, mis_en_avant, actif, ordre)
values
  (
    'essentiel',
    'Essentiel',
    'Pour faire vos premiers pas et présenter votre premier projet.',
    5000,
    30,
    array[
      'Un espace artiste personnel',
      'Soumission de vos sorties musicales',
      'Suivi du statut de chaque demande',
      'Assistance par e-mail'
    ],
    null,
    false,
    true,
    1
  ),
  (
    'artiste',
    'Artiste',
    'La formule pensée pour les artistes qui sortent régulièrement.',
    13500,
    90,
    array[
      'Tout ce que contient la formule Essentiel',
      'Accompagnement à la préparation des crédits',
      'Suivi prioritaire des demandes',
      'Assistance par WhatsApp'
    ],
    'Recommandée',
    true,
    true,
    2
  ),
  (
    'professionnel',
    'Professionnel',
    'Pour les artistes et équipes qui gèrent plusieurs projets.',
    48000,
    365,
    array[
      'Tout ce que contient la formule Artiste',
      'Gestion de plusieurs projets en parallèle',
      'Échanges réguliers avec notre équipe',
      'Assistance prioritaire'
    ],
    null,
    false,
    true,
    3
  )
on conflict (code) do nothing;
