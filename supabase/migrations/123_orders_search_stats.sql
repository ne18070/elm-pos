-- Migration 123 : statistiques à jour pour la recherche ILIKE sur orders
--
-- Les index trigram de la migration 122 ne suffisent pas seuls : `CREATE
-- INDEX` ne déclenche pas d'ANALYZE, donc le planificateur peut continuer à
-- estimer la sélectivité d'un motif ILIKE ('%amadou dabo%') à partir de
-- statistiques périmées ou insuffisantes et choisir, à tort, un plan qui
-- ignore l'index (balayage trié par created_at, filtré ligne à ligne) plutôt
-- que de partir de l'index trigram. Un terme fréquent ("amadou") reste rapide
-- dans ce plan (les correspondances arrivent tôt) ; un terme précis/rare
-- ("amadou dabo") force alors un balayage quasi complet de l'historique et
-- peut dépasser le statement_timeout — confirmé en production.
--
-- On augmente la cible de statistiques sur les 3 colonnes recherchées (texte
-- libre à forte cardinalité, la valeur par défaut de 100 est insuffisante
-- pour bien estimer un motif à joker) puis on relance ANALYZE pour que le
-- planificateur choisisse correctement l'index dès cette requête.

ALTER TABLE public.orders ALTER COLUMN id_text        SET STATISTICS 500;
ALTER TABLE public.orders ALTER COLUMN customer_name   SET STATISTICS 500;
ALTER TABLE public.orders ALTER COLUMN customer_phone  SET STATISTICS 500;

ANALYZE public.orders;
