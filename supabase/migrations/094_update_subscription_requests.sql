-- Migration 094 : Mise à jour des demandes d'abonnement pour inclure le nom complet et la dénomination
-- Permet de séparer les infos de l'utilisateur (Admin) de celles de l'entreprise (Structure)

ALTER TABLE public.public_subscription_requests
ADD COLUMN IF NOT EXISTS full_name    TEXT,
ADD COLUMN IF NOT EXISTS denomination TEXT;

-- Rendre receipt_url optionnel si on veut permettre l'envoi sans reçu immédiat
ALTER TABLE public.public_subscription_requests
ALTER COLUMN receipt_url DROP NOT NULL;

-- Ajouter password pour stocker temporairement le MDP choisi
ALTER TABLE public.public_subscription_requests
ADD COLUMN IF NOT EXISTS password TEXT;
