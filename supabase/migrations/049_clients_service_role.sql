-- Permettre à l'Edge Function WhatsApp (service_role) d'insérer/modifier les clients
CREATE POLICY "clients: service_role"
  ON clients FOR ALL
  USING (auth.role() = 'service_role');
