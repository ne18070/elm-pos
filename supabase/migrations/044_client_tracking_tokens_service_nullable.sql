-- Allow tracking tokens to target either a dossier or a service order.
-- Older schema versions made dossier_id mandatory, which blocks service-order links.

ALTER TABLE public.client_tracking_tokens
  ALTER COLUMN dossier_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'client_tracking_tokens_target_check'
      AND conrelid = 'public.client_tracking_tokens'::regclass
  ) THEN
    ALTER TABLE public.client_tracking_tokens
      ADD CONSTRAINT client_tracking_tokens_target_check
      CHECK (dossier_id IS NOT NULL OR service_order_id IS NOT NULL);
  END IF;
END $$;
