-- AI assistant memory and feedback.
-- This is not fine-tuning. It is business-scoped memory/RAG so the assistant
-- improves from validated answers and corrections without retraining a model.

CREATE TABLE IF NOT EXISTS public.ai_knowledge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text NOT NULL,
  source      text NOT NULL DEFAULT 'feedback',
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  question    text NOT NULL,
  answer      text NOT NULL,
  model       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rating          text NOT NULL CHECK (rating IN ('good', 'bad')),
  comment         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_business_created
  ON public.ai_knowledge (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business_created
  ON public.ai_conversations (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_business_created
  ON public.ai_feedback (business_id, created_at DESC);

ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_knowledge_select_members" ON public.ai_knowledge;
CREATE POLICY "ai_knowledge_select_members" ON public.ai_knowledge
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = ai_knowledge.business_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_knowledge_insert_members" ON public.ai_knowledge;
CREATE POLICY "ai_knowledge_insert_members" ON public.ai_knowledge
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = ai_knowledge.business_id
        AND bm.user_id = auth.uid()
        AND bm.role IN ('owner', 'admin', 'manager', 'staff')
    )
  );

DROP POLICY IF EXISTS "ai_conversations_select_members" ON public.ai_conversations;
CREATE POLICY "ai_conversations_select_members" ON public.ai_conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = ai_conversations.business_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_conversations_insert_self" ON public.ai_conversations;
CREATE POLICY "ai_conversations_insert_self" ON public.ai_conversations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = ai_conversations.business_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_feedback_select_members" ON public.ai_feedback;
CREATE POLICY "ai_feedback_select_members" ON public.ai_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = ai_feedback.business_id
        AND bm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ai_feedback_insert_self" ON public.ai_feedback;
CREATE POLICY "ai_feedback_insert_self" ON public.ai_feedback
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.business_members bm
      WHERE bm.business_id = ai_feedback.business_id
        AND bm.user_id = auth.uid()
    )
  );
