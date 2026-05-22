import { supabase } from './client';
import { q } from './q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any

export interface AiKnowledge {
  id: string;
  business_id: string;
  title: string;
  content: string;
  source: string;
  created_by?: string | null;
  created_at: string;
}

export interface AiConversation {
  id: string;
  business_id: string;
  user_id?: string | null;
  question: string;
  answer: string;
  model?: string | null;
  created_at: string;
}

export async function getAiKnowledge(businessId: string): Promise<AiKnowledge[]> {
  return q<AiKnowledge[]>(
    supabase
      .from('ai_knowledge')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(30),
    'ai_knowledge_select',
  ).catch(() => []);
}

export async function saveAiKnowledge(input: {
  business_id: string;
  title: string;
  content: string;
  source?: string;
  created_by: string;
}): Promise<AiKnowledge | null> {
  return q<AiKnowledge>(
    supabase
      .from('ai_knowledge')
      .insert({
        business_id: input.business_id,
        title: input.title,
        content: input.content,
        source: input.source ?? 'feedback',
        created_by: input.created_by,
      })
      .select()
      .single(),
    'ai_knowledge_insert',
  ).catch(() => null);
}

export async function saveAiConversation(input: {
  business_id: string;
  user_id: string;
  question: string;
  answer: string;
  model?: string | null;
}): Promise<AiConversation | null> {
  return q<AiConversation>(
    supabase
      .from('ai_conversations')
      .insert(input)
      .select()
      .single(),
    'ai_conversation_insert',
  ).catch(() => null);
}

export async function saveAiFeedback(input: {
  business_id: string;
  conversation_id?: string | null;
  user_id: string;
  rating: 'good' | 'bad';
  comment?: string | null;
}): Promise<void> {
  await q(
    supabase.from('ai_feedback').insert({
      business_id: input.business_id,
      conversation_id: input.conversation_id ?? null,
      user_id: input.user_id,
      rating: input.rating,
      comment: input.comment ?? null,
    }),
    'ai_feedback_insert',
  ).catch(() => {});
}
