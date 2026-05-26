-- Add timezone to businesses so timestamps are always displayed in the business's local time,
-- regardless of the viewer's browser timezone.
-- Default: Africa/Dakar (UTC+0) — covers Senegal, Côte d'Ivoire, Mali, Guinea, etc.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Africa/Dakar';

-- Explicit grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.businesses TO authenticated;
GRANT ALL ON TABLE public.businesses TO service_role;
