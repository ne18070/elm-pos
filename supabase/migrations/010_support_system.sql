-- Migration : Système de Support Client
-- Permet aux utilisateurs d'envoyer des feedbacks, bugs et suggestions.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.users(id),
  type         text        NOT NULL CHECK (type IN ('bug', 'suggestion', 'question', 'feedback')),
  subject      text        NOT NULL,
  message      text        NOT NULL,
  attachments  text[]      DEFAULT '{}', -- URLs des screenshots
  status       text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority     text        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  metadata     jsonb       NOT NULL DEFAULT '{}', -- Infos système (navigateur, version app)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexation
CREATE INDEX IF NOT EXISTS idx_support_tickets_business ON support_tickets(business_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON support_tickets(status);

-- RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent voir et créer leurs propres tickets
CREATE POLICY "support_select_own" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

CREATE POLICY "support_insert_own" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM business_members WHERE user_id = auth.uid()));

-- Les superadmins peuvent tout faire
CREATE POLICY "support_superadmin" ON public.support_tickets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_superadmin = true));

-- Trigger updated_at
CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
