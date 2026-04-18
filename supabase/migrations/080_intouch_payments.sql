-- Migration: Intouch (TouchPay) Integration
-- Description: Adds configuration table for Intouch payment gateway

CREATE TABLE IF NOT EXISTS intouch_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  partner_id text NOT NULL,
  api_key text NOT NULL,
  merchant_id text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE intouch_configs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can see their business intouch config"
  ON intouch_configs FOR SELECT
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "Owners can manage their business intouch config"
  ON intouch_configs FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Grant access to service role (for edge functions)
GRANT ALL ON intouch_configs TO service_role;

-- Add to realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'intouch_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE intouch_configs;
  END IF;
END $$;
