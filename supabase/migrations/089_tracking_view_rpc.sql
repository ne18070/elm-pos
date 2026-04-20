-- ─── Fonction RPC pour incrémenter les vues de suivi ──────────────────────────
-- Migration 089 : Statistiques de consultation du lien de suivi.

CREATE OR REPLACE FUNCTION public.increment_tracking_view(t text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.client_tracking_tokens
  SET 
    view_count = view_count + 1,
    last_viewed = now()
  WHERE token = t;
END;
$$;

-- Accès public à la fonction (nécessaire pour le suivi client sans auth)
GRANT EXECUTE ON FUNCTION public.increment_tracking_view(text) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_tracking_view(text) TO authenticated;
