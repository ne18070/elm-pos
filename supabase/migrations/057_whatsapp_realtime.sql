-- Active Supabase Realtime pour whatsapp_messages
-- Nécessaire pour que les nouvelles conversations/messages s'affichent en temps réel

ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
