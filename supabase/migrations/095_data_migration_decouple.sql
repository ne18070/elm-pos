-- Migration 095 : Migration des données existantes pour le découplage Structure/Profil
-- Initialise les nouveaux champs pour les établissements existants.

DO $$ 
BEGIN
    -- 1. Initialiser la dénomination avec le nom commercial si elle est vide
    UPDATE public.businesses
    SET denomination = name
    WHERE denomination IS NULL OR denomination = '';

    -- 2. Initialiser brand_config avec un objet vide si NULL
    UPDATE public.businesses
    SET brand_config = '{}'::jsonb
    WHERE brand_config IS NULL;

    -- 3. Sécurité : S'assurer que chaque owner_id est bien présent dans business_members
    -- Cela garantit que la fonction RPC get_my_businesses() continuera de renvoyer les données pour les anciens comptes.
    INSERT INTO public.business_members (business_id, user_id, role)
    SELECT id, owner_id, 'owner'
    FROM public.businesses
    WHERE owner_id IS NOT NULL
    ON CONFLICT (business_id, user_id) DO NOTHING;

    -- 4. Optionnel : On peut aussi mettre à jour les demandes d'abonnement existantes
    UPDATE public.public_subscription_requests
    SET denomination = business_name,
        full_name = 'Ancien Prospect'
    WHERE denomination IS NULL OR full_name IS NULL;

END $$;
