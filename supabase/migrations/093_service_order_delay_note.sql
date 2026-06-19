-- Note explicative lorsqu'un encaissement a du retard
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS delay_note TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_orders TO authenticated;
GRANT ALL ON TABLE public.service_orders TO service_role;
