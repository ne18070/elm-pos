-- ============================================================================
-- Migration 170 : Offre Enterprise — ne lister que ce qui est réellement fourni
--
-- La liste affichée sur la landing (/#tarifs) et dans /billing promettait
-- notamment SSO, hébergement dédié / région des données au choix, support
-- 24/7, SLA et account manager — rien de cela n'existe. Aucune fonctionnalité
-- logicielle n'est réservée à Enterprise (aucun contrôle de plan dans le
-- code) : ce qui la distingue de Pro, ce sont les services.
--
-- Les plans restent modifiables depuis le back office ; cette migration ne
-- fait que corriger la liste actuelle (offres mensuelle et annuelle, même
-- name 'enterprise').
-- ============================================================================

UPDATE public.plans
SET features = ARRAY[
  'Tout le plan Pro',
  'Mise en place et formation de votre équipe',
  'Support prioritaire sur WhatsApp',
  'Adaptations sur mesure (sur devis)'
]
WHERE name = 'enterprise';
