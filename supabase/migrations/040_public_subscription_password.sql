-- Add password field to public_subscription_requests
-- Nullable for backward compatibility with existing records

ALTER TABLE public.public_subscription_requests
  ADD COLUMN IF NOT EXISTS password text;

-- Also make receipt_url nullable (needed for free plans)
ALTER TABLE public.public_subscription_requests
  ALTER COLUMN receipt_url DROP NOT NULL;
