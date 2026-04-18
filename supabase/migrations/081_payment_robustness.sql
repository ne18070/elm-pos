-- Migration: Payment Transactions & Security
-- Description: Robust tracking of payment attempts and sensitive config security

-- 1. Create a table to track all payment attempts (Audit Trail & Reliability)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  order_id text, -- Can be null if order not yet created
  transaction_id text UNIQUE, -- Provider transaction ID (e.g. Intouch ID)
  external_reference text, -- Our internal unique reference sent to provider
  amount numeric(12, 2) NOT NULL,
  currency text DEFAULT 'XOF',
  provider text NOT NULL, -- 'WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'INTOUCH'
  method text NOT NULL, -- 'push', 'qr', etc.
  phone text,
  status text NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'
  provider_response jsonb, -- Store raw response for debugging
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for performance and searching
CREATE INDEX IF NOT EXISTS idx_payment_transactions_business_id ON payment_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_reference ON payment_transactions(external_reference);

-- Enable RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their business transactions"
  ON payment_transactions FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- 2. Improve Security for intouch_configs
-- We should NEVER select the api_key from the client.
-- Let's create a view for the client that excludes the key.

CREATE OR REPLACE VIEW intouch_configs_public AS
SELECT id, business_id, partner_id, merchant_id, is_active, created_at, updated_at
FROM intouch_configs;

-- Only Edge Functions (service_role) should see the api_key.
-- Revoke all on the base table from authenticated/anon, grant only to service_role.
REVOKE ALL ON intouch_configs FROM authenticated, anon;
GRANT SELECT ON intouch_configs_public TO authenticated;

-- 3. Function to update transaction status (Reliability)
CREATE OR REPLACE FUNCTION update_payment_transaction_status(
  p_external_ref text,
  p_status text,
  p_transaction_id text DEFAULT NULL,
  p_response jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE payment_transactions
  SET 
    status = p_status,
    transaction_id = COALESCE(p_transaction_id, transaction_id),
    provider_response = COALESCE(p_response, provider_response),
    error_message = COALESCE(p_error, error_message),
    updated_at = now()
  WHERE external_reference = p_external_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
